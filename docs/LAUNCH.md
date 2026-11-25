# Launch checklist

What has to be true before a real business books a real patient on this, and
what is deliberately not true yet. Written at the end of Phase 10, from the
state of the repository rather than from the plan.

## Before anyone relies on it

These are not optional and none of them is code — they are the handful of
secrets and switches that turn a working deployment into a running one.

| What | Where | Without it |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel → Environment Variables (Production) | The notification worker, the nightly jobs and the operator console stop. **Signup is no longer on this list**: migration 0028 moved it onto the publishable key, after a wrong value here closed the front door of a deployment whose every public page looked healthy. |
| `CRON_SECRET` | Vercel, and as a GitHub repository secret | Reminders are queued and never sent; nightly housekeeping never runs. |
| `APP_URL` | GitHub repository secret | Same — the scheduled workflows have nowhere to call. |
| `SUPABASE_DB_URL` | GitHub repository secret | Keep-alive and backup fail on schedule. A free Supabase project pauses after **7 idle days**, and a paused project is an outage a tenant finds first. |
| `BACKUP_PASSPHRASE` (24+ chars) | GitHub repository secret | The backup refuses to run. On a public repository this encryption is the only thing between a workflow artifact URL and a medical record. |
| `MAIL_FROM` + a provider key | Vercel | Email falls back to the log channel: nothing is sent and nothing fails. |

Email is optional in a real sense: without it the product still works, because
the calendar invite carries the reminders. Without SMS — which §1.5 removed for
want of a free tier — the `.ics` is the only reminder that reaches someone who
gave you nothing but a phone number.

## What the scheduled jobs do

| Workflow | When | Why it exists |
|---|---|---|
| `notifications.yml` | every 10 minutes | Sends what is due. Safe late, safe twice. |
| `maintenance.yml` | 02:10 UTC daily | Prune logs, expire subscriptions, release unverified deposits, expire waitlist offers. |
| `keepalive.yml` | every 3 days | A free Supabase project pauses after 7 idle days. |
| `backup.yml` | daily | The free tier has no backups and no PITR. This **is** the backup strategy. |

All four no-op without their secrets rather than failing loudly, except the
backup, which refuses — a backup that silently does not run is worse than one
that tells you.

## Free-tier headroom

The numbers that decide when this stops being free. Record them monthly; the
first growth spurt should be a planned conversation, not an outage.

| Resource | Ceiling | Where to look |
|---|---|---|
| Database | 500 MB | Supabase → Reports. `notification_logs` is the table that grows; the nightly prune keeps 90 days. |
| Egress | 5 GB/month | Supabase → Reports |
| Email | 3,000/month, platform-wide | `platform_email_usage`. Not per tenant — the worker spends a shared budget. |
| Vercel bandwidth | 100 GB/month | Vercel → Usage |
| Supabase projects | 2 per organisation | One is this; one is already spoken for. This is why there is no staging. |

**Vercel Hobby is licensed for non-commercial use only.** Nothing warns you.
The honest statement is zero cost until the first paying tenant, then $20/month
(D-013).

## Security, re-checked at the end

Each of these is asserted by a test rather than reviewed by eye:

- `anon` holds no privilege on any base table — `tests/db/0001`, `0003`, `0018`.
- A provider reads their own column of the diary and not a colleague's —
  `tests/db/0018`, 23 cells across five roles.
- A receptionist cannot read revenue or analytics — same file. RLS filters rows
  and never columns, so these are functions that refuse, not policies.
- The platform operator can read neither bookings nor customers (D-012).
- Double-booking is impossible under concurrency —
  `scripts/run-concurrency-tests.ts`, three passes on every push.
- A reminder cannot be sent twice — `tests/db/0017`.
- The service-role key is server-only: `lib/supabase/admin.ts` imports
  `server-only`, so a client component importing it fails the build.

## Not done, and why

Listed so nothing here is mistaken for finished.

- **Three pilot businesses for a week.** Needs real businesses.
- **Load test (k6).** Needs an environment to point at that is not production,
  and there is no staging project — the free plan allows two Supabase projects
  per organisation and one is already taken. This is the strongest argument in
  the plan for spending the first $25.
- **Lighthouse on the portal.** Same reason: no seeded tenant to audit.
- **Browser-level booking tests.** Written and gated on `E2E_TENANT_SLUG`; the
  logic they would cover runs on every push as component tests instead.
- **Custom domains.** The tenant buys the domain so it costs the platform
  nothing, but it serves one Enterprise flag and nobody is on that plan.
- **Web push.** The subscription table and the VAPID config exist; the service
  worker and the send path do not. It is the only channel with no ceiling, so
  it is the first thing worth finishing.
- **Telegram digests.** The channel adapter exists; the morning and nightly
  digest jobs do not.
