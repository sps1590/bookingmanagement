-- ---------------------------------------------------------------------------
-- Tenant signup — plan §3.3
--
-- Signup is five writes that must all land or none. The failure the
-- transaction prevents is specific and nasty: create the business, fail before
-- the owner membership, and the result is a tenant that occupies its slug,
-- that nobody can administer, and that the person who just signed up cannot
-- retry because their chosen URL is now taken. They have no way to report it
-- either, since they cannot sign in.
--
-- So these assertions are mostly about what is true *after* one call, and what
-- is true after one that fails.
-- ---------------------------------------------------------------------------

-- 1. A complete tenant from one call.
DO $$
DECLARE
    r          RECORD;
    v_branches INT;
    v_owners   INT;
    v_tpl      INT;
    v_step     TEXT;
    v_terms    JSONB;
BEGIN
    SELECT * INTO r FROM register_business(
        'dddd0001-0000-4000-8000-000000000001',
        'Mirpur Dental Studio',
        'dentist',
        '+8801711000555',
        'founder@example.com',
        'Asia/Dhaka',
        'BDT',
        '{"customer":"Patient","staff":"Dentist","booking":"Dental Appointment","resource":"Dental Chair"}'::jsonb,
        '[{"event_type":"booking_confirmed","channel":"email","subject":"Confirmed","body_template":"Hello {{customer_name}}"},
          {"event_type":"reminder_24h","channel":"email","subject":"Tomorrow","body_template":"See you at {{time}}"}]'::jsonb,
        NULL
    );

    IF r.business_id IS NULL THEN
        RAISE EXCEPTION 'register_business returned no business';
    END IF;

    -- The code comes from a sequence, so two concurrent signups cannot mint
    -- the same one. The spec left this to application code.
    IF r.business_code !~ '^BIZ-[0-9]+$' THEN
        RAISE EXCEPTION 'Expected a BIZ-#### code, got %', r.business_code;
    END IF;

    IF r.slug <> 'mirpur-dental-studio' THEN
        RAISE EXCEPTION 'Expected the slug to come from the name, got %', r.slug;
    END IF;

    SELECT count(*) INTO v_owners FROM business_members
    WHERE business_id = r.business_id AND role = 'owner' AND is_active;
    IF v_owners <> 1 THEN
        RAISE EXCEPTION 'A new business must have exactly one active owner, found %', v_owners;
    END IF;

    SELECT count(*) INTO v_branches FROM branches
    WHERE business_id = r.business_id AND is_default;
    IF v_branches <> 1 THEN
        RAISE EXCEPTION 'A new business must have one default branch, found %', v_branches;
    END IF;

    SELECT count(*) INTO v_tpl FROM notification_templates WHERE business_id = r.business_id;
    IF v_tpl <> 2 THEN
        RAISE EXCEPTION 'Expected the 2 seeded templates, found %', v_tpl;
    END IF;

    -- Onboarding resumes from the row, not from a cookie, so a closed laptop
    -- does not restart the wizard.
    SELECT onboarding_step, terminology_config INTO v_step, v_terms
    FROM businesses WHERE id = r.business_id;

    IF v_step <> 'details' THEN
        RAISE EXCEPTION 'A new business should be waiting at the details step, found %', v_step;
    END IF;

    IF v_terms ->> 'customer' <> 'Patient' THEN
        RAISE EXCEPTION 'Industry terminology was not applied: %', v_terms;
    END IF;

    -- Not publicly bookable until onboarding finishes.
    IF EXISTS (SELECT 1 FROM public_businesses WHERE slug = r.slug) THEN
        RAISE EXCEPTION 'A business mid-onboarding is already listed publicly';
    END IF;
END
$$;

-- 2. A name that is already taken still works. "Dental Care" is going to
-- collide, and the second clinic must not be turned away at signup.
DO $$
DECLARE
    first_slug  TEXT;
    second_slug TEXT;
