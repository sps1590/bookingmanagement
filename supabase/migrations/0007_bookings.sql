-- ---------------------------------------------------------------------------
-- 0007 — Bookings and their audit trail
--
-- This is the table the whole product exists to protect. Two customers must
-- never hold the same provider at the same time, and that guarantee is made
-- here, by the database, not by the slot picker — because the slot picker is
-- reading a snapshot that is already stale by the time the user taps "Confirm".
--
-- ## Defect B-03 — the buffers were never enforced
--
-- The spec computes free slots from `services.buffer_before_minutes` and
-- `buffer_after_minutes`, but stores `slot_range = tstzrange(start, end)` and
-- puts the exclusion constraint on *that*. So the database happily accepts two
-- appointments that sit back to back, even when the service demands fifteen
-- minutes of sterilisation between patients. Under concurrency — two people
-- booking the last two slots of the day at the same moment — that is exactly
-- what happens, and the dentist finds out when the second patient walks in.
--
-- The fix has three parts:
--
--   1. The buffers are copied onto the booking row at insert time rather than
--      read from `services`. A service edited next month must not silently
--      redraw the blocked range of an appointment booked today.
--   2. `blocked_range` is the appointment *plus* its buffers, generated and
--      stored.
--   3. The exclusion constraint indexes `blocked_range`, not `slot_range`.
--
-- `slot_range` is kept because the calendar and every "what is on at 3pm"
-- query want the real appointment, not the padded one.
--
-- ## Why `shift_minutes` exists
--
-- The obvious expression — `start_time - make_interval(mins => buffers)` —
-- cannot be used in a generated column. `timestamptz - interval` is STABLE,
-- not IMMUTABLE, because for intervals carrying months or days the result
-- depends on the session time zone, and Postgres refuses the whole DDL with
-- "generation expression is not immutable". (The snippet in the plan's §13 was
-- subject to this and did not compile; it has been corrected there too.)
--
-- `shift_minutes` is narrowed to the case that *is* immutable: a whole number
-- of minutes is a pure time offset with no calendar fields, so shifting an
-- absolute instant by it gives the same answer in every time zone and on both
-- sides of a DST boundary. The IMMUTABLE label is therefore accurate rather
-- than a convenient lie, and the `int` parameter is what keeps it accurate —
-- there is no way to hand this function a month.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE FUNCTION shift_minutes(ts TIMESTAMPTZ, mins INT)
RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = public, extensions, pg_temp
AS $$ SELECT ts + make_interval(mins => mins) $$;

COMMENT ON FUNCTION shift_minutes(TIMESTAMPTZ, INT) IS
    'Shift an instant by a whole number of minutes. Immutable because a minute offset carries no calendar fields, which is what lets blocked_range be a generated column.';

CREATE FUNCTION generate_reschedule_token()
RETURNS TEXT
LANGUAGE sql VOLATILE
SET search_path = public, extensions, pg_temp
AS $$ SELECT encode(gen_random_bytes(24), 'hex') $$;

COMMENT ON FUNCTION generate_reschedule_token() IS
    '192 bits of entropy. This token is the only credential a guest customer has — it stands in for a password on /manage/[token] — so it must be unguessable and must never appear in a log (see lib/logger.ts redactToken). Pins its own search_path because pgcrypto lives in the extensions schema on Supabase and in public elsewhere.';

