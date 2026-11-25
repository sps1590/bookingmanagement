-- ---------------------------------------------------------------------------
-- 0019 — Creating a booking, and the notifications that follow it
--
-- ## Defect B-06 — the spec's create_booking_atomic validates nothing
--
-- As specified the function is SECURITY DEFINER, callable by `anon`, takes
-- `p_business_id` and `p_start_time` straight from the client, and inserts
-- after no checks beyond the GIST overlap. The public portal publishes the
-- business id, so the consequences are not theoretical:
--
--   * book 03:00 on a day the clinic is shut
--   * book a doctor who is on Eid leave
--   * book a hygienist for a root canal
--   * book 400 days out, past every plan limit
--   * script thousands of rows against any tenant whose link you have
--
-- Every gate below exists because of one of those. They run in the order the
-- plan lists them, cheapest and most specific first, so the error a caller
-- gets names the actual problem rather than whichever check happened to fire.
--
-- ## Gate 5 is the one that matters
--
-- Working hours, breaks, holidays, leave, lead time and the advance window are
-- *not* re-derived here. The function asks `get_available_slots` whether the
-- requested start is in the list it would have offered. One implementation of
-- availability, so the picker and the gate cannot drift apart — which is the
-- failure mode where a customer books a slot the UI never showed, or is
-- refused one it did.
--
-- ## Errors
--
-- Raised with SQLSTATE `BK001` and the canonical ErrorCode as the message, so
-- lib/api/errors.ts can translate without parsing prose. The one exception is
-- `exclusion_violation` (23P01), which arrives from the constraint itself when
-- two customers race; it is caught and re-raised as SLOT_TAKEN so the loser
-- sees "pick another time" instead of a 500.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE FUNCTION booking_error(p_code TEXT, p_detail TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = 'BK001', MESSAGE = p_code, DETAIL = p_detail;
END;
$$;

COMMENT ON FUNCTION booking_error(TEXT, TEXT) IS
    'Raises an application error whose MESSAGE is a canonical ErrorCode from lib/api/errors.ts. The client switches on the code; DETAIL carries the sentence a human reads.';

-- --- Template rendering ----------------------------------------------------
--
-- Minimal on purpose: Phase 5 owns delivery, this owns queueing. Placeholders
-- are the ones documented on notification_templates.body_template.

CREATE FUNCTION render_template(p_body TEXT, p_vars JSONB)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_out TEXT := p_body;
    v_key TEXT;
BEGIN
    IF p_body IS NULL THEN
        RETURN NULL;
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_vars) LOOP
        -- replace() rather than regexp_replace(): a tenant's business name may
        -- contain backslashes or ampersands, which regexp_replace would read
        -- as references into the match.
        v_out := replace(v_out, '{{' || v_key || '}}', coalesce(p_vars ->> v_key, ''));
    END LOOP;

    RETURN v_out;
END;
$$;

-- --- queue_booking_notifications (defect B-18) -----------------------------
--
-- The spec's reschedule path cancels every queued notification and then queues
-- only the "rescheduled" confirmation, so the 24-hour and 1-hour reminders are
-- silently destroyed — directly contradicting §1.4B, which says new reminders
-- are scheduled. The patient is then reminded of nothing and the clinic
-- records a no-show.
--
-- One function, called from create, self-reschedule and admin-reschedule, is
-- the only arrangement where that cannot drift again.
--
-- Reminders in the past are not queued. A booking made two hours out has no
-- 24-hour reminder to send, and a queue row whose scheduled_at has already
-- passed would be delivered immediately by the worker — "your appointment is
-- tomorrow" arriving nine minutes after you booked it.

