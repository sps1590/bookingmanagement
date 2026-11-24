-- ---------------------------------------------------------------------------
-- Role separation inside one tenant — defect B-23
--
-- The spec's §1.2 RBAC matrix says "Service Provider / Staff — Own Schedule
-- Only". Its RLS block says:
--
--     CREATE POLICY "Members manage tenant bookings"
--         ON bookings FOR ALL USING (is_business_member(business_id));
--
-- Those two statements cannot both be true. As written, every member — a
-- part-time stylist, a locum dentist — can read and rewrite every appointment
-- in the business, including other providers' patient notes.
--
-- The fixture gives tenant A two providers, each with a login and one booking,
-- which is the smallest arrangement in which the distinction is observable.
-- ---------------------------------------------------------------------------

SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0002-0000-4000-8000-000000000002","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- Dr Rahman is a `staff` member. He sees his own column of the diary.
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM bookings;
    IF n <> 1 THEN
        RAISE EXCEPTION
            'A staff member should see only their own 1 booking, saw % (defect B-23)', n;
    END IF;

    SELECT count(*) INTO n FROM bookings
    WHERE staff_id = 'aaaa00f1-0000-4000-8000-000000000001';
    IF n <> 1 THEN
        RAISE EXCEPTION 'A staff member cannot see their own booking';
    END IF;

    SELECT count(*) INTO n FROM bookings
    WHERE staff_id = 'aaaa00f2-0000-4000-8000-000000000001';
    IF n <> 0 THEN
        RAISE EXCEPTION
            'A staff member can read a colleague''s appointments, including the clinical notes on them (defect B-23)';
    END IF;
END
$$;

-- And cannot edit a colleague's. An UPDATE filtered out by a policy's USING
-- clause affects zero rows rather than raising, so the assertion counts rows.
DO $$
DECLARE
    touched INT;
BEGIN
    WITH attempt AS (
        UPDATE bookings
        SET internal_notes = 'edited by another provider'
        WHERE id = 'aaaa00d2-0000-4000-8000-000000000001'
        RETURNING 1
    )
    SELECT count(*) INTO touched FROM attempt;

    IF touched <> 0 THEN
        RAISE EXCEPTION
            'A staff member rewrote a colleague''s booking (% rows) (defect B-23)', touched;
    END IF;
END
$$;

-- Nor reassign their own appointment to a colleague. This is why the UPDATE
-- policy needs a WITH CHECK as well as a USING: without it, a provider can
-- select a row they own, hand it to someone else, and in doing so modify a row
-- they were never allowed to touch.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE bookings
        SET staff_id = 'aaaa00f2-0000-4000-8000-000000000001'
        WHERE id = 'aaaa00d1-0000-4000-8000-000000000001';
    EXCEPTION WHEN insufficient_privilege THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION
            'A staff member moved their own booking onto a colleague, editing a row they cannot select';
    END IF;
END
$$;

-- A staff member is not an admin: the catalogue is read-only to them.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO services (business_id, name, duration_minutes)
        VALUES ('aaaa0000-0000-4000-8000-000000000001', 'Unauthorised Service', 30);
    EXCEPTION WHEN insufficient_privilege THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A staff member created a service';
    END IF;
END
$$;

-- Booking history follows booking visibility, or the notes are simply one
-- join away.
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM booking_history
    WHERE booking_id = 'aaaa00d2-0000-4000-8000-000000000001';
    IF n <> 0 THEN
        RAISE EXCEPTION 'A staff member read the history of a colleague''s booking';
    END IF;
END
$$;

-- The front desk, by contrast, sees the whole diary. Same tenant, same tables,
-- different role: this is the assertion that proves the restriction above is
-- role-based and not an accident of the fixture.
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM bookings;
    IF n <> 2 THEN
        RAISE EXCEPTION 'The owner should see all 2 bookings in the tenant, saw %', n;
    END IF;
END
$$;
