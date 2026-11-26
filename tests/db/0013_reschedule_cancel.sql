-- ---------------------------------------------------------------------------
-- Reschedule, cancel and the status machine — B-11, B-18, B-19, M-04, M-11, M-12
--
-- The reschedule path is where the spec is weakest: it validates nothing but
-- the overlap, destroys the reminders it was supposed to re-create, counts
-- reschedules without ever reading the count, and leaves a one-time link
-- replayable forever. Cancellation it describes in the API table and never
-- implements at all.
--
-- The fixture carries no notification templates — those are seeded per tenant
-- at signup — so the reminder assertions insert the two they need. Without
-- them `queue_booking_notifications` correctly queues nothing, and a test
-- asserting "reminders exist" would fail for the wrong reason.
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

INSERT INTO notification_templates
    (business_id, event_type, channel, subject, body_template)
VALUES
    ('aaaa0000-0000-4000-8000-000000000001', 'booking_confirmed', 'email',
     'Your {{service_name}} is booked',
     'Dear {{customer_name}}, your {{service_name}} with {{staff_name}} is on {{date}} at {{time}}. Code {{booking_code}}.'),
    ('aaaa0000-0000-4000-8000-000000000001', 'reminder_24h', 'email',
     'Tomorrow: {{service_name}}',
     '{{customer_name}}, this is a reminder for {{date}} at {{time}}.'),
    ('aaaa0000-0000-4000-8000-000000000001', 'reminder_1h', 'email',
     'In an hour: {{service_name}}',
     '{{customer_name}}, see you at {{time}}.');

-- One booking, far enough out that both reminders are still in the future.
CREATE TEMP TABLE made AS
SELECT *
FROM create_booking_atomic(
    'aaaa0000-0000-4000-8000-000000000001',
    'aaaa00e1-0000-4000-8000-000000000001',
    'aaaa00f1-0000-4000-8000-000000000001',
    (SELECT min(slot_start)
     FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                              'aaaa00e1-0000-4000-8000-000000000001',
                              'aaaa00f1-0000-4000-8000-000000000001',
                              (SELECT work_day FROM probe))),
    'Tanvir Ahmed', '+8801911100001', 'tanvir@example.com', NULL, NULL, 'online');

-- 1. Creating a booking queues the confirmation and both reminders, and the
--    placeholders are actually substituted.
DO $$
DECLARE
    v_queued INT;
    v_body   TEXT;
BEGIN
    SELECT count(*) INTO v_queued
    FROM notification_logs
    WHERE booking_id = (SELECT booking_id FROM made) AND status = 'queued';

    IF v_queued <> 3 THEN
        RAISE EXCEPTION
            'Expected a confirmation and two reminders queued, found %', v_queued;
    END IF;

    SELECT message_body INTO v_body
    FROM notification_logs
    WHERE booking_id = (SELECT booking_id FROM made) AND event_type = 'reminder_24h';

    IF v_body LIKE '%{{%' THEN
        RAISE EXCEPTION 'A template placeholder survived rendering: %', v_body;
    END IF;
    IF v_body NOT LIKE '%Tanvir Ahmed%' THEN
        RAISE EXCEPTION 'The customer name was not substituted into the reminder: %', v_body;
    END IF;
END
$$;

-- 2. Defect B-19. A self-service reschedule into the lunch break is refused.
--    The spec checks only the overlap, so 13:00 on a working day — or 04:00
--    on a holiday — goes straight in.
DO $$
DECLARE
    v_day DATE := (SELECT work_day FROM probe);
    v_msg TEXT;
BEGIN
    BEGIN
        PERFORM * FROM reschedule_booking_by_token(
            (SELECT reschedule_token FROM made),
            (v_day + TIME '13:00') AT TIME ZONE 'Asia/Dhaka');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'SLOT_UNAVAILABLE' THEN
        RAISE EXCEPTION
            'A customer rescheduled themselves into the provider''s break (got "%") — defect B-19', v_msg;
    END IF;
END
$$;

-- 3. A legitimate move succeeds, and lands on a slot that overlaps where the
--    booking currently sits. This is the case that fails if the busy set is
--    not told to ignore the booking being moved: 11:00 collides with the
--    10:00-11:00 appointment's own sterilisation buffer.
DO $$
DECLARE
    v_day   DATE := (SELECT work_day FROM probe);
    v_to    TIMESTAMPTZ;
    v_r     RECORD;
    v_old   TEXT := (SELECT reschedule_token FROM made);
