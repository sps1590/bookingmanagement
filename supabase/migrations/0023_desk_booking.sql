-- ---------------------------------------------------------------------------
-- 0023 — A walk-in is happening now
--
-- Phase 2 gave `create_booking_atomic` a minimum lead time (defect M-03: the
-- spec's `v_cursor > NOW()` would otherwise accept a slot sixty seconds away
-- that nobody sees before the patient arrives). The default is sixty minutes,
-- and it is right for the public portal.
--
-- It is wrong for the front desk, and in a way that makes the walk-in path
-- unusable rather than merely strict: someone standing at the counter wants
-- the next free slot, which is by definition inside the lead time. The gate
-- refuses it, and — worse — `get_available_slots` has already filtered that
-- slot out, so gate 5 refuses it too and the error says "that time is not
-- available" about a provider who is sitting there.
--
-- The plan's rule is that the desk may override the *customer's* cutoff but
-- never the availability gates. Lead time is a customer-facing courtesy —
-- "don't book something I won't see coming" — not a statement about whether
-- the provider is free. So for `walk_in`, `phone` and `admin` sources the lead
-- time and the advance window are skipped, and everything that describes
-- actual availability still applies: working hours, breaks, holidays, leave,
-- the service mapping, and the exclusion constraint.
--
-- A receptionist still cannot book a provider into their lunch break. That was
-- never the thing standing in the way.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- `p_ignore_lead` is last and defaulted, so every existing caller keeps the
-- behaviour it has. The public portal must never pass it.
--
-- DROP before CREATE, not CREATE OR REPLACE: adding a parameter makes a
-- *different* function as far as Postgres is concerned, so a replace would
-- leave both versions in place and every five-argument call — which is all of
-- them — would fail as "function is not unique". The body is a string literal
-- rather than a standard BEGIN ATOMIC block, so nothing records a dependency
-- on it and the drop is clean.
DROP FUNCTION available_slots_for(UUID, UUID, UUID, DATE, UUID);

