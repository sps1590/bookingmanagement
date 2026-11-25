-- ---------------------------------------------------------------------------
-- The notification queue — defect B-16
--
-- The spec's worker selects due rows, sends them, then marks them sent. Two
-- runs that overlap — which happens the moment a run takes longer than the
-- tick — both select the same rows and both send. "Your appointment is
-- tomorrow", twice, is the complaint that loses a tenant.
--
-- The test that matters is the first one: claiming must be the same statement
-- as selecting.
-- ---------------------------------------------------------------------------

-- Three messages due now for the fixture's booking.
INSERT INTO notification_logs
    (business_id, booking_id, recipient_type, recipient_contact, channel,
     event_type, subject, message_body, scheduled_at)
SELECT 'aaaa0000-0000-4000-8000-000000000001',
       'aaaa00d1-0000-4000-8000-000000000001',
       'customer', 'nusrat@example.com', 'email',
       'reminder_1h', 'Soon', 'Body ' || g, NOW() - INTERVAL '1 minute'
FROM generate_series(1, 3) g;

-- 1. A second claim cannot see what the first one took.
DO $$
DECLARE
    v_first  INT;
    v_second INT;
    v_overlap INT;
BEGIN
    CREATE TEMP TABLE run_one AS
    SELECT id FROM claim_notifications(2);

    CREATE TEMP TABLE run_two AS
    SELECT id FROM claim_notifications(5);

    SELECT count(*) INTO v_first FROM run_one;
    SELECT count(*) INTO v_second FROM run_two;
    SELECT count(*) INTO v_overlap
    FROM run_one JOIN run_two USING (id);

    IF v_first <> 2 THEN
        RAISE EXCEPTION 'The first claim took % rows, expected 2', v_first;
    END IF;

    IF v_overlap <> 0 THEN
        RAISE EXCEPTION
            '% message(s) were claimed by both runs and would be sent twice (defect B-16)',
            v_overlap;
    END IF;

    -- The fixture adds one more due row of its own, so the second run picks up
    -- whatever is left rather than a fixed number.
    IF v_second = 0 THEN
        RAISE EXCEPTION 'The second claim found nothing, so the first took rows it should not have';
    END IF;
END
$$;

-- 2. Claiming marks the row and spends an attempt. Counting only explicit
--    failures is how a message that kills the worker retries forever.
DO $$
DECLARE
    v_status TEXT;
    v_attempts INT;
BEGIN
    SELECT status, attempts INTO v_status, v_attempts
    FROM notification_logs WHERE id = (SELECT id FROM run_one LIMIT 1);

    IF v_status <> 'sending' OR v_attempts <> 1 THEN
        RAISE EXCEPTION
            'A claimed row is status=% attempts=%, expected sending/1', v_status, v_attempts;
    END IF;
END
$$;

-- 3. Success is terminal and records who sent it.
DO $$
DECLARE
    v_id     UUID := (SELECT id FROM run_one LIMIT 1);
    v_result TEXT;
    v_row    RECORD;
BEGIN
    v_result := complete_notification(v_id, TRUE, 'resend', 'abc123', NULL);

    SELECT status, sent_at, provider, provider_message_id, locked_at
    INTO v_row FROM notification_logs WHERE id = v_id;

    IF v_result <> 'sent' OR v_row.status <> 'sent' OR v_row.sent_at IS NULL THEN
        RAISE EXCEPTION 'A successful send did not settle as sent (%).', v_row.status;
    END IF;

    IF v_row.locked_at IS NOT NULL THEN
        RAISE EXCEPTION 'A settled row is still holding its lock';
    END IF;
END
$$;

-- 4. A failure goes back to the queue, later than it was. Retrying at the same
--    instant against a provider that just refused is a retry storm.
DO $$
DECLARE
    v_id   UUID := (SELECT id FROM run_one OFFSET 1 LIMIT 1);
    v_when TIMESTAMPTZ;
    v_status TEXT;
BEGIN
    PERFORM complete_notification(v_id, FALSE, 'resend', NULL, 'HTTP 503');

    SELECT status, scheduled_at INTO v_status, v_when
    FROM notification_logs WHERE id = v_id;

    IF v_status <> 'queued' THEN
        RAISE EXCEPTION 'A first failure settled as "%" instead of returning to the queue', v_status;
    END IF;

    IF v_when <= NOW() THEN
        RAISE EXCEPTION 'A failed message was rescheduled for now or earlier, so it will spin';
    END IF;
END
$$;

-- 5. After max_attempts it stops. Four tries over roughly two and a half hours
--    is long enough to ride out an outage and short enough that a 24-hour
--    reminder is not delivered about yesterday.
DO $$
DECLARE
    v_id     UUID := (SELECT id FROM run_one OFFSET 1 LIMIT 1);
    v_status TEXT;
