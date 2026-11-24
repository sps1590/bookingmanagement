-- ---------------------------------------------------------------------------
-- The anonymous role — defect B-05
--
-- `anon` is the role behind the publishable key, and that key ships in the
-- browser bundle by design. So "what can anon read" is "what can anyone on the
-- internet read", and it has to be answered by a test rather than by trust.
--
-- The spec answers it with two policies:
--
--     CREATE POLICY "Public can view active businesses"
--         ON businesses FOR SELECT USING (is_active = TRUE);
--     CREATE POLICY "Public can view active staff"
--         ON staff_resources FOR SELECT USING (is_active = TRUE);
--
-- Row-Level Security filters rows, never columns. So those two lines publish
-- the owner's email address and every staff member's personal phone number and
-- email — on a platform whose stated market is doctors and dental clinics.
--
-- Here, `anon` has no privilege on either table and reads four curated views
-- instead.
-- ---------------------------------------------------------------------------

-- A tenant that has not finished onboarding, inserted while we still hold the
-- privileged connection role. Assertion 6 below checks it stays invisible.
INSERT INTO businesses (id, slug, name, business_type, phone, onboarding_step)
VALUES ('eeee0000-0000-4000-8000-000000000001', 'half-built-clinic',
        'Half Built Clinic', 'doctor', '+8801711000777', 'details');

SET LOCAL ROLE anon;

-- 1. Private base tables are not merely empty for anon; they are refused.
--
-- Asserting the error rather than a zero row count is deliberate. If someone
-- later grants anon SELECT and leans on RLS to filter, this test fails and
-- forces that to be a decision rather than an accident — which is exactly the
-- step that was skipped in the spec.
DO $$
DECLARE
    t TEXT;
    refused BOOLEAN;
BEGIN
    FOREACH t IN ARRAY ARRAY['customers', 'bookings', 'booking_history',
                             'notification_logs', 'business_members',
                             'businesses', 'staff_resources', 'payments',
                             'availability_rules', 'platform_admins']
    LOOP
        refused := FALSE;
        BEGIN
            EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t);
        EXCEPTION WHEN insufficient_privilege THEN
            refused := TRUE;
        END;

        IF NOT refused THEN
            RAISE EXCEPTION
                'anon can reach the base table %, which makes every column of it public (defect B-05)',
                t;
        END IF;
    END LOOP;
END
$$;

-- 2. The public portal still works: the curated views are readable.
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM public_businesses WHERE slug = 'dhaka-dental-care';
    IF n <> 1 THEN
        RAISE EXCEPTION 'anon cannot read the public business view; the booking portal would be empty';
    END IF;

    SELECT count(*) INTO n FROM public_services;
    IF n < 2 THEN RAISE EXCEPTION 'anon should see both tenants'' public services, saw %', n; END IF;

    SELECT count(*) INTO n FROM public_staff;
    IF n < 3 THEN RAISE EXCEPTION 'anon should see the public provider list, saw %', n; END IF;
END
$$;

-- 3. The regression that matters: no contact column exists on public_staff.
--
-- Not "is null", not "is empty" — the column is absent, so no query can ask
-- for it and no future `select=*` can widen it back.
DO $$
DECLARE
    c TEXT;
    absent BOOLEAN;
BEGIN
    FOREACH c IN ARRAY ARRAY['phone', 'email', 'user_id']
    LOOP
        absent := FALSE;
        BEGIN
            EXECUTE format('SELECT %I FROM public.public_staff LIMIT 1', c);
        EXCEPTION WHEN undefined_column THEN
            absent := TRUE;
        END;

        IF NOT absent THEN
            RAISE EXCEPTION
                'public_staff exposes %, which is a staff member''s personal detail (defect B-05)',
                c;
        END IF;
    END LOOP;
END
$$;

-- 4. The business view withholds the tenant's private settings too.
DO $$
DECLARE
    c TEXT;
    absent BOOLEAN;
BEGIN
    FOREACH c IN ARRAY ARRAY['email', 'plan_id', 'business_code', 'is_active',
                             'onboarding_step']
    LOOP
        absent := FALSE;
        BEGIN
            EXECUTE format('SELECT %I FROM public.public_businesses LIMIT 1', c);
        EXCEPTION WHEN undefined_column THEN
            absent := TRUE;
        END;

        IF NOT absent THEN
            RAISE EXCEPTION 'public_businesses exposes %, which is tenant-private', c;
        END IF;
    END LOOP;
END
$$;

-- 5. `auto_confirm` is internal scheduling policy and is not in the curated
-- booking_rules object. Checked because the view rebuilds that JSON key by
-- key, and the easy "fix" when a key is missing is to pass the whole column
-- through — which would publish this one along with it.
DO $$
DECLARE
    rules JSONB;
BEGIN
    SELECT booking_rules INTO rules FROM public_businesses WHERE slug = 'dhaka-dental-care';

    IF rules ? 'auto_confirm' THEN
        RAISE EXCEPTION 'public_businesses.booking_rules leaks auto_confirm';
    END IF;

    IF NOT (rules ? 'slot_interval_minutes') THEN
        RAISE EXCEPTION 'public_businesses.booking_rules is missing slot_interval_minutes, which the slot picker needs';
    END IF;
END
$$;

-- 6. A tenant that has not finished onboarding is not publicly bookable.
-- Otherwise a customer reaches /book/<slug>, finds no services and no working
-- hours, and concludes the clinic is closed.
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM public_businesses WHERE slug = 'half-built-clinic';
    IF n <> 0 THEN
        RAISE EXCEPTION 'A business mid-onboarding is publicly listed';
    END IF;
END
$$;
