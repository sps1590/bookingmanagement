-- ---------------------------------------------------------------------------
-- Booking codes — defect B-15
--
-- The spec mints `'BK-' || YYMMDD || 4 hex` against `UNIQUE (business_id,
-- booking_code)` and the RPC does not catch `unique_violation`. Four hex
-- characters is 65,536 values, so by the birthday bound a clinic doing a few
-- hundred bookings a day starts colliding — and the customer meets the
-- collision as a 500 at the moment they tap Confirm, having already chosen
-- their slot and typed their details.
--
-- A per-business, per-day counter cannot collide, so there is nothing to
-- retry. What it can get wrong instead is the *date*, which is why the
-- assertions below are mostly about timezones: the counter keys on the
-- business's own local date, read from `businesses.timezone`. Using UTC would
-- file a Dhaka clinic's evening appointments under tomorrow, and a New York
-- salon's early ones under yesterday — the same class of mistake as defect
-- B-20, in a string the customer quotes on the phone.
--
-- The fixture has already booked two appointments for tenant A and one for
-- tenant B, all on 2027-01-11 local time, so the counters start at 2 and 1.
-- ---------------------------------------------------------------------------

-- 1. The fixture's own codes are well-formed, distinct, and numbered from one.
DO $$
DECLARE
    codes TEXT[];
BEGIN
    SELECT array_agg(booking_code ORDER BY booking_code) INTO codes
    FROM bookings WHERE business_id = 'aaaa0000-0000-4000-8000-000000000001';

    IF codes <> ARRAY['BK-270111-001', 'BK-270111-002'] THEN
        RAISE EXCEPTION
            'Tenant A''s first two bookings should be BK-270111-001 and -002; got %',
            codes;
    END IF;
END
$$;

-- 2. Counters are per business. Tenant B's first booking is also -001, on the
-- same date, and that is correct: two unrelated businesses sharing a numbering
-- sequence would leak how busy the other one is.
DO $$
DECLARE
    code TEXT;
BEGIN
    SELECT booking_code INTO code FROM bookings
    WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001';

    IF code <> 'BK-270111-001' THEN
        RAISE EXCEPTION
            'Tenant B''s first booking should be BK-270111-001, independent of tenant A; got %',
            code;
    END IF;
END
$$;

-- 3. The date is the tenant's local date, not UTC.
--
-- 2027-01-12 01:00 in Dhaka is 2027-01-11 19:00 UTC. The code must say the
-- twelfth, because that is the day the patient will turn up, and it must open
-- a fresh counter for that day.
DO $$
DECLARE
    code TEXT;
BEGIN
    INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                          start_time, end_time, buffer_before_minutes, buffer_after_minutes)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
            'aaaa00c1-0000-4000-8000-000000000001', 'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            '2027-01-12 01:00+06', '2027-01-12 02:00+06', 10, 15)
    RETURNING booking_code INTO code;

    IF code <> 'BK-270112-001' THEN
        RAISE EXCEPTION
            'A 01:00 Dhaka appointment on the 12th is 19:00 UTC on the 11th. The code must follow the tenant''s timezone and start a new day: expected BK-270112-001, got %',
            code;
    END IF;
END
$$;

-- 4. The mirror case, west of UTC. 2027-01-11 20:00 in New York is
-- 2027-01-12 01:00 UTC, and the salon's client is coming on the eleventh.
DO $$
DECLARE
    code TEXT;
BEGIN
    INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                          start_time, end_time)
    VALUES ('bbbb0000-0000-4000-8000-000000000001', 'bbbb00b1-0000-4000-8000-000000000001',
            'bbbb00c1-0000-4000-8000-000000000001', 'bbbb00e1-0000-4000-8000-000000000001',
            'bbbb00f1-0000-4000-8000-000000000001',
            '2027-01-11 20:00-05', '2027-01-11 20:45-05')
    RETURNING booking_code INTO code;

    IF code <> 'BK-270111-002' THEN
        RAISE EXCEPTION
            'A 20:00 New York appointment on the 11th is 01:00 UTC on the 12th. Expected BK-270111-002; got %',
            code;
    END IF;
END
$$;

-- 5. The counter keeps counting, and codes stay unique under a run of inserts.
-- This is the property the spec's random suffix did not have.
DO $$
DECLARE
    i INT;
    distinct_codes INT;
    total INT;
BEGIN
    FOR i IN 1..25 LOOP
        INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                              start_time, end_time)
        VALUES ('bbbb0000-0000-4000-8000-000000000001', 'bbbb00b1-0000-4000-8000-000000000001',
                'bbbb00c1-0000-4000-8000-000000000001', 'bbbb00e1-0000-4000-8000-000000000001',
                'bbbb00f1-0000-4000-8000-000000000001',
                '2027-03-01 09:00-05'::timestamptz + make_interval(hours => i),
                '2027-03-01 09:45-05'::timestamptz + make_interval(hours => i));
    END LOOP;

    SELECT count(*), count(DISTINCT booking_code) INTO total, distinct_codes
    FROM bookings WHERE business_id = 'bbbb0000-0000-4000-8000-000000000001';

    IF total <> distinct_codes THEN
        RAISE EXCEPTION
            'Booking codes collided: % bookings, % distinct codes (defect B-15)',
            total, distinct_codes;
    END IF;

    IF total <> 27 THEN
        RAISE EXCEPTION 'Expected 27 bookings for tenant B by now, found %', total;
    END IF;
END
$$;

-- 6. An explicitly supplied code is respected. The admin importing last year's
-- appointment book keeps its references, and the trigger stays out of the way.
DO $$
DECLARE
    code TEXT;
BEGIN
    INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                          booking_code, start_time, end_time)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
            'aaaa00c1-0000-4000-8000-000000000001', 'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f2-0000-4000-8000-000000000001',
            'LEGACY-2026-0042', '2027-01-20 10:00+06', '2027-01-20 11:00+06')
    RETURNING booking_code INTO code;

    IF code <> 'LEGACY-2026-0042' THEN
        RAISE EXCEPTION 'A supplied booking code was overwritten with %', code;
    END IF;
END
$$;

-- 7. And codes are unique within a tenant, whatever their origin.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                              booking_code, start_time, end_time)
        VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
                'aaaa00c1-0000-4000-8000-000000000001', 'aaaa00e1-0000-4000-8000-000000000001',
                'aaaa00f2-0000-4000-8000-000000000001',
                'LEGACY-2026-0042', '2027-01-21 10:00+06', '2027-01-21 11:00+06');
    EXCEPTION WHEN unique_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A duplicate booking code was accepted within one tenant';
    END IF;
END
$$;
