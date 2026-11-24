-- ---------------------------------------------------------------------------
-- 0002 — Subscription plans
--
-- The platform's own product catalogue. One row per tier; `businesses.plan_id`
-- points here. Enforcement of the caps is Phase 8 — this migration only makes
-- the limits representable.
--
-- Changes from the spec's DDL:
--
--   * `monthly_sms_quota` is gone. There is no SMS channel (docs/DECISIONS.md
--     D-009). It is replaced by `monthly_email_quota`, which exists for a
--     different reason: the platform's whole email allowance is 3,000 messages
--     a month shared across *every* tenant (docs/FREE_STACK.md §1). A per-plan
--     cap is how one busy clinic is stopped from spending the allowance that
--     nine other tenants are relying on. The sum of (quota x expected tenants)
--     is meant to stay under the platform allowance, so these numbers are
--     deliberately small.
--
--   * `features.whatsapp` is gone for the same reason (D-009).
--
--   * RLS is enabled with an explicit public-read policy. The spec omits this
--     table from its ALTER list entirely (defect B-25), which leaves the whole
--     price list — including inactive and unreleased tiers — readable through
--     PostgREST by anyone who guesses the table name.
--
--   * `sort_order` and `updated_at` added; a pricing page needs a stable order
--     and plan limits will be edited in place.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE TABLE subscription_plans (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                 TEXT NOT NULL UNIQUE
                             CHECK (code ~ '^[a-z][a-z0-9_]{1,29}$'),
    name                 TEXT NOT NULL CHECK (length(trim(name)) > 0),
    monthly_price        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
    currency             TEXT NOT NULL DEFAULT 'BDT' CHECK (currency ~ '^[A-Z]{3}$'),
    max_branches         INT NOT NULL DEFAULT 1 CHECK (max_branches > 0),
    max_staff            INT NOT NULL DEFAULT 2 CHECK (max_staff > 0),
    max_monthly_bookings INT NOT NULL DEFAULT 50 CHECK (max_monthly_bookings > 0),
    -- Per-tenant share of the platform-wide email allowance. See note above.
    monthly_email_quota  INT NOT NULL DEFAULT 0 CHECK (monthly_email_quota >= 0),
    features             JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order           INT NOT NULL DEFAULT 0,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE subscription_plans IS
    'Platform product catalogue. Caps are enforced in Phase 8; this table only stores them.';
COMMENT ON COLUMN subscription_plans.monthly_email_quota IS
    'Per-tenant cap carved out of the platform-wide free email allowance (3,000/month across all tenants). Not a per-tenant entitlement the platform can honour independently.';

INSERT INTO subscription_plans
    (code, name, monthly_price, max_branches, max_staff, max_monthly_bookings,
     monthly_email_quota, sort_order, features)
VALUES
    ('free', 'Starter Free', 0, 1, 2, 50, 100, 10, jsonb_build_object(
        'exports', false, 'custom_domain', false, 'waitlist', false,
        'analytics', false, 'multi_branch', false, 'web_push', true,
        'calendar_invite', true, 'telegram_digest', false)),
    ('pro', 'Business Pro', 1500, 3, 15, 2000, 800, 20, jsonb_build_object(
        'exports', true, 'custom_domain', false, 'waitlist', true,
        'analytics', true, 'multi_branch', true, 'web_push', true,
        'calendar_invite', true, 'telegram_digest', true)),
    ('enterprise', 'Enterprise', 5000, 20, 100, 50000, 2000, 30, jsonb_build_object(
        'exports', true, 'custom_domain', true, 'waitlist', true,
        'analytics', true, 'multi_branch', true, 'web_push', true,
        'calendar_invite', true, 'telegram_digest', true))
ON CONFLICT (code) DO NOTHING;

-- Defect B-25. Without this the table is world-readable through PostgREST.
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone may read active plans"
    ON subscription_plans FOR SELECT
    USING (is_active = TRUE);

-- Writes are the platform's own business: service role only, no policy.
REVOKE ALL ON subscription_plans FROM anon, authenticated;
GRANT SELECT ON subscription_plans TO anon, authenticated;
