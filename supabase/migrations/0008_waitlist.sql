-- ---------------------------------------------------------------------------
-- 0008 — Waitlist
--
-- A customer who wanted a slot that was already taken. When a booking is
-- cancelled, these are the people to tell. The automation is Phase 9 (defect
-- M-09: the spec defines the table and then never notifies anyone from it);
-- this migration only makes the queue representable.
--
-- Changes from the spec's DDL:
--
--   * `business_id` composite FKs, as everywhere else, so an entry cannot
--     reference another tenant's service or provider.
--   * A desired time window rather than a bare date. "Any time on Thursday"
--     and "Thursday morning only" are different requests, and offering a 7pm
--     slot to someone who can only come before noon wastes the slot and the
--     goodwill.
--   * `expires_at`. Without it the list grows forever and eventually someone
--     is offered a slot for a need they had four months ago.
--   * `notified_at` and a `notified` status, so the same person is not
--     offered the same freed slot twice.
--   * E.164 phone, matching `customers`.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE TABLE waitlist_entries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_id        UUID NOT NULL,
    -- NULL means "any provider who performs this service".
    staff_id          UUID,
    -- Linked when the person is already in the CRM; a first-time caller is not.
    customer_id       UUID,
    customer_name     TEXT NOT NULL CHECK (length(trim(customer_name)) > 0),
    customer_phone    TEXT NOT NULL CHECK (customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
    customer_email    TEXT CHECK (customer_email IS NULL
                                  OR customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    desired_date      DATE NOT NULL,
    desired_from_time TIME,
    desired_to_time   TIME,
    status            TEXT NOT NULL DEFAULT 'waiting'
                          CHECK (status IN ('waiting', 'notified', 'booked', 'expired', 'cancelled')),
    notified_at       TIMESTAMPTZ,
    expires_at        TIMESTAMPTZ NOT NULL,
    note              TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT waitlist_window_ordered
        CHECK (desired_from_time IS NULL
               OR desired_to_time IS NULL
               OR desired_to_time > desired_from_time),
    CONSTRAINT waitlist_notified_has_timestamp
        CHECK (status <> 'notified' OR notified_at IS NOT NULL),
    CONSTRAINT waitlist_service_same_business
        FOREIGN KEY (business_id, service_id) REFERENCES services (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT waitlist_staff_same_business
        FOREIGN KEY (business_id, staff_id) REFERENCES staff_resources (business_id, id)
        ON DELETE SET NULL,
    CONSTRAINT waitlist_customer_same_business
        FOREIGN KEY (business_id, customer_id) REFERENCES customers (business_id, id)
        ON DELETE SET NULL
);

COMMENT ON TABLE waitlist_entries IS
    'Unfulfilled demand. Phase 9 matches freed slots against it; until then rows accumulate and nothing reads them. The retention job that expires them is part of that phase.';

-- One live request per person per service per day. Without this, a customer
-- who taps "notify me" three times gets told three times.
CREATE UNIQUE INDEX waitlist_one_active_per_request
    ON waitlist_entries (business_id, service_id, customer_phone, desired_date)
    WHERE status IN ('waiting', 'notified');

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
