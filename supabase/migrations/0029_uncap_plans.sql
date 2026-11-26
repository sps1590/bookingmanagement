-- ---------------------------------------------------------------------------
-- 0029 — No tenant is capped
--
-- 0002 shipped a price list with three tiers and a Starter Free plan allowing
-- two providers, one branch and fifty bookings a month. 0026 made those
-- numbers real with constraint triggers, which was the right call: a limit
-- enforced in a form is a limit anyone with the API walks past.
--
-- The numbers themselves were wrong for this deployment. A clinic that adds
-- its third doctor is not abusing anything, and it met a trigger whose only
-- answer was "upgrade" — to a plan that cannot be bought, because this
-- platform has no billing. The cap stopped the owner from using their own
-- software and offered them nothing in exchange.
--
-- So the caps become NULL, which the enforcement already reads as "no limit":
--
--     plan_limit()        returns NULL  -> enforce_plan_limit() returns NEW
--     max_monthly_bookings IS NULL      -> gate 6 of create_booking is skipped
--
-- Nothing is deleted. The columns, the triggers and the per-tenant counting
-- all stay exactly as they were, so the day this platform does sell tiers,
-- setting a number is the whole change. What is removed is the number, not
-- the machinery.
--
-- Two further details:
--
--   * The column defaults become NULL as well. Leaving DEFAULT 2 behind would
--     mean the next plan anybody inserts is capped at two providers by
--     accident, which is how this started.
--
--   * `expire_subscriptions` paged past the free plan's staff allowance with
--     `OFFSET (SELECT max_staff ...)`. PostgreSQL treats `OFFSET NULL` as
--     `OFFSET 0`, so an uncapped free plan would have made the downgrade path
--     suspend *every* provider in the business instead of none. It is guarded
--     below. The function is unreachable today (no billing, so no expiry),
--     which is exactly why it had to be fixed now rather than when it fires.
--
-- `monthly_email_quota` is deliberately left alone. It is not the platform's
-- choice to make: the whole deployment shares one 3,000-message monthly
-- allowance from the email provider (docs/FREE_STACK.md §1), and a per-tenant
-- number here cannot create messages that do not exist. It gates nothing in
-- the code today.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- NULL is already the "unlimited" sentinel everywhere it is read. Make it
-- storable, and make it the default.
--
-- The CHECK constraints (`max_staff > 0` and friends) need no change: a CHECK
-- that evaluates to NULL passes, so they still reject 0 and -1 while allowing
-- "no limit".
ALTER TABLE subscription_plans
    ALTER COLUMN max_branches         DROP NOT NULL,
    ALTER COLUMN max_branches         SET DEFAULT NULL,
    ALTER COLUMN max_staff            DROP NOT NULL,
    ALTER COLUMN max_staff            SET DEFAULT NULL,
    ALTER COLUMN max_monthly_bookings DROP NOT NULL,
    ALTER COLUMN max_monthly_bookings SET DEFAULT NULL;

COMMENT ON COLUMN subscription_plans.max_staff IS
    'NULL means unlimited, and is the default. Read by plan_limit(), which returns NULL to enforce_plan_limit(), which then admits the row.';
COMMENT ON COLUMN subscription_plans.max_branches IS
    'NULL means unlimited, and is the default.';
COMMENT ON COLUMN subscription_plans.max_monthly_bookings IS
    'NULL means unlimited, and is the default. Gate 6 of create_booking_atomic skips the monthly count entirely when it is NULL.';

-- Every tier, not only Starter Free. A free plan that allowed more than Pro
-- would be a worse price list than no price list, and this platform charges
-- nobody for anything today.
UPDATE subscription_plans
SET max_branches         = NULL,
    max_staff            = NULL,
    max_monthly_bookings = NULL,
    -- No feature is withheld either. `plan_feature()` defaults a missing or
    -- false flag to refused, and the honest answer here is that everything
    -- this software can do, every tenant can do.
    features             = features
                           || jsonb_build_object(
                                  'exports',         true,
                                  'custom_domain',   true,
                                  'waitlist',        true,
                                  'analytics',       true,
                                  'multi_branch',    true,
                                  'web_push',        true,
                                  'calendar_invite', true,
                                  'telegram_digest', true),
    updated_at           = NOW();

COMMENT ON TABLE subscription_plans IS
    'Platform product catalogue. Every cap is NULL (unlimited) as of 0029; the enforcement in 0026 stays, so selling a tier means setting a number, not writing code.';

/**
 * Downgrade what has lapsed — with the OFFSET landmine removed.
 *
 * Identical to 0026 except that an unlimited free plan now suspends nobody.
 * `OFFSET NULL` is `OFFSET 0` in PostgreSQL, so the previous body would have
 * deactivated every provider in a business the moment a paid plan expired
 * onto an uncapped free tier — the opposite of what the plan allows.
 */
CREATE OR REPLACE FUNCTION expire_subscriptions(p_grace_days INT DEFAULT 3)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_free       UUID;
    v_free_staff INT;
    v_count      INT := 0;
    v_biz        RECORD;
BEGIN
    SELECT id, max_staff INTO v_free, v_free_staff
    FROM subscription_plans WHERE code = 'free';

    IF v_free IS NULL THEN
        RETURN 0;
    END IF;

    FOR v_biz IN
        SELECT b.id
        FROM businesses b
        WHERE b.plan_expires_at IS NOT NULL
          AND b.plan_expires_at < NOW() - make_interval(days => greatest(coalesce(p_grace_days, 3), 0))
          AND b.plan_id <> v_free
    LOOP
        UPDATE businesses
        SET plan_id = v_free, plan_expires_at = NULL, updated_at = NOW()
        WHERE id = v_biz.id;

        -- Only when the plan being downgraded *to* actually has a ceiling.
        IF v_free_staff IS NOT NULL THEN
            -- Suspend the newest first: the people hired under the bigger plan
            -- are the ones it was bought for.
            UPDATE staff_resources
            SET is_active = FALSE, updated_at = NOW()
            WHERE id IN (
                SELECT id FROM staff_resources
                WHERE business_id = v_biz.id AND is_active
                ORDER BY created_at DESC
                OFFSET v_free_staff
            );
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;
