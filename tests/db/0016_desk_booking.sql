-- ---------------------------------------------------------------------------
-- The walk-in path — migration 0023
--
-- Phase 2's minimum lead time (defect M-03) is right for the public portal and
-- makes the front desk unusable: a walk-in is by definition inside it. Worse
-- than refusing, `get_available_slots` had already filtered those times out,
-- so the error said "that time is not available" about a provider sitting
-- right there.
--
-- What must still hold for the desk: working hours, breaks, closures, the
-- service mapping, and the exclusion constraint. The desk may ignore the
-- customer's courtesy window. It may not book someone into their lunch.
-- ---------------------------------------------------------------------------

-- Dr Rahman works 10:00-18:00 Sunday to Thursday with a 13:00-14:00 break.
-- Give him today as well, whatever weekday today is, so "now" is inside his
-- working day no matter when the suite runs.
INSERT INTO availability_rules (business_id, staff_id, day_of_week, start_time, end_time, is_break)
SELECT 'aaaa0000-0000-4000-8000-000000000001'::uuid,
       'aaaa00f1-0000-4000-8000-000000000001'::uuid,
       d::smallint, TIME '00:00', TIME '23:45', FALSE
FROM generate_series(0, 6) AS d
WHERE d NOT IN (SELECT day_of_week FROM availability_rules
                WHERE staff_id = 'aaaa00f1-0000-4000-8000-000000000001'
                  AND NOT is_break);

SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- 1. The desk sees times the public portal does not. The lead time is 60
--    minutes, so anything sooner is invisible online and must be offered here.
DO $$
DECLARE
    v_today  DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
    v_public INT;
    v_desk   INT;
BEGIN
    SELECT count(*) INTO v_public
    FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                             'aaaa00e1-0000-4000-8000-000000000001',
                             'aaaa00f1-0000-4000-8000-000000000001', v_today)
    WHERE slot_start < NOW() + INTERVAL '60 minutes';

    SELECT count(*) INTO v_desk
    FROM get_desk_slots('aaaa0000-0000-4000-8000-000000000001',
                        'aaaa00e1-0000-4000-8000-000000000001',
                        'aaaa00f1-0000-4000-8000-000000000001', v_today)
    WHERE slot_start < NOW() + INTERVAL '60 minutes';

    IF v_public <> 0 THEN
        RAISE EXCEPTION
            'The public slot list offered % slot(s) inside the lead time (defect M-03)', v_public;
    END IF;

    IF v_desk = 0 THEN
        RAISE EXCEPTION
            'The desk was offered nothing inside the lead time, so a walk-in standing at the counter cannot be booked at all';
    END IF;
END
$$;

-- 2. The desk still cannot book into a break. This is the line the plan draws:
--    the customer's cutoff may be overridden, the availability gates may not.
DO $$
DECLARE
    v_day DATE;
    v_hit INT;
BEGIN
    -- A day where the 13:00-14:00 break applies (Sunday to Thursday).
    SELECT d::date INTO v_day
    FROM generate_series((NOW() AT TIME ZONE 'Asia/Dhaka')::date + 1,
                         (NOW() AT TIME ZONE 'Asia/Dhaka')::date + 8,
                         INTERVAL '1 day') AS d
    WHERE EXTRACT(DOW FROM d) BETWEEN 0 AND 4
    ORDER BY d LIMIT 1;

    SELECT count(*) INTO v_hit
    FROM get_desk_slots('aaaa0000-0000-4000-8000-000000000001',
                        'aaaa00e1-0000-4000-8000-000000000001',
                        'aaaa00f1-0000-4000-8000-000000000001', v_day)
    WHERE to_char(slot_start AT TIME ZONE 'Asia/Dhaka', 'HH24:MI') = '13:00';

    IF v_hit > 0 THEN
        RAISE EXCEPTION
            'The desk was offered 13:00, which is inside the provider''s break';
    END IF;
END
$$;

-- 3. A walk-in inside the lead time is accepted, and is confirmed rather than
--    pending — the person typing it is the person who would have approved it.
DO $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
    v_at    TIMESTAMPTZ;
    v_r     RECORD;
BEGIN
    SELECT slot_start INTO v_at
    FROM get_desk_slots('aaaa0000-0000-4000-8000-000000000001',
                        'aaaa00e1-0000-4000-8000-000000000001',
                        'aaaa00f1-0000-4000-8000-000000000001', v_today)
    WHERE slot_start < NOW() + INTERVAL '60 minutes'
    ORDER BY slot_start
    LIMIT 1;

    IF v_at IS NULL THEN
        RAISE EXCEPTION 'No desk slot inside the lead time to test with';
    END IF;

    SELECT * INTO v_r
    FROM create_booking_atomic(
        'aaaa0000-0000-4000-8000-000000000001',
        'aaaa00e1-0000-4000-8000-000000000001',
        'aaaa00f1-0000-4000-8000-000000000001',
        v_at, 'Walk In Patient', '+8801911500001', NULL, NULL, NULL, 'walk_in');

    IF v_r.booking_id IS NULL THEN
        RAISE EXCEPTION 'A walk-in at the next free slot was refused';
    END IF;

    IF v_r.status <> 'confirmed' THEN
        RAISE EXCEPTION 'A walk-in should be confirmed at the desk, got "%"', v_r.status;
    END IF;
END
$$;

-- 4. The same time through the public path is still refused. If this passes
--    for the wrong reason the lead time has simply been removed, which is the
--    defect M-03 was about.
DO $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
    v_at    TIMESTAMPTZ;
    v_msg   TEXT;
BEGIN
    SELECT slot_start INTO v_at
    FROM get_desk_slots('aaaa0000-0000-4000-8000-000000000001',
                        'aaaa00e1-0000-4000-8000-000000000001',
                        'aaaa00f1-0000-4000-8000-000000000001', v_today)
    WHERE slot_start < NOW() + INTERVAL '45 minutes'
    ORDER BY slot_start DESC
    LIMIT 1;

    IF v_at IS NULL THEN
        RETURN;  -- nothing close enough today to make the point
    END IF;

    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            v_at, 'Online Customer', '+8801911500002', NULL, NULL, NULL, 'online');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg = 'NO ERROR' THEN
        RAISE EXCEPTION
            'The public path accepted a booking inside the lead time; 0023 removed the gate instead of scoping it (defect M-03)';
    END IF;
END
$$;

-- 5. `walk_in` is not a password. A caller who is not a member of the business
--    cannot use the source to skip the lead time — otherwise the public
--    endpoint could pass it and the gate would be decorative.
RESET ROLE;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';
SET LOCAL ROLE anon;

DO $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
    v_msg   TEXT;
BEGIN
    BEGIN
        PERFORM * FROM create_booking_atomic(
            'aaaa0000-0000-4000-8000-000000000001',
            'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            NOW() + INTERVAL '10 minutes',
            'Pretend Desk', '+8801911500003', NULL, NULL, NULL, 'walk_in');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'FORBIDDEN' THEN
        RAISE EXCEPTION
            'anon used source=walk_in to bypass the lead time (got "%")', v_msg;
    END IF;
END
$$;
