-- ---------------------------------------------------------------------------
-- Month availability and rate limiting — defect M-13, and Phase 2 §4.2's
-- carried-over abuse control.
--
-- The month calendar matters more than it looks. It is the first thing a
-- customer touches, and the spec gave it no endpoint at all, so it either made
-- thirty round trips or invited taps on days the clinic is shut. Both end with
-- someone choosing a day and being told no.
-- ---------------------------------------------------------------------------

INSERT INTO availability_rules (business_id, staff_id, day_of_week, start_time, end_time, is_break)
SELECT 'aaaa0000-0000-4000-8000-000000000001'::uuid,
       'aaaa00f2-0000-4000-8000-000000000001'::uuid,
       d::smallint, TIME '10:00', TIME '18:00', FALSE
FROM generate_series(0, 4) AS d;

-- 1. Every day of the month comes back, once, in order. A calendar that is
--    missing the 29th renders a hole rather than a closed day.
DO $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
    v_rows  INT;
    v_days  INT;
BEGIN
    SELECT count(*), count(DISTINCT day)
    INTO v_rows, v_days
    FROM get_month_availability('aaaa0000-0000-4000-8000-000000000001',
                                'aaaa00e1-0000-4000-8000-000000000001',
                                EXTRACT(YEAR FROM v_today)::int,
                                EXTRACT(MONTH FROM v_today)::int,
                                'aaaa00f1-0000-4000-8000-000000000001');

    IF v_rows <> v_days OR v_rows NOT BETWEEN 28 AND 31 THEN
        RAISE EXCEPTION 'Expected one row per day of the month, got % rows / % distinct days',
            v_rows, v_days;
    END IF;
END
$$;

-- 2. Friday and Saturday are not working days for this provider (the weekly
--    rules cover Sunday to Thursday), so they must come back unavailable. The
--    spec's calendar had no way to know.
DO $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
    v_bad   INT;
BEGIN
    SELECT count(*) INTO v_bad
    FROM get_month_availability('aaaa0000-0000-4000-8000-000000000001',
                                'aaaa00e1-0000-4000-8000-000000000001',
                                EXTRACT(YEAR FROM v_today)::int,
                                EXTRACT(MONTH FROM v_today)::int,
                                'aaaa00f1-0000-4000-8000-000000000001')
    WHERE has_slots AND EXTRACT(DOW FROM day) IN (5, 6);

    IF v_bad > 0 THEN
        RAISE EXCEPTION
            '% weekend day(s) were offered as bookable; the provider works Sunday to Thursday (defect M-13)',
            v_bad;
    END IF;
END
$$;

-- 3. A declared holiday on a working day is reported closed. This is the case
--    that makes the calendar worth having.
DO $$
DECLARE
    v_day   DATE;
    v_open  BOOLEAN;
BEGIN
    SELECT d::date INTO v_day
    FROM generate_series((NOW() AT TIME ZONE 'Asia/Dhaka')::date + 3,
                         (NOW() AT TIME ZONE 'Asia/Dhaka')::date + 12,
                         INTERVAL '1 day') AS d
    WHERE EXTRACT(DOW FROM d) BETWEEN 0 AND 4
    ORDER BY d LIMIT 1;

    INSERT INTO availability_overrides
        (business_id, staff_id, override_date, is_closed, reason)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', NULL, v_day, TRUE, 'Public holiday');

    SELECT has_slots INTO v_open
    FROM get_month_availability('aaaa0000-0000-4000-8000-000000000001',
                                'aaaa00e1-0000-4000-8000-000000000001',
                                EXTRACT(YEAR FROM v_day)::int,
                                EXTRACT(MONTH FROM v_day)::int,
                                'aaaa00f1-0000-4000-8000-000000000001')
    WHERE day = v_day;

    IF v_open IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION
            'A declared holiday (%) was still offered as bookable', v_day;
    END IF;
END
$$;

-- 4. "Any available" answers for the month too, and a day where one provider
--    is on leave is still open if a colleague is working. Otherwise the
--    calendar greys out days the business can in fact serve.
DO $$
DECLARE
    v_day  DATE;
    v_one  BOOLEAN;
    v_any  BOOLEAN;
