-- ---------------------------------------------------------------------------
-- 0006 — Customers
--
-- Tenant-scoped. Two clinics each have a patient on the same phone number and
-- they are two unrelated records; there is deliberately no cross-tenant
-- customer identity, because a patient list is the most sensitive thing a
-- tenant stores here and sharing it between tenants is a breach, not a
-- feature.
--
-- Changes from the spec's DDL:
--
--   * Phone numbers are constrained to E.164. The spec stores free-form
--     `VARCHAR(25)` under `UNIQUE (business_id, phone)`, which makes the
--     uniqueness constraint decorative: `01711000000`, `+8801711000000` and
--     `017 1100 0000` are the same patient and three rows. The receptionist
--     then has three visit histories for one person and the reminder goes to
--     whichever row today's booking happened to attach to. Input is normalised
--     at the API boundary by lib/phone.ts; this constraint is what guarantees
--     nothing bypasses it.
--
--   * `preferred_channel` is new, and matters more here than it would have in
--     the spec: with no SMS channel (D-009) the platform has to know how it can
--     actually reach someone, and a phone number alone is no longer a delivery
--     address. A customer with neither an email nor a push subscription can
--     only be reached by the calendar invite, and the booking UI needs to be
--     able to say so.
--
--   * `no_show_count` exists in the spec but is never written (M-07); Phase 4
--     maintains it. `total_bookings` likewise.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE TABLE customers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    full_name         TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
    phone             TEXT NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    email             TEXT CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    preferred_channel TEXT NOT NULL DEFAULT 'email'
                          CHECK (preferred_channel IN ('email', 'push', 'none')),
    notes             TEXT,
    total_bookings    INT NOT NULL DEFAULT 0 CHECK (total_bookings >= 0),
    no_show_count     INT NOT NULL DEFAULT 0 CHECK (no_show_count >= 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, phone),
    UNIQUE (business_id, id)
);

COMMENT ON TABLE customers IS
    'Tenant-scoped CRM. Contains health-adjacent free text in `notes` for medical tenants: no anon grant, no platform-admin read path (docs/DECISIONS.md D-012).';
COMMENT ON COLUMN customers.phone IS
    'E.164, normalised by lib/phone.ts before insert. The UNIQUE (business_id, phone) constraint is only meaningful because of this format CHECK.';
COMMENT ON COLUMN customers.preferred_channel IS
    '''none'' is a real and common state: a walk-in who gave only a phone number. Such a customer is reachable only through the .ics calendar invite — see docs/FREE_STACK.md §3.';

-- Case-insensitive email lookup for "has this person booked before".
-- Not unique: two family members sharing one email address is ordinary.
CREATE INDEX customers_business_email_lower
    ON customers (business_id, lower(email)) WHERE email IS NOT NULL;

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