CREATE FUNCTION queue_booking_notifications(p_booking_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_b        RECORD;
    v_vars     JSONB;
    v_queued   INT := 0;
    v_event    TEXT;
    v_tpl      RECORD;
    v_body     TEXT;
    v_subject  TEXT;
    v_app_url  TEXT;
BEGIN
    SELECT bk.id, bk.business_id, bk.booking_code, bk.start_time, bk.end_time,
           bk.status, bk.reschedule_token,
           biz.name AS business_name, biz.timezone,
           c.full_name AS customer_name, c.email AS customer_email,
           c.preferred_channel,
           s.name AS service_name,
           sr.name AS staff_name
    INTO v_b
    FROM bookings bk
    JOIN businesses biz ON biz.id = bk.business_id
    JOIN customers c    ON c.id = bk.customer_id
    JOIN services s     ON s.id = bk.service_id
    JOIN staff_resources sr ON sr.id = bk.staff_id
    WHERE bk.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Supersede anything still queued for this booking. 'cancelled' rather
    -- than DELETE: the log is also the audit trail of what was promised.
    UPDATE notification_logs
    SET status = 'cancelled', updated_at = NOW()
    WHERE booking_id = p_booking_id
      AND status = 'queued';

    IF v_b.status NOT IN ('pending', 'confirmed') THEN
        RETURN 0;
    END IF;

    -- No contact route means nothing to queue. Web push arrives in Phase 5 and
    -- needs a subscription that does not exist yet; a row with a fabricated
    -- recipient would fail in the worker instead of here.
    IF v_b.customer_email IS NULL OR v_b.preferred_channel = 'none' THEN
        RETURN 0;
    END IF;

    -- Rendered in the tenant's own timezone (defect B-20). to_char on a
    -- timestamptz AT TIME ZONE gives the tenant's wall clock, which is the
    -- only time the customer has ever seen.
    v_app_url := coalesce(current_setting('app.public_url', TRUE), '');

    v_vars := jsonb_build_object(
        'customer_name', v_b.customer_name,
        'business_name', v_b.business_name,
        'service_name',  v_b.service_name,
        'staff_name',    v_b.staff_name,
        'booking_code',  v_b.booking_code,
        'date',          to_char(v_b.start_time AT TIME ZONE v_b.timezone, 'FMDay, FMDD FMMonth YYYY'),
        'time',          to_char(v_b.start_time AT TIME ZONE v_b.timezone, 'HH12:MI AM'),
        'manage_url',    v_app_url || '/manage/' || v_b.reschedule_token
    );

    FOR v_event IN
        SELECT unnest(ARRAY[
            CASE WHEN v_b.status = 'confirmed' THEN 'booking_confirmed' ELSE 'booking_pending' END,
            'reminder_24h',
            'reminder_1h'
        ])
    LOOP
        SELECT nt.subject, nt.body_template
        INTO v_tpl
        FROM notification_templates nt
        WHERE nt.business_id = v_b.business_id
          AND nt.event_type = v_event
          AND nt.channel = 'email'
          AND nt.is_enabled;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        v_subject := render_template(v_tpl.subject, v_vars);
        v_body    := render_template(v_tpl.body_template, v_vars);

        INSERT INTO notification_logs
            (business_id, booking_id, recipient_type, recipient_contact, channel,
             event_type, subject, message_body, scheduled_at)
        SELECT v_b.business_id, v_b.id, 'customer', v_b.customer_email, 'email',
               v_event, v_subject, v_body, sched
        FROM (SELECT CASE v_event
                         WHEN 'reminder_24h' THEN v_b.start_time - INTERVAL '24 hours'
                         WHEN 'reminder_1h'  THEN v_b.start_time - INTERVAL '1 hour'
                         ELSE NOW()
                     END AS sched) q
        WHERE q.sched > NOW() - INTERVAL '1 minute';

        v_queued := v_queued + (CASE WHEN FOUND THEN 1 ELSE 0 END);
    END LOOP;

    RETURN v_queued;
END;
$$;

COMMENT ON FUNCTION queue_booking_notifications(UUID) IS
    'Defect B-18: the spec''s reschedule path destroyed the 24h and 1h reminders and never re-created them. Shared by create, self-reschedule and admin-reschedule so the three cannot diverge again.';

-- --- create_booking_atomic -------------------------------------------------

CREATE FUNCTION create_booking_atomic(
    p_business_id    UUID,
    p_service_id     UUID,
    p_staff_id       UUID,
    p_start_time     TIMESTAMPTZ,
    p_customer_name  TEXT,
    p_customer_phone TEXT,
    p_customer_email TEXT DEFAULT NULL,
    p_customer_notes TEXT DEFAULT NULL,
    p_branch_id      UUID DEFAULT NULL,
    p_source         TEXT DEFAULT 'online'
)
RETURNS TABLE (
    booking_id       UUID,
    booking_code     TEXT,
    status           TEXT,
    reschedule_token TEXT,
    staff_id         UUID,
    start_time       TIMESTAMPTZ,
    end_time         TIMESTAMPTZ
)
-- SECURITY DEFINER because `anon` holds no privilege on `bookings`,
-- `customers` or `notification_logs` and must not: the gates above are the
-- access control, not the grants. Without this the public portal cannot book
-- at all, and with it the pinned search_path is load-bearing — a definer
-- function that resolves `bookings` through a caller-controlled path is a
-- privilege escalation (defect B-09).
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_tz          TEXT;
    v_rules       JSONB;
    v_plan_cap    INT;
    v_staff       UUID := p_staff_id;
    v_duration    INT;
    v_buf_before  INT;
    v_buf_after   INT;
    v_end         TIMESTAMPTZ;
    v_date        DATE;
    v_customer    UUID;
    v_status      TEXT;
    v_branch      UUID := p_branch_id;
    v_used        INT;
    v_active      INT;
    v_max_active  INT;
    v_new         RECORD;
BEGIN
    -- Gate 1. The business exists, is active, and is published. An
    -- unpublished tenant has no services and no hours; a booking against it
    -- would be unanswerable by anyone.
    SELECT b.timezone, b.booking_rules, sp.max_monthly_bookings
    INTO v_tz, v_rules, v_plan_cap
    FROM businesses b
    LEFT JOIN subscription_plans sp ON sp.id = b.plan_id
    WHERE b.id = p_business_id
      AND b.is_active
      AND b.onboarding_completed_at IS NOT NULL;

    IF v_tz IS NULL THEN
        PERFORM booking_error('NOT_FOUND', 'That business is not taking bookings.');
    END IF;

    -- Gate 2. The service is this tenant's and is active.
    SELECT s.buffer_before_minutes, s.buffer_after_minutes
    INTO v_buf_before, v_buf_after
    FROM services s
    WHERE s.id = p_service_id
      AND s.business_id = p_business_id
      AND s.is_active;

    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'That service is no longer offered.');
    END IF;

    v_date := (p_start_time AT TIME ZONE v_tz)::date;

    -- "Any available": resolve to a concrete provider before the gates below,
    -- so the one chosen is validated like any other. Defect B-14 gave the
    -- portal this option with nothing behind it.
    IF v_staff IS NULL THEN
        SELECT a.staff_id INTO v_staff
        FROM get_available_slots_any(p_business_id, p_service_id, v_date, p_branch_id) a
        WHERE a.slot_start = p_start_time
        LIMIT 1;

        IF v_staff IS NULL THEN
            PERFORM booking_error('SLOT_UNAVAILABLE',
                'Nobody is free at that time. Please choose another.');
        END IF;
    END IF;

    -- Gate 3. The provider is this tenant's, active, and performs the service
    -- (defect M-01 — otherwise a hygienist is bookable for a root canal).
    PERFORM 1 FROM staff_resources sr
    WHERE sr.id = v_staff AND sr.business_id = p_business_id AND sr.is_active;
    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'That provider is not available.');
    END IF;

    v_duration := resolved_duration_minutes(v_staff, p_service_id);
    IF v_duration IS NULL THEN
        PERFORM booking_error('STAFF_SERVICE_MISMATCH',
            'That provider does not perform this service.');
    END IF;

    v_end := shift_minutes(p_start_time, v_duration);

    -- Gate 4. The booking window (M-02) and the lead time (M-03). Checked
    -- before gate 5 only so the error is specific: "too far ahead" is a
    -- different message from "that time is not free".
    IF p_start_time < NOW() + make_interval(mins => greatest(booking_rule_int(v_rules, 'min_lead_minutes', 60), 0)) THEN
        PERFORM booking_error('OUTSIDE_BOOKING_WINDOW',
            'That time is too soon. Please choose a later slot.');
    END IF;

    IF v_date > (NOW() AT TIME ZONE v_tz)::date
                + greatest(booking_rule_int(v_rules, 'max_advance_days', 30), 0) THEN
        PERFORM booking_error('OUTSIDE_BOOKING_WINDOW',
            'That date is further ahead than this business accepts bookings.');
    END IF;

    -- Gate 5. The authoritative check. Working hours, breaks, holidays, leave
    -- and existing appointments all collapse into this one question.
    PERFORM 1
    FROM get_available_slots(p_business_id, p_service_id, v_staff, v_date) g
    WHERE g.slot_start = p_start_time;

    IF NOT FOUND THEN
        PERFORM booking_error('SLOT_UNAVAILABLE',
            'That time is not available. Please choose another.');
    END IF;

    -- Gate 6. Plan quota, counted in the tenant's own month.
    IF v_plan_cap IS NOT NULL THEN
        SELECT count(*) INTO v_used
        FROM bookings bk
        WHERE bk.business_id = p_business_id
          AND bk.status <> 'cancelled'
          AND (bk.created_at AT TIME ZONE v_tz)::date
              >= date_trunc('month', (NOW() AT TIME ZONE v_tz))::date;

        IF v_used >= v_plan_cap THEN
            PERFORM booking_error('PLAN_LIMIT_REACHED',
                'This business has reached its monthly booking limit.');
        END IF;
    END IF;

    -- Customer, by phone within the tenant. The unique key is
    -- (business_id, phone), so a returning patient keeps one record and one
    -- history rather than accumulating a row per visit.
    SELECT c.id INTO v_customer
    FROM customers c
    WHERE c.business_id = p_business_id AND c.phone = p_customer_phone;

    IF v_customer IS NULL THEN
        INSERT INTO customers (business_id, full_name, phone, email,
                               preferred_channel, notes)
        VALUES (p_business_id, p_customer_name, p_customer_phone, p_customer_email,
                CASE WHEN p_customer_email IS NULL THEN 'none' ELSE 'email' END,
                NULLIF(p_customer_notes, ''))
        RETURNING id INTO v_customer;
    ELSE
        -- Fill gaps, never overwrite. The clinic may have corrected the
        -- spelling of a name the customer keeps typing differently, and the
        -- clinic's copy is the one staff recognise.
        UPDATE customers c
        SET email = coalesce(c.email, p_customer_email),
            updated_at = NOW()
        WHERE c.id = v_customer;
    END IF;

    -- Gate 7. Abuse control. Without it one phone number can hold a tenant's
    -- entire week, which is a denial of service costing nothing to mount.
    v_max_active := greatest(booking_rule_int(v_rules, 'max_active_per_customer', 3), 1);

    SELECT count(*) INTO v_active
    FROM bookings bk
    WHERE bk.business_id = p_business_id
      AND bk.customer_id = v_customer
      AND bk.status IN ('pending', 'confirmed')
      AND bk.start_time > NOW();

    IF v_active >= v_max_active THEN
        PERFORM booking_error('RATE_LIMITED',
            'You already have the maximum number of upcoming bookings with this business.');
    END IF;

    -- Gate 8. The spec hardcodes 'confirmed' and ignores its own
    -- auto_confirm flag, so a clinic that wants to vet every request gets none
    -- of them. Admin-entered bookings are confirmed regardless: the person
    -- typing it is the person who would approve it.
    v_status := CASE
        WHEN p_source IN ('walk_in', 'phone', 'admin') THEN 'confirmed'
        WHEN booking_rule_bool(v_rules, 'auto_confirm', TRUE) THEN 'confirmed'
        ELSE 'pending'
    END;

    IF v_branch IS NULL THEN
        SELECT sr.branch_id INTO v_branch FROM staff_resources sr WHERE sr.id = v_staff;
    END IF;

    -- Gate 9 and 10. Buffers are snapshotted from the service, never read back
    -- from it (defect B-03): editing the service next month must not redraw
    -- the blocked range of an appointment booked today. The exclusion
    -- constraint is what actually prevents the double booking; everything
    -- above only decides whether it is worth asking.
    BEGIN
        INSERT INTO bookings
            (business_id, branch_id, customer_id, service_id, staff_id,
             start_time, end_time, buffer_before_minutes, buffer_after_minutes,
             status, booking_source, customer_notes, total_price)
        SELECT p_business_id, v_branch, v_customer, p_service_id, v_staff,
               p_start_time, v_end, v_buf_before, v_buf_after,
               v_status, p_source, NULLIF(p_customer_notes, ''),
               coalesce(ss.custom_price, s.price)
        FROM services s
        LEFT JOIN staff_services ss
          ON ss.service_id = s.id AND ss.staff_id = v_staff
        WHERE s.id = p_service_id
        RETURNING id, booking_code, status, reschedule_token, staff_id, start_time, end_time
        INTO v_new;
    EXCEPTION WHEN exclusion_violation THEN
        -- Two customers wanted the same slot and the other one committed
        -- first. Expected traffic on a busy clinic, not a fault.
        PERFORM booking_error('SLOT_TAKEN',
            'That time was just booked by someone else. Please choose another.');
    END;

    UPDATE customers c
    SET total_bookings = c.total_bookings + 1, updated_at = NOW()
    WHERE c.id = v_customer;

    INSERT INTO booking_history
        (business_id, booking_id, action, new_start_time, new_status,
         actor_type, actor_user_id)
    VALUES (p_business_id, v_new.id, 'created', v_new.start_time, v_new.status,
            CASE WHEN auth.uid() IS NULL THEN 'customer' ELSE 'staff' END,
            auth.uid());

    PERFORM queue_booking_notifications(v_new.id);

    booking_id       := v_new.id;
    booking_code     := v_new.booking_code;
    status           := v_new.status;
    reschedule_token := v_new.reschedule_token;
    staff_id         := v_new.staff_id;
    start_time       := v_new.start_time;
    end_time         := v_new.end_time;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION create_booking_atomic(UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) IS
    'Defect B-06. The spec''s version validated nothing and was callable by anon against any business id on the public portal. Ten gates run before the insert; gate 5 defers to get_available_slots so the picker and the gate cannot disagree.';

-- --- Grants ----------------------------------------------------------------
--
-- `anon` must be able to book: that is the entire public portal. It may not
-- queue notifications directly — that would let anyone write arbitrary rows
-- into the send queue with a recipient of their choosing.

REVOKE EXECUTE ON FUNCTION
    booking_error(TEXT, TEXT),
    render_template(TEXT, JSONB),
    queue_booking_notifications(UUID),
    create_booking_atomic(UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, UUID, TEXT)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    create_booking_atomic(UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, UUID, TEXT)
    TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
    booking_error(TEXT, TEXT),
    render_template(TEXT, JSONB)
    TO authenticated, service_role;

-- Deliberately not granted to `authenticated`. It is SECURITY DEFINER and
-- takes a bare booking id, so a signed-in user of tenant A could otherwise
-- cancel and rewrite tenant B's queued reminders by guessing or harvesting an
-- id. The functions that legitimately call it are themselves SECURITY
-- DEFINER, so they execute it as the owner and need no grant here.
GRANT EXECUTE ON FUNCTION queue_booking_notifications(UUID) TO service_role;
