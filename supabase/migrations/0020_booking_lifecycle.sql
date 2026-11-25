-- ---------------------------------------------------------------------------
-- 0020 — Rescheduling, cancelling, and the status machine
--
-- Three defects and one outright omission, all in the same area:
--
--   * **B-19** — `reschedule_booking_by_token` validates nothing but the GIST
--     overlap, so a customer can move their own appointment to 04:00 on a
--     public holiday. The slot picker would never have offered it; the API
--     accepts it anyway.
--
--   * **B-18** — the same function destroys the queued reminders and queues
--     only the "rescheduled" notice, so the 24-hour and 1-hour reminders are
--     gone. Fixed by routing every path through
--     `queue_booking_notifications` (0019).
--
--   * **M-04 / M-11** — `reschedule_count` is incremented and never checked,
--     and the token is never rotated, so a link forwarded once can be replayed
--     indefinitely by whoever received it.
--
--   * **B-11** — `cancel_booking_by_token` appears in the spec's API table and
--     nowhere in its SQL. The endpoint simply does not exist.
--
-- And **M-12**: the spec describes a status workflow
-- (pending → confirmed → checked_in → completed, plus cancelled / no_show) and
-- enforces none of it, so a completed appointment can be moved back to pending
-- and a cancelled one marked as attended.
--
-- ## Why all of these are SECURITY DEFINER
--
-- Two different reasons, worth separating:
--
--   * The token functions are called by a guest with no session at all. The
--     token *is* the credential, so authorization is "you produced 192 bits of
--     entropy that match this row", and that check happens inside the
--     function. `anon` holds no privilege on `bookings` and must not.
--
--   * `booking_history` has a SELECT policy and no INSERT policy, which is
--     deliberate: if members could write it directly they could forge the
--     audit trail, including `actor_user_id`. The audit row is therefore
--     written only by trusted code running as the owner, and the staff-facing
--     function does its own role check instead of relying on RLS.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- --- The status machine (defect M-12) --------------------------------------