BEGIN
    v_to := (v_day + TIME '15:00') AT TIME ZONE 'Asia/Dhaka';

    SELECT * INTO v_r
    FROM reschedule_booking_by_token(v_old, v_to);

    IF v_r.start_time <> v_to THEN
        RAISE EXCEPTION 'Reschedule reported % but was asked for %', v_r.start_time, v_to;
    END IF;

    -- M-11. The old link must stop working the moment it is used, or a
    -- forwarded email keeps control of someone else's appointment.
    IF v_r.reschedule_token = v_old THEN
        RAISE EXCEPTION
            'The reschedule token was not rotated, so the old link still controls this booking — defect M-11';
    END IF;

    PERFORM 1 FROM bookings
    WHERE id = (SELECT booking_id FROM made) AND reschedule_token = v_old;
    IF FOUND THEN
        RAISE EXCEPTION 'The superseded token is still accepted on the booking row';
    END IF;
END
$$;

-- 4. Defect B-18. After a reschedule the 24-hour and 1-hour reminders exist
--    again, against the NEW time. The spec cancels them and queues only the
--    confirmation, so the patient is reminded of nothing and the clinic
--    records a no-show.
DO $$
DECLARE
    v_live  INT;
    v_start TIMESTAMPTZ;
    v_at24  TIMESTAMPTZ;
BEGIN
    SELECT start_time INTO v_start FROM bookings
    WHERE id = (SELECT booking_id FROM made);

    SELECT count(*) INTO v_live
    FROM notification_logs
    WHERE booking_id = (SELECT booking_id FROM made)
      AND status = 'queued'
      AND event_type IN ('reminder_24h', 'reminder_1h');

    IF v_live <> 2 THEN
        RAISE EXCEPTION
            'After rescheduling, % reminder(s) are queued instead of 2 — defect B-18', v_live;
    END IF;

    SELECT scheduled_at INTO v_at24
    FROM notification_logs
    WHERE booking_id = (SELECT booking_id FROM made)
      AND status = 'queued' AND event_type = 'reminder_24h';

    IF v_at24 <> v_start - INTERVAL '24 hours' THEN
        RAISE EXCEPTION
            'The 24h reminder is scheduled for % but the appointment moved to % — it is pointing at the old time',
            v_at24, v_start;
    END IF;
END
$$;

-- 5. Defect M-04. The tenant allows two reschedules and the booking has
--    used one. A second is allowed, a third is not.
--
--    The cap is set here rather than inherited from the column default.
--    This file used to rely on that default being 2; migration 0030 raised
--    it to 5 — because two was too mean for a real clinic — and the test
--    failed while the behaviour it checks was untouched. A test of "the
--    limit is enforced" should state the limit, and then it keeps working
--    whatever the default becomes.
DO $$
DECLARE
    v_day DATE := (SELECT work_day FROM probe);
    v_tok TEXT;
    v_msg TEXT;
BEGIN
    UPDATE businesses
    SET booking_rules = booking_rules || jsonb_build_object('max_reschedules', 2)
    WHERE id = 'aaaa0000-0000-4000-8000-000000000001';

    SELECT reschedule_token INTO v_tok FROM bookings
    WHERE id = (SELECT booking_id FROM made);

    SELECT reschedule_token INTO v_tok
    FROM reschedule_booking_by_token(v_tok, (v_day + TIME '16:00') AT TIME ZONE 'Asia/Dhaka');

    BEGIN
        PERFORM * FROM reschedule_booking_by_token(
            v_tok, (v_day + TIME '17:00') AT TIME ZONE 'Asia/Dhaka');
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'RESCHEDULE_LIMIT_REACHED' THEN
        RAISE EXCEPTION
            'A third reschedule was allowed against max_reschedules = 2 (got "%") — defect M-04', v_msg;
    END IF;
END
$$;

-- 6. Defect B-11. Cancellation exists, frees the slot, and silences the
--    reminders — reminding someone about an appointment they cancelled is
--    worse than sending nothing.
DO $$
DECLARE
    v_tok   TEXT;
    v_r     RECORD;
    v_queued INT;
