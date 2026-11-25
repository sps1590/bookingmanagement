-- ---------------------------------------------------------------------------
-- The slot engine — defects B-14, B-20, M-01, M-02, M-03
--
-- Every assertion here is arithmetic on the fixture, so a failure message can
-- name the real consequence rather than printing two numbers.
--
-- Dr Rahman works Sunday to Thursday, 10:00–18:00 Dhaka time, with a
-- 13:00–14:00 break. A Root Canal takes 60 minutes and the tenant's slot
-- interval is 15. So a clear day is:
--
--   morning    10:00 … 12:00   (a 60-minute appointment must end by 13:00)
--   afternoon  14:00 … 17:00
--             = 9 + 13 = 22 slots
--
-- Dates are computed relative to now rather than taken from the fixture's
-- fixed 2027 dates, because `max_advance_days` is 30 by default: a test
-- pinned to a literal date passes today and silently stops exercising
-- anything the moment that date drifts outside the window.
-- ---------------------------------------------------------------------------

-- Two working days far enough ahead to clear min_lead_minutes, and
-- Sunday-to-Thursday ones so the weekly rules apply. Two, because the closure
-- test below has to shut the clinic on a date, and doing that on the day every
-- other assertion uses would make each test depend on its position in the
-- file.
CREATE TEMP TABLE probe AS
SELECT d::date AS work_day,
       row_number() OVER (ORDER BY d) AS n
FROM generate_series(
         (NOW() AT TIME ZONE 'Asia/Dhaka')::date + 3,
         (NOW() AT TIME ZONE 'Asia/Dhaka')::date + 12,
         INTERVAL '1 day') AS d
WHERE EXTRACT(DOW FROM d) BETWEEN 0 AND 4
ORDER BY d
LIMIT 2;

-- The fixture gives weekly hours to Dr Rahman only. Dr Chowdhury is mapped to
-- the same service, so "Any Available" should offer both — but a provider with
-- no hours is correctly offered for nothing, and without this the B-14
-- assertion would be measuring the fixture rather than the function.
INSERT INTO availability_rules (business_id, staff_id, day_of_week, start_time, end_time, is_break)
SELECT 'aaaa0000-0000-4000-8000-000000000001'::uuid,
       'aaaa00f2-0000-4000-8000-000000000001'::uuid,
       d::smallint, TIME '10:00', TIME '18:00', FALSE
FROM generate_series(0, 4) AS d
UNION ALL
SELECT 'aaaa0000-0000-4000-8000-000000000001'::uuid,
       'aaaa00f2-0000-4000-8000-000000000001'::uuid,
       d::smallint, TIME '13:00', TIME '14:00', TRUE
FROM generate_series(0, 4) AS d;

-- 1. A clear working day yields exactly the 22 slots the arithmetic predicts,
--    the first at 10:00 and the last at 17:00 local.
DO $$
DECLARE
    v_day   DATE := (SELECT work_day FROM probe WHERE n = 1);
    v_count INT;
    v_first TEXT;
    v_last  TEXT;
BEGIN
    SELECT count(*),
           to_char(min(slot_start) AT TIME ZONE 'Asia/Dhaka', 'HH24:MI'),
           to_char(max(slot_start) AT TIME ZONE 'Asia/Dhaka', 'HH24:MI')
    INTO v_count, v_first, v_last
    FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                             'aaaa00e1-0000-4000-8000-000000000001',
                             'aaaa00f1-0000-4000-8000-000000000001',
                             v_day);

    IF v_count <> 22 OR v_first <> '10:00' OR v_last <> '17:00' THEN
        RAISE EXCEPTION
            'Expected 22 slots from 10:00 to 17:00 on %, got % from % to %',
            v_day, v_count, v_first, v_last;
    END IF;
END
$$;

-- 2. The 13:00 break is subtracted, not merely noted. A 60-minute appointment
--    cannot start at 12:15, 12:30, 12:45 or 13:00 — each would run into the
--    hour the provider is not there.
DO $$
DECLARE
    v_day DATE := (SELECT work_day FROM probe WHERE n = 1);
    v_bad INT;
