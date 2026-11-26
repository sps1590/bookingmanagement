-- ---------------------------------------------------------------------------
-- Plan caps are lifted, and the enforcement still works — migration 0029
--
-- The owner of a real clinic could not add a third doctor. The Starter Free
-- plan allowed two, the constraint trigger from 0026 did its job, and the
-- only remedy on offer was an upgrade to a plan this platform cannot sell.
--
-- 0029 sets every cap to NULL. That is one line of SQL and three claims worth
-- proving, because "unlimited" implemented as a NULL has a way of becoming
-- "zero" in the places that forgot to ask:
--
--   1. A tenant on the free plan can add providers and branches past the old
--      ceilings, and keep going.
--   2. The machinery is still there. Put a number back and the trigger
--      refuses the row exactly as before — the caps were removed, not the
--      ability to have caps.
--   3. `expire_subscriptions` does not suspend everybody. `OFFSET NULL` is
--      `OFFSET 0` in PostgreSQL, so an uncapped free plan would otherwise
--      have deactivated every provider in a downgraded business.
--
-- Tenant B (Northside Salon) is the free-plan tenant in the fixture and
-- starts with one provider and one branch.
-- ---------------------------------------------------------------------------

-- 1. Past the old ceilings, and well past them.
DO $$
DECLARE
    v_staff INT;
    v_branch INT;
BEGIN
    INSERT INTO staff_resources (business_id, branch_id, name, title)
    SELECT 'bbbb0000-0000-4000-8000-000000000001',
           'bbbb00b1-0000-4000-8000-000000000001',
           'Stylist ' || n, 'Stylist'
    FROM generate_series(2, 12) AS n;

    INSERT INTO branches (business_id, name)
    SELECT 'bbbb0000-0000-4000-8000-000000000001', 'Branch ' || n
    FROM generate_series(2, 6) AS n;

    SELECT count(*) INTO v_staff FROM staff_resources
    WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001' AND is_active;

    SELECT count(*) INTO v_branch FROM branches
    WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001' AND is_active;

    IF v_staff <> 12 THEN
        RAISE EXCEPTION 'The free plan stopped at % providers; it should have no ceiling', v_staff;
    END IF;

    IF v_branch <> 6 THEN
        RAISE EXCEPTION 'The free plan stopped at % branches; it should have no ceiling', v_branch;
    END IF;
END
$$;

-- 2. The trigger is still a trigger. A tier that does carry a number must
--    still refuse the row that crosses it, or 0029 did not lift the caps —
--    it deleted the ability to have one.
DO $$
DECLARE
    v_msg TEXT;
BEGIN
    UPDATE subscription_plans SET max_staff = 12 WHERE code = 'free';

    BEGIN
        INSERT INTO staff_resources (business_id, branch_id, name)
        VALUES ('bbbb0000-0000-4000-8000-000000000001',
                'bbbb00b1-0000-4000-8000-000000000001', 'One Too Many');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'PLAN_LIMIT_REACHED' THEN
        RAISE EXCEPTION 'A cap of 12 did not refuse the 13th provider (got "%")', v_msg;
    END IF;

    UPDATE subscription_plans SET max_staff = NULL WHERE code = 'free';

    -- And with the cap gone, the very row that was just refused goes in.
    INSERT INTO staff_resources (business_id, branch_id, name)
    VALUES ('bbbb0000-0000-4000-8000-000000000001',
            'bbbb00b1-0000-4000-8000-000000000001', 'One Too Many');
END
$$;

-- 3. A lapsed plan downgrades without emptying the clinic.
DO $$
DECLARE
    v_active   INT;
    v_expected INT;
    v_moved    INT;
    v_plan     TEXT;
BEGIN
    SELECT count(*) INTO v_expected FROM staff_resources
    WHERE business_id = 'aaaa0000-0000-4000-8000-000000000001' AND is_active;

    UPDATE businesses
    SET plan_expires_at = NOW() - INTERVAL '30 days'
    WHERE id = 'aaaa0000-0000-4000-8000-000000000001';

    SELECT expire_subscriptions(3) INTO v_moved;

    IF v_moved <> 1 THEN
        RAISE EXCEPTION 'The lapsed tenant was not downgraded (% moved)', v_moved;
    END IF;

    SELECT sp.code INTO v_plan
    FROM businesses b JOIN subscription_plans sp ON sp.id = b.plan_id
    WHERE b.id = 'aaaa0000-0000-4000-8000-000000000001';

    IF v_plan <> 'free' THEN
        RAISE EXCEPTION 'The lapsed tenant landed on "%" rather than the free plan', v_plan;
    END IF;

    SELECT count(*) INTO v_active FROM staff_resources
    WHERE business_id = 'aaaa0000-0000-4000-8000-000000000001' AND is_active;

    IF v_active <> v_expected THEN
        RAISE EXCEPTION
            'Downgrading onto an uncapped plan suspended providers: % of % left active — OFFSET NULL is OFFSET 0',
            v_active, v_expected;
    END IF;
END
$$;

-- 4. And the monthly booking gate asks nothing of an uncapped tenant.
DO $$
DECLARE
    v_cap INT;
BEGIN
    SELECT max_monthly_bookings INTO v_cap
    FROM subscription_plans WHERE code = 'free';

    IF v_cap IS NOT NULL THEN
        RAISE EXCEPTION 'The free plan still caps bookings at % a month', v_cap;
    END IF;
END
$$;
