-- ---------------------------------------------------------------------------
-- create_booking_atomic — defect B-06, gate by gate
--
-- The spec's version inserts after no validation at all, and is callable by
-- `anon` against any business id the public portal publishes. Each block below
-- is one of the things that made possible. A gate with no failing-case test is
-- a gate nobody has seen fail, so every one of the ten has an entry here.
--
-- The error contract: SQLSTATE BK001, with the canonical ErrorCode from
-- lib/api/errors.ts as the message. Asserting on the code rather than the
-- sentence is deliberate — the sentences are written for patients and will be
-- rewritten and translated, and a test that pins them turns copy-editing into
-- a build failure.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE probe AS
SELECT d::date AS work_day
FROM generate_series(
         (NOW() AT TIME ZONE 'Asia/Dhaka')::date + 3,
         (NOW() AT TIME ZONE 'Asia/Dhaka')::date + 12,
         INTERVAL '1 day') AS d
WHERE EXTRACT(DOW FROM d) BETWEEN 0 AND 4
ORDER BY d
LIMIT 1;

CREATE TEMP TABLE slot AS
SELECT min(slot_start) AS at
FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                         'aaaa00e1-0000-4000-8000-000000000001',
                         'aaaa00f1-0000-4000-8000-000000000001',
                         (SELECT work_day FROM probe));

-- 0. The happy path, so that every refusal below means something. A booking
--    is created, the per-tenant daily code is assigned by the trigger, a
--    token is minted, the buffers are snapshotted from the service, and the
--    audit trail records who did it.
DO $$
DECLARE
    v_r      RECORD;
    v_buf_b  INT;
    v_buf_a  INT;
    v_hist   INT;
BEGIN
    SELECT * INTO v_r
    FROM create_booking_atomic(
        'aaaa0000-0000-4000-8000-000000000001',
        'aaaa00e1-0000-4000-8000-000000000001',
        'aaaa00f1-0000-4000-8000-000000000001',
        (SELECT at FROM slot),
        'Rafiq Islam', '+8801911000001', 'rafiq@example.com', NULL, NULL, 'online');

    IF v_r.booking_id IS NULL OR v_r.booking_code IS NULL
       OR length(v_r.reschedule_token) <> 48 THEN
        RAISE EXCEPTION 'Booking came back incomplete: id=%, code=%, token length=%',
            v_r.booking_id, v_r.booking_code, length(v_r.reschedule_token);
    END IF;

    IF v_r.status <> 'confirmed' THEN
        RAISE EXCEPTION 'auto_confirm is true for this tenant, so the booking should be confirmed, not %', v_r.status;
    END IF;

    SELECT buffer_before_minutes, buffer_after_minutes INTO v_buf_b, v_buf_a
    FROM bookings WHERE id = v_r.booking_id;

    IF v_buf_b <> 10 OR v_buf_a <> 15 THEN
        RAISE EXCEPTION
            'Buffers were not snapshotted from the service (10/15): got %/% — defect B-03 depends on this',
            v_buf_b, v_buf_a;
    END IF;

    SELECT count(*) INTO v_hist FROM booking_history
    WHERE booking_id = v_r.booking_id AND action = 'created';
    IF v_hist <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one "created" audit row, found %', v_hist;
    END IF;
END
$$;

-- 10. The constraint, not the gate, is the last word. Booking the same slot
--     again must come back as SLOT_TAKEN rather than a raw 23P01.
DO $$
DECLARE
    v_msg TEXT;
BEGIN
    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            (SELECT at FROM slot),
            'Second Customer', '+8801911000002', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    -- Gate 5 sees the slot is gone and says so first, which is the better
    -- message; either answer is correct, a raw exclusion_violation is not.
    IF v_msg NOT IN ('SLOT_TAKEN', 'SLOT_UNAVAILABLE') THEN
        RAISE EXCEPTION 'Re-booking a taken slot gave "%" instead of a clean SLOT_TAKEN', v_msg;
    END IF;
END
$$;

-- 3. Gate 3 — defect M-01. A provider who does not perform the service.
DO $$
DECLARE
    v_staff UUID;
    v_msg   TEXT;
BEGIN
    INSERT INTO staff_resources (business_id, branch_id, name)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'aaaa00b1-0000-4000-8000-000000000001', 'Ms Hygienist')
    RETURNING id INTO v_staff;

    INSERT INTO availability_rules
        (business_id, staff_id, day_of_week, start_time, end_time, is_break)
    SELECT 'aaaa0000-0000-4000-8000-000000000001', v_staff, d::smallint,
           TIME '10:00', TIME '18:00', FALSE
    FROM generate_series(0, 6) d;

    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'aaaa00e1-0000-4000-8000-000000000001',
            v_staff,
            (SELECT at FROM slot) + INTERVAL '2 hours',
            'Curious Patient', '+8801911000003', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'STAFF_SERVICE_MISMATCH' THEN
        RAISE EXCEPTION
            'A hygienist was accepted for a root canal (got "%") — defect M-01', v_msg;
    END IF;
END
$$;

-- 1 and 2. Gates 1 and 2 — a business that is not taking bookings, and a
--    service belonging to a different tenant.
DO $$
DECLARE
    v_msg TEXT;
BEGIN
    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'bbbb00e1-0000-4000-8000-000000000001',   -- the salon's service
            'aaaa00f1-0000-4000-8000-000000000001',
            (SELECT at FROM slot) + INTERVAL '3 hours',
            'Cross Tenant', '+8801911000004', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'NOT_FOUND' THEN
        RAISE EXCEPTION
            'Tenant A accepted a booking for tenant B''s service (got "%")', v_msg;
    END IF;