BEGIN
    SELECT reschedule_token INTO v_tok FROM bookings
    WHERE id = (SELECT booking_id FROM made);

    SELECT * INTO v_r FROM cancel_booking_by_token(v_tok, 'Changed my mind');

    IF v_r.status <> 'cancelled' THEN
        RAISE EXCEPTION 'cancel_booking_by_token returned status "%"', v_r.status;
    END IF;

    SELECT count(*) INTO v_queued
    FROM notification_logs
    WHERE booking_id = (SELECT booking_id FROM made) AND status = 'queued';

    IF v_queued <> 0 THEN
        RAISE EXCEPTION
            '% notification(s) are still queued for a cancelled booking', v_queued;
    END IF;

    PERFORM 1 FROM booking_history
    WHERE booking_id = (SELECT booking_id FROM made) AND action = 'cancelled';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cancelling wrote no audit row';
    END IF;
END
$$;

-- 7. The cancelled slot is genuinely free again: the exclusion constraint
--    excludes cancelled bookings, so the time can be sold twice over the day.
DO $$
DECLARE
    v_day DATE := (SELECT work_day FROM probe);
    v_at  TIMESTAMPTZ;
    v_n   INT;
BEGIN
    v_at := (v_day + TIME '16:00') AT TIME ZONE 'Asia/Dhaka';

    SELECT count(*) INTO v_n
    FROM get_available_slots('aaaa0000-0000-4000-8000-000000000001',
                             'aaaa00e1-0000-4000-8000-000000000001',
                             'aaaa00f1-0000-4000-8000-000000000001',
                             v_day)
    WHERE slot_start = v_at;

    IF v_n <> 1 THEN
        RAISE EXCEPTION
            'The cancelled 16:00 slot was not released back into availability';
    END IF;
END
$$;

-- 8. The cutoff. A booking inside min_cancel_hours cannot be cancelled
--    online — by then the chair is already set up.
DO $$
DECLARE
    v_id  UUID;
    v_tok TEXT;
    v_msg TEXT;
BEGIN
    -- Written directly rather than through the RPC: create_booking_atomic
    -- would refuse it for exactly the reason being tested.
    INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                          start_time, end_time, buffer_before_minutes, buffer_after_minutes)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
            'aaaa00c1-0000-4000-8000-000000000001', 'aaaa00e1-0000-4000-8000-000000000001',
            'aaaa00f2-0000-4000-8000-000000000001',
            NOW() + INTERVAL '30 minutes', NOW() + INTERVAL '90 minutes', 0, 0)
    RETURNING id, reschedule_token INTO v_id, v_tok;

    BEGIN
        PERFORM * FROM cancel_booking_by_token(v_tok, NULL);
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'CUTOFF_PASSED' THEN
        RAISE EXCEPTION
            'A booking 30 minutes away was cancelled online against a 2-hour cutoff (got "%")', v_msg;
    END IF;
END
$$;

-- 9. Defect M-12. The status machine. The spec describes the workflow and
--    enforces none of it, so a cancelled appointment can be marked attended.
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_id  UUID := 'aaaa00d1-0000-4000-8000-000000000001';
    v_msg TEXT;
BEGIN
    PERFORM set_booking_status(v_id, 'checked_in', NULL);
    PERFORM set_booking_status(v_id, 'completed', NULL);

    BEGIN
        PERFORM set_booking_status(v_id, 'pending', NULL);
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'INVALID_STATUS_TRANSITION' THEN
        RAISE EXCEPTION
            'A completed appointment was moved back to pending (got "%") — defect M-12', v_msg;
    END IF;
END
$$;

-- 10. A provider may move their own appointments and nobody else's. This
--     mirrors the UPDATE policy on bookings, which the function has to
--     reproduce because it runs as the owner and RLS is not consulted.
RESET ROLE;
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0002-0000-4000-8000-000000000002","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_msg TEXT;
BEGIN
    -- aaaa00d2 belongs to Dr Chowdhury; the caller is Dr Rahman.
    BEGIN
        PERFORM set_booking_status('aaaa00d2-0000-4000-8000-000000000001', 'checked_in', NULL);
        v_msg := 'NO ERROR';
    EXCEPTION WHEN SQLSTATE 'BK001' THEN v_msg := SQLERRM;
    END;

    IF v_msg <> 'FORBIDDEN' THEN
        RAISE EXCEPTION
            'A provider changed a colleague''s appointment (got "%")', v_msg;
    END IF;
END
$$;
