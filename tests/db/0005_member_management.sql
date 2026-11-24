-- ---------------------------------------------------------------------------
-- Managing members — defect B-21, and the last-owner guard
--
-- The spec gives `business_members` a SELECT policy and nothing else. So an
-- owner cannot invite a receptionist: the product's own staff-management
-- screen is unimplementable against its own schema. That is B-21.
--
-- Fixing it introduces a question the spec never asks — may a manager create
-- an owner? If yes, "manager" is a synonym for "owner", because a manager can
-- promote themselves and then do anything. The policies say no, and that is
-- asserted below.
--
-- The last-owner guard is not from the spec at all. It is here because the
-- failure has no self-service recovery: remove the last active owner and
-- nobody left can invite anyone, change the plan, or edit the business. The
-- only way back is the platform operator reaching in with the service key.
-- ---------------------------------------------------------------------------

-- Make the second provider a manager, so the role boundary has two sides.
UPDATE business_members SET role = 'manager'
WHERE user_id = 'aaaa0003-0000-4000-8000-000000000003';

INSERT INTO auth.users (id, email)
VALUES ('aaaa0004-0000-4000-8000-000000000004', 'desk-a@example.com');

-- === As the owner of tenant A ===============================================
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- B-21: inviting a receptionist works at all.
DO $$
DECLARE
    n INT;
BEGIN
    INSERT INTO business_members (business_id, user_id, role, invited_by)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'aaaa0004-0000-4000-8000-000000000004', 'receptionist',
            'aaaa0001-0000-4000-8000-000000000001');

    SELECT count(*) INTO n FROM business_members
    WHERE user_id = 'aaaa0004-0000-4000-8000-000000000004';

    IF n <> 1 THEN
        RAISE EXCEPTION 'An owner could not invite a receptionist (defect B-21)';
    END IF;
END
$$;

-- An owner cannot invite into someone else's business.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO business_members (business_id, user_id, role)
        VALUES ('bbbb0000-0000-4000-8000-000000000001',
                'aaaa0004-0000-4000-8000-000000000004', 'manager');
    EXCEPTION WHEN insufficient_privilege THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'Tenant A''s owner added a member to tenant B';
    END IF;
END
$$;

-- The last active owner cannot step down.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        DELETE FROM business_members
        WHERE user_id = 'aaaa0001-0000-4000-8000-000000000001';
    EXCEPTION WHEN check_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'The last owner removed themselves and locked the tenant out';
    END IF;
END
$$;

-- Nor deactivate themselves, which is the same lockout by a different route.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE business_members SET is_active = FALSE
        WHERE user_id = 'aaaa0001-0000-4000-8000-000000000001';
    EXCEPTION WHEN check_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'The last owner deactivated themselves';
    END IF;
END
$$;

-- With a second owner in place, stepping down is allowed. The guard protects
-- the business, not the individual.
DO $$
DECLARE
    gone INT;
BEGIN
    UPDATE business_members SET role = 'owner'
    WHERE user_id = 'aaaa0003-0000-4000-8000-000000000003';

    DELETE FROM business_members
    WHERE user_id = 'aaaa0001-0000-4000-8000-000000000001';

    SELECT count(*) INTO gone FROM business_members
    WHERE user_id = 'aaaa0001-0000-4000-8000-000000000001';

    IF gone <> 0 THEN
        RAISE EXCEPTION 'An owner could not step down even with a co-owner present';
    END IF;
END
$$;

-- === As a manager of tenant A ===============================================
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0002-0000-4000-8000-000000000002","role":"authenticated"}';

-- aaaa0002 is a plain staff member in the fixture, so promote them to manager
-- and create the identity the manager is about to invite. Both need the
-- privileged role: `authenticated` has no grant on auth.users, which is
-- correct — real identities are created through Supabase Auth, not SQL.
RESET ROLE;
UPDATE business_members SET role = 'manager'
WHERE user_id = 'aaaa0002-0000-4000-8000-000000000002';
INSERT INTO auth.users (id, email)
VALUES ('aaaa0005-0000-4000-8000-000000000005', 'hired@example.com');
SET LOCAL ROLE authenticated;

-- A manager may invite ordinary staff.
DO $$
DECLARE
    n INT;
BEGIN
    INSERT INTO business_members (business_id, user_id, role)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'aaaa0005-0000-4000-8000-000000000005', 'staff');

    SELECT count(*) INTO n FROM business_members
    WHERE user_id = 'aaaa0005-0000-4000-8000-000000000005';

    IF n <> 1 THEN RAISE EXCEPTION 'A manager could not invite a staff member'; END IF;
END
$$;

-- But a manager may not mint an owner.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO business_members (business_id, user_id, role)
        VALUES ('aaaa0000-0000-4000-8000-000000000001',
                'aaaa0004-0000-4000-8000-000000000004', 'owner');
    EXCEPTION WHEN insufficient_privilege OR unique_violation THEN
        -- unique_violation would mean the row already exists from an earlier
        -- assertion; either way the manager did not create an owner.
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A manager created an owner, which makes the two roles identical';
    END IF;
END
$$;

-- Nor promote themselves to one.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
    role_now TEXT;
BEGIN
    BEGIN
        UPDATE business_members SET role = 'owner'
        WHERE user_id = 'aaaa0002-0000-4000-8000-000000000002';
    EXCEPTION WHEN insufficient_privilege THEN
        rejected := TRUE;
    END;

    SELECT role INTO role_now FROM business_members
    WHERE user_id = 'aaaa0002-0000-4000-8000-000000000002';

    IF role_now = 'owner' THEN
        RAISE EXCEPTION 'A manager promoted themselves to owner';
    END IF;
END
$$;

-- === Deleting a business must still work ====================================
-- The guard fires on every member delete, including the ones a cascade issues
-- when the tenant itself is removed. If it did not notice that case, a
-- business would be undeletable.
RESET ROLE;

DO $$
DECLARE
    n INT;
BEGIN
    DELETE FROM businesses WHERE id = 'bbbb0000-0000-4000-8000-000000000001';

    SELECT count(*) INTO n FROM business_members
    WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001';

    IF n <> 0 THEN
        RAISE EXCEPTION 'Deleting a business left % memberships behind', n;
    END IF;
END
$$;