BEGIN
    SELECT count(*) INTO v_bad
    FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                             'aaaa00e1-0000-4000-8000-000000000001',
                             'aaaa00f1-0000-4000-8000-000000000001',
                             v_day)
    WHERE to_char(slot_start AT TIME ZONE 'Asia/Dhaka', 'HH24:MI')
          IN ('12:15', '12:30', '12:45', '13:00');

    IF v_bad > 0 THEN
        RAISE EXCEPTION
            '% slot(s) were offered that overlap the 13:00-14:00 break: a patient would arrive to an empty chair', v_bad;
    END IF;
END
$$;

-- 3. Defect M-01. A provider who does not perform the service is offered no
--    slots at all — otherwise a hygienist is bookable for a root canal.
DO $$
DECLARE
    v_day     DATE := (SELECT work_day FROM probe WHERE n = 1);
    v_service UUID;
    v_count   INT;
BEGIN
    INSERT INTO services (business_id, name, duration_minutes, price)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'Orthodontic Review', 30, 3000)
    RETURNING id INTO v_service;
    -- Deliberately no staff_services row for Dr Rahman.

    SELECT count(*) INTO v_count
    FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                             v_service,
                             'aaaa00f1-0000-4000-8000-000000000001',
                             v_day);

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'A provider not mapped to the service through staff_services was offered % slots (defect M-01)', v_count;
    END IF;
END
$$;

-- 4. Defect M-02. Beyond max_advance_days there is nothing, and the boundary
--    is inclusive on the allowed side.
DO $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
    v_far   INT;
BEGIN
    SELECT count(*) INTO v_far
    FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                             'aaaa00e1-0000-4000-8000-000000000001',
                             'aaaa00f1-0000-4000-8000-000000000001',
                             v_today + 400);

    IF v_far > 0 THEN
        RAISE EXCEPTION
            'Slots were offered 400 days out against a 30-day max_advance_days (defect M-02)';
    END IF;
END
$$;

-- 5. Defect M-03. No slot inside the minimum lead time. Built explicitly for
--    "today" so the assertion is about the clock, not about which weekday the
--    suite happens to run on.
DO $$
DECLARE
    v_today   DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
    v_staff   UUID;
    v_service UUID;
    v_dow     SMALLINT := EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Dhaka'))::smallint;
    v_too_soon INT;
BEGIN
    INSERT INTO staff_resources (business_id, branch_id, name)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'aaaa00b1-0000-4000-8000-000000000001', 'Dr Always-On')
    RETURNING id INTO v_staff;

    -- A service of their own rather than the shared Root Canal. Today's
    -- weekday can coincide with the probe day's, and this provider would then
    -- turn up in the "Any Available" count below and make it depend on which
    -- day of the week the suite happens to run.
    INSERT INTO services (business_id, name, duration_minutes, price)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'Emergency Visit', 30, 1500)
    RETURNING id INTO v_service;

    INSERT INTO staff_services (business_id, staff_id, service_id)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', v_staff, v_service);

    -- Open round the clock today, so the only thing that can exclude a slot
    -- is the lead time.
    INSERT INTO availability_rules
        (business_id, staff_id, day_of_week, start_time, end_time, is_break)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', v_staff, v_dow,
            TIME '00:00', TIME '23:45', FALSE);

    SELECT count(*) INTO v_too_soon
    FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                             v_service, v_staff, v_today)
    WHERE slot_start < NOW() + INTERVAL '60 minutes';

    IF v_too_soon > 0 THEN
        RAISE EXCEPTION
            '% slot(s) were offered inside the 60-minute lead time; the spec''s "> NOW()" would accept one 60 seconds away (defect M-03)',
            v_too_soon;
    END IF;
END
$$;

-- 6. Defect B-20. The second tenant is in America/New_York. Its 09:00 must be
--    09:00 *there* — the spec formats everything through a hardcoded
--    Asia/Dhaka and would place this eleven hours out.
DO $$
DECLARE
    v_day   DATE;
    v_first TEXT;
    v_dhaka TEXT;
