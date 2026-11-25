-- ---------------------------------------------------------------------------
-- 0018 — The slot engine
--
-- `get_available_slots` is the authoritative answer to "when is this provider
-- free". Everything in Phase 2 defers to it: `create_booking_atomic` does not
-- re-derive working hours, it asks this function whether the requested start
-- is in the list. One implementation, one set of defects, one place to fix
-- them.
--
-- ## What the spec got wrong, and why each one matters
--
-- * **B-20 — the timezone was hardcoded.** The spec formats with
--   `AT TIME ZONE 'Asia/Dhaka'` while `businesses.timezone` sits unread two
--   tables away. The second tenant outside Dhaka gets slots shifted by hours,
--   silently, with no error anywhere. Everything here converts through the
--   tenant's own zone.
--
-- * **M-01 — `staff_services` was ignored.** The spec's generator offers every
--   active provider for every service, so a hygienist is bookable for a root
--   canal and a colourist for a beard trim. The join is not optional; it is
--   the difference between a schedule and a suggestion.
--
-- * **M-02 / M-03 — `booking_rules` was defined and never read.** No maximum
--   advance window, so a customer books 400 days out; no minimum lead time, so
--   the spec's `v_cursor > NOW()` permits a slot sixty seconds away that
--   nobody will see before the patient arrives.
--
-- * **M-05 — performance.** The spec runs a correlated `NOT EXISTS` per
--   candidate slot, so a 12-hour day at 15-minute granularity against 40
--   bookings is ~2000 index probes. Here the day's commitments are collapsed
--   once into a `tstzmultirange` and every candidate is tested against that in
--   memory. Postgres 14 gained `range_agg`; this is exactly what it is for.
--
-- ## Wall-clock times, and why the conversion lives here
--
-- `availability_rules` stores `TIME`, not `timestamptz`, because a clinic that
-- opens at 10:00 opens at 10:00 on both sides of a DST change. That makes the
-- rules wall-clock facts, and they become instants only when combined with a
-- date and a zone — which happens here, once. `(date + time) AT TIME ZONE tz`
-- is the whole conversion; doing it anywhere else is how the two halves of a
-- product drift apart.
--
-- ## Why these are SECURITY DEFINER
--
-- The public booking portal calls this as `anon`, which holds no privilege on
-- `availability_rules`, `staff_resources` or `bookings` — deliberately, since
-- those tables carry a provider's personal phone number and a patient's
-- history (defects B-05, N-01). The function therefore runs as its owner and
-- returns nothing but times. It still refuses to answer for a business that is
-- inactive or has not finished onboarding, so an unpublished tenant's working
-- hours are not probeable through it.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- --- Reading booking_rules safely ------------------------------------------
--
-- `booking_rules` is tenant-editable JSONB. It has been written by an earlier
-- version of this schema, by a settings screen, and by hand in fixtures, so a
-- key may be absent, null, or a string where a number belongs. A slot
-- generator that throws `invalid input syntax for type integer` because
-- someone typed "thirty" into a settings box has turned a bad preference into
-- an outage. These resolve to the documented default instead.

CREATE FUNCTION booking_rule_int(p_rules JSONB, p_key TEXT, p_default INT)
RETURNS INT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_rules IS NULL                           THEN p_default
        WHEN jsonb_typeof(p_rules -> p_key) = 'number' THEN (p_rules ->> p_key)::numeric::int
        WHEN p_rules ->> p_key ~ '^-?[0-9]+$'          THEN (p_rules ->> p_key)::int
        ELSE p_default
    END;
$$;