CREATE TABLE bookings (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id             UUID,
    -- Assigned by a per-business, per-day sequence in 0012 (defect B-15).
    booking_code          TEXT NOT NULL,
    customer_id           UUID NOT NULL,
    service_id            UUID NOT NULL,
    staff_id              UUID NOT NULL,

    start_time            TIMESTAMPTZ NOT NULL,
    end_time              TIMESTAMPTZ NOT NULL,

    -- Snapshotted from `services` at insert time. See B-03 above.
    buffer_before_minutes INT NOT NULL DEFAULT 0
                              CHECK (buffer_before_minutes BETWEEN 0 AND 480),
    buffer_after_minutes  INT NOT NULL DEFAULT 0
                              CHECK (buffer_after_minutes BETWEEN 0 AND 480),

    -- The appointment as the customer experiences it.
    slot_range            TSTZRANGE GENERATED ALWAYS AS
                              (tstzrange(start_time, end_time, '[)')) STORED,
    -- The appointment as the provider's diary experiences it.
    blocked_range         TSTZRANGE GENERATED ALWAYS AS
                              (tstzrange(shift_minutes(start_time, -buffer_before_minutes),
                                         shift_minutes(end_time, buffer_after_minutes),
                                         '[)')) STORED,

    status                TEXT NOT NULL DEFAULT 'confirmed'
                              CHECK (status IN ('pending', 'confirmed', 'checked_in',
                                                'completed', 'cancelled', 'no_show')),
    booking_source        TEXT NOT NULL DEFAULT 'online'
                              CHECK (booking_source IN ('online', 'walk_in', 'phone', 'admin')),

    reschedule_token      TEXT NOT NULL UNIQUE DEFAULT generate_reschedule_token(),
    reschedule_count      INT NOT NULL DEFAULT 0 CHECK (reschedule_count >= 0),

    customer_notes        TEXT,
    internal_notes        TEXT,

    total_price           NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
    paid_amount           NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    payment_status        TEXT NOT NULL DEFAULT 'unpaid'
                              CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT bookings_end_after_start CHECK (end_time > start_time),
    UNIQUE (business_id, booking_code),
    UNIQUE (business_id, id),

    -- Tenant integrity: every reference must stay inside this booking's
    -- tenant. RLS alone does not give this — a policy that checks
    -- `business_id = A` is perfectly satisfied by a row naming tenant B's
    -- service_id, which would leak B's service name onto A's invoice.
    CONSTRAINT bookings_branch_same_business
        FOREIGN KEY (business_id, branch_id) REFERENCES branches (business_id, id)
        ON DELETE SET NULL,
    CONSTRAINT bookings_customer_same_business
        FOREIGN KEY (business_id, customer_id) REFERENCES customers (business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT bookings_service_same_business
        FOREIGN KEY (business_id, service_id) REFERENCES services (business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT bookings_staff_same_business
        FOREIGN KEY (business_id, staff_id) REFERENCES staff_resources (business_id, id)
        ON DELETE RESTRICT,

    -- The whole point. Defect B-03: this indexes `blocked_range`, so the
    -- buffers the slot picker promised are the buffers the database enforces.
    -- Cancelled and completed bookings leave the constraint, which is what
    -- frees the slot again.
    CONSTRAINT prevent_double_booking EXCLUDE USING GIST (
        business_id   WITH =,
        staff_id      WITH =,
        blocked_range WITH &&
    ) WHERE (status IN ('pending', 'confirmed', 'checked_in'))
);

COMMENT ON COLUMN bookings.blocked_range IS
    'Appointment plus its buffers. The exclusion constraint indexes this, not slot_range (defect B-03). If a migration ever moves the constraint back to slot_range, the database starts permitting buffer violations that the UI believes it prevented — see the double-booking entry in docs/RUNBOOK.md.';
COMMENT ON COLUMN bookings.reschedule_token IS
    'Bearer credential for the guest self-service page. Never log it in full; never put it in a URL that reaches an analytics tool. Rotation on use is M-11, Phase 6.';
COMMENT ON COLUMN bookings.status IS
    'There is deliberately no transition guard here yet — any status can currently become any other (defect M-12). Phase 2 adds the guard in create/reschedule/cancel.';

-- Audit trail. Append-only in practice: `authenticated` is granted SELECT and
-- nothing else (0015), so rows arrive through the Phase 2 RPCs.
CREATE TABLE booking_history (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    booking_id     UUID NOT NULL,
    action         TEXT NOT NULL
                       CHECK (action IN ('created', 'rescheduled', 'cancelled',
                                         'status_changed', 'payment_recorded',
                                         'payment_verified', 'payment_rejected',
                                         'notes_updated')),
    old_start_time TIMESTAMPTZ,
    new_start_time TIMESTAMPTZ,
    old_status     TEXT,
    new_status     TEXT,
    -- The spec records only a category string ('customer', 'staff', ...), which
    -- cannot answer "who cancelled this appointment". On a platform where a
    -- cancellation costs a clinic a slot and a patient a diagnosis, and where
    -- a receptionist can mark a deposit paid, the acting identity belongs in
    -- the trail.
    actor_type     TEXT NOT NULL
                       CHECK (actor_type IN ('customer', 'staff', 'admin', 'system')),
    actor_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason         TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT booking_history_booking_same_business
        FOREIGN KEY (business_id, booking_id) REFERENCES bookings (business_id, id)
        ON DELETE CASCADE
);

COMMENT ON COLUMN booking_history.actor_user_id IS
    'NULL for a guest customer acting with a reschedule token, and for system actions. Non-NULL whenever a signed-in member did it.';

ALTER TABLE bookings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_history ENABLE ROW LEVEL SECURITY;
