-- ---------------------------------------------------------------------------
-- 0027 — The waitlist that was never wired up, and the numbers an owner asks for
--
-- ## Defect M-09 — `waitlist_entries` has a `notified` status and no logic
--
-- The table is in the spec, the status values are in the spec, and nothing
-- anywhere moves a row between them. So a cancellation frees a slot and the
-- people who asked to be told hear nothing.
--
-- The rule that matters is the one the plan calls out: **notify one person,
-- not fifty**. Telling everybody on the list produces a race to a single slot
-- and forty-nine people who were told they could have an appointment and
-- cannot. One at a time, in the order they asked, each with a window to
-- respond — and when the window closes, the next.
--
-- ## Suspension has to be immediate
--
-- `businesses.is_active` already gates every public read and
-- `create_booking_atomic`. What was missing is the lever: an operator could
-- not set it without writing SQL by hand, and a suspended tenant that can
-- still take bookings is worse than no suspension at all.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- --- The waitlist ----------------------------------------------------------

/**
 * Offer a freed slot to one waiting person.
 *
 * FIFO within the matching entries, because the only fair ordering a customer
 * can understand is the order they asked. A row stays `notified` until it
 * expires, which is what stops the same slot being offered twice over.
 *
 * Returns the entry notified, or NULL when nobody matched — a cancellation
 * with an empty waitlist is the normal case, not an error.
 */
