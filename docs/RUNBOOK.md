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
| dev | local via CLI | `npm run dev` |
| staging | *(Phase 1 — create and record the ref here)* | Vercel preview |
| prod | *(Phase 1 — create and record the ref here)* | Vercel production |

Deploying schema: `npx supabase link --project-ref <ref>` then `npm run db:push`. Always push to staging and run the E2E suite against it before production.

## Incident procedures

### Notification queue stalled — *Phase 5*

Symptoms: `notification_logs` rows with `status = 'queued'` and `scheduled_at` well in the past; customers report missing reminders.

1. Check whether `pg_cron` is firing: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;`
2. Check for rows stuck in `sending` — the reaper should return anything older than 10 minutes to `queued`.
3. Check `last_error` on failed rows for a gateway credential or balance problem.
4. Check the tenant's `sms_balance`. A zero balance is a skip, not a failure, and should have alerted the owner.
5. To replay safely: set `status = 'queued'`, `attempts = 0`, `locked_at = NULL` for the affected ids. The worker claims with `FOR UPDATE SKIP LOCKED`, so a replay cannot double-send alongside a live run.

### SMS gateway outage — *Phase 5*

Switch `SMS_PROVIDER` to a secondary provider and redeploy. Queued rows retry with backoff and drain automatically; nothing needs manual re-queueing unless rows have already exhausted `max_attempts`.

### Double-booking reported — *Phase 2*

This should be impossible: the `prevent_double_booking` GIST exclusion constraint on `bookings.blocked_range` makes two overlapping active bookings for one staff member unrepresentable.

1. Confirm it is real: `SELECT a.id, b.id FROM bookings a JOIN bookings b ON a.staff_id = b.staff_id AND a.id < b.id AND a.blocked_range && b.blocked_range WHERE a.status IN ('pending','confirmed','checked_in') AND b.status IN ('pending','confirmed','checked_in');`
2. Rows returned means the constraint was dropped, disabled, or the migration shipped excluding on `slot_range` instead of `blocked_range` (defect B-03). Check `\d bookings`.
3. An empty result means the two appointments are for *different* staff or the business double-booked a room, which is a resource-modelling gap, not a constraint failure.

### Payment taken but booking not confirmed — *Phase 8*

1. Find the row in `payments` by the provider reference.
2. Check whether the webhook arrived. If not, re-trigger it from the gateway dashboard — handlers are idempotent by provider reference.
3. If the booking expired and the slot is gone, refund and contact the customer. Do not force an overlapping booking.

### Restore from backup — *Phase 10*

Supabase PITR. Rehearse quarterly and record the date of the last rehearsal here.

## Monitoring

To be configured in Phase 10. Alert on: queue depth, failed-notification rate, worker lag, payment webhook failures, p95 slot-query latency, error rate.
