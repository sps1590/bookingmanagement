-- ---------------------------------------------------------------------------
-- 0004 — Catalogue: services, staff/resources, and the mapping between them
--
-- Changes from the spec's DDL:
--
--   * `staff_services` gains `business_id` and composite foreign keys. In the
--     spec it is a bare (staff_id, service_id) pair, which has two
--     consequences: RLS cannot scope it without a join, and nothing stops a
--     row pairing tenant A's staff member with tenant B's service. The
--     composite FKs make that unrepresentable.
--
--   * `UNIQUE (business_id, id)` on both parents, for the same reason — see the
--     note in 0003.
--
--   * `sort_order` on both, because the public portal lists them and
--     alphabetical order is rarely the order a clinic wants.
--
-- `staff_resources` is the one table in the schema whose every row contains a
-- named individual's personal phone and email. The spec publishes this table to
-- anonymous visitors (defect B-05). It must never be readable by `anon`; the
-- public portal reads `public_staff` (0014), which has no contact columns at
-- all. There is a database test asserting that.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE TABLE services (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL CHECK (length(trim(name)) > 0),
    category              TEXT,
    description           TEXT,
    duration_minutes      INT NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
    buffer_before_minutes INT NOT NULL DEFAULT 0
                              CHECK (buffer_before_minutes >= 0 AND buffer_before_minutes <= 480),
    buffer_after_minutes  INT NOT NULL DEFAULT 0
                              CHECK (buffer_after_minutes >= 0 AND buffer_after_minutes <= 480),
    price                 NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    deposit_required      NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (deposit_required >= 0),
    color_hex             TEXT NOT NULL DEFAULT '#2563EB' CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order            INT NOT NULL DEFAULT 0,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT services_deposit_within_price CHECK (deposit_required <= price),
    UNIQUE (business_id, id)
);

COMMENT ON COLUMN services.buffer_before_minutes IS
    'Preparation gap held before the appointment. Copied onto the booking row at insert time and enforced there by the exclusion constraint (defect B-03) — a later edit to this service must not silently rewrite the blocked range of appointments already booked.';

CREATE TABLE staff_resources (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id   UUID,
    -- NULL for a non-human resource (a dental chair, a service bay) or for a
    -- provider who has no login.
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    title       TEXT,
    phone       TEXT CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
    email       TEXT CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    avatar_url  TEXT,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, id),
    CONSTRAINT staff_resources_branch_same_business
        FOREIGN KEY (business_id, branch_id) REFERENCES branches (business_id, id)
        ON DELETE SET NULL
);

COMMENT ON TABLE staff_resources IS
    'Providers and bookable resources. Contains personal contact details: never expose to anon. The public portal reads public_staff (defect B-05).';

-- One login maps to at most one provider record per tenant, otherwise
-- `current_staff_id()` — which the bookings policy uses to mean "own
-- schedule" — would have to choose between two answers.
CREATE UNIQUE INDEX staff_resources_one_per_user_per_business
    ON staff_resources (business_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE staff_services (
    business_id             UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_id                UUID NOT NULL,
    service_id              UUID NOT NULL,
    custom_duration_minutes INT CHECK (custom_duration_minutes > 0
                                       AND custom_duration_minutes <= 1440),
    custom_price            NUMERIC(10, 2) CHECK (custom_price IS NULL OR custom_price >= 0),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (staff_id, service_id),
    CONSTRAINT staff_services_staff_same_business
        FOREIGN KEY (business_id, staff_id) REFERENCES staff_resources (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT staff_services_service_same_business
        FOREIGN KEY (business_id, service_id) REFERENCES services (business_id, id)
        ON DELETE CASCADE
);

COMMENT ON TABLE staff_services IS
    'Which provider performs which service. The spec''s slot generator ignores this table, so a service is offered by staff who do not perform it (defect M-01); Phase 2 joins through it.';

ALTER TABLE services        ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_services  ENABLE ROW LEVEL SECURITY;
