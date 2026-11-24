-- ---------------------------------------------------------------------------
-- The platform operator's reach — defect B-22, decision D-012
--
-- B-22: the spec sells a Super Admin console and defines no table, function or
-- policy for it, so the only route to cross-tenant access is the service-role
-- key wired into an admin page. `platform_admins` and `is_platform_admin()`
-- close that.
--
-- D-012 then narrows what the role grants, which is a deliberate departure
-- from the register's instruction that "every RLS policy gains
-- OR is_platform_admin()". A support engineer looking at a tenant's plan,
-- working hours or unpaid invoice does not need a standing ambient read of
-- every clinic's patient list. So the clause appears on configuration tables
-- and not on `customers`, `bookings`, `booking_history`, `waitlist_entries` or
-- `notification_logs`.
--
-- The console that genuinely needs patient data still has it, through the
-- service role, where the access is an explicit act rather than a property of
-- being logged in. Both halves are asserted here, because the risk with a
-- documented limit is that someone later "fixes" it by adding the clause
-- everywhere.
-- ---------------------------------------------------------------------------

SET LOCAL "request.jwt.claims" =
    '{"sub":"cccc0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- The operator is a member of no business.
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM business_members
    WHERE user_id = 'cccc0001-0000-4000-8000-000000000001';
    IF n <> 0 THEN
        RAISE EXCEPTION 'The fixture operator should not be a member of any tenant';
    END IF;
END
$$;

-- Configuration across every tenant: readable. This is what makes the Super
-- Admin console possible at all (B-22).
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM businesses;
    IF n < 2 THEN
        RAISE EXCEPTION
            'A platform admin should see every tenant, saw % (defect B-22)', n;
    END IF;

    SELECT count(*) INTO n FROM services;
    IF n < 2 THEN RAISE EXCEPTION 'A platform admin should see every tenant''s services, saw %', n; END IF;

    SELECT count(*) INTO n FROM staff_resources;
    IF n < 3 THEN RAISE EXCEPTION 'A platform admin should see every tenant''s staff, saw %', n; END IF;

    SELECT count(*) INTO n FROM availability_rules;
    IF n = 0 THEN RAISE EXCEPTION 'A platform admin cannot read working hours, which support needs'; END IF;

    SELECT count(*) INTO n FROM business_members;
    IF n < 4 THEN RAISE EXCEPTION 'A platform admin should see memberships, saw %', n; END IF;

    SELECT count(*) INTO n FROM payments;
    IF n < 1 THEN RAISE EXCEPTION 'A platform admin cannot read payments, which billing support needs'; END IF;
END
$$;

-- Patient data across every tenant: not readable. Deliberate (D-012).
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM customers;
    IF n <> 0 THEN
        RAISE EXCEPTION
            'A platform admin has an ambient read of % customer records, including clinical notes. D-012 says this access belongs to the service-role console, not to a JWT.',
            n;
    END IF;

    SELECT count(*) INTO n FROM bookings;
    IF n <> 0 THEN
        RAISE EXCEPTION 'A platform admin has an ambient read of % appointments (D-012)', n;
    END IF;

    SELECT count(*) INTO n FROM notification_logs;
    IF n <> 0 THEN
        RAISE EXCEPTION
            'A platform admin has an ambient read of % notification logs, every row of which holds a customer contact (D-012)',
            n;
    END IF;

    SELECT count(*) INTO n FROM booking_history;
    IF n <> 0 THEN
        RAISE EXCEPTION 'A platform admin has an ambient read of % booking history rows (D-012)', n;
    END IF;
END
$$;

-- The grant is read-only. A platform admin is not an admin of any tenant, so
-- platform writes go through the service role, where they are deliberate.
DO $$
DECLARE
    touched INT;
    rejected BOOLEAN := FALSE;
BEGIN
    WITH attempt AS (
        UPDATE businesses SET name = 'Renamed by the platform'
        WHERE id = 'aaaa0000-0000-4000-8000-000000000001'
        RETURNING 1
    )
    SELECT count(*) INTO touched FROM attempt;

    IF touched <> 0 THEN
        RAISE EXCEPTION 'A platform admin renamed a tenant through RLS (D-012: reads only)';
    END IF;

    BEGIN
        INSERT INTO services (business_id, name, duration_minutes)
        VALUES ('aaaa0000-0000-4000-8000-000000000001', 'Added by the platform', 30);
    EXCEPTION WHEN insufficient_privilege THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A platform admin wrote into a tenant''s catalogue (D-012: reads only)';
    END IF;
END
$$;

-- A tenant cannot see who the operators are, and cannot become one. Both
-- matter: an enumerable operator list is a target list, and a self-service
-- grant is a privilege escalation.
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE
    blocked_read  BOOLEAN := FALSE;
    blocked_write BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM 1 FROM platform_admins;
    EXCEPTION WHEN insufficient_privilege THEN
        blocked_read := TRUE;
    END;

    IF NOT blocked_read THEN
        RAISE EXCEPTION 'A tenant owner can enumerate the platform operators';
    END IF;

    BEGIN
        INSERT INTO platform_admins (user_id)
        VALUES ('aaaa0001-0000-4000-8000-000000000001');
    EXCEPTION WHEN insufficient_privilege THEN
        blocked_write := TRUE;
    END;

    IF NOT blocked_write THEN
        RAISE EXCEPTION 'A tenant owner made themselves a platform operator';
    END IF;
END
$$;

-- And the helper reports honestly for an ordinary user.
DO $$
BEGIN
    IF is_platform_admin() THEN
        RAISE EXCEPTION 'is_platform_admin() returned true for a tenant owner';
    END IF;
END
$$;
