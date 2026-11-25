-- ---------------------------------------------------------------------------
-- The permission matrix — defect B-23, and the deliverable of Phase 7
--
-- The spec's RBAC table promises "Service Provider / Staff — Own Schedule
-- Only" and its SQL writes `ON bookings FOR ALL USING
-- (is_business_member(business_id))`, which hands a part-time stylist the
-- whole salon. The plan calls the matrix the deliverable of this phase rather
-- than the staff portal, and it is right: a screen that hides a row is not a
-- permission, it is a decoration over one.
--
-- Every check runs as a real JWT against real policies, and every one that
-- could raise is wrapped — a refusal is an *expected outcome* here, and an
-- uncaught one would abort the transaction and take the rest of the matrix
-- with it.
--
-- The cast:
--   aaaa0001  owner of tenant A
--   aaaa0002  Dr Rahman, a provider at A (role `staff`)
--   aaaa0003  Dr Chowdhury, a provider at A (role `staff`)
--   cccc0001  the platform operator
--   dddd0001  a receptionist at A, added below
-- ---------------------------------------------------------------------------

INSERT INTO business_members (business_id, user_id, role)
VALUES ('aaaa0000-0000-4000-8000-000000000001',
        'dddd0001-0000-4000-8000-000000000001',
        'receptionist');

CREATE TEMP TABLE outcome (what TEXT, got TEXT, want TEXT);
GRANT INSERT, SELECT ON outcome TO authenticated, anon;

-- Record the result of a query that returns a scalar.
CREATE OR REPLACE FUNCTION pg_temp.check_value(p_what TEXT, p_sql TEXT, p_want TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_got TEXT;
BEGIN
    EXECUTE p_sql INTO v_got;
    INSERT INTO outcome VALUES (p_what, coalesce(v_got, 'NULL'), p_want);
EXCEPTION WHEN OTHERS THEN
    -- A refusal is a result, not a crash. SQLERRM carries the canonical code
    -- for BK001 errors and the Postgres message otherwise.
    INSERT INTO outcome VALUES (p_what, SQLERRM, p_want);
END;
$$;

-- =========================================================================
-- staff: Dr Rahman
-- =========================================================================
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0002-0000-4000-8000-000000000002","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.check_value(
    'staff sees own booking',
    $q$SELECT count(*)::text FROM bookings WHERE id = 'aaaa00d1-0000-4000-8000-000000000001'$q$,
    '1');

SELECT pg_temp.check_value(
    'staff cannot see a colleague''s booking',
    $q$SELECT count(*)::text FROM bookings WHERE id = 'aaaa00d2-0000-4000-8000-000000000001'$q$,
    '0');

SELECT pg_temp.check_value(
    'staff cannot see another tenant''s bookings',
    $q$SELECT count(*)::text FROM bookings WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001'$q$,
    '0');

SELECT pg_temp.check_value(
    'staff cannot see another tenant''s customers',
    $q$SELECT count(*)::text FROM customers WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001'$q$,
    '0');

SELECT pg_temp.check_value(
    'staff cannot read revenue',
    $q$SELECT count(*)::text FROM revenue_summary('aaaa0000-0000-4000-8000-000000000001', CURRENT_DATE - 30, CURRENT_DATE)$q$,
    'FORBIDDEN');

SELECT pg_temp.check_value(
    'staff cannot change a colleague''s booking',
    $q$SELECT set_booking_status('aaaa00d2-0000-4000-8000-000000000001', 'checked_in', NULL)$q$,
    'FORBIDDEN');

SELECT pg_temp.check_value(
    'staff can change their own booking',
    $q$SELECT set_booking_status('aaaa00d1-0000-4000-8000-000000000001', 'checked_in', NULL)$q$,
    'checked_in');

-- =========================================================================
-- receptionist
-- =========================================================================
RESET ROLE;
SET LOCAL "request.jwt.claims" =
    '{"sub":"dddd0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.check_value(
    'receptionist sees the whole diary',
    $q$SELECT CASE WHEN count(*) >= 2 THEN 'yes' ELSE 'no' END FROM bookings WHERE business_id = 'aaaa0000-0000-4000-8000-000000000001'$q$,
    'yes');

SELECT pg_temp.check_value(
    'receptionist cannot read revenue',
    $q$SELECT count(*)::text FROM revenue_summary('aaaa0000-0000-4000-8000-000000000001', CURRENT_DATE - 30, CURRENT_DATE)$q$,
    'FORBIDDEN');

SELECT pg_temp.check_value(
    'receptionist cannot see another tenant',
    $q$SELECT count(*)::text FROM bookings WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001'$q$,
    '0');

SELECT pg_temp.check_value(
    'receptionist cannot delete a customer',
    $q$WITH d AS (DELETE FROM customers WHERE id = 'aaaa00c1-0000-4000-8000-000000000001' RETURNING 1) SELECT count(*)::text FROM d$q$,
    '0');

-- =========================================================================
-- owner
-- =========================================================================
RESET ROLE;
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.check_value(
    'owner reads revenue',
    $q$SELECT count(*)::text FROM revenue_summary('aaaa0000-0000-4000-8000-000000000001', CURRENT_DATE - 30, CURRENT_DATE)$q$,
    '1');

SELECT pg_temp.check_value(
    'owner sees the whole diary',
    $q$SELECT CASE WHEN count(*) >= 2 THEN 'yes' ELSE 'no' END FROM bookings WHERE business_id = 'aaaa0000-0000-4000-8000-000000000001'$q$,
    'yes');

SELECT pg_temp.check_value(
    'owner cannot see another tenant',
    $q$SELECT count(*)::text FROM bookings WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001'$q$,
    '0');

SELECT pg_temp.check_value(
    'owner sees their own plan usage',
    $q$SELECT count(*)::text FROM plan_usage WHERE business_id = 'aaaa0000-0000-4000-8000-000000000001'$q$,
    '1');

SELECT pg_temp.check_value(
    'owner cannot see another tenant''s plan usage',
    $q$SELECT count(*)::text FROM plan_usage WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001'$q$,
    '0');

-- Refused by the column grant in 0015, not by a policy: `businesses` grants
-- UPDATE on a named list of columns and `plan_id` is not among them. That is a
-- stronger answer than an empty result — the statement never runs — and the
-- expectation here was wrong rather than the schema.
SELECT pg_temp.check_value(
    'owner cannot upgrade their own plan',
    $q$WITH u AS (UPDATE businesses SET plan_id = (SELECT id FROM subscription_plans WHERE code = 'enterprise') WHERE id = 'aaaa0000-0000-4000-8000-000000000001' RETURNING 1) SELECT count(*)::text FROM u$q$,
    'permission denied for table businesses');

SELECT pg_temp.check_value(
    'owner can still edit their own details',
    $q$WITH u AS (UPDATE businesses SET phone = '+8801711000099' WHERE id = 'aaaa0000-0000-4000-8000-000000000001' RETURNING 1) SELECT count(*)::text FROM u$q$,
    '1');

-- =========================================================================
-- the platform operator — D-012: configuration only, never patient data
-- =========================================================================
RESET ROLE;
SET LOCAL "request.jwt.claims" =
    '{"sub":"cccc0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.check_value(
    'platform operator cannot read bookings',
    $q$SELECT count(*)::text FROM bookings$q$,
    '0');

SELECT pg_temp.check_value(
    'platform operator cannot read customers',
    $q$SELECT count(*)::text FROM customers$q$,
    '0');

-- =========================================================================
-- anon — the key that ships in every browser
-- =========================================================================
RESET ROLE;
SET LOCAL ROLE anon;

SELECT pg_temp.check_value(
    'anon cannot read bookings',
    $q$SELECT count(*)::text FROM bookings$q$,
    'permission denied for table bookings');

SELECT pg_temp.check_value(
    'anon cannot read customers',
    $q$SELECT count(*)::text FROM customers$q$,
    'permission denied for table customers');

SELECT pg_temp.check_value(
    'anon cannot read staff contact details',
    $q$SELECT count(*)::text FROM staff_resources$q$,
    'permission denied for table staff_resources');

SELECT pg_temp.check_value(
    'anon can read the published view',
    $q$SELECT CASE WHEN count(*) >= 0 THEN 'allowed' END FROM public_businesses$q$,
    'allowed');

RESET ROLE;

-- =========================================================================
-- The verdict, as one message naming every cell that moved
-- =========================================================================
DO $$
DECLARE
    v_bad   TEXT;
    v_total INT;
BEGIN
    SELECT count(*) INTO v_total FROM outcome;

    SELECT string_agg(format('%s — got "%s", wanted "%s"', what, got, want), E'\n  ' ORDER BY what)
    INTO v_bad
    FROM outcome
    WHERE got IS DISTINCT FROM want;

    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION E'Permission matrix: % of % cells failed\n  %',
            (SELECT count(*) FROM outcome WHERE got IS DISTINCT FROM want), v_total, v_bad;
    END IF;

    IF v_total < 20 THEN
        RAISE EXCEPTION 'Only % cells ran; the matrix is the deliverable of this phase', v_total;
    END IF;
END
$$;