CREATE FUNCTION booking_status_transition_allowed(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
    SELECT CASE p_from
        -- A request not yet accepted. It can be accepted, withdrawn, or the
        -- customer can fail to turn up for a slot that was never confirmed.
        WHEN 'pending'    THEN p_to IN ('confirmed', 'cancelled', 'no_show')
        -- 'completed' is reachable without 'checked_in' on purpose: plenty of
        -- clinics never touch a check-in screen, and forcing the intermediate
        -- state would make them mark every appointment twice.
        WHEN 'confirmed'  THEN p_to IN ('checked_in', 'completed', 'cancelled', 'no_show')
        WHEN 'checked_in' THEN p_to IN ('completed', 'no_show')
        ELSE FALSE
    END;
$$;

COMMENT ON FUNCTION booking_status_transition_allowed(TEXT, TEXT) IS
    'Defect M-12. completed, cancelled and no_show are terminal: a cancelled appointment that can be marked attended is a billing dispute waiting to happen.';

CREATE FUNCTION set_booking_status(
    p_booking_id UUID,
    p_new_status TEXT,
    p_reason     TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_business UUID;
    v_staff    UUID;
    v_old      TEXT;
BEGIN
    SELECT bk.business_id, bk.staff_id, bk.status
    INTO v_business, v_staff, v_old
    FROM bookings bk
    WHERE bk.id = p_booking_id;

    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'No such booking.');
    END IF;

    -- Mirrors the UPDATE policy on `bookings`: the desk handles anyone's
    -- appointments, a provider only their own. Spelled out here because this
    -- function runs as the owner and RLS is therefore not consulted.
    IF NOT (has_role(v_business, ARRAY['owner', 'manager', 'receptionist'])
            OR (has_role(v_business, ARRAY['staff']) AND v_staff = current_staff_id(v_business))) THEN
        PERFORM booking_error('FORBIDDEN', 'You cannot change this booking.');
    END IF;

    IF v_old = p_new_status THEN
        RETURN v_old;
    END IF;

    IF NOT booking_status_transition_allowed(v_old, p_new_status) THEN
        PERFORM booking_error('INVALID_STATUS_TRANSITION',
            format('A booking cannot go from %s to %s.', v_old, p_new_status));
    END IF;

    UPDATE bookings bk
    SET status = p_new_status, updated_at = NOW()
    WHERE bk.id = p_booking_id;

    INSERT INTO booking_history
        (business_id, booking_id, action, old_status, new_status,
         actor_type, actor_user_id, reason)
    VALUES (v_business, p_booking_id, 'status_changed', v_old, p_new_status,
            'staff', auth.uid(), p_reason);

    -- A booking that leaves pending/confirmed has nothing left to remind
    -- anyone about; one that enters confirmed from pending does. Both cases
    -- are the same call, because the function reads the booking's current
    -- state rather than being told what happened.
    PERFORM queue_booking_notifications(p_booking_id);

    IF p_new_status = 'no_show' THEN
        UPDATE customers c
        SET no_show_count = c.no_show_count + 1, updated_at = NOW()
        FROM bookings bk
        WHERE bk.id = p_booking_id AND c.id = bk.customer_id;
    END IF;

    RETURN p_new_status;
END;
$$;

-- --- Self-service reschedule (defects B-18, B-19, M-04, M-11) --------------

CREATE FUNCTION reschedule_booking_by_token(
    p_token      TEXT,
    p_start_time TIMESTAMPTZ
)
RETURNS TABLE (
    booking_id       UUID,
    booking_code     TEXT,
    start_time       TIMESTAMPTZ,
    end_time         TIMESTAMPTZ,
    reschedule_token TEXT,
    reschedules_left INT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_bk       RECORD;
    v_rules    JSONB;
    v_tz       TEXT;
    v_cutoff   INT;
    v_max      INT;
    v_duration INT;
    v_end      TIMESTAMPTZ;
    v_date     DATE;
    v_token    TEXT;
BEGIN
    SELECT bk.id, bk.business_id, bk.service_id, bk.staff_id, bk.status,
           bk.start_time, bk.reschedule_count
    INTO v_bk
    FROM bookings bk
    WHERE bk.reschedule_token = p_token;

    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'That booking link is not valid.');
    END IF;

    IF v_bk.status NOT IN ('pending', 'confirmed') THEN
        PERFORM booking_error('INVALID_STATUS_TRANSITION',
            'This booking can no longer be changed.');
    END IF;

    SELECT b.booking_rules, b.timezone INTO v_rules, v_tz
    FROM businesses b WHERE b.id = v_bk.business_id;

    -- The cutoff protects the provider's day, not the customer's convenience:
    -- an hour before the appointment the chair is already set up.
    v_cutoff := greatest(booking_rule_int(v_rules, 'min_reschedule_hours', 2), 0);
    IF v_bk.start_time - make_interval(hours => v_cutoff) <= NOW() THEN
        PERFORM booking_error('CUTOFF_PASSED',
            format('Appointments can only be changed more than %s hours ahead. Please call instead.', v_cutoff));
    END IF;

    -- M-04. The spec counts reschedules and never looks at the number.
    v_max := greatest(booking_rule_int(v_rules, 'max_reschedules', 2), 0);
    IF v_bk.reschedule_count >= v_max THEN
        PERFORM booking_error('RESCHEDULE_LIMIT_REACHED',
            'This booking has been changed the maximum number of times. Please call us.');
    END IF;

    v_duration := resolved_duration_minutes(v_bk.staff_id, v_bk.service_id);
    IF v_duration IS NULL THEN
        PERFORM booking_error('STAFF_SERVICE_MISMATCH',
            'This appointment can no longer be moved online. Please call us.');
    END IF;

    v_end  := shift_minutes(p_start_time, v_duration);
    v_date := (p_start_time AT TIME ZONE v_tz)::date;

    -- B-19. The gate the spec left out entirely. Excluding this booking from
    -- the busy set is what lets an appointment move by fifteen minutes
    -- without colliding with where it currently sits.
    PERFORM 1
    FROM available_slots_for(v_bk.business_id, v_bk.service_id, v_bk.staff_id,
                             v_date, v_bk.id) g
    WHERE g.slot_start = p_start_time;

    IF NOT FOUND THEN
        PERFORM booking_error('SLOT_UNAVAILABLE',
            'That time is not available. Please choose another.');
    END IF;

    -- M-11. A new token on every successful change, so a link that was
    -- forwarded to a colleague, or left in a shared inbox, stops working the
    -- moment the customer uses it themselves.
    v_token := generate_reschedule_token();

    BEGIN
        UPDATE bookings bk
        SET start_time       = p_start_time,
            end_time         = v_end,
            reschedule_count = bk.reschedule_count + 1,
            reschedule_token = v_token,
            updated_at       = NOW()
        WHERE bk.id = v_bk.id;
    EXCEPTION WHEN exclusion_violation THEN
        PERFORM booking_error('SLOT_TAKEN',
            'That time was just booked by someone else. Please choose another.');
    END;

    INSERT INTO booking_history
        (business_id, booking_id, action, old_start_time, new_start_time,
         actor_type)
    VALUES (v_bk.business_id, v_bk.id, 'rescheduled', v_bk.start_time,
            p_start_time, 'customer');

    -- B-18. Re-queues the confirmation *and both reminders* against the new
    -- time. The spec queued only the confirmation and left the appointment
    -- with no reminders at all.
    PERFORM queue_booking_notifications(v_bk.id);

    booking_id       := v_bk.id;
    start_time       := p_start_time;
    end_time         := v_end;
    reschedule_token := v_token;
    reschedules_left := v_max - (v_bk.reschedule_count + 1);
    SELECT bk.booking_code INTO booking_code FROM bookings bk WHERE bk.id = v_bk.id;
    RETURN NEXT;
END;
$$;

-- --- Self-service cancel (defect B-11) -------------------------------------

CREATE FUNCTION cancel_booking_by_token(
    p_token  TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (booking_id UUID, booking_code TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_bk     RECORD;
    v_rules  JSONB;
    v_cutoff INT;
BEGIN
    SELECT bk.id, bk.business_id, bk.customer_id, bk.status, bk.start_time,
           bk.booking_code
    INTO v_bk
    FROM bookings bk
    WHERE bk.reschedule_token = p_token;

    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'That booking link is not valid.');
    END IF;

    -- Cancelling an already-cancelled booking is the customer pressing the
    -- button twice, not an error worth showing them.
    IF v_bk.status = 'cancelled' THEN
        booking_id := v_bk.id;
        booking_code := v_bk.booking_code;
        status := 'cancelled';
        RETURN NEXT;
        RETURN;
    END IF;

    IF v_bk.status NOT IN ('pending', 'confirmed') THEN
        PERFORM booking_error('INVALID_STATUS_TRANSITION',
            'This booking can no longer be cancelled online.');
    END IF;

    SELECT b.booking_rules INTO v_rules FROM businesses b WHERE b.id = v_bk.business_id;

    v_cutoff := greatest(booking_rule_int(v_rules, 'min_cancel_hours', 2), 0);
    IF v_bk.start_time - make_interval(hours => v_cutoff) <= NOW() THEN
        PERFORM booking_error('CUTOFF_PASSED',
            format('Appointments can only be cancelled more than %s hours ahead. Please call instead.', v_cutoff));
    END IF;

    UPDATE bookings bk
    SET status = 'cancelled', updated_at = NOW()
    WHERE bk.id = v_bk.id;

    INSERT INTO booking_history
        (business_id, booking_id, action, old_status, new_status,
         actor_type, reason)
    VALUES (v_bk.business_id, v_bk.id, 'cancelled', v_bk.status, 'cancelled',
            'customer', p_reason);

    -- Leaving the booking's status outside pending/confirmed, this cancels
    -- the queued reminders and queues nothing new — which is the whole point.
    -- Reminding someone about an appointment they cancelled is worse than
    -- sending nothing.
    PERFORM queue_booking_notifications(v_bk.id);

    -- The waitlist sweep that should offer this freed slot to whoever is
    -- waiting belongs to Phase 9, where `waitlist_entries` gets its matching
    -- logic. Noted here rather than silently omitted: the slot is free from
    -- this moment and nobody is told.

    booking_id   := v_bk.id;
    booking_code := v_bk.booking_code;
    status       := 'cancelled';
    RETURN NEXT;
END;
$$;

-- --- Admin reschedule ------------------------------------------------------
--
-- Drag-and-drop on the calendar. Bypasses the customer's cutoff — the clinic
-- is allowed to move its own day at short notice — but availability is checked
-- exactly as for a customer, because the alternative is a receptionist
-- dropping an appointment onto a provider's lunch break and nothing objecting.

CREATE FUNCTION admin_reschedule_booking(
    p_booking_id UUID,
    p_start_time TIMESTAMPTZ,
    p_staff_id   UUID DEFAULT NULL,
    p_reason     TEXT DEFAULT NULL
)
RETURNS TABLE (booking_id UUID, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, staff_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_bk       RECORD;
    v_tz       TEXT;
    v_staff    UUID;
    v_duration INT;
    v_end      TIMESTAMPTZ;
    v_date     DATE;
BEGIN
    SELECT bk.id, bk.business_id, bk.service_id, bk.staff_id, bk.status, bk.start_time
    INTO v_bk
    FROM bookings bk
    WHERE bk.id = p_booking_id;

    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'No such booking.');
    END IF;

    IF NOT (has_role(v_bk.business_id, ARRAY['owner', 'manager', 'receptionist'])
            OR (has_role(v_bk.business_id, ARRAY['staff'])
                AND v_bk.staff_id = current_staff_id(v_bk.business_id))) THEN
        PERFORM booking_error('FORBIDDEN', 'You cannot change this booking.');
    END IF;

    IF v_bk.status NOT IN ('pending', 'confirmed') THEN
        PERFORM booking_error('INVALID_STATUS_TRANSITION',
            'Only an open booking can be moved.');
    END IF;

    v_staff := coalesce(p_staff_id, v_bk.staff_id);

    SELECT b.timezone INTO v_tz FROM businesses b WHERE b.id = v_bk.business_id;

    v_duration := resolved_duration_minutes(v_staff, v_bk.service_id);
    IF v_duration IS NULL THEN
        PERFORM booking_error('STAFF_SERVICE_MISMATCH',
            'That provider does not perform this service.');
    END IF;

    v_end  := shift_minutes(p_start_time, v_duration);
    v_date := (p_start_time AT TIME ZONE v_tz)::date;

    PERFORM 1
    FROM available_slots_for(v_bk.business_id, v_bk.service_id, v_staff,
                             v_date, v_bk.id) g
    WHERE g.slot_start = p_start_time;

    IF NOT FOUND THEN
        PERFORM booking_error('SLOT_UNAVAILABLE',
            'That time is not free for this provider.');
    END IF;

    BEGIN
        UPDATE bookings bk
        SET start_time = p_start_time,
            end_time   = v_end,
            staff_id   = v_staff,
            updated_at = NOW()
        WHERE bk.id = v_bk.id;
    EXCEPTION WHEN exclusion_violation THEN
        PERFORM booking_error('SLOT_TAKEN', 'That time is already taken.');
    END;

    INSERT INTO booking_history
        (business_id, booking_id, action, old_start_time, new_start_time,
         actor_type, actor_user_id, reason)
    VALUES (v_bk.business_id, v_bk.id, 'rescheduled', v_bk.start_time,
            p_start_time, 'staff', auth.uid(), p_reason);

    PERFORM queue_booking_notifications(v_bk.id);

    booking_id := v_bk.id;
    start_time := p_start_time;
    end_time   := v_end;
    staff_id   := v_staff;
    RETURN NEXT;
END;
$$;

-- --- Grants ----------------------------------------------------------------
--
-- The token functions are public because their caller is a guest holding a
-- link. The staff functions are not: they authorize by role, and a role is
-- something only a signed-in user has.

REVOKE EXECUTE ON FUNCTION
    booking_status_transition_allowed(TEXT, TEXT),
    set_booking_status(UUID, TEXT, TEXT),
    reschedule_booking_by_token(TEXT, TIMESTAMPTZ),
    cancel_booking_by_token(TEXT, TEXT),
    admin_reschedule_booking(UUID, TIMESTAMPTZ, UUID, TEXT)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    reschedule_booking_by_token(TEXT, TIMESTAMPTZ),
    cancel_booking_by_token(TEXT, TEXT)
    TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
    booking_status_transition_allowed(TEXT, TEXT),
    set_booking_status(UUID, TEXT, TEXT),
    admin_reschedule_booking(UUID, TIMESTAMPTZ, UUID, TEXT)
    TO authenticated, service_role;