BEGIN
    SELECT d::date INTO v_day
    FROM generate_series((NOW() AT TIME ZONE 'America/New_York')::date + 3,
                         (NOW() AT TIME ZONE 'America/New_York')::date + 12,
                         INTERVAL '1 day') AS d
    WHERE EXTRACT(DOW FROM d) = 1
    ORDER BY d LIMIT 1;

    INSERT INTO availability_rules
        (business_id, staff_id, day_of_week, start_time, end_time, is_break)
    VALUES ('bbbb0000-0000-4000-8000-000000000001',
            'bbbb00f1-0000-4000-8000-000000000001', 1,
            TIME '09:00', TIME '17:00', FALSE);

    SELECT to_char(min(slot_start) AT TIME ZONE 'America/New_York', 'HH24:MI'),
           to_char(min(slot_start) AT TIME ZONE 'Asia/Dhaka', 'HH24:MI')
    INTO v_first, v_dhaka
    FROM get_available_slots('bbbb0000-0000-4000-8000-000000000001',
                             'bbbb00e1-0000-4000-8000-000000000001',
                             'bbbb00f1-0000-4000-8000-000000000001',
                             v_day);

    IF v_first IS DISTINCT FROM '09:00' THEN
        RAISE EXCEPTION
            'The New York salon opens at 09:00 local; the first slot rendered as % there (% in Dhaka) — defect B-20',
            coalesce(v_first, 'no slots'), coalesce(v_dhaka, '-');
    END IF;
END
$$;

-- 7. A business-wide closure beats the weekly rules, and the function says
--    "nothing available" rather than why.
DO $$
DECLARE
    -- The SECOND working day: shutting the clinic on the day the other
    -- assertions use would silently turn them into tests of this one.
    v_day   DATE := (SELECT work_day FROM probe WHERE n = 2);
    v_count INT;
BEGIN
    INSERT INTO availability_overrides
        (business_id, staff_id, override_date, is_closed, reason)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', NULL, v_day, TRUE, 'Strike');

    SELECT count(*) INTO v_count
    FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                             'aaaa00e1-0000-4000-8000-000000000001',
                             'aaaa00f1-0000-4000-8000-000000000001',
                             v_day);

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'The clinic was declared closed and % slots were still offered', v_count;
    END IF;
END
$$;

-- 8. Defect B-14. "Any Available" has a backend, it names a provider, and it
--    only ever names one who performs the service. Dr Rahman and Dr Chowdhury
--    both do Root Canals, so each slot should come back twice — once per
--    provider — and never with the unmapped Dr Always-On.
DO $$
DECLARE
    v_day      DATE := (SELECT work_day FROM probe WHERE n = 1);
    v_rows     INT;
    v_staff    INT;
    v_unmapped INT;
BEGIN
    SELECT count(*), count(DISTINCT staff_id) INTO v_rows, v_staff
    FROM get_available_slots_any('aaaa0000-0000-4000-8000-000000000001',
                                 'aaaa00e1-0000-4000-8000-000000000001',
                                 v_day, NULL);

    IF v_staff <> 2 THEN
        RAISE EXCEPTION
            '"Any Available" offered % distinct providers; the fixture maps exactly 2 to this service (defect B-14/M-01)', v_staff;
    END IF;

    SELECT count(*) INTO v_unmapped
    FROM get_available_slots_any('aaaa0000-0000-4000-8000-000000000001',
                                 'aaaa00e1-0000-4000-8000-000000000001',
                                 v_day, NULL) a
    WHERE NOT EXISTS (SELECT 1 FROM staff_services ss
                      WHERE ss.staff_id = a.staff_id
                        AND ss.service_id = 'aaaa00e1-0000-4000-8000-000000000001');

    IF v_unmapped > 0 THEN
        RAISE EXCEPTION '"Any Available" proposed a provider who does not perform the service';
    END IF;
END
$$;

-- 9. An unpublished tenant is not probeable. Onboarding is the gate that keeps
--    a half-configured clinic off the public portal; this function must not be
--    a way around it.
DO $$
DECLARE
    v_day   DATE := (SELECT work_day FROM probe WHERE n = 1);
    v_count INT;
BEGIN
    UPDATE businesses
    SET onboarding_step = 'working_hours', onboarding_completed_at = NULL
    WHERE id = 'aaaa0000-0000-4000-8000-000000000001';

    SELECT count(*) INTO v_count
    FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                             'aaaa00e1-0000-4000-8000-000000000001',
                             'aaaa00f1-0000-4000-8000-000000000001',
                             v_day);

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'An unpublished business still answered with % slots, which leaks its working hours', v_count;
    END IF;
END
$$;