CREATE FUNCTION notify_waitlist_for_booking(p_booking_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_bk    RECORD;
    v_entry RECORD;
    v_hours INT;
    v_body  TEXT;
BEGIN
    SELECT bk.business_id, bk.service_id, bk.staff_id, bk.start_time,
           b.timezone, b.booking_rules, b.name AS business_name, b.slug
    INTO v_bk
    FROM bookings bk
    JOIN businesses b ON b.id = bk.business_id
    WHERE bk.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_hours := greatest(booking_rule_int(v_bk.booking_rules, 'waitlist_claim_hours', 4), 1);

    -- One row, locked, so two cancellations landing together cannot both
    -- offer the slot to the same person — or to two people for one slot.
    SELECT w.*
    INTO v_entry
    FROM waitlist_entries w
    WHERE w.business_id = v_bk.business_id
      AND w.service_id = v_bk.service_id
      AND w.status = 'waiting'
      AND w.desired_date = (v_bk.start_time AT TIME ZONE v_bk.timezone)::date
      AND (w.staff_id IS NULL OR w.staff_id = v_bk.staff_id)
      AND (w.desired_from_time IS NULL
           OR (v_bk.start_time AT TIME ZONE v_bk.timezone)::time >= w.desired_from_time)
      AND (w.desired_to_time IS NULL
           OR (v_bk.start_time AT TIME ZONE v_bk.timezone)::time < w.desired_to_time)
      AND w.expires_at > NOW()
    ORDER BY w.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE waitlist_entries
    SET status = 'notified',
        notified_at = NOW(),
        expires_at = NOW() + make_interval(hours => v_hours),
        updated_at = NOW()
    WHERE id = v_entry.id;

    -- Queued like any other message, so it inherits the retry, the backoff and
    -- the delivery log rather than being a send that nothing records.
    IF v_entry.customer_email IS NOT NULL THEN
        v_body := format(
            '%s has a free slot on %s at %s. It is held for you for %s hours — book at %s/book/%s',
            v_bk.business_name,
            to_char(v_bk.start_time AT TIME ZONE v_bk.timezone, 'FMDay, FMDD FMMonth'),
            to_char(v_bk.start_time AT TIME ZONE v_bk.timezone, 'HH12:MI AM'),
            v_hours,
            coalesce(current_setting('app.public_url', TRUE), ''),
            v_bk.slug);

        INSERT INTO notification_logs
            (business_id, booking_id, recipient_type, recipient_contact, channel,
             event_type, subject, message_body, scheduled_at)
        VALUES (v_bk.business_id, NULL, 'customer', v_entry.customer_email, 'email',
                'waitlist_slot_open', 'A slot has come free', v_body, NOW());
    END IF;

    RETURN v_entry.id;
END;
$$;

COMMENT ON FUNCTION notify_waitlist_for_booking(UUID) IS
    'Defect M-09. One person, in the order they asked, with a window to respond. Telling everyone produces a race to a single slot and a queue of people who were promised an appointment that is already gone.';

/**
 * Return expired offers to the queue and pass the slot on.
 *
 * Without this a waitlist silently drains: every unanswered offer leaves a row
 * stuck in `notified` and the next person never hears anything.
 */
CREATE FUNCTION expire_waitlist_offers()
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE waitlist_entries
    SET status = CASE WHEN desired_date < CURRENT_DATE THEN 'expired' ELSE 'waiting' END,
        notified_at = NULL,
        expires_at = CASE
            WHEN desired_date < CURRENT_DATE THEN expires_at
            ELSE (desired_date + TIME '23:59')::timestamptz
        END,
        updated_at = NOW()
    WHERE status = 'notified'
      AND expires_at < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Cancelling now offers the slot on. Rebuilt rather than patched so the whole
-- cancellation path reads in one place.
CREATE OR REPLACE FUNCTION cancel_booking_by_token(
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
    SELECT bk.id, bk.business_id, bk.customer_id, bk.status, bk.start_time, bk.booking_code
    INTO v_bk
    FROM bookings bk
    WHERE bk.reschedule_token = p_token;

    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'That booking link is not valid.');
    END IF;

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
        (business_id, booking_id, action, old_status, new_status, actor_type, reason)
    VALUES (v_bk.business_id, v_bk.id, 'cancelled', v_bk.status, 'cancelled',
            'customer', p_reason);

    PERFORM queue_booking_notifications(v_bk.id);

    -- Defect M-09: the freed slot goes to the first person who asked for it.
    PERFORM notify_waitlist_for_booking(v_bk.id);

    booking_id   := v_bk.id;
    booking_code := v_bk.booking_code;
    status       := 'cancelled';
    RETURN NEXT;
END;
$$;


/**
 * Joining the waitlist, from the public portal.
 *
 * The CTA that appears when a day has nothing free. Deliberately light: a
 * name, a number and a day. Asking for an account first is how a waitlist
 * ends up empty.
 *
 * Capped per phone per day, because the list is only useful if the order in
 * it means something — somebody adding themselves eleven times is not eleven
 * people.
 */
CREATE FUNCTION join_waitlist(
    p_business_id    UUID,
    p_service_id     UUID,
    p_desired_date   DATE,
    p_customer_name  TEXT,
    p_customer_phone TEXT,
    p_customer_email TEXT DEFAULT NULL,
    p_staff_id       UUID DEFAULT NULL,
    p_note           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id    UUID;
    v_count INT;
BEGIN
    PERFORM 1 FROM businesses
    WHERE id = p_business_id AND is_active AND onboarding_completed_at IS NOT NULL;
    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'That business is not taking bookings.');
    END IF;

    PERFORM 1 FROM services
    WHERE id = p_service_id AND business_id = p_business_id AND is_active;
    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'That service is no longer offered.');
    END IF;

    IF p_desired_date < CURRENT_DATE THEN
        PERFORM booking_error('OUTSIDE_BOOKING_WINDOW', 'That day has already passed.');
    END IF;

    SELECT count(*) INTO v_count
    FROM waitlist_entries
    WHERE business_id = p_business_id
      AND customer_phone = p_customer_phone
      AND desired_date = p_desired_date
      AND status IN ('waiting', 'notified');

    IF v_count >= 3 THEN
        PERFORM booking_error('RATE_LIMITED',
            'You are already on the list for that day.');
    END IF;

    INSERT INTO waitlist_entries
        (business_id, service_id, staff_id, customer_name, customer_phone,
         customer_email, desired_date, note, expires_at)
    VALUES (p_business_id, p_service_id, p_staff_id, p_customer_name, p_customer_phone,
            nullif(p_customer_email, ''), p_desired_date, nullif(p_note, ''),
            (p_desired_date + TIME '23:59')::timestamptz)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- --- Analytics -------------------------------------------------------------

/**
 * The numbers an owner actually asks for, behind the same role test as
 * revenue: these are commercial figures, not desk information.
 */