BEGIN
    INSERT INTO auth.users (id, email) VALUES
        ('eeee0001-0000-4000-8000-000000000001', 'rival1@example.com'),
        ('eeee0002-0000-4000-8000-000000000002', 'rival2@example.com');

    SELECT slug INTO first_slug FROM register_business(
        'eeee0001-0000-4000-8000-000000000001', 'Smile Dental Care', 'dentist',
        '+8801711000601', 'r1@example.com', 'Asia/Dhaka', 'BDT', '{}'::jsonb);

    SELECT slug INTO second_slug FROM register_business(
        'eeee0002-0000-4000-8000-000000000002', 'Smile Dental Care', 'dentist',
        '+8801711000602', 'r2@example.com', 'Asia/Dhaka', 'BDT', '{}'::jsonb);

    IF first_slug <> 'smile-dental-care' THEN
        RAISE EXCEPTION 'Unexpected first slug: %', first_slug;
    END IF;

    IF second_slug <> 'smile-dental-care-1' THEN
        RAISE EXCEPTION
            'A duplicate business name must still produce a usable slug; got %', second_slug;
    END IF;
END
$$;

-- 3. A name with nothing slug-able in it still yields a valid URL. Bengali,
-- Arabic or emoji business names reduce to an empty string, which would
-- violate the slug CHECK and fail the signup for a reason the person cannot
-- act on.
DO $$
DECLARE
    v_slug TEXT;
BEGIN
    INSERT INTO auth.users (id, email)
    VALUES ('eeee0003-0000-4000-8000-000000000003', 'bangla@example.com');

    SELECT slug INTO v_slug FROM register_business(
        'eeee0003-0000-4000-8000-000000000003', 'ঢাকা ডেন্টাল', 'dentist',
        '+8801711000603', 'b@example.com', 'Asia/Dhaka', 'BDT', '{}'::jsonb);

    IF v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(v_slug) < 3 THEN
        RAISE EXCEPTION
            'A non-Latin business name must still produce a valid slug; got %', coalesce(v_slug, 'NULL');
    END IF;
END
$$;

-- 4. One business per owner, for now — and the refusal is explicit rather
-- than a second tenant nobody meant to create.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM register_business(
            'dddd0001-0000-4000-8000-000000000001', 'Second Clinic', 'doctor',
            '+8801711000604', 'again@example.com', 'Asia/Dhaka', 'BDT', '{}'::jsonb);
    EXCEPTION WHEN unique_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'The same account registered a second business';
    END IF;
END
$$;

-- 5. An unknown owner is refused. The API route creates the Auth identity
-- first, so this can only happen if the two have drifted — and silently
-- creating an unowned tenant would be the worst available answer.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM register_business(
            'ffff0009-0000-4000-8000-000000000009', 'Ghost Clinic', 'doctor',
            '+8801711000605', 'ghost@example.com', 'Asia/Dhaka', 'BDT', '{}'::jsonb);
    EXCEPTION WHEN foreign_key_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A business was created for a non-existent user';
    END IF;
END
$$;

-- 6. Signup is unauthenticated, so this function is the one place an
-- anonymous request could reach a cross-tenant write. It must be unreachable
-- with the publishable key: the route that calls it holds the service key.
DO $$
DECLARE
    r       TEXT;
    blocked BOOLEAN;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        blocked := FALSE;
        EXECUTE format('SET LOCAL ROLE %I', r);
        BEGIN
            PERFORM register_business(
                'dddd0001-0000-4000-8000-000000000001', 'Injected', 'other',
                '+8801711000606', 'x@example.com', 'Asia/Dhaka', 'BDT', '{}'::jsonb);
        EXCEPTION WHEN insufficient_privilege THEN
            blocked := TRUE;
        END;
        RESET ROLE;

        IF NOT blocked THEN
            RAISE EXCEPTION
                'Role % can execute register_business; only service_role may', r;
        END IF;
    END LOOP;
END
$$;