CREATE FUNCTION available_slots_for(
    p_business_id        UUID,
    p_service_id         UUID,
    p_staff_id           UUID,
    p_date               DATE,
    p_exclude_booking_id UUID DEFAULT NULL,
    p_ignore_lead        BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_tz          TEXT;
    v_rules       JSONB;
    v_interval    INT;
    v_lead        INT;
    v_max_advance INT;
    v_duration    INT;
    v_buf_before  INT;
    v_buf_after   INT;
    v_today       DATE;
    v_work        TSTZMULTIRANGE;
    v_busy        TSTZMULTIRANGE;
    v_window      TSTZRANGE;
    v_cursor      TIMESTAMPTZ;
    v_end         TIMESTAMPTZ;
    v_earliest    TIMESTAMPTZ;
BEGIN
    SELECT timezone, booking_rules
    INTO v_tz, v_rules
    FROM businesses
    WHERE id = p_business_id
      AND is_active
      AND onboarding_completed_at IS NOT NULL;

    IF v_tz IS NULL THEN
        RETURN;
    END IF;

    v_duration := resolved_duration_minutes(p_staff_id, p_service_id);
    IF v_duration IS NULL THEN
        RETURN;
    END IF;

    SELECT s.buffer_before_minutes, s.buffer_after_minutes
    INTO v_buf_before, v_buf_after
    FROM services s
    WHERE s.id = p_service_id
      AND s.business_id = p_business_id
      AND s.is_active;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    PERFORM 1 FROM staff_resources
    WHERE id = p_staff_id AND business_id = p_business_id AND is_active;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_interval    := greatest(booking_rule_int(v_rules, 'slot_interval_minutes', 15), 1);
    v_lead        := greatest(booking_rule_int(v_rules, 'min_lead_minutes', 60), 0);
    v_max_advance := greatest(booking_rule_int(v_rules, 'max_advance_days', 30), 0);

    v_today := (NOW() AT TIME ZONE v_tz)::date;

    -- The desk is allowed to look at today regardless of the advance window;
    -- it is not allowed to invent a day in the past, because the exclusion
    -- constraint would happily accept one and the diary would show an
    -- appointment nobody can attend.
    IF p_date < v_today OR (NOT p_ignore_lead AND p_date > v_today + v_max_advance) THEN
        RETURN;
    END IF;

    v_work := working_windows(p_business_id, p_staff_id, p_date);
    IF isempty(v_work) THEN
        RETURN;
    END IF;

    v_busy := busy_ranges(p_business_id, p_staff_id,
                          lower(v_work), upper(v_work), p_exclude_booking_id);

    -- For the desk, "not in the past" replaces "not within the lead time".
    v_earliest := CASE
        WHEN p_ignore_lead THEN NOW()
        ELSE NOW() + make_interval(mins => v_lead)
    END;

    FOR v_window IN SELECT unnest(v_work) LOOP
        v_cursor := lower(v_window);

        WHILE v_cursor + make_interval(mins => v_duration) <= upper(v_window) LOOP
            v_end := v_cursor + make_interval(mins => v_duration);

            IF v_cursor >= v_earliest
               AND v_work @> tstzrange(v_cursor, v_end, '[)')
               AND NOT (v_busy && tstzrange(shift_minutes(v_cursor, -v_buf_before),
                                            shift_minutes(v_end, v_buf_after), '[)'))
            THEN
                slot_start := v_cursor;
                slot_end   := v_end;
                RETURN NEXT;
            END IF;

            v_cursor := v_cursor + make_interval(mins => v_interval);
        END LOOP;
    END LOOP;
END;
$$;

/**
 * Free slots as the front desk sees them: the lead time and the advance
 * window lifted, everything about actual availability still in force.
 *
 * Separate from `get_available_slots` rather than a flag on it, because the
 * public portal must have no way to ask this question — a parameter the
 * browser can set is a parameter the browser will set.
 */
CREATE FUNCTION get_desk_slots(
    p_business_id UUID,
    p_service_id  UUID,
    p_staff_id    UUID,
    p_date        DATE
)
RETURNS TABLE (slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT slot_start, slot_end
    FROM available_slots_for(p_business_id, p_service_id, p_staff_id, p_date, NULL, TRUE)
    WHERE is_business_member(p_business_id);
$$;

COMMENT ON FUNCTION get_desk_slots(UUID, UUID, UUID, DATE) IS
    'The walk-in view of today. Definer rights to reach the schedule tables, with an explicit membership test inside — a SECURITY DEFINER function granted to authenticated would otherwise answer about any business whose id the caller could name.';

-- --- create_booking_atomic: the desk takes the next free slot --------------

CREATE OR REPLACE FUNCTION create_booking_atomic(
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
    v_desk        BOOLEAN := p_source IN ('walk_in', 'phone', 'admin');
BEGIN
    -- Gate 1.
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

    -- A desk source is only trustworthy if the caller is actually at the
    -- desk. Without this check, the public endpoint could pass
    -- p_source => 'walk_in' and skip the lead time it exists to enforce.
    IF v_desk AND NOT is_business_member(p_business_id) THEN
        PERFORM booking_error('FORBIDDEN', 'Only staff can record a walk-in.');
    END IF;

    -- Gate 2.
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

    -- Gate 3.
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

    -- Gate 4. Lifted for the desk: a walk-in is by definition inside the lead
    -- time, and the advance window is a courtesy to the customer, not a fact
    -- about the provider. The past is still refused for everyone.
    IF v_desk THEN
        IF p_start_time < NOW() - INTERVAL '1 hour' THEN
            PERFORM booking_error('OUTSIDE_BOOKING_WINDOW',
                'That time has already passed.');
        END IF;
    ELSE
        IF p_start_time < NOW() + make_interval(mins => greatest(booking_rule_int(v_rules, 'min_lead_minutes', 60), 0)) THEN
            PERFORM booking_error('OUTSIDE_BOOKING_WINDOW',
                'That time is too soon. Please choose a later slot.');
        END IF;

        IF v_date > (NOW() AT TIME ZONE v_tz)::date
                    + greatest(booking_rule_int(v_rules, 'max_advance_days', 30), 0) THEN
            PERFORM booking_error('OUTSIDE_BOOKING_WINDOW',
                'That date is further ahead than this business accepts bookings.');
        END IF;
    END IF;

    -- Gate 5, against the same slot list the caller was shown.
    PERFORM 1
    FROM available_slots_for(p_business_id, p_service_id, v_staff, v_date, NULL, v_desk) g
    WHERE g.slot_start = p_start_time;

    IF NOT FOUND THEN
        PERFORM booking_error('SLOT_UNAVAILABLE',
            'That time is not available. Please choose another.');
    END IF;

    -- Gate 6.
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
        UPDATE customers c
        SET email = coalesce(c.email, p_customer_email),
            updated_at = NOW()
        WHERE c.id = v_customer;
    END IF;

    -- Gate 7. Not applied at the desk: the abuse this stops is a script, and
    -- a receptionist booking a family of four in a row is not one. The person
    -- doing it is named in the audit trail.
    IF NOT v_desk THEN
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
    END IF;

    -- Gate 8.
    v_status := CASE
        WHEN v_desk THEN 'confirmed'
        WHEN booking_rule_bool(v_rules, 'auto_confirm', TRUE) THEN 'confirmed'
        ELSE 'pending'
    END;

    IF v_branch IS NULL THEN
        SELECT sr.branch_id INTO v_branch FROM staff_resources sr WHERE sr.id = v_staff;
    END IF;

    -- Gates 9 and 10.
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

-- --- Grants ----------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION
    available_slots_for(UUID, UUID, UUID, DATE, UUID, BOOLEAN),
    get_desk_slots(UUID, UUID, UUID, DATE)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION available_slots_for(UUID, UUID, UUID, DATE, UUID, BOOLEAN)
    TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION get_desk_slots(UUID, UUID, UUID, DATE)
    TO authenticated, service_role;
