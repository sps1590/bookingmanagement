-- ---------------------------------------------------------------------------
-- 0003 — Tenancy: businesses, members, branches, platform admins
--
-- `business_id` is the tenant key for the entire schema. Every table from here
-- on carries it, and every RLS policy is written in terms of it.
--
-- Changes from the spec's DDL:
--
--   * `platform_admins` is new (defect B-22). The spec sells a Super Admin role
--     and describes its console, but defines no table, function or policy path
--     for it, which leaves the only route to cross-tenant access being the
--     service-role key pasted into an admin page. Scope of the grant is
--     deliberately narrow — see 0015 and docs/DECISIONS.md D-012.
--
--   * `sms_balance` is gone (D-009: no SMS channel).
--
--   * `business_code` comes from a sequence rather than application code, so
--     two concurrent signups cannot mint the same code.
--
--   * `slug` is constrained to a lowercase URL-safe shape. Its UNIQUE
--     constraint is then case-insensitive for free, which is what a public
--     booking URL needs — `/book/Dhaka-Dental` and `/book/dhaka-dental` must
--     not be two tenants.
--
--   * Onboarding progress lives on the row so the wizard is resumable (plan
--     §3.3) rather than held in a cookie that a closed laptop loses.
--
--   * `UNIQUE (business_id, id)` on every tenant-owned parent looks redundant
--     against a UUID primary key, and it is — as a uniqueness constraint. Its
--     purpose is to be the target of a composite foreign key from child tables,
--     so that a row in tenant A cannot reference a parent in tenant B. RLS does
--     not prevent that: a policy checking `business_id = A` is perfectly happy
--     with an insert naming tenant B's service_id. Composite FKs make the
--     mix-up unrepresentable instead of merely unlikely.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE SEQUENCE business_code_seq AS INT START WITH 1001 INCREMENT BY 1;

CREATE TABLE businesses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_code           TEXT NOT NULL UNIQUE
                                DEFAULT ('BIZ-' || nextval('business_code_seq')),
    slug                    TEXT NOT NULL UNIQUE
                                CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                                       AND length(slug) BETWEEN 3 AND 100),
    name                    TEXT NOT NULL CHECK (length(trim(name)) > 0),
    business_type            TEXT NOT NULL
                                CHECK (business_type IN ('doctor', 'dentist', 'salon',
                                                         'parlor', 'consultant',
                                                         'workshop', 'other')),
    phone                   TEXT NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    email                   TEXT CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    address                 TEXT,
    -- IANA zone name. Validated by lib/time, not by a CHECK: pg_timezone_names
    -- is not immutable so it cannot appear in one.
    timezone                TEXT NOT NULL DEFAULT 'Asia/Dhaka'
                                CHECK (length(timezone) > 0),
    currency                TEXT NOT NULL DEFAULT 'BDT' CHECK (currency ~ '^[A-Z]{3}$'),
    plan_id                 UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
    terminology_config      JSONB NOT NULL DEFAULT
        '{"customer":"Customer","staff":"Provider","booking":"Appointment","resource":"Station"}'::jsonb,
    booking_rules           JSONB NOT NULL DEFAULT
        '{"min_reschedule_hours":2,"min_cancel_hours":2,"max_advance_days":30,"slot_interval_minutes":15,"min_lead_minutes":60,"max_reschedules":2,"auto_confirm":true}'::jsonb,
    branding_config         JSONB NOT NULL DEFAULT
        '{"logo_url":null,"primary_color":"#1D4ED8","welcome_message":"Book your slot online"}'::jsonb,
    onboarding_step         TEXT NOT NULL DEFAULT 'industry'
                                CHECK (onboarding_step IN ('industry', 'details',
                                                           'first_service', 'working_hours',
                                                           'go_live', 'complete')),
    onboarding_completed_at TIMESTAMPTZ,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT businesses_onboarding_complete_has_timestamp
        CHECK ((onboarding_step = 'complete') = (onboarding_completed_at IS NOT NULL))
);

COMMENT ON COLUMN businesses.timezone IS
    'All appointment times are stored as timestamptz and rendered in this zone. Never render in a literal ''Asia/Dhaka'' (defect B-20).';
COMMENT ON COLUMN businesses.booking_rules IS
    'min_lead_minutes (M-03) and max_reschedules (M-04) are defined here and enforced in Phase 2. auto_confirm is internal and is not exposed by the public view.';
COMMENT ON COLUMN businesses.terminology_config IS
    'Industry label set. Every user-facing noun resolves from here — a dentist''s "Patient" is a salon''s "Client".';

-- 2. Members: the join from Supabase Auth identities to tenants, with the role.
CREATE TABLE business_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL
                    CHECK (role IN ('owner', 'manager', 'receptionist', 'staff')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, user_id)
);

COMMENT ON TABLE business_members IS
    'Role source of truth for RLS. A business must keep at least one active owner — enforced by a trigger in 0012, because losing the last owner locks a tenant out of its own account with no self-service recovery.';

CREATE TABLE branches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    address     TEXT,
    phone       TEXT CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
    map_url     TEXT,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, id)
);

-- One default branch per tenant, or none. A second default would make
-- "where is this booking" ambiguous for every walk-in.
CREATE UNIQUE INDEX branches_one_default_per_business
    ON branches (business_id) WHERE is_default;

-- 4. Platform admins (defect B-22).
--
-- Deliberately has no `business_id`: membership here is platform-wide. Neither
-- `anon` nor `authenticated` is granted anything on this table, so the only
-- read path is `is_platform_admin()`, which is SECURITY DEFINER, and the only
-- write path is the service role. A tenant cannot enumerate platform staff,
-- and cannot grant themselves the role.
CREATE TABLE platform_admins (
    user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE businesses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins  ENABLE ROW LEVEL SECURITY;

-- Policies and grants live in 0015, together, so the whole access surface can
-- be reviewed in one file rather than reconstructed from twelve.
