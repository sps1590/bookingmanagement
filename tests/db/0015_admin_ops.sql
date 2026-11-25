-- ---------------------------------------------------------------------------
-- The no-show counter and branch scoping — defect M-07, and the Phase 4 gate
-- "a manager of Branch A cannot see Branch B's bookings".
--
-- Both are things the spec assumed and the schema could not express. The
-- counter was displayed on the CRM screen and written by nothing, so a serial
-- no-show read as a reliable patient. Branch scoping had nowhere to live at
-- all: `business_members` carried a role and no branch.
-- ---------------------------------------------------------------------------

SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- 1. Defect M-07. Marking a no-show counts it.
DO $$
DECLARE
    v_before INT;
    v_after  INT;
BEGIN
    SELECT no_show_count INTO v_before FROM customers
    WHERE id = 'aaaa00c1-0000-4000-8000-000000000001';

    PERFORM set_booking_status('aaaa00d1-0000-4000-8000-000000000001', 'no_show', 'Did not arrive');

    SELECT no_show_count INTO v_after FROM customers
    WHERE id = 'aaaa00c1-0000-4000-8000-000000000001';

    IF v_after <> v_before + 1 THEN
        RAISE EXCEPTION
            'A no-show did not reach customers.no_show_count (% -> %). The CRM shows this number and a serial no-show would read as reliable (defect M-07)',
            v_before, v_after;
    END IF;
END
$$;

-- 2. It counts once, not twice. set_booking_status used to increment the
--    column itself; 0022 moved that to a trigger, and leaving both in place
--    would have double-counted — a harder bug to see than counting none.
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT no_show_count INTO v_count FROM customers
    WHERE id = 'aaaa00c1-0000-4000-8000-000000000001';

    -- The fixture starts at zero and exactly one booking has been marked.
    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'One no-show produced a count of %. The trigger and set_booking_status are both incrementing.',
            v_count;
    END IF;
END
$$;

-- 3. And it comes back down. Marking someone a no-show by mistake must not
--    leave a permanent mark — this number decides whether a clinic asks for a
--    deposit.
DO $$
DECLARE
    v_count INT;
BEGIN
    -- no_show is terminal in the status machine, so a correction is a direct
    -- write, which is exactly why the counter is a trigger rather than a line
    -- inside set_booking_status.
    UPDATE bookings SET status = 'completed'
    WHERE id = 'aaaa00d1-0000-4000-8000-000000000001';

    SELECT no_show_count INTO v_count FROM customers
    WHERE id = 'aaaa00c1-0000-4000-8000-000000000001';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'Correcting a mistaken no-show left the count at %', v_count;
    END IF;
END
$$;

-- 4. The counter never goes negative, whatever order things happen in. The
--    column has a non-negative CHECK, and a correction must not be able to
--    fail the update it is correcting.
DO $$
DECLARE
    v_count INT;
BEGIN
    UPDATE customers SET no_show_count = 0
    WHERE id = 'aaaa00c1-0000-4000-8000-000000000001';

    UPDATE bookings SET status = 'no_show'
    WHERE id = 'aaaa00d1-0000-4000-8000-000000000001';
    UPDATE bookings SET status = 'completed'
    WHERE id = 'aaaa00d1-0000-4000-8000-000000000001';
    UPDATE bookings SET status = 'cancelled'
    WHERE id = 'aaaa00d1-0000-4000-8000-000000000001';

    SELECT no_show_count INTO v_count FROM customers
    WHERE id = 'aaaa00c1-0000-4000-8000-000000000001';

    IF v_count < 0 THEN
        RAISE EXCEPTION 'no_show_count went negative (%)', v_count;
    END IF;
END
$$;

-- --- Branch scoping --------------------------------------------------------

RESET ROLE;

-- A second branch for tenant A, and a booking in it.
INSERT INTO branches (id, business_id, name)
VALUES ('aaaa00b2-0000-4000-8000-000000000001',
        'aaaa0000-0000-4000-8000-000000000001', 'Dhanmondi Chamber');

INSERT INTO staff_resources (id, business_id, branch_id, name)
VALUES ('aaaa00f3-0000-4000-8000-000000000001',
        'aaaa0000-0000-4000-8000-000000000001',
        'aaaa00b2-0000-4000-8000-000000000001', 'Dr Haque');

INSERT INTO bookings
    (id, business_id, branch_id, customer_id, service_id, staff_id,
     start_time, end_time, buffer_before_minutes, buffer_after_minutes)
