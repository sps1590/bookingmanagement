-- ---------------------------------------------------------------------------
-- 0021 — What the public portal needs that the schema did not have
--
-- Two things, both of which the spec assumes and neither of which it provides.
--
-- ## Defect M-13 — the date picker has nothing to grey out closed days with
--
-- Portal 1 Screen 2 shows a month calendar. The only availability endpoint in
-- the spec answers for a single date, so the calendar either makes thirty
-- round trips or invites clicks on days the clinic is shut. Both are bad in
-- the same direction: the customer picks a day, waits, and is told no.
--
-- `get_month_availability` answers for a whole month in one call. It is
-- deliberately exact rather than cheap — it asks the real slot generator per
-- day rather than just checking whether the provider works that weekday — so
-- a day that is fully booked is reported closed, which is what the customer
-- actually experiences. The cost is bounded: for an open day the generator
-- stops at the first free slot.
--
-- ## Rate limiting (carried over from Phase 2 §4.2)
--
-- `create_booking_atomic` has an abuse cap per customer, but that only binds
-- once a customer record exists. Nothing stops a script posting a thousand
-- bookings under a thousand invented phone numbers, and the public portal
-- publishes the business id needed to try.
--
-- This lives in Postgres rather than in Redis or Vercel KV because the whole
-- stack is the free tier (docs/FREE_STACK.md): there is no durable key-value
-- store in it, and a limiter held in a serverless function's memory resets on
-- every cold start, which is to say it does not exist. A table is unglamorous
-- and survives deploys.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- --- Month availability (M-13) ---------------------------------------------

-- `p_staff_id` is last and defaulted because NULL is a real answer here —
-- it means the portal's "Any Available". A parameter that is genuinely
-- optional should be optional in the signature, which is also what makes it
-- optional in the generated TypeScript rather than something every call site
-- has to pass a null into.
CREATE FUNCTION get_month_availability(
    p_business_id UUID,
    p_service_id  UUID,
    p_year        INT,
    p_month       INT,
    p_staff_id    UUID DEFAULT NULL
)
RETURNS TABLE (day DATE, has_slots BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_tz    TEXT;
    v_first DATE;
    v_last  DATE;
    v_d     DATE;
BEGIN
    IF p_month < 1 OR p_month > 12 OR p_year < 2000 OR p_year > 2100 THEN
        RETURN;
    END IF;

    -- Same gate as get_available_slots: an unpublished tenant answers nothing,
    -- so this is not a way to discover that a business exists here.
    SELECT b.timezone INTO v_tz
    FROM businesses b
    WHERE b.id = p_business_id
      AND b.is_active
      AND b.onboarding_completed_at IS NOT NULL;

    IF v_tz IS NULL THEN
        RETURN;
    END IF;

    v_first := make_date(p_year, p_month, 1);
    v_last  := (v_first + INTERVAL '1 month - 1 day')::date;

    v_d := v_first;
    WHILE v_d <= v_last LOOP
        day := v_d;

        IF p_staff_id IS NULL THEN
            has_slots := EXISTS (
                SELECT 1 FROM get_available_slots_any(p_business_id, p_service_id, v_d, NULL)
            );
        ELSE
            has_slots := EXISTS (
                SELECT 1 FROM available_slots_for(p_business_id, p_service_id, p_staff_id, v_d, NULL)
            );
        END IF;

        RETURN NEXT;
        v_d := v_d + 1;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION get_month_availability(UUID, UUID, INT, INT, UUID) IS
    'Defect M-13: the spec''s calendar had no way to know which days are closed, so it invited clicks on holidays. Reports a fully booked day as unavailable too, because that is what the customer finds when they click it.';

-- --- Rate limiting ---------------------------------------------------------

CREATE TABLE rate_limit_hits (
    bucket       TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    hits         INT         NOT NULL DEFAULT 0 CHECK (hits >= 0),
    PRIMARY KEY (bucket, window_start)
);

COMMENT ON TABLE rate_limit_hits IS
    'Fixed-window counters for the public API. A bucket is a scope and a subject, e.g. "book:ip:203.0.113.4" or "book:phone:+8801711000001". Holds no personal data beyond what the key itself carries, and rows are pruned as they expire.';

-- Not exposed through PostgREST, and no policy: every read and write goes
-- through the function below, which is SECURITY DEFINER. RLS is enabled so
-- that a future grant cannot accidentally open it.
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE INDEX rate_limit_hits_window ON rate_limit_hits (window_start);

/**
 * Consume one unit from a fixed window. Returns TRUE when the caller is within
 * its allowance.
 *
 * A fixed window rather than a sliding one or a token bucket: it is one row,
 * one upsert, and no background job, and its known weakness — twice the limit
 * across a window boundary — does not matter for what this guards. The point
 * is to stop a script making thousands of bookings, not to meter an API.
 */
CREATE FUNCTION check_rate_limit(
    p_bucket         TEXT,
    p_limit          INT,
    p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_window TIMESTAMPTZ;
    v_hits   INT;
BEGIN
    IF p_bucket IS NULL OR p_limit <= 0 OR p_window_seconds <= 0 THEN
        RETURN TRUE;
    END IF;

    v_window := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds)
                             * p_window_seconds);

    -- The increment and the read are one statement, so two concurrent requests
    -- cannot both see the count below the limit. Doing it as SELECT-then-
    -- UPDATE is the classic way to build a limiter that does not limit.
    INSERT INTO rate_limit_hits (bucket, window_start, hits)
    VALUES (p_bucket, v_window, 1)
    ON CONFLICT (bucket, window_start)
    DO UPDATE SET hits = rate_limit_hits.hits + 1
    RETURNING hits INTO v_hits;

    -- Opportunistic pruning, roughly one call in fifty, so the table does not
    -- grow without bound on a stack that has no cron worth spending. Cheap
    -- enough to be invisible and frequent enough to keep up.
    IF random() < 0.02 THEN
        DELETE FROM rate_limit_hits
        WHERE window_start < clock_timestamp() - INTERVAL '1 day';
    END IF;

    RETURN v_hits <= p_limit;
END;
$$;

COMMENT ON FUNCTION check_rate_limit(TEXT, INT, INT) IS
    'Consumes one unit and says whether the caller is within allowance. Increment and read are a single statement: a limiter that reads then writes does not limit under the concurrency it exists to survive.';

-- --- Grants ----------------------------------------------------------------
--
-- `get_month_availability` is public for the same reason `get_available_slots`
-- is: the calendar renders before anyone has an identity.
--
-- `check_rate_limit` is not. It is called from route handlers on the server,
-- which hold the service key; letting the browser call it would let a client
-- spend its own allowance harmlessly, or spend someone else's deliberately.

REVOKE EXECUTE ON FUNCTION
    get_month_availability(UUID, UUID, INT, INT, UUID),
    check_rate_limit(TEXT, INT, INT)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_month_availability(UUID, UUID, INT, INT, UUID)
    TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INT, INT)
    TO service_role;