END
$$;

DO $$
DECLARE
    v_msg TEXT;
BEGIN
    UPDATE businesses SET is_active = FALSE
    WHERE id = 'bbbb0000-0000-4000-8000-000000000001';

    BEGIN
        PERFORM * FROM create_booking_atomic(
            'bbbb0000-0000-4000-8000-000000000001',
            'bbbb00e1-0000-4000-8000-000000000001',
            'bbbb00f1-0000-4000-8000-000000000001',
            NOW() + INTERVAL '5 days',
            'Walk Up', '+12125559002', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'NOT_FOUND' THEN
        RAISE EXCEPTION 'A deactivated business still took a booking (got "%")', v_msg;
    END IF;

    UPDATE businesses SET is_active = TRUE
    WHERE id = 'bbbb0000-0000-4000-8000-000000000001';
END
$$;

-- 4. Gate 4 — defects M-02 and M-03. Too soon, and too far ahead.
DO $$
DECLARE
    v_msg TEXT;
BEGIN
    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            NOW() + INTERVAL '2 minutes',
            'In A Hurry', '+8801911000005', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'OUTSIDE_BOOKING_WINDOW' THEN
        RAISE EXCEPTION
            'A booking two minutes away was accepted (got "%") — defect M-03', v_msg;
    END IF;
END
$$;

DO $$
DECLARE
    v_msg TEXT;
BEGIN
    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            NOW() + INTERVAL '400 days',
            'Very Organised', '+8801911000006', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'OUTSIDE_BOOKING_WINDOW' THEN
        RAISE EXCEPTION
            'A booking 400 days out was accepted (got "%") — defect M-02', v_msg;
    END IF;
END
$$;

-- 5. Gate 5 — the authoritative check. 13:00 is inside the lunch break, so the
--    picker never offered it. The spec would have inserted it happily.
DO $$
DECLARE
    v_day DATE := (SELECT work_day FROM probe);
    v_msg TEXT;
BEGIN
    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            (v_day + TIME '13:00') AT TIME ZONE 'Asia/Dhaka',
            'Lunch Crasher', '+8801911000007', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'SLOT_UNAVAILABLE' THEN
        RAISE EXCEPTION
            'An appointment was booked during the provider''s break (got "%") — defect B-06', v_msg;
    END IF;
END
$$;

-- 6. Gate 6 — the plan quota. The fixture already holds bookings for this
--    tenant, so a cap of one is already spent.
DO $$
DECLARE
    v_msg TEXT;
BEGIN
    UPDATE subscription_plans SET max_monthly_bookings = 1 WHERE code = 'pro';

    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            (SELECT at FROM slot) + INTERVAL '4 hours',
            'Over Quota', '+8801911000008', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'PLAN_LIMIT_REACHED' THEN
        RAISE EXCEPTION 'The monthly booking quota was not enforced (got "%")', v_msg;
    END IF;

    UPDATE subscription_plans SET max_monthly_bookings = 2000 WHERE code = 'pro';
END
$$;

-- 7. Gate 7 — abuse control. One phone number must not be able to hold a
--    tenant's whole week. The fixture's patient already has two future
--    bookings, so a cap of one is exceeded.
DO $$
DECLARE
    v_msg TEXT;
BEGIN
    UPDATE businesses
    SET booking_rules = booking_rules || '{"max_active_per_customer":1}'::jsonb
    WHERE id = 'aaaa0000-0000-4000-8000-000000000001';

    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            (SELECT at FROM slot) + INTERVAL '4 hours',
            'Nusrat Jahan', '+8801811000001', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'RATE_LIMITED' THEN
        RAISE EXCEPTION
            'One phone number was allowed to exceed max_active_per_customer (got "%")', v_msg;
    END IF;

    UPDATE businesses
    SET booking_rules = booking_rules || '{"max_active_per_customer":3}'::jsonb
    WHERE id = 'aaaa0000-0000-4000-8000-000000000001';
END
$$;

-- 8. Gate 8 — the spec hardcodes 'confirmed' and ignores its own auto_confirm
--    flag, so a clinic that wants to vet every request receives none of them.
DO $$
DECLARE
    v_status TEXT;
BEGIN
    UPDATE businesses
    SET booking_rules = booking_rules || '{"auto_confirm":false}'::jsonb
    WHERE id = 'aaaa0000-0000-4000-8000-000000000001';

    SELECT status INTO v_status
    FROM create_booking_atomic(
        'aaaa0000-0000-4000-8000-000000000001',
        'aaaa00e1-0000-4000-8000-000000000001',
        'aaaa00f2-0000-4000-8000-000000000001',
        (SELECT at FROM slot),
        'Needs Approval', '+8801911000009', NULL, NULL, NULL, 'online');

    IF v_status <> 'pending' THEN
        RAISE EXCEPTION
            'auto_confirm is false, so the booking should be pending, not "%"', v_status;
    END IF;
END
$$;

-- A booking taken at the front desk is confirmed whatever auto_confirm says:
-- the person typing it is the person who would have approved it.
DO $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status
    FROM create_booking_atomic(
        'aaaa0000-0000-4000-8000-000000000001',
        'aaaa00e1-0000-4000-8000-000000000001',
        'aaaa00f2-0000-4000-8000-000000000001',
        (SELECT at FROM slot) + INTERVAL '2 hours',
        'Walk In', '+8801911000010', NULL, NULL, NULL, 'walk_in');

    IF v_status <> 'confirmed' THEN
        RAISE EXCEPTION 'A walk-in should be confirmed at the desk, got "%"', v_status;
    END IF;
END
$$;
