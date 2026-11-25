-- ---------------------------------------------------------------------------
-- 0026 — What roles may do, and what a plan allows
--
-- Phases 7 and 8 share a boundary, so they share a migration: both are about
-- refusing something server-side that the interface could only hide.
--
-- ## Defect M-14 — "request leave" had nothing to approve
--
-- The spec gives staff a leave request flow and `availability_overrides` no
-- state to hold it in, so a request either blocks the diary the instant it is
-- typed or does nothing at all. A `status` column makes the request a request:
-- only an approved one removes time from the calendar.
--
-- Existing rows become `approved`, because that is what they already meant.
--
-- ## Plan limits are enforced here, not in a button
--
-- `max_staff` and `max_branches` are triggers rather than checks in a form.
-- A limit that lives in the interface is a limit anyone with the API can walk
-- past, and this is the layer that decides whether the platform gets paid.
--
-- ## The receptionist boundary
--
-- Row-Level Security filters rows and never columns — the same fact behind
-- defect B-05. "A receptionist cannot read revenue" therefore cannot be a
-- policy; it is a function that checks the caller's role before answering.
-- Putting the figure behind `revenue_summary` rather than leaving it to a
-- SELECT the UI is trusted not to make is what makes it testable.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- --- M-14: leave becomes a request -----------------------------------------

ALTER TABLE availability_overrides
    ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    ADD COLUMN requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN decided_at TIMESTAMPTZ;

COMMENT ON COLUMN availability_overrides.status IS
    'Defect M-14. The spec let staff request leave and gave the request nowhere to live, so it either blocked the diary immediately or did nothing. Only `approved` removes time from the calendar. Existing rows default to approved because that is what they already meant.';

-- Only an approved closure actually shuts anything. Rebuilt rather than
-- patched, because the precedence rules in here are the ones every slot
-- depends on and they are easier to read whole.
CREATE OR REPLACE FUNCTION working_windows(p_business_id UUID, p_staff_id UUID, p_date DATE)
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

    SELECT is_closed, custom_start_time, custom_end_time
    INTO v_closed, v_ovr_start, v_ovr_end
    FROM availability_overrides
    WHERE business_id = p_business_id
      AND staff_id IS NULL
      AND override_date = p_date
      AND status = 'approved';

    IF FOUND THEN
        IF v_closed THEN
            RETURN '{}'::tstzmultirange;
        END IF;
        v_has_ovr := TRUE;
    ELSE
        SELECT is_closed, custom_start_time, custom_end_time
        INTO v_closed, v_ovr_start, v_ovr_end
        FROM availability_overrides
        WHERE business_id = p_business_id
          AND staff_id = p_staff_id
          AND override_date = p_date
          AND status = 'approved';

        IF FOUND THEN
            IF v_closed THEN
                RETURN '{}'::tstzmultirange;
            END IF;
            v_has_ovr := TRUE;
        END IF;
    END IF;

    IF v_has_ovr THEN
        v_work := multirange(tstzrange(
            (p_date + v_ovr_start) AT TIME ZONE v_tz,
            (p_date + v_ovr_end)   AT TIME ZONE v_tz,
            '[)'));
    ELSE
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

-- Staff may ask; only an admin may decide. The WITH CHECK is what stops a
-- provider approving their own request by updating the row they just created.
GRANT INSERT (business_id, staff_id, override_date, is_closed, reason, status, requested_by)
    ON availability_overrides TO authenticated;

CREATE POLICY "Providers request their own leave"
    ON availability_overrides FOR INSERT
    WITH CHECK (is_business_member(business_id)
                AND status = 'pending'
                AND staff_id = current_staff_id(business_id));

-- --- Plan limits -----------------------------------------------------------

ALTER TABLE businesses
    ADD COLUMN plan_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN businesses.plan_expires_at IS
    'NULL means no expiry, which is what Free means. A paid plan past this date is downgraded by expire_subscriptions, not blocked mid-request — a tenant discovering their plan lapsed in the middle of taking a booking is a worse outcome than a day of grace.';

