-- ---------------------------------------------------------------------------
-- 0009 — Notification templates and the delivery queue
--
-- `notification_logs` is both the queue and the log: a row is created when a
-- message becomes due, claimed by the worker, and then kept as the record of
-- what was sent. Phase 5 builds the worker.
--
-- ## Channels
--
-- The spec's channel list is ('sms', 'whatsapp', 'email') for templates and
-- adds 'push' for logs. Two of those are gone (docs/DECISIONS.md D-009):
-- SMS has no free tier in Bangladesh, and WhatsApp's Cloud API bills
-- business-initiated conversations, which is exactly what a reminder is. What
-- is left is genuinely free:
--
--   email     Resend 3,000/month — shared across ALL tenants, not per tenant
--   push      VAPID web push; no account, no provider, no ceiling
--   telegram  Bot API; unlimited, used for staff and owner digests
--   calendar  the .ics invite; the customer's own calendar app does the
--             reminding, which is the only channel that reaches someone who
--             gave nothing but a phone number
--
-- Re-adding SMS later is one adapter in lib/notify/ plus one line here:
--   ALTER TABLE ... DROP CONSTRAINT ... ; ADD CONSTRAINT ... CHECK (channel IN (..., 'sms'));
-- It is left out rather than stubbed in because a value no code can produce
-- invites dead branches that are never exercised.
--
-- ## Defect B-16 — the worker double-sends
--
-- The spec's worker selects queued rows and sends them, with no claim step. Two
-- overlapping cron ticks therefore both pick up the same row and the customer
-- gets the reminder twice. The columns that fix it are added here so the Phase
-- 5 worker can claim with `FOR UPDATE SKIP LOCKED`:
--
--   status 'sending'  a row in flight, invisible to the next tick
--   attempts          with max_attempts, bounds the retry loop
--   locked_at         lets a reaper return rows abandoned by a crashed worker
--   last_error        why it failed, without reading provider logs
--
-- `status 'skipped'` is for a message the platform chose not to send — almost
-- always because the shared monthly email allowance is spent. That is a
-- deliberate, recorded decision, not a failure, and it must not look like one
-- on a dashboard.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE TABLE notification_templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL
                      CHECK (event_type IN ('booking_confirmed', 'booking_pending',
                                            'reminder_24h', 'reminder_1h',
                                            'rescheduled', 'cancelled',
                                            'waitlist_slot_open', 'daily_summary',
                                            'payment_verified', 'payment_rejected')),
    channel       TEXT NOT NULL CHECK (channel IN ('email', 'push', 'telegram', 'calendar')),
    subject       TEXT,
    body_template TEXT NOT NULL CHECK (length(trim(body_template)) > 0),
    is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, event_type, channel)
);

COMMENT ON COLUMN notification_templates.body_template IS
    'Placeholders: {{customer_name}}, {{business_name}}, {{service_name}}, {{staff_name}}, {{booking_code}}, {{date}}, {{time}}, {{manage_url}}. Rendered in the tenant''s timezone and terminology — never with a hardcoded label or a literal Asia/Dhaka (defects B-20 and the terminology layer).';

CREATE TABLE notification_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    booking_id          UUID,
    recipient_type      TEXT NOT NULL
                            CHECK (recipient_type IN ('customer', 'staff', 'business_owner')),
    -- An email address, a push endpoint id, or a Telegram chat id.
    recipient_contact   TEXT NOT NULL,
    channel             TEXT NOT NULL
                            CHECK (channel IN ('email', 'push', 'telegram', 'calendar')),
    event_type          TEXT NOT NULL,
    subject             TEXT,
    message_body        TEXT NOT NULL,
    scheduled_at        TIMESTAMPTZ NOT NULL,
    sent_at             TIMESTAMPTZ,

    status              TEXT NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued', 'sending', 'sent',
                                              'failed', 'cancelled', 'skipped')),
    attempts            INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts        INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    locked_at           TIMESTAMPTZ,
    last_error          TEXT,

    provider            TEXT,
    provider_message_id TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT notification_logs_sent_has_timestamp
        CHECK (status <> 'sent' OR sent_at IS NOT NULL),
    CONSTRAINT notification_logs_sending_is_locked
        CHECK (status <> 'sending' OR locked_at IS NOT NULL),
    CONSTRAINT notification_logs_booking_same_business
        FOREIGN KEY (business_id, booking_id) REFERENCES bookings (business_id, id)
        ON DELETE CASCADE
);

COMMENT ON TABLE notification_logs IS
    'Queue and delivery log in one table. Contains customer contact details, so no anon grant and no platform-admin read path (docs/DECISIONS.md D-012). Retention matters: this is the table most likely to exhaust the 500 MB free-tier ceiling, and the pruning job is part of Phase 5.';
COMMENT ON COLUMN notification_logs.status IS
    '''sending'' is the claimed state that makes FOR UPDATE SKIP LOCKED safe (defect B-16). ''skipped'' means the platform deliberately did not send — normally the shared email allowance was exhausted — and must not be reported as a failure.';
COMMENT ON COLUMN notification_logs.locked_at IS
    'Set when a worker claims the row. A reaper returns rows stuck in ''sending'' for more than ten minutes to ''queued'' — see docs/RUNBOOK.md.';

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs      ENABLE ROW LEVEL SECURITY;
