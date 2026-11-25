-- ---------------------------------------------------------------------------
-- Signup without the service-role key — migration 0028
--
-- 0010 proves what `register_business` writes. This file is about who may
-- call the version that signup actually uses now, because moving the front
-- door off the service key is only safe if the door still has a lock.
--
-- Three things must hold:
--
--   * `anon` cannot reach it. The publishable key ships in the browser
--     bundle; if anonymous callers could create tenants, anyone could fill
--     the table from a laptop.
--   * A session is required even for `authenticated`, which is not the same
--     statement — a definer function reached without a JWT would otherwise
--     create a business owned by NULL.
--   * The owner is `auth.uid()` and nothing else. There is no parameter for
--     it, and this asserts that the absence is load-bearing rather than
--     cosmetic: the row that comes back belongs to the caller.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
    ('9a9a0001-0000-4000-8000-000000000001', 'selfserve1@example.com'),
    ('9a9a0002-0000-4000-8000-000000000002', 'selfserve2@example.com');

-- 1. Anonymous callers are refused by the grant, before any logic runs.
DO $$
DECLARE
    blocked BOOLEAN := FALSE;
BEGIN
    SET LOCAL ROLE anon;
    BEGIN
        PERFORM register_my_business(
            'Anon Clinic', 'doctor', '+8801711000701', 'a@example.com',
            'Asia/Dhaka', 'BDT', '{}'::jsonb);
    EXCEPTION WHEN insufficient_privilege THEN
        blocked := TRUE;
    END;
    RESET ROLE;

    IF NOT blocked THEN
        RAISE EXCEPTION
            'anon can create a tenant with the publishable key; the grant on register_my_business is wrong';
    END IF;
END
$$;

-- 2. `authenticated` without a session is refused too. The role is granted
--    EXECUTE, so this one is the function's own guard rather than the grant:
--    without it the insert would name a NULL owner and the business would be
--    unreachable forever.
DO $$
DECLARE
    blocked BOOLEAN := FALSE;
BEGIN
    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM register_my_business(
            'Sessionless Clinic', 'doctor', '+8801711000702', 'b@example.com',
            'Asia/Dhaka', 'BDT', '{}'::jsonb);
    EXCEPTION WHEN insufficient_privilege THEN
        blocked := TRUE;
    END;
    RESET ROLE;

    IF NOT blocked THEN
        RAISE EXCEPTION
            'register_my_business ran without a session; it would have created an unowned business';
    END IF;
END
$$;

-- 3. The signed-in path: one call, a complete tenant, owned by the caller.
DO $$
DECLARE
    r          RECORD;
    v_owner    UUID;
    v_branches INT;
    v_tpl      INT;
BEGIN
    SET LOCAL "request.jwt.claims" =
        '{"sub":"9a9a0001-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL ROLE authenticated;

    SELECT * INTO r FROM register_my_business(
        'Banani Physio', 'doctor', '+8801711000703',
        -- Deliberately not the account's own address: the business contact
        -- and the owner identity are different things, and only one of them
        -- may be chosen by the caller.
        'reception@example.com',
        'Asia/Dhaka', 'BDT',
        '{"customer":"Patient","staff":"Doctor","booking":"Consultation","resource":"Room"}'::jsonb,
        '[{"event_type":"booking_confirmed","channel":"email","subject":"Confirmed","body_template":"Hello {{customer_name}}"}]'::jsonb);

    RESET ROLE;

    IF r.business_id IS NULL THEN
        RAISE EXCEPTION 'register_my_business returned no business';
    END IF;

    IF r.slug <> 'banani-physio' THEN
        RAISE EXCEPTION 'Expected the slug to come from the name, got %', r.slug;
    END IF;

    SELECT user_id INTO v_owner FROM business_members
    WHERE business_id = r.business_id AND role = 'owner' AND is_active;

    IF v_owner IS DISTINCT FROM '9a9a0001-0000-4000-8000-000000000001'::uuid THEN
        RAISE EXCEPTION
            'The business was not owned by the signed-in caller (owner is %)', coalesce(v_owner::text, 'NULL');
    END IF;

    SELECT count(*) INTO v_branches FROM branches
    WHERE business_id = r.business_id AND is_default;
    IF v_branches <> 1 THEN
        RAISE EXCEPTION 'A new business must have one default branch, found %', v_branches;
    END IF;

    SELECT count(*) INTO v_tpl FROM notification_templates WHERE business_id = r.business_id;
    IF v_tpl <> 1 THEN
        RAISE EXCEPTION 'Expected the seeded template, found %', v_tpl;
    END IF;
END
$$;

-- 4. The one-business-per-owner rule still applies through the wrapper. The
--    route turns this into "that account already owns a business" rather than
--    a second tenant the person did not ask for.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    SET LOCAL "request.jwt.claims" =
        '{"sub":"9a9a0001-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL ROLE authenticated;

    BEGIN
        PERFORM register_my_business(
            'Second Physio', 'doctor', '+8801711000704', 'c@example.com',
            'Asia/Dhaka', 'BDT', '{}'::jsonb);
    EXCEPTION WHEN unique_violation THEN
        rejected := TRUE;
    END;
    RESET ROLE;

    IF NOT rejected THEN
        RAISE EXCEPTION 'The same account registered a second business through the wrapper';
    END IF;
END
$$;

-- 5. A different signed-in account gets its own tenant, and cannot see the
--    first one. The wrapper changes who calls signup, not what isolation
--    means afterwards.
DO $$
DECLARE
    r       RECORD;
    v_other INT;
BEGIN
    SET LOCAL "request.jwt.claims" =
        '{"sub":"9a9a0002-0000-4000-8000-000000000002","role":"authenticated"}';
    SET LOCAL ROLE authenticated;

    SELECT * INTO r FROM register_my_business(
        'Banani Physio', 'doctor', '+8801711000705', 'd@example.com',
        'Asia/Dhaka', 'BDT', '{}'::jsonb);

    IF r.slug <> 'banani-physio-1' THEN
        RAISE EXCEPTION
            'A duplicate business name must still produce a usable slug; got %', r.slug;
    END IF;

    -- Their own, and only their own.
    SELECT count(*) INTO v_other FROM businesses;
    RESET ROLE;

    IF v_other <> 1 THEN
        RAISE EXCEPTION
            'A new owner can see % businesses through RLS; they should see only their own', v_other;
    END IF;
END
$$;