CREATE FUNCTION booking_rule_bool(p_rules JSONB, p_key TEXT, p_default BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_rules IS NULL                            THEN p_default
        WHEN jsonb_typeof(p_rules -> p_key) = 'boolean' THEN (p_rules ->> p_key)::boolean
        WHEN lower(p_rules ->> p_key) IN ('true','t','yes','1')  THEN TRUE
        WHEN lower(p_rules ->> p_key) IN ('false','f','no','0')  THEN FALSE
        ELSE p_default
    END;
$$;

COMMENT ON FUNCTION booking_rule_int(JSONB, TEXT, INT) IS
    'Total: never raises on malformed tenant configuration. A settings screen that accepted "thirty" must not take the booking portal down.';

-- --- The resolved duration of one service for one provider -----------------
--
-- M-01: `staff_services.custom_duration_minutes` lets a senior stylist take 30
-- minutes over a cut the salon bills at 45. Returns NULL when the provider
-- does not perform the service at all, which is the signal every caller uses
-- to refuse the booking.

CREATE FUNCTION resolved_duration_minutes(p_staff_id UUID, p_service_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(ss.custom_duration_minutes, s.duration_minutes)
    FROM staff_services ss
    JOIN services s ON s.id = ss.service_id
    WHERE ss.staff_id = p_staff_id
      AND ss.service_id = p_service_id
      AND s.is_active;
$$;

-- --- The working day, as instants ------------------------------------------
--
-- Returns the provider's bookable windows on one date in the tenant's zone,
-- already reduced by breaks, as a multirange. Empty means "not working", which
-- covers a day off, a holiday and a closure without the caller distinguishing
-- them — the public portal must not reveal *why* a provider is unavailable.
--
-- Precedence, per the note on `availability_overrides`:
--   1. A business-wide override (staff_id IS NULL) beats everything. The
--      clinic is shut; no provider works.
--   2. A per-provider override for that date replaces the weekly rules.
--   3. Otherwise the weekly rules for that day of week.
--
-- Breaks subtract in every case, including from an override's custom hours: a
-- shortened Saturday still has lunch, and a tenant who wants otherwise can
-- remove the break rule. Stated here because the opposite choice is just as
-- defensible and the next reader deserves to know which one was made.

CREATE FUNCTION working_windows(p_business_id UUID, p_staff_id UUID, p_date DATE)
RETURNS TSTZMULTIRANGE
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_tz        TEXT;
    v_dow       SMALLINT;
    v_closed    BOOLEAN;
    v_work      TSTZMULTIRANGE;
    v_breaks    TSTZMULTIRANGE;
    v_ovr_start TIME;
    v_ovr_end   TIME;
    v_has_ovr   BOOLEAN := FALSE;
BEGIN
    SELECT timezone INTO v_tz FROM businesses WHERE id = p_business_id;
    IF v_tz IS NULL THEN
        RETURN '{}'::tstzmultirange;
    END IF;

    v_dow := EXTRACT(DOW FROM p_date)::smallint;

    -- 1. Business-wide closure.
    SELECT is_closed, custom_start_time, custom_end_time
    INTO v_closed, v_ovr_start, v_ovr_end
    FROM availability_overrides
    WHERE business_id = p_business_id
      AND staff_id IS NULL
      AND override_date = p_date;

    IF FOUND THEN
        IF v_closed THEN
            RETURN '{}'::tstzmultirange;
        END IF;
        v_has_ovr := TRUE;
    ELSE
        -- 2. Per-provider override.
        SELECT is_closed, custom_start_time, custom_end_time
        INTO v_closed, v_ovr_start, v_ovr_end
        FROM availability_overrides
        WHERE business_id = p_business_id
          AND staff_id = p_staff_id
          AND override_date = p_date;

        IF FOUND THEN
            IF v_closed THEN
                RETURN '{}'::tstzmultirange;
            END IF;
            v_has_ovr := TRUE;
        END IF;
    END IF;

    IF v_has_ovr THEN
        -- The CHECK on availability_overrides guarantees both times are
        -- present and ordered when is_closed is false (defect M-15), so this
        -- cannot produce an empty or inverted range.
        v_work := multirange(tstzrange(
            (p_date + v_ovr_start) AT TIME ZONE v_tz,
            (p_date + v_ovr_end)   AT TIME ZONE v_tz,
            '[)'));
    ELSE
        -- 3. The repeating week.
        SELECT coalesce(range_agg(tstzrange(
                   (p_date + start_time) AT TIME ZONE v_tz,
                   (p_date + end_time)   AT TIME ZONE v_tz,
                   '[)')), '{}'::tstzmultirange)
        INTO v_work
        FROM availability_rules
        WHERE business_id = p_business_id
          AND staff_id = p_staff_id
          AND day_of_week = v_dow
          AND NOT is_break;
    END IF;

    IF v_work IS NULL OR isempty(v_work) THEN
        RETURN '{}'::tstzmultirange;
    END IF;

    SELECT coalesce(range_agg(tstzrange(
               (p_date + start_time) AT TIME ZONE v_tz,
               (p_date + end_time)   AT TIME ZONE v_tz,
               '[)')), '{}'::tstzmultirange)
    INTO v_breaks
    FROM availability_rules
    WHERE business_id = p_business_id
      AND staff_id = p_staff_id
      AND day_of_week = v_dow
      AND is_break;

    RETURN v_work - v_breaks;
END;
$$;

COMMENT ON FUNCTION working_windows(UUID, UUID, DATE) IS
    'Bookable windows for one provider on one date, in the tenant timezone, breaks already subtracted. Empty means unavailable without saying why — the public portal must not leak the reason.';

-- --- The diary -------------------------------------------------------------
--
-- Every blocked range already committed for this provider, collapsed once.
-- Widened by the 480-minute maximum buffer at each end so a booking starting
-- before midnight whose sterilisation gap reaches into this day is still seen.
--
-- `p_exclude_booking_id` exists for reschedules: a booking must not be judged
-- to collide with where it currently sits.

CREATE FUNCTION busy_ranges(
    p_business_id        UUID,
    p_staff_id           UUID,
    p_from               TIMESTAMPTZ,
    p_to                 TIMESTAMPTZ,
    p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS TSTZMULTIRANGE
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(range_agg(blocked_range), '{}'::tstzmultirange)
    FROM bookings
    WHERE business_id = p_business_id
      AND staff_id = p_staff_id
      AND status IN ('pending', 'confirmed', 'checked_in')
      AND (p_exclude_booking_id IS NULL OR id <> p_exclude_booking_id)
      AND blocked_range && tstzrange(p_from - INTERVAL '480 minutes',
                                     p_to   + INTERVAL '480 minutes', '[)');
$$;

COMMENT ON FUNCTION busy_ranges(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) IS
    'The provider''s committed time as one multirange. The status filter matches the predicate on prevent_double_booking exactly: if the two ever diverge, the picker offers slots the database then refuses, or hides slots that are free.';

-- --- get_available_slots ---------------------------------------------------

-- The implementation carries one parameter the public signature does not:
-- `p_exclude_booking_id`. A reschedule must not find the appointment it is
-- moving sitting in its own way — without this, dragging a 10:00 booking to
-- 10:15 is refused because 10:00–11:00 is busy, by itself. It is kept off the
-- public function because the portal has no business naming a booking id when
-- asking what is free.

CREATE FUNCTION available_slots_for(
    p_business_id        UUID,
    p_service_id         UUID,
    p_staff_id           UUID,
    p_date               DATE,
    p_exclude_booking_id UUID DEFAULT NULL
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
    -- The business must exist, be active, and have finished onboarding. The
    -- last condition is what keeps a half-configured clinic — no services, no
    -- hours — off the public portal (see public_businesses in 0014). Probing
    -- this function must not be a way around that gate.
    SELECT timezone, booking_rules
    INTO v_tz, v_rules
    FROM businesses
    WHERE id = p_business_id
      AND is_active
      AND onboarding_completed_at IS NOT NULL;

    IF v_tz IS NULL THEN
        RETURN;
    END IF;

    -- M-01: NULL here means this provider does not perform this service, so
    -- there is nothing to offer. Not an error: "Any Available" iterates
    -- providers and expects the ones who cannot do the job to contribute
    -- nothing.
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

    -- The provider must be active and inside this tenant. Checked explicitly
    -- rather than left to the availability lookup, because a deactivated
    -- provider may still have weekly rules on file.
    PERFORM 1 FROM staff_resources
    WHERE id = p_staff_id AND business_id = p_business_id AND is_active;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_interval    := greatest(booking_rule_int(v_rules, 'slot_interval_minutes', 15), 1);
    v_lead        := greatest(booking_rule_int(v_rules, 'min_lead_minutes', 60), 0);
    v_max_advance := greatest(booking_rule_int(v_rules, 'max_advance_days', 30), 0);

    -- M-02. "Today" is the tenant's today, not the server's: at 23:30 in Dhaka
    -- it is still yesterday in UTC, and a window measured from the wrong one
    -- is off by a day for half of every day.
    v_today := (NOW() AT TIME ZONE v_tz)::date;
    IF p_date < v_today OR p_date > v_today + v_max_advance THEN
        RETURN;
    END IF;

    v_work := working_windows(p_business_id, p_staff_id, p_date);
    IF isempty(v_work) THEN
        RETURN;
    END IF;

    v_busy := busy_ranges(p_business_id, p_staff_id,
                          lower(v_work), upper(v_work), p_exclude_booking_id);

    -- M-03. The spec's `v_cursor > NOW()` offers a slot sixty seconds out.
    v_earliest := NOW() + make_interval(mins => v_lead);

    FOR v_window IN SELECT unnest(v_work) LOOP
        -- Slots are anchored to the start of each working block, so a
        -- 10:00-13:00 morning and a 14:00-18:00 afternoon both start on the
        -- hour rather than the afternoon inheriting the morning's offset.
        v_cursor := lower(v_window);

        WHILE v_cursor + make_interval(mins => v_duration) <= upper(v_window) LOOP
            v_end := v_cursor + make_interval(mins => v_duration);

            IF v_cursor >= v_earliest
               -- The appointment must sit inside working hours. Its buffers
               -- need not: preparation before the first patient of the day is
               -- the provider's own time, and sterilisation after the last one
               -- does not require the clinic to stay open.
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

-- The public face: four arguments, nothing a stranger can use to ask about a
-- specific booking.

CREATE FUNCTION get_available_slots(
    p_business_id UUID,
    p_service_id  UUID,
    p_staff_id    UUID,
    p_date        DATE
)
RETURNS TABLE (slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ)
-- Definer rights, so that calling this as `anon` reaches the implementation.
-- EXECUTE is checked against the *current* role, and `anon` deliberately has
-- no grant on available_slots_for.
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT slot_start, slot_end
    FROM available_slots_for(p_business_id, p_service_id, p_staff_id, p_date, NULL);
$$;

COMMENT ON FUNCTION get_available_slots(UUID, UUID, UUID, DATE) IS
    'The authoritative availability answer. create_booking_atomic asks this rather than re-deriving working hours, so the picker and the gate cannot disagree.';

-- --- get_available_slots_any (defect B-14) ---------------------------------
--
-- Portal 1 Screen 2 offers "Any Available" and the spec provides no function
-- behind it: its RPC requires a staff id. This iterates only the providers
-- mapped to the service through `staff_services`, which is also what stops
-- "Any Available" meaning "anyone in the building".
--
-- Ordered so the caller can take the first row per slot and get a stable,
-- fair-ish assignment: by slot, then by the provider's own sort order.

CREATE FUNCTION get_available_slots_any(
    p_business_id UUID,
    p_service_id  UUID,
    p_date        DATE,
    p_branch_id   UUID DEFAULT NULL
)
RETURNS TABLE (slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ, staff_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT g.slot_start, g.slot_end, sr.id
    FROM staff_resources sr
    JOIN staff_services ss
      ON ss.staff_id = sr.id
     AND ss.service_id = p_service_id
    CROSS JOIN LATERAL get_available_slots(p_business_id, p_service_id, sr.id, p_date) g
    WHERE sr.business_id = p_business_id
      AND sr.is_active
      AND (p_branch_id IS NULL OR sr.branch_id = p_branch_id)
    ORDER BY g.slot_start, sr.sort_order, sr.id;
$$;

COMMENT ON FUNCTION get_available_slots_any(UUID, UUID, DATE, UUID) IS
    'Defect B-14: the "Any Available" option the public portal offers had no backend at all. Joins through staff_services so it cannot propose a provider who does not perform the service (M-01).';

-- --- Grants ----------------------------------------------------------------
--
-- The slot functions are public: a stranger with a booking link calls them
-- before they have any identity at all. The internal helpers are not — they
-- take a staff id and would answer questions about a provider's diary that the
-- portal has no business asking.

REVOKE EXECUTE ON FUNCTION
    booking_rule_int(JSONB, TEXT, INT),
    booking_rule_bool(JSONB, TEXT, BOOLEAN),
    resolved_duration_minutes(UUID, UUID),
    working_windows(UUID, UUID, DATE),
    busy_ranges(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID),
    available_slots_for(UUID, UUID, UUID, DATE, UUID),
    get_available_slots(UUID, UUID, UUID, DATE),
    get_available_slots_any(UUID, UUID, DATE, UUID)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    get_available_slots(UUID, UUID, UUID, DATE),
    get_available_slots_any(UUID, UUID, DATE, UUID)
    TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
    booking_rule_int(JSONB, TEXT, INT),
    booking_rule_bool(JSONB, TEXT, BOOLEAN),
    resolved_duration_minutes(UUID, UUID),
    working_windows(UUID, UUID, DATE),
    busy_ranges(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID),
    available_slots_for(UUID, UUID, UUID, DATE, UUID)
    TO authenticated, service_role;
