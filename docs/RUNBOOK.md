# Runbook

Operational procedures. Phase 0 establishes the file; each phase fills in the sections its features make possible, so that nothing ships with an on-call story written after the first incident.

## Local development

| Task | Command |
|---|---|
| Start database | `npm run db:start` (needs Docker Desktop) |
| Stop database | `npm run db:stop` |
| Rebuild schema from zero | `npm run db:reset` |
| Studio UI | http://127.0.0.1:54323 |
| Inbucket (captured email) | http://127.0.0.1:54324 |

If `db:start` fails, confirm Docker is running and ports 54321–54324 are free.

## Environments

| | Supabase project | Frontend |
|---|---|---|
| dev | local via CLI (Docker) | `npm run dev` |
| staging | *(Phase 1 — create and record the ref here)* | Netlify deploy preview |
| prod | *(Phase 1 — create and record the ref here)* | Netlify production |

Only **two** hosted Supabase projects, because that is what the free tier allows; dev is local only. See [FREE_STACK.md](FREE_STACK.md).

Deploying schema: `npx supabase link --project-ref <ref>` then `npm run db:push`. Always push to staging and run the E2E suite against it before production.

## Free-tier watch items

These are the failure modes that come from running at zero cost rather than from the code. Check them during any incident before suspecting a bug.

| Symptom | Likely cause | Action |
|---|---|---|
| Every request to prod errors, nothing deployed recently | Supabase project **paused** after 7 days idle | Resume it in the dashboard; confirm the keep-alive workflow is still scheduled and green |
| Reminders stopped platform-wide, queue is backing up | Monthly email allowance spent (3,000 across **all** tenants) | Check the send counter; switch `NOTIFY_EMAIL_PROVIDER` to Brevo; reminders fall back to push and the calendar invite |
| Writes failing, queue rows not inserting | 500 MB database ceiling | Run the `notification_logs` retention job; check for an un-pruned table |
| Deploys refused mid-month | 300 Netlify build minutes spent | Batch commits; wait for the reset |
| CI stops running on a private repo | 2,000 Actions minutes spent | Make the repo public (unlimited), or gate the Docker-heavy database job to migration changes only |

## Incident procedures

### Notification queue stalled — *Phase 5*

Symptoms: `notification_logs` rows with `status = 'queued'` and `scheduled_at` well in the past; customers report missing reminders.

1. Check whether `pg_cron` is firing: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;`
2. Check for rows stuck in `sending` — the reaper should return anything older than 10 minutes to `queued`.
3. Check `last_error` on failed rows for a provider credential or allowance problem.
4. Check the platform-wide monthly email count against the free allowance. Exhaustion is a skip, not a failure, and should have alerted before it happened.
5. To replay safely: set `status = 'queued'`, `attempts = 0`, `locked_at = NULL` for the affected ids. The worker claims with `FOR UPDATE SKIP LOCKED`, so a replay cannot double-send alongside a live run.

### Email provider outage or allowance exhausted — *Phase 5*

Switch `NOTIFY_EMAIL_PROVIDER` from `resend` to `brevo` and redeploy. Queued rows retry with backoff and drain automatically; nothing needs manual re-queueing unless rows have already exhausted `max_attempts`.

Remember what still reaches the customer while email is down: the `.ics` invite already in their calendar fires its own alarms, and web push is unaffected. Do not treat an email outage as a total reminder outage.

### Web push failing for one subscriber — *Phase 5*

A `410 Gone` or `404` from the push service means the subscription is dead (browser data cleared, notifications revoked). Delete the row rather than retrying — a dead subscription never recovers.

### Double-booking reported — *Phase 2*

This should be impossible: the `prevent_double_booking` GIST exclusion constraint on `bookings.blocked_range` makes two overlapping active bookings for one staff member unrepresentable.

1. Confirm it is real: `SELECT a.id, b.id FROM bookings a JOIN bookings b ON a.staff_id = b.staff_id AND a.id < b.id AND a.blocked_range && b.blocked_range WHERE a.status IN ('pending','confirmed','checked_in') AND b.status IN ('pending','confirmed','checked_in');`
2. Rows returned means the constraint was dropped, disabled, or the migration shipped excluding on `slot_range` instead of `blocked_range` (defect B-03). Check `\d bookings`.
3. An empty result means the two appointments are for *different* staff or the business double-booked a room, which is a resource-modelling gap, not a constraint failure.

### Customer paid a deposit but the booking was never confirmed — *Phase 8*

Payment is verified manually (see [DECISIONS.md](DECISIONS.md) D-010), so this is a process gap rather than a webhook failure.

1. Find the booking by phone or booking code; check `payment_status` and the claimed TrxID.
2. Have the tenant confirm the TrxID against their own bKash/Nagad statement, and check the amount actually received against the amount expected.
3. If genuine, mark it verified — this writes an audit row naming the acting user.
4. If the booking already expired and the slot is gone, the tenant refunds the customer directly. Do not force an overlapping booking.
5. A rejected TrxID that the customer insists is valid is a conversation for the tenant, not the platform. The platform's job is to record who decided what, and when.

### Restore from backup — *Phase 10*

PITR is a paid feature, so the scheduled encrypted `pg_dump` from Phase 1 **is** the backup strategy. Restore by downloading the artifact, decrypting it, and running `psql` against a fresh project or the local Docker instance.

Rehearse quarterly and record the date of the last rehearsal here. An unrehearsed backup is a guess.

## Monitoring

To be configured in Phase 10. Alert on: queue depth, failed-notification rate, worker lag, payment webhook failures, p95 slot-query latency, error rate.