VALUES ('aaaa00d3-0000-4000-8000-000000000001',
        'aaaa0000-0000-4000-8000-000000000001',
        'aaaa00b2-0000-4000-8000-000000000001',
        'aaaa00c1-0000-4000-8000-000000000001',
        'aaaa00e1-0000-4000-8000-000000000001',
        'aaaa00f3-0000-4000-8000-000000000001',
        '2027-01-12 10:00+06', '2027-01-12 11:00+06', 0, 0);

-- A booking with no branch at all. `bookings.branch_id` is ON DELETE SET
-- NULL, so this is what a closed branch leaves behind.
INSERT INTO bookings
    (id, business_id, branch_id, customer_id, service_id, staff_id,
     start_time, end_time, buffer_before_minutes, buffer_after_minutes)
VALUES ('aaaa00d4-0000-4000-8000-000000000001',
        'aaaa0000-0000-4000-8000-000000000001',
        NULL,
        'aaaa00c1-0000-4000-8000-000000000001',
        'aaaa00e1-0000-4000-8000-000000000001',
        'aaaa00f3-0000-4000-8000-000000000001',
        '2027-01-13 10:00+06', '2027-01-13 11:00+06', 0, 0);

-- 5. An unpinned member sees the whole business. This is every existing row
--    and every single-branch tenant, so it must not change.
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_seen INT;
BEGIN
    SELECT count(*) INTO v_seen FROM bookings
    WHERE business_id = 'aaaa0000-0000-4000-8000-000000000001';

    IF v_seen < 4 THEN
        RAISE EXCEPTION
            'An unpinned owner sees only % bookings; branch scoping must not narrow a member who has no branch', v_seen;
    END IF;
END
$$;

-- 6. Pinned to Gulshan, the owner stops seeing Dhanmondi — the Phase 4 gate.
RESET ROLE;
UPDATE business_members
SET branch_id = 'aaaa00b1-0000-4000-8000-000000000001'
WHERE business_id = 'aaaa0000-0000-4000-8000-000000000001'
  AND user_id = 'aaaa0001-0000-4000-8000-000000000001';

SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_other INT;
    v_own   INT;
BEGIN
    SELECT count(*) INTO v_other FROM bookings
    WHERE id = 'aaaa00d3-0000-4000-8000-000000000001';

    IF v_other <> 0 THEN
        RAISE EXCEPTION
            'A member pinned to Gulshan can still read the Dhanmondi booking';
    END IF;

    SELECT count(*) INTO v_own FROM bookings
    WHERE branch_id = 'aaaa00b1-0000-4000-8000-000000000001';

    IF v_own = 0 THEN
        RAISE EXCEPTION 'A member pinned to Gulshan can no longer read Gulshan''s own bookings';
    END IF;
END
$$;

-- 7. A booking with no branch stays visible. Otherwise closing a branch makes
--    its remaining appointments invisible to everyone on the morning they are
--    due, which is the failure nobody discovers until the patient arrives.
DO $$
DECLARE
    v_orphan INT;
BEGIN
    SELECT count(*) INTO v_orphan FROM bookings
    WHERE id = 'aaaa00d4-0000-4000-8000-000000000001';

    IF v_orphan <> 1 THEN
        RAISE EXCEPTION
            'A booking with no branch is invisible to a pinned member; a closed branch would hide its remaining appointments';
    END IF;
END
$$;

-- 8. A pinned member cannot write into another branch either. Read scoping
--    without write scoping would let the desk move an appointment into a
--    branch it cannot then see.
DO $$
DECLARE
    v_code TEXT;
BEGIN
    BEGIN
        INSERT INTO bookings
            (business_id, branch_id, customer_id, service_id, staff_id,
             start_time, end_time, buffer_before_minutes, buffer_after_minutes)
        VALUES ('aaaa0000-0000-4000-8000-000000000001',
                'aaaa00b2-0000-4000-8000-000000000001',
                'aaaa00c1-0000-4000-8000-000000000001',
                'aaaa00e1-0000-4000-8000-000000000001',
                'aaaa00f3-0000-4000-8000-000000000001',
                '2027-01-14 10:00+06', '2027-01-14 11:00+06', 0, 0);
        v_code := 'INSERTED';
    EXCEPTION WHEN insufficient_privilege THEN
        v_code := 'refused';
    END;

    IF v_code <> 'refused' THEN
        RAISE EXCEPTION
            'A member pinned to Gulshan created a booking in Dhanmondi';
    END IF;
END
$$;
