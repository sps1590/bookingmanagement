-- ---------------------------------------------------------------------------
-- 0024 — The notification queue, safely
--
-- ## Defect B-16 — the spec's worker double-sends
--
-- Its claim is `SELECT ... WHERE status='queued' AND scheduled_at <= NOW()
-- LIMIT 50`, then send, then mark sent. Two runs that overlap — and they will,
-- because a run that takes longer than the tick is normal under load — both
-- select the same fifty rows and both send them. "Your appointment is
-- tomorrow", twice, is the complaint that loses a tenant.
--
-- The fix is to claim and mark in one statement, with FOR UPDATE SKIP LOCKED
-- so a second worker steps over rows the first already holds.
--
-- ## Retention, built now rather than when the database fills
--
-- `notification_logs` grows a row per message per recipient forever, against a
-- 500 MB free-tier database. The prune keeps ninety days of detail and rolls
-- the rest into daily counts, so "how many did we send in March" survives the
-- deletion. Adding this later means adding it in an emergency.
--
-- ## The email ceiling is real and platform-wide
--
-- Resend's free tier is 3,000 messages a month across every tenant, not per
-- tenant. A cap that is not counted centrally is not a cap, so the counter is
-- one row per month for the whole platform and the worker reads it before
-- sending. Degrading to "skipped" is deliberate: a skipped message is a
-- missing reminder, a failed one is a retry storm against a provider that is
-- already refusing.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- --- Live updates ----------------------------------------------------------
--
-- Supabase Realtime streams changes from a publication. Row-Level Security
-- still applies to what each subscriber receives, so adding `bookings` here
-- does not widen who can see what — it only lets the dashboard hear about the
-- rows it could already read.
--
-- Guarded because the publication is part of the Supabase stack and does not
-- exist in the plain Postgres CI builds the schema against.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
        ) THEN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings';
        END IF;
    END IF;
END
$$;

-- --- Web push subscriptions ------------------------------------------------
--
-- The only channel with no ceiling and no account: VAPID keys are generated
-- once and belong to this deployment. A subscription is a browser, not a
-- person, so one customer may have several and each dies independently — a
-- 410 from the push service means delete this row, not retry it.

CREATE TABLE push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    -- Exactly one of these. A staff subscription belongs to a login; a
    -- customer subscription belongs to a customer record.
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id UUID,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    CONSTRAINT push_subscriptions_one_owner
        CHECK ((user_id IS NOT NULL) <> (customer_id IS NOT NULL)),
    CONSTRAINT push_subscriptions_customer_same_business
        FOREIGN KEY (business_id, customer_id) REFERENCES customers (business_id, id)
        ON DELETE CASCADE
);

