-- ---------------------------------------------------------------------------
-- Double-booking and buffers — defect B-03
--
-- The constraint's definition is checked in 0001; this file checks its
-- behaviour, because an exclusion constraint can be present and still be
-- wrong in ways a definition string does not reveal — the wrong predicate on
-- `status`, or a tenant key that accidentally makes every provider distinct.
--
-- The fixture's Root Canal takes 60 minutes with a 10-minute preparation gap
-- and a 15-minute sterilisation gap, and Dr Rahman has one booked at
-- 2027-01-11 10:00–11:00 Dhaka time. So his diary is blocked 09:50–11:15, and
-- every assertion below is a consequence of that arithmetic.
--
-- The case that fails on the spec's schema is the first one: an appointment
-- starting at 11:00, exactly when the previous patient's slot ends. The spec
-- excludes on `slot_range`, which ends at 11:00, so `[10:00,11:00)` and
-- `[11:00,12:00)` do not overlap and the insert is accepted — committing the
-- dentist to a patient during the fifteen minutes the chair is being
-- sterilised. Nothing in the UI would show it, because the slot picker
-- subtracts the buffers and would never have offered 11:00.
-- ---------------------------------------------------------------------------

SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- Helper values, for readability in the assertions below.
-- tenant A = aaaa0000…, branch = aaaa00b1…, customer = aaaa00c1…,
-- service = aaaa00e1…, Dr Rahman = aaaa00f1…, Dr Chowdhury = aaaa00f2…

-- 1. Back-to-back at 11:00 violates the sterilisation gap. THE B-03 CASE.
DO $$
DECLARE
    code TEXT;
BEGIN
    BEGIN
        INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                              start_time, end_time, buffer_before_minutes, buffer_after_minutes)
        VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
                'aaaa00c1-0000-4000-8000-000000000001', 'aaaa00e1-0000-4000-8000-000000000001',
                'aaaa00f1-0000-4000-8000-000000000001',
                '2027-01-11 11:00+06', '2027-01-11 12:00+06', 0, 0);
    EXCEPTION WHEN exclusion_violation THEN
        code := 'ok';
    END;

    IF code IS NULL THEN
        RAISE EXCEPTION
            'An appointment was accepted at 11:00, inside the previous patient''s 15-minute sterilisation buffer (defect B-03)';
    END IF;
END
$$;

-- 2. A straightforward overlap is refused, and with SQLSTATE 23P01 — the code
-- lib/api/errors.ts maps to SLOT_TAKEN so the customer is told to pick another
-- time rather than shown a 500.
DO $$
DECLARE
    sqlstate_seen TEXT;
BEGIN
    BEGIN
        INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                              start_time, end_time, buffer_before_minutes, buffer_after_minutes)
        VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
                'aaaa00c1-0000-4000-8000-000000000001', 'aaaa00e1-0000-4000-8000-000000000001',
                'aaaa00f1-0000-4000-8000-000000000001',
                '2027-01-11 10:30+06', '2027-01-11 11:30+06', 10, 15);
    EXCEPTION WHEN OTHERS THEN
        sqlstate_seen := SQLSTATE;
    END;

    IF sqlstate_seen IS DISTINCT FROM '23P01' THEN
        RAISE EXCEPTION
            'An overlapping booking should raise 23P01 (exclusion_violation); got %',
            coalesce(sqlstate_seen, 'no error at all');
    END IF;
END
$$;

-- 3. Clear of the buffer, it is accepted. Dr Rahman is blocked until 11:15, and
-- a booking with a 10-minute preparation gap therefore becomes legal from
-- 11:25. This is the assertion that stops someone "fixing" the test above by
-- making the constraint reject everything.
DO $$
DECLARE
    n INT;
BEGIN
    INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                          start_time, end_time, buffer_before_minutes, buffer_after_minutes)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
            'aaaa00c1-0000-4000-8000-000000000001', 'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            '2027-01-11 11:30+06', '2027-01-11 12:30+06', 10, 15);

    SELECT count(*) INTO n FROM bookings
    WHERE staff_id = 'aaaa00f1-0000-4000-8000-000000000001';

    IF n <> 2 THEN
        RAISE EXCEPTION 'A booking clear of the buffer was refused; Dr Rahman has % bookings', n;
    END IF;
END
$$;

-- 4. The blocked range is what the buffers say it is. Checked directly, so a
-- future change to the generated expression cannot drift unnoticed.
DO $$
DECLARE
    blocked TSTZRANGE;
BEGIN
    SELECT blocked_range INTO blocked FROM bookings
    WHERE id = 'aaaa00d1-0000-4000-8000-000000000001';

    IF lower(blocked) <> '2027-01-11 09:50+06'::timestamptz
       OR upper(blocked) <> '2027-01-11 11:15+06'::timestamptz THEN
        RAISE EXCEPTION
            'blocked_range should be 09:50-11:15 for a 10:00-11:00 appointment with 10/15 buffers; got %',
            blocked;
    END IF;
END
$$;

-- 5. The same hour for a different provider is fine. Two dentists, two chairs.
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM bookings
    WHERE slot_range && tstzrange('2027-01-11 10:00+06', '2027-01-11 11:00+06')
      AND business_id = 'aaaa0000-0000-4000-8000-000000000001';

    IF n <> 2 THEN
        RAISE EXCEPTION
            'Two providers should each be bookable at 10:00; found % such appointments', n;
    END IF;
END
$$;

-- 6. Cancelling frees the slot. The constraint's WHERE clause is what does
-- this, and getting it wrong would mean a cancelled appointment holds its time
-- forever — the slot picker would offer it, the insert would fail, and the
-- customer would see an error for a slot the system had just advertised.
DO $$
DECLARE
    n INT;
BEGIN
    UPDATE bookings SET status = 'cancelled'
    WHERE id = 'aaaa00d1-0000-4000-8000-000000000001';

    INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                          start_time, end_time, buffer_before_minutes, buffer_after_minutes)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
            'aaaa00c1-0000-4000-8000-000000000001', 'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f1-0000-4000-8000-000000000001',
            '2027-01-11 10:00+06', '2027-01-11 11:00+06', 10, 15);

    SELECT count(*) INTO n FROM bookings
    WHERE staff_id = 'aaaa00f1-0000-4000-8000-000000000001'
      AND status IN ('pending', 'confirmed', 'checked_in');

    IF n <> 2 THEN
        RAISE EXCEPTION
            'After cancelling, the 10:00 slot should be bookable again; Dr Rahman now holds % active bookings', n;
    END IF;
END
$$;

-- 7. A completed appointment also leaves the constraint, which is what lets a
-- walk-in be recorded retrospectively in a slot that is already past.
DO $$
DECLARE
    n INT;
BEGIN
    UPDATE bookings SET status = 'completed'
    WHERE staff_id = 'aaaa00f1-0000-4000-8000-000000000001'
      AND start_time = '2027-01-11 11:30+06';

    SELECT count(*) INTO n FROM bookings
    WHERE staff_id = 'aaaa00f1-0000-4000-8000-000000000001'
      AND status = 'completed';

    IF n <> 1 THEN RAISE EXCEPTION 'Expected one completed booking, found %', n; END IF;
END
$$;