BEGIN
    UPDATE notification_logs SET attempts = max_attempts WHERE id = v_id;
    v_status := complete_notification(v_id, FALSE, 'resend', NULL, 'HTTP 503');

    IF v_status <> 'failed' THEN
        RAISE EXCEPTION 'A message past max_attempts settled as "%"', v_status;
    END IF;
END
$$;

-- 6. The reaper returns abandoned work. A worker killed between claiming and
--    completing would otherwise leave the row in `sending` forever.
DO $$
DECLARE
    v_id     UUID;
    v_reaped INT;
    v_status TEXT;
BEGIN
    INSERT INTO notification_logs
        (business_id, booking_id, recipient_type, recipient_contact, channel,
         event_type, message_body, scheduled_at, status, locked_at)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'aaaa00d1-0000-4000-8000-000000000001',
            'customer', 'nusrat@example.com', 'email', 'reminder_24h',
            'Stuck', NOW() - INTERVAL '1 hour', 'sending', NOW() - INTERVAL '30 minutes')
    RETURNING id INTO v_id;

    v_reaped := reap_stuck_notifications();

    SELECT status INTO v_status FROM notification_logs WHERE id = v_id;

    IF v_status <> 'queued' THEN
        RAISE EXCEPTION 'A row stuck in sending for 30 minutes was not reaped (now "%")', v_status;
    END IF;

    IF v_reaped < 1 THEN
        RAISE EXCEPTION 'The reaper reported % rows', v_reaped;
    END IF;
END
$$;

-- 7. The shared email allowance is platform-wide, so a second tenant's send
--    spends the same budget. A per-tenant counter would let ten tenants each
--    stay under a limit the platform has already blown.
DO $$
DECLARE
    v_first  BOOLEAN;
    v_second BOOLEAN;
    v_third  BOOLEAN;
BEGIN
    v_first  := claim_email_allowance(2);
    v_second := claim_email_allowance(2);
    v_third  := claim_email_allowance(2);

    IF NOT v_first OR NOT v_second THEN
        RAISE EXCEPTION 'The first two sends against an allowance of 2 were refused';
    END IF;

    IF v_third THEN
        RAISE EXCEPTION 'The third send against an allowance of 2 was allowed';
    END IF;
END
$$;

-- 8. Pruning keeps the counts. "How many reminders went out in March" has to
--    outlive the rows, or the retention job quietly destroys the only record
--    a tenant has of what was promised.
DO $$
DECLARE
    v_id      UUID;
    v_pruned  INT;
    v_rolled  INT;
BEGIN
    INSERT INTO notification_logs
        (business_id, booking_id, recipient_type, recipient_contact, channel,
         event_type, message_body, scheduled_at, status, sent_at, created_at)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'aaaa00d1-0000-4000-8000-000000000001',
            'customer', 'nusrat@example.com', 'email', 'reminder_24h',
            'Ancient', NOW() - INTERVAL '200 days', 'sent',
            NOW() - INTERVAL '200 days', NOW() - INTERVAL '200 days')
    RETURNING id INTO v_id;

    v_pruned := prune_notification_logs(90);

    IF EXISTS (SELECT 1 FROM notification_logs WHERE id = v_id) THEN
        RAISE EXCEPTION 'A 200-day-old sent row survived a 90-day prune';
    END IF;

    SELECT count(*) INTO v_rolled
    FROM notification_daily_stats
    WHERE business_id = 'aaaa0000-0000-4000-8000-000000000001'
      AND status = 'sent';

    IF v_rolled = 0 THEN
        RAISE EXCEPTION 'The prune deleted history without rolling it into the daily counts';
    END IF;
END
$$;

-- 9. None of the worker's functions is reachable from a browser. Draining
--    another tenant's queue into a state nothing will send is a denial of
--    service that costs nothing to mount.
DO $$
DECLARE
    v_leaked TEXT;
BEGIN
    SELECT string_agg(p.proname || ' -> ' || a.grantee, ', ')
    INTO v_leaked
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    JOIN LATERAL (SELECT pg_get_userbyid(acl.grantee) AS grantee) a ON TRUE
    WHERE n.nspname = 'public'
      AND p.proname IN ('claim_notifications', 'complete_notification', 'skip_notification',
                        'reap_stuck_notifications', 'claim_email_allowance',
                        'prune_notification_logs')
      AND acl.privilege_type = 'EXECUTE'
      AND a.grantee IN ('anon', 'authenticated');

    IF v_leaked IS NOT NULL THEN
        RAISE EXCEPTION 'Worker functions are callable from the browser: %', v_leaked;
    END IF;
END
$$;