CREATE INDEX push_subscriptions_customer ON push_subscriptions (business_id, customer_id);
CREATE INDEX push_subscriptions_user ON push_subscriptions (business_id, user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Members may see which devices are subscribed for their own tenant; nobody
-- else touches this table, because an endpoint plus its keys *is* the
-- credential needed to push to that browser.
GRANT SELECT ON push_subscriptions TO authenticated;

CREATE POLICY "Members see their tenant's push subscriptions"
    ON push_subscriptions FOR SELECT
    USING (is_business_member(business_id));

-- --- The platform-wide email allowance -------------------------------------

CREATE TABLE platform_email_usage (
    month      DATE NOT NULL PRIMARY KEY,
    sent       INT  NOT NULL DEFAULT 0 CHECK (sent >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE platform_email_usage IS
    'One row per calendar month for the whole platform, because the free Resend allowance is platform-wide rather than per tenant. A per-tenant counter would let ten tenants each stay under a limit that the platform has already blown.';

ALTER TABLE platform_email_usage ENABLE ROW LEVEL SECURITY;

-- --- Rolled-up history, so the prune does not lose the totals --------------

CREATE TABLE notification_daily_stats (
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    day         DATE NOT NULL,
    channel     TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    status      TEXT NOT NULL,
    count       INT  NOT NULL DEFAULT 0 CHECK (count >= 0),
    PRIMARY KEY (business_id, day, channel, event_type, status)
);

ALTER TABLE notification_daily_stats ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON notification_daily_stats TO authenticated;

CREATE POLICY "Members read their own delivery history"
    ON notification_daily_stats FOR SELECT
    USING (has_role(business_id, ARRAY['owner', 'manager']));

-- --- Claiming work (defect B-16) -------------------------------------------

/**
 * Claim up to `p_limit` due messages, atomically.
 *
 * The UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) shape is the whole
 * point: the row is marked `sending` in the same statement that selects it, so
 * a second worker arriving mid-run sees it already claimed and skips past
 * rather than sending it again.
 *
 * `attempts` is incremented on claim, not on failure. A worker that dies
 * mid-send has still used an attempt, and counting only explicit failures is
 * how a poisonous message retries forever.
 */
CREATE FUNCTION claim_notifications(p_limit INT DEFAULT 25)
RETURNS TABLE (
    id                UUID,
    business_id       UUID,
    booking_id        UUID,
    recipient_type    TEXT,
    recipient_contact TEXT,
    channel           TEXT,
    event_type        TEXT,
    subject           TEXT,
    message_body      TEXT,
    attempts          INT,
    max_attempts      INT
)
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
    UPDATE notification_logs n
    SET status = 'sending', locked_at = NOW(), attempts = n.attempts + 1, updated_at = NOW()
    FROM (
        SELECT q.id
        FROM notification_logs q
        WHERE q.status = 'queued'
          AND q.scheduled_at <= NOW()
        ORDER BY q.scheduled_at
        LIMIT greatest(coalesce(p_limit, 25), 1)
        FOR UPDATE SKIP LOCKED
    ) due
    WHERE n.id = due.id
    RETURNING n.id, n.business_id, n.booking_id, n.recipient_type, n.recipient_contact,
              n.channel, n.event_type, n.subject, n.message_body, n.attempts, n.max_attempts;
$$;

/**
 * Record the outcome of one send.
 *
 * Backoff is 1m, 5m, 30m, 2h by attempt. A provider outage is usually minutes,
 * and four attempts over roughly two and a half hours is long enough to ride
 * one out while still giving up before a 24-hour reminder becomes a reminder
 * about yesterday.
 */
CREATE FUNCTION complete_notification(
    p_id          UUID,
    p_ok          BOOLEAN,
    p_provider    TEXT DEFAULT NULL,
    p_provider_id TEXT DEFAULT NULL,
    p_error       TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_attempts INT;
    v_max      INT;
    v_status   TEXT;
BEGIN
    SELECT n.attempts, n.max_attempts INTO v_attempts, v_max
    FROM notification_logs n WHERE n.id = p_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF p_ok THEN
        UPDATE notification_logs
        SET status = 'sent', sent_at = NOW(), locked_at = NULL,
            provider = p_provider, provider_message_id = p_provider_id,
            last_error = NULL, updated_at = NOW()
        WHERE id = p_id;
        RETURN 'sent';
    END IF;

    IF v_attempts >= v_max THEN
        UPDATE notification_logs
        SET status = 'failed', locked_at = NULL, last_error = left(coalesce(p_error, ''), 1000),
            provider = p_provider, updated_at = NOW()
        WHERE id = p_id;
        RETURN 'failed';
    END IF;

    v_status := 'queued';
    UPDATE notification_logs
    SET status = 'queued',
        locked_at = NULL,
        last_error = left(coalesce(p_error, ''), 1000),
        provider = p_provider,
        scheduled_at = NOW() + CASE v_attempts
            WHEN 1 THEN INTERVAL '1 minute'
            WHEN 2 THEN INTERVAL '5 minutes'
            WHEN 3 THEN INTERVAL '30 minutes'
            ELSE INTERVAL '2 hours'
        END,
        updated_at = NOW()
    WHERE id = p_id;

    RETURN v_status;
END;
$$;

/**
 * Mark a message as deliberately not sent.
 *
 * Used when the platform's shared email allowance is spent. `skipped` is a
 * distinct state from `failed` on purpose: failing would retry against a
 * provider that is going to keep refusing, and would be reported to the tenant
 * as a fault rather than as a limit.
 */
CREATE FUNCTION skip_notification(p_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
    UPDATE notification_logs
    SET status = 'skipped', locked_at = NULL,
        last_error = left(coalesce(p_reason, ''), 1000), updated_at = NOW()
    WHERE id = p_id;
$$;

/**
 * Return rows abandoned mid-send.
 *
 * A worker killed between claiming and completing leaves `sending` forever.
 * Ten minutes is comfortably longer than any send and short enough that the
 * message is still worth delivering.
 */
CREATE FUNCTION reap_stuck_notifications()
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE notification_logs
    SET status = 'queued', locked_at = NULL, updated_at = NOW()
    WHERE status = 'sending'
      AND locked_at < NOW() - INTERVAL '10 minutes';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

/** Consume one unit of the platform's shared monthly email allowance. */
CREATE FUNCTION claim_email_allowance(p_limit INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_month DATE := date_trunc('month', NOW())::date;
    v_sent  INT;
BEGIN
    IF p_limit <= 0 THEN
        RETURN TRUE;
    END IF;

    INSERT INTO platform_email_usage (month, sent)
    VALUES (v_month, 1)
    ON CONFLICT (month) DO UPDATE SET sent = platform_email_usage.sent + 1, updated_at = NOW()
    RETURNING sent INTO v_sent;

    RETURN v_sent <= p_limit;
END;
$$;

/**
 * Prune detail, keep the counts.
 *
 * Rolls everything older than `p_days` into `notification_daily_stats` before
 * deleting it, so "how many reminders went out in March" outlives the rows.
 */
CREATE FUNCTION prune_notification_logs(p_days INT DEFAULT 90)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ := NOW() - make_interval(days => greatest(coalesce(p_days, 90), 1));
    v_count  INT;
BEGIN
    INSERT INTO notification_daily_stats (business_id, day, channel, event_type, status, count)
    SELECT business_id, created_at::date, channel, event_type, status, count(*)
    FROM notification_logs
    WHERE created_at < v_cutoff
      AND status IN ('sent', 'failed', 'skipped', 'cancelled')
    GROUP BY business_id, created_at::date, channel, event_type, status
    ON CONFLICT (business_id, day, channel, event_type, status)
    DO UPDATE SET count = notification_daily_stats.count + EXCLUDED.count;

    DELETE FROM notification_logs
    WHERE created_at < v_cutoff
      AND status IN ('sent', 'failed', 'skipped', 'cancelled');

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- --- Grants ----------------------------------------------------------------
--
-- All of these belong to the worker, which runs on the server with the service
-- key. None of them is anything a browser should be able to call: claiming
-- notifications from a client would let anyone drain another tenant's queue
-- into a state nothing will send.

REVOKE EXECUTE ON FUNCTION
    claim_notifications(INT),
    complete_notification(UUID, BOOLEAN, TEXT, TEXT, TEXT),
    skip_notification(UUID, TEXT),
    reap_stuck_notifications(),
    claim_email_allowance(INT),
    prune_notification_logs(INT)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    claim_notifications(INT),
    complete_notification(UUID, BOOLEAN, TEXT, TEXT, TEXT),
    skip_notification(UUID, TEXT),
    reap_stuck_notifications(),
    claim_email_allowance(INT),
    prune_notification_logs(INT)
    TO service_role;