CREATE FUNCTION plan_limit(p_business_id UUID, p_key TEXT)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE p_key
        WHEN 'max_branches'         THEN sp.max_branches
        WHEN 'max_staff'            THEN sp.max_staff
        WHEN 'max_monthly_bookings' THEN sp.max_monthly_bookings
        ELSE NULL
    END
    FROM businesses b
    JOIN subscription_plans sp ON sp.id = b.plan_id
    WHERE b.id = p_business_id;
$$;

CREATE FUNCTION plan_feature(p_business_id UUID, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce((sp.features ->> p_key)::boolean, FALSE)
    FROM businesses b
    JOIN subscription_plans sp ON sp.id = b.plan_id
    WHERE b.id = p_business_id;
$$;

/**
 * Refuse the row that would cross the line.
 *
 * A trigger rather than a check in the form, because a limit enforced in the
 * interface is a limit anyone with the API walks past — and this is the layer
 * that decides whether the platform gets paid. Inactive rows do not count: a
 * suspended staff member is exactly what a lapsed plan should leave behind.
 */
CREATE FUNCTION enforce_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_limit INT;
    v_count INT;
    v_key   TEXT := TG_ARGV[0];
BEGIN
    v_limit := plan_limit(NEW.business_id, v_key);
    IF v_limit IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_key = 'max_staff' THEN
        SELECT count(*) INTO v_count FROM staff_resources
        WHERE business_id = NEW.business_id AND is_active;
    ELSE
        SELECT count(*) INTO v_count FROM branches
        WHERE business_id = NEW.business_id AND is_active;
    END IF;

    IF v_count > v_limit THEN
        RAISE EXCEPTION USING
            ERRCODE = 'BK001',
            MESSAGE = 'PLAN_LIMIT_REACHED',
            DETAIL  = format('This plan allows %s. Upgrade to add more.', v_limit);
    END IF;

    RETURN NEW;
END;
$$;

-- AFTER, so the count includes the row being added and the comparison is
-- "would this take us over" rather than "are we already over".
CREATE CONSTRAINT TRIGGER staff_within_plan
    AFTER INSERT OR UPDATE OF is_active ON staff_resources
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW WHEN (NEW.is_active)
    EXECUTE FUNCTION enforce_plan_limit('max_staff');

CREATE CONSTRAINT TRIGGER branches_within_plan
    AFTER INSERT OR UPDATE OF is_active ON branches
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW WHEN (NEW.is_active)
    EXECUTE FUNCTION enforce_plan_limit('max_branches');

/** What the dashboard meter reads. */
CREATE VIEW plan_usage
WITH (security_invoker = true)
AS
SELECT b.id AS business_id,
       sp.code AS plan_code,
       sp.name AS plan_name,
       b.plan_expires_at,
       sp.max_staff,
       (SELECT count(*) FROM staff_resources s
        WHERE s.business_id = b.id AND s.is_active) AS staff_used,
       sp.max_branches,
       (SELECT count(*) FROM branches br
        WHERE br.business_id = b.id AND br.is_active) AS branches_used,
       sp.max_monthly_bookings,
       (SELECT count(*) FROM bookings bk
        WHERE bk.business_id = b.id
          AND bk.status <> 'cancelled'
          AND (bk.created_at AT TIME ZONE b.timezone)::date
              >= date_trunc('month', (NOW() AT TIME ZONE b.timezone))::date) AS bookings_this_month,
       sp.features
FROM businesses b
JOIN subscription_plans sp ON sp.id = b.plan_id;

COMMENT ON VIEW plan_usage IS
    'security_invoker, so the RLS on businesses decides who sees which row. A definer view here would publish every tenant''s usage to anyone who could name an id.';

GRANT SELECT ON plan_usage TO authenticated;

/**
 * Downgrade what has lapsed.
 *
 * Suspends over-limit staff rather than deleting them: the spec does not say
 * what happens to staff 11–15 when a Pro plan ends, and deleting a provider
 * takes their appointment history with them. Deactivated is reversible by
 * paying.
 */
CREATE FUNCTION expire_subscriptions(p_grace_days INT DEFAULT 3)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_free  UUID;
    v_count INT := 0;
    v_biz   RECORD;
BEGIN
    SELECT id INTO v_free FROM subscription_plans WHERE code = 'free';
    IF v_free IS NULL THEN
        RETURN 0;
    END IF;

    FOR v_biz IN
        SELECT b.id, plan_limit(b.id, 'max_staff') AS old_limit
        FROM businesses b
        WHERE b.plan_expires_at IS NOT NULL
          AND b.plan_expires_at < NOW() - make_interval(days => greatest(coalesce(p_grace_days, 3), 0))
          AND b.plan_id <> v_free
    LOOP
        UPDATE businesses
        SET plan_id = v_free, plan_expires_at = NULL, updated_at = NOW()
        WHERE id = v_biz.id;

        -- Suspend the newest first: the people hired under the bigger plan are
        -- the ones it was bought for.
        UPDATE staff_resources
        SET is_active = FALSE, updated_at = NOW()
        WHERE id IN (
            SELECT id FROM staff_resources
            WHERE business_id = v_biz.id AND is_active
            ORDER BY created_at DESC
            OFFSET (SELECT max_staff FROM subscription_plans WHERE id = v_free)
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- --- Deposits --------------------------------------------------------------

-- Somebody will reuse a transaction id, by mistake or otherwise. A constraint
-- catches it; a check in the UI catches only the honest case.
CREATE UNIQUE INDEX payments_txn_unique_per_business
    ON payments (business_id, provider_txn_id)
    WHERE provider_txn_id IS NOT NULL;

/**
 * Release deposit bookings nobody paid for.
 *
 * A `pending` booking holds its slot — the exclusion constraint includes
 * `pending` deliberately — so an unverified deposit would otherwise keep a
 * slot out of circulation forever. Cancelling frees it and silences whatever
 * was queued.
 */
CREATE FUNCTION sweep_unverified_deposits(p_hours INT DEFAULT 2)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id    UUID;
    v_count INT := 0;
BEGIN
    FOR v_id IN
        SELECT bk.id
        FROM bookings bk
        WHERE bk.status = 'pending'
          AND bk.payment_status = 'unpaid'
          AND bk.created_at < NOW() - make_interval(hours => greatest(coalesce(p_hours, 2), 1))
          AND EXISTS (SELECT 1 FROM payments p
                      WHERE p.booking_id = bk.id AND p.status = 'claimed')
    LOOP
        UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = v_id;

        INSERT INTO booking_history
            (business_id, booking_id, action, old_status, new_status, actor_type, reason)
        SELECT business_id, id, 'cancelled', 'pending', 'cancelled', 'system',
               'Deposit not verified within the window.'
        FROM bookings WHERE id = v_id;

        PERFORM queue_booking_notifications(v_id);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- --- The receptionist boundary ---------------------------------------------

/**
 * Revenue, for the people allowed to see it.
 *
 * Row-Level Security filters rows and never columns, so "a receptionist
 * cannot read revenue" cannot be a policy. It is a role test inside a
 * function, which is also what makes it assertable in the permission matrix
 * rather than a promise about what the UI queries.
 */
CREATE FUNCTION revenue_summary(p_business_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (bookings BIGINT, collected NUMERIC, outstanding NUMERIC)
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
            DETAIL  = 'Only an owner or manager can see revenue.';
    END IF;

    SELECT timezone INTO v_tz FROM businesses WHERE id = p_business_id;

    RETURN QUERY
    SELECT count(*)::bigint,
           coalesce(sum(bk.paid_amount), 0),
           coalesce(sum(bk.total_price - bk.paid_amount), 0)
    FROM bookings bk
    WHERE bk.business_id = p_business_id
      AND bk.status = 'completed'
      AND (bk.start_time AT TIME ZONE v_tz)::date BETWEEN p_from AND p_to;
END;
$$;

-- --- Grants ----------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION
    plan_limit(UUID, TEXT),
    plan_feature(UUID, TEXT),
    enforce_plan_limit(),
    expire_subscriptions(INT),
    sweep_unverified_deposits(INT),
    revenue_summary(UUID, DATE, DATE)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    plan_limit(UUID, TEXT),
    plan_feature(UUID, TEXT),
    revenue_summary(UUID, DATE, DATE)
    TO authenticated, service_role;

-- Scheduled work only. A tenant must not be able to expire their own
-- subscription, and nobody should be able to sweep another tenant's slots.
GRANT EXECUTE ON FUNCTION
    expire_subscriptions(INT),
    sweep_unverified_deposits(INT)
    TO service_role;