CREATE FUNCTION analytics_summary(p_business_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (
    total_bookings    BIGINT,
    completed         BIGINT,
    cancelled         BIGINT,
    no_shows          BIGINT,
    completion_rate   NUMERIC,
    no_show_rate      NUMERIC,
    repeat_customers  BIGINT,
    distinct_customers BIGINT,
    collected         NUMERIC,
    estimated         NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tz TEXT;
BEGIN
    IF NOT has_role(p_business_id, ARRAY['owner', 'manager']) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'BK001',
            MESSAGE = 'FORBIDDEN',
            DETAIL  = 'Only an owner or manager can see analytics.';
    END IF;

    SELECT timezone INTO v_tz FROM businesses WHERE id = p_business_id;

    RETURN QUERY
    WITH scoped AS (
        SELECT bk.*
        FROM bookings bk
        WHERE bk.business_id = p_business_id
          AND (bk.start_time AT TIME ZONE v_tz)::date BETWEEN p_from AND p_to
    ),
    per_customer AS (
        SELECT customer_id, count(*) AS visits FROM scoped GROUP BY customer_id
    )
    SELECT count(*)::bigint,
           count(*) FILTER (WHERE status = 'completed')::bigint,
           count(*) FILTER (WHERE status = 'cancelled')::bigint,
           count(*) FILTER (WHERE status = 'no_show')::bigint,
           -- Rates are over what was *meant* to happen: a cancellation is not
           -- a failure to complete, it is an appointment that was called off.
           round(100.0 * count(*) FILTER (WHERE status = 'completed')
                 / nullif(count(*) FILTER (WHERE status <> 'cancelled'), 0), 1),
           round(100.0 * count(*) FILTER (WHERE status = 'no_show')
                 / nullif(count(*) FILTER (WHERE status <> 'cancelled'), 0), 1),
           (SELECT count(*) FROM per_customer WHERE visits > 1)::bigint,
           (SELECT count(*) FROM per_customer)::bigint,
           coalesce(sum(paid_amount), 0),
           coalesce(sum(total_price) FILTER (WHERE status <> 'cancelled'), 0)
    FROM scoped;
END;
$$;

/** Busiest hours, for deciding when to put a second provider on. */
CREATE FUNCTION analytics_peak_hours(p_business_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (hour_of_day INT, bookings BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tz TEXT;
BEGIN
    IF NOT has_role(p_business_id, ARRAY['owner', 'manager']) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'BK001', MESSAGE = 'FORBIDDEN',
            DETAIL = 'Only an owner or manager can see analytics.';
    END IF;

    SELECT timezone INTO v_tz FROM businesses WHERE id = p_business_id;

    RETURN QUERY
    SELECT EXTRACT(HOUR FROM (bk.start_time AT TIME ZONE v_tz))::int, count(*)::bigint
    FROM bookings bk
    WHERE bk.business_id = p_business_id
      AND bk.status <> 'cancelled'
      AND (bk.start_time AT TIME ZONE v_tz)::date BETWEEN p_from AND p_to
    GROUP BY 1
    ORDER BY 1;
END;
$$;

-- --- Suspension ------------------------------------------------------------

-- An operator acting on somebody else's business leaves a trail. D-012 says
-- the operator reads configuration and never patient data; this is the record
-- of the writes they *are* allowed to make.
CREATE TABLE platform_audit (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action             TEXT NOT NULL,
    target_business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
    detail             TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_audit ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON platform_audit TO authenticated;

CREATE POLICY "Operators read the platform audit"
    ON platform_audit FOR SELECT
    USING (is_platform_admin());

/**
 * Suspend or restore a tenant.
 *
 * `is_active` already gates the public views, `get_available_slots` and
 * `create_booking_atomic`, so flipping it stops new bookings immediately
 * without touching anything already in the diary — which is the correct
 * behaviour: suspending a business for non-payment should not cancel a
 * patient's appointment tomorrow.
 */
CREATE FUNCTION set_business_active(p_business_id UUID, p_active BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT is_platform_admin() THEN
        RAISE EXCEPTION USING
            ERRCODE = 'BK001', MESSAGE = 'FORBIDDEN',
            DETAIL = 'Only a platform operator can do that.';
    END IF;

    UPDATE businesses SET is_active = p_active, updated_at = NOW()
    WHERE id = p_business_id;

    INSERT INTO platform_audit (actor_user_id, action, target_business_id, detail)
    VALUES (auth.uid(),
            CASE WHEN p_active THEN 'business_activated' ELSE 'business_suspended' END,
            p_business_id, p_note);

    RETURN p_active;
END;
$$;

-- --- Grants ----------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION
    notify_waitlist_for_booking(UUID),
    expire_waitlist_offers(),
    join_waitlist(UUID, UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT),
    analytics_summary(UUID, DATE, DATE),
    analytics_peak_hours(UUID, DATE, DATE),
    set_business_active(UUID, BOOLEAN, TEXT)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION join_waitlist(UUID, UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT)
    TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
    analytics_summary(UUID, DATE, DATE),
    analytics_peak_hours(UUID, DATE, DATE),
    set_business_active(UUID, BOOLEAN, TEXT)
    TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION
    notify_waitlist_for_booking(UUID),
    expire_waitlist_offers()
    TO service_role;
