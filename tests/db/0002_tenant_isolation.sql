-- ---------------------------------------------------------------------------
-- Cross-tenant isolation
--
-- The plan's Phase 1 exit gate: tenant A's signed-in owner must see exactly
-- their own rows and none of tenant B's. This is the test that cannot be
-- replaced by reading the policies, because the failure mode is a policy that
-- looks right — `USING (is_business_member(business_id))` reads perfectly —
-- and is attached to the wrong command, or to a table that was added later and
-- never got one.
--
-- `SET LOCAL ROLE authenticated` plus a `request.jwt.claims` GUC is how
-- Supabase presents a signed-in user to Postgres, so `auth.uid()` resolves
-- exactly as it does in production.
-- ---------------------------------------------------------------------------

SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- Tenant A's owner sees tenant A.
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM businesses;
    IF n <> 1 THEN
        RAISE EXCEPTION 'Owner of tenant A should see exactly 1 business, saw %', n;
    END IF;

    SELECT count(*) INTO n FROM customers;
    IF n <> 1 THEN
        RAISE EXCEPTION 'Owner of tenant A should see their 1 customer, saw %', n;
    END IF;

    SELECT count(*) INTO n FROM bookings;
    IF n <> 2 THEN
        RAISE EXCEPTION 'Owner of tenant A should see their 2 bookings, saw %', n;
    END IF;
END
$$;

-- And none of tenant B's, on any table that holds tenant data.
DO $$
DECLARE
    tenant_b UUID := 'bbbb0000-0000-4000-8000-000000000001';
    n INT;
BEGIN
    SELECT count(*) INTO n FROM bookings WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s bookings', n; END IF;

    SELECT count(*) INTO n FROM customers WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s customers', n; END IF;

    SELECT count(*) INTO n FROM notification_logs WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s notification logs', n; END IF;

    SELECT count(*) INTO n FROM booking_history WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s booking history', n; END IF;

    SELECT count(*) INTO n FROM business_members WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s memberships', n; END IF;

    SELECT count(*) INTO n FROM services WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s services', n; END IF;

    SELECT count(*) INTO n FROM staff_resources WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s staff', n; END IF;

    SELECT count(*) INTO n FROM availability_rules WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s working hours (defect N-01)', n; END IF;

    SELECT count(*) INTO n FROM payments WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s payments', n; END IF;

    SELECT count(*) INTO n FROM branches WHERE business_id = tenant_b;
    IF n <> 0 THEN RAISE EXCEPTION 'Leaked % of tenant B''s branches', n; END IF;
END
$$;

-- Writing into another tenant is refused, not silently redirected. RLS turns a
-- disallowed INSERT into error 42501, which is the only safe answer: a write
-- that quietly lands somewhere else is worse than one that fails.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO customers (business_id, full_name, phone)
        VALUES ('bbbb0000-0000-4000-8000-000000000001', 'Injected', '+8801911000099');
    EXCEPTION WHEN insufficient_privilege THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'Tenant A was able to insert a customer into tenant B';
    END IF;
END
$$;

-- A signed-in user who belongs to no tenant sees nothing at all. Worth its own
-- assertion: "authenticated" is not a permission, and a bug that treats it as
-- one is invisible while every test user happens to be a member of something.
SET LOCAL "request.jwt.claims" =
    '{"sub":"dddd0001-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM businesses;
    IF n <> 0 THEN RAISE EXCEPTION 'A non-member saw % businesses', n; END IF;

    SELECT count(*) INTO n FROM bookings;
    IF n <> 0 THEN RAISE EXCEPTION 'A non-member saw % bookings', n; END IF;

    SELECT count(*) INTO n FROM customers;
    IF n <> 0 THEN RAISE EXCEPTION 'A non-member saw % customers', n; END IF;
END
$$;