BEGIN
    SELECT d::date INTO v_day
    FROM generate_series((NOW() AT TIME ZONE 'Asia/Dhaka')::date + 13,
                         (NOW() AT TIME ZONE 'Asia/Dhaka')::date + 25,
                         INTERVAL '1 day') AS d
    WHERE EXTRACT(DOW FROM d) BETWEEN 0 AND 4
    ORDER BY d LIMIT 1;

    -- Dr Rahman alone is on leave that day.
    INSERT INTO availability_overrides
        (business_id, staff_id, override_date, is_closed, reason)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001', v_day, TRUE, 'Leave');

    SELECT has_slots INTO v_one
    FROM get_month_availability('aaaa0000-0000-4000-8000-000000000001',
                                'aaaa00e1-0000-4000-8000-000000000001',
                                EXTRACT(YEAR FROM v_day)::int,
                                EXTRACT(MONTH FROM v_day)::int,
                                'aaaa00f1-0000-4000-8000-000000000001')
    WHERE day = v_day;

    SELECT has_slots INTO v_any
    FROM get_month_availability('aaaa0000-0000-4000-8000-000000000001',
                                'aaaa00e1-0000-4000-8000-000000000001',
                                EXTRACT(YEAR FROM v_day)::int,
                                EXTRACT(MONTH FROM v_day)::int)
    WHERE day = v_day;

    IF v_one IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'A provider on leave was still offered on %', v_day;
    END IF;

    IF v_any IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION
            '"Any available" closed % although a colleague is working that day', v_day;
    END IF;
END
$$;

-- 5. An unpublished tenant answers nothing here either. The slot function is
--    gated on onboarding; a calendar that was not would leak the same
--    information one month at a time.
DO $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
    v_rows  INT;
BEGIN
    UPDATE businesses SET onboarding_completed_at = NULL, onboarding_step = 'go_live'
    WHERE id = 'bbbb0000-0000-4000-8000-000000000001';

    SELECT count(*) INTO v_rows
    FROM get_month_availability('bbbb0000-0000-4000-8000-000000000001',
                                'bbbb00e1-0000-4000-8000-000000000001',
                                EXTRACT(YEAR FROM v_today)::int,
                                EXTRACT(MONTH FROM v_today)::int);

    IF v_rows <> 0 THEN
        RAISE EXCEPTION
            'An unpublished business returned % calendar days', v_rows;
    END IF;
END
$$;

-- 6. The limiter counts, refuses past the allowance, and keeps refusing.
DO $$
DECLARE
    v_allowed INT := 0;
    v_i       INT;
    v_ok      BOOLEAN;
BEGIN
    FOR v_i IN 1..5 LOOP
        v_ok := check_rate_limit('test:bucket:one', 3, 3600);
        IF v_ok THEN v_allowed := v_allowed + 1; END IF;
    END LOOP;

    IF v_allowed <> 3 THEN
        RAISE EXCEPTION
            'A limit of 3 allowed % of 5 attempts', v_allowed;
    END IF;
END
$$;

-- 7. Buckets are independent. One customer exhausting their allowance must not
--    lock out everyone else — a limiter that does is a denial-of-service
--    amplifier rather than a defence.
DO $$
DECLARE
    v_i  INT;
    v_ok BOOLEAN;
BEGIN
    FOR v_i IN 1..4 LOOP
        PERFORM check_rate_limit('test:bucket:noisy', 2, 3600);
    END LOOP;

    v_ok := check_rate_limit('test:bucket:quiet', 2, 3600);
    IF NOT v_ok THEN
        RAISE EXCEPTION 'One bucket being spent locked out an unrelated one';
    END IF;
END
$$;

-- 8. The counter table is not reachable by the public roles. It is keyed by IP
--    and phone number, so a readable copy is a list of who booked and from
--    where.
DO $$
DECLARE
    v_grants INT;
BEGIN
    SELECT count(*) INTO v_grants
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'rate_limit_hits'
      AND grantee IN ('anon', 'authenticated');

    IF v_grants > 0 THEN
        RAISE EXCEPTION
            'rate_limit_hits is reachable by anon/authenticated (% grants); it keys on IP and phone number',
            v_grants;
    END IF;
END
$$;
