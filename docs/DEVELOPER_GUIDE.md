# Developer guide

How to run this, how it is put together, and the handful of things that will bite you.

Companion documents: [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for build order and exit criteria, [DECISIONS.md](DECISIONS.md) for why anything departs from the spec, [FREE_STACK.md](FREE_STACK.md) for what each service costs and when it stops, [RUNBOOK.md](RUNBOOK.md) for operations, [USER_GUIDE.md](USER_GUIDE.md) for the product itself.

---

## 1. Setting up

### What you need

Node 24 and a free Supabase account. That is the whole list — **no Docker, no local PostgreSQL, no `psql`** (see [DECISIONS.md](DECISIONS.md) D-014).

### Steps

```powershell
npm install
```

```powershell
Copy-Item .env.example .env.local
```

Create a Supabase project, then fill in four values:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, service-role key |
| `SUPABASE_DB_URL` | Project Settings → Database → Connection string → **URI** |

The last one is the direct Postgres connection, and it is only used by the command-line scripts. The application never touches it — it talks to Supabase over HTTPS. Keep it out of anything that reaches the browser.

```powershell
npm run db:push
```

```powershell
npm run dev
```

Then open http://localhost:3000/signup and create a business. No demo tenant is seeded on purpose: walking the real signup path exercises `register_business`, the terminology registry, the slug generator and the publish gate, and a seeded row would skip all four and hide a break in any of them.

### Verifying the setup

```powershell
npm run verify
```

```powershell
npm run test:db
```

The second one needs `SUPABASE_DB_URL`. Each test runs inside a transaction that is always rolled back, so it is safe against a staging project — though not something to aim at production, since a rollback does not un-advance a sequence.

---

## 2. Layout

```
app/(auth)/                   signup, login
app/(app)/app/                tenant dashboard + onboarding wizard
app/(public)/book/[slug]/     the customer-facing booking portal
app/api/v1/                   REST API, uniform envelope

lib/api/                      response envelope, error codes, route wrapper
lib/auth/session.ts           who is asking, and about which tenant
lib/supabase/                 server.ts (RLS) · client.ts · admin.ts (service-role)
lib/terminology/              industry label registry
lib/phone.ts                  E.164 normalisation
lib/notify/                   channel adapters + default templates
lib/logger.ts                 structured JSON logging with PII redaction

supabase/migrations/          forward-only schema — the source of truth
scripts/                      db-push, gen-types, run-db-tests
scripts/sql/supabase-shim.sql lets the schema build on a plain Postgres
tests/db/                     SQL assertions: RLS, isolation, integrity
tests/unit/                   Vitest
tests/e2e/                    Playwright
```

---

## 3. How the data model holds together

`business_id` is the tenant key for the entire schema. Every tenant table carries it, every policy is written in terms of it, and the whole isolation story rests on it.

### Three layers of protection, doing different jobs

It is worth being precise about this, because they are often confused and they fail in different ways.

**Grants** decide which *tables and columns* a role can touch at all. `anon` has no privilege on any base table. `authenticated` has the narrowest set each screen needs — no `DELETE` on `bookings` (cancellation is a status change) and a **column-level** `UPDATE` on `businesses`, because a tenant admin legitimately administers their own row and no policy could stop them setting their own `plan_id` to the enterprise tier.

**Row-Level Security** decides which *rows* within those tables. Six helper functions in `0013_rls_helpers.sql` express every rule: `is_business_member`, `has_role`, `is_business_admin`, `is_platform_admin`, `current_business_ids`, `current_staff_id`.

**Constraints** decide whether a row is *coherent*. This is the layer people forget. RLS is perfectly happy with a booking whose `business_id` is tenant A and whose `service_id` belongs to tenant B — the caller really is a member of A. Composite foreign keys on `(business_id, id)` make that unrepresentable (D-015).

### The thing to internalise

**RLS filters rows. It never filters columns.**

The source spec got this wrong and the consequence was severe: `CREATE POLICY "Public can view active staff" ON staff_resources FOR SELECT USING (is_active = TRUE)` gives anonymous visitors row access to the staff table, and therefore *every column* of it — including each provider's personal phone number and email address, on a platform for doctors. One `curl` with the publishable key, which ships in the browser bundle by design.

So anything the public needs goes through a curated view with an explicit column list: `public_businesses`, `public_branches`, `public_services`, `public_staff` in `0014_public_views.sql`. Those views are owner-rights on purpose, which is what lets `anon` hold zero privilege on the tables beneath them. The trade is that each view body is security-critical — a careless `SELECT *` there is a PII breach — hence the explicit lists and the test asserting `public_staff` has no contact column.

### Double-booking

`bookings` carries two generated ranges. `slot_range` is the appointment as the customer experiences it; `blocked_range` is the appointment plus its buffers, as the provider's diary experiences it. The exclusion constraint indexes **`blocked_range`**:

```sql
CONSTRAINT prevent_double_booking EXCLUDE USING GIST (
    business_id WITH =, staff_id WITH =, blocked_range WITH &&
) WHERE (status IN ('pending', 'confirmed', 'checked_in'))
```

Put it on `slot_range` instead — as the spec does — and the database accepts an appointment starting the moment the previous one ends, committing the dentist to a patient during the fifteen minutes the chair is being sterilised. Nothing in the interface would show it, because the slot picker subtracts the buffers and would never have offered that time. `tests/db/0007_double_booking_buffers.sql` is the standing guard, and it has been verified to fail when the constraint is moved back.

The buffers are copied onto the booking row rather than read from `services`, so editing a service next month does not silently redraw the blocked range of an appointment booked today.

One mechanical wrinkle, because it will come up again: `blocked_range` cannot be written the obvious way. `timestamptz - interval` is `STABLE`, not `IMMUTABLE`, and Postgres refuses `STABLE` expressions in generated columns. `shift_minutes(ts, mins)` narrows it to the case that genuinely is immutable — a whole number of minutes is a pure time offset with no calendar fields — so the label is accurate rather than convenient. That matters: a wrongly-labelled immutable function in an index expression produces an index that returns wrong rows, which here would mean a booking the constraint cannot see. See D-017.

---

## 4. Working on it

### Adding a migration

Numbered `NNNN_name.sql`, applied in filename order.

1. Create the next file by hand.
2. Begin with `SET search_path = public, extensions, pg_temp;` so DDL resolution does not depend on which role runs it.
3. `npm run test:db -- --fresh` against a throwaway database.
4. `npm run db:types` and commit the result — CI diffs it.
5. Add assertions in `tests/db/`.

Forward-only. Never edit a migration that has reached staging: the CLI records applied versions and will not reapply an edited file, so the edit diverges staging from production without telling you.

Two easy things to forget, both caught by `tests/db/0001_schema_invariants.sql`:

- **A new table has no grants.** Write them, or PostgREST returns "permission denied". That default is deliberate (D-016) — the alternative is a table readable by `anon`, which means every column.
- **A `SECURITY DEFINER` function needs `SET search_path`.** Without it, a role that can create objects in an earlier schema can shadow a name and run its own code as `postgres`.

### Writing a database test

They are plain SQL in `tests/db/`, run in filename order, each inside a rolled-back transaction with `tests/db/_shared/fixture.sql` prepended. The fixture gives you two tenants — a dentist in Dhaka and a salon in New York — with providers, services, customers, bookings and a platform operator. The second timezone is not decoration: the spec hardcodes `Asia/Dhaka` in several places and a fixture that only uses Dhaka cannot catch it.

To act as a signed-in user, do what Supabase does:

```sql
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;
```

`auth.uid()` then resolves exactly as in production. `RESET ROLE` returns to the privileged connection role.

Assertions raise. A `SELECT` blocked by RLS returns zero rows, an `INSERT` blocked by RLS raises `42501`, and an `UPDATE` filtered out by a `USING` clause affects zero rows without raising — so check the right thing:

```sql
DO $$
DECLARE touched INT;
BEGIN
    WITH attempt AS (
        UPDATE bookings SET internal_notes = 'x' WHERE id = '…' RETURNING 1
    ) SELECT count(*) INTO touched FROM attempt;
    IF touched <> 0 THEN RAISE EXCEPTION 'policy did not hold'; END IF;
END $$;
```

**Prove your test has teeth.** Break the thing it guards and watch it fail. A test that passes against a correct schema and would also pass against the broken one is worse than no test, because it buys false confidence. The B-03 test was validated by reintroducing the spec's original constraint and confirming the failure message named the real-world consequence.

### Where the terminology comes from

No user-facing noun is hardcoded. `lib/terminology/` maps each industry to its labels, a tenant's stored `terminology_config` overrides them, and `resolveTerminology()` merges the two and never throws — a page that cannot work out whether to say "Patient" should say "Customer", not return a 500.

One `<h2>Appointments</h2>` in a shared screen and a salon is reading medical language about its own bookings. That is the whole failure mode.

---

## 5. Testing

| Suite | Command | What it covers |
|---|---|---|
| Static | `npm run format:check`, `npm run lint`, `npm run typecheck` | |
| Unit | `npm test` | Pure logic: error mapping, redaction, phone normalisation |
| Database | `npm run test:db` | RLS isolation, role separation, double-booking, integrity |
| E2E | `npm run test:e2e` | Browser journeys, desktop and mobile |

Playwright runs on port **3100**, not 3000 (D-006), and probes `/api/v1/health` rather than `/` — in dev, Turbopack compiles routes on demand, so a server already answering `/` can still 404 an API route.

### How CI gets a database without Docker

`npm run test:db -- --fresh` applies `scripts/sql/supabase-shim.sql` and then every migration in order. The shim supplies the only four things the schema needs from Supabase: an `auth` schema with `auth.users`, `auth.uid()`, the three roles, and Supabase's open default grants on new tables.

That last one is the subtle part. Migration 0015 exists to *revoke* those grants. If the shim did not reproduce them, CI would be testing a database that started closed, and the test proving `anon` cannot read `customers` would pass for the wrong reason.

CI runs it against a `postgres:17` service container. That is Docker on GitHub's runner — free, and not what the no-Docker constraint was about.

The shim can drift from real Supabase. It is kept narrow and faithful (`auth.uid()` is a verbatim copy, fallback included), and the real check is `npm run db:push` against the hosted project.

---

## 6. Deploying

### This deployment

The hosted environment this repository is wired to, recorded here so nobody has
to guess which project a migration is about to hit:

| | |
|---|---|
| Supabase project | `booking-management`, ref `aywfflosscqerxnxbhar`, region `ap-southeast-1` (Singapore), free plan |
| Vercel project | `booking-management` under team `sps-a983`, Hobby |
| Production URL | https://booking-management-mauve.vercel.app |
| Git | `sps1590/bookingmanagement`; a push to `main` deploys to production |

There is **no staging project**. The free Supabase plan allows two projects per
organisation and one slot is already spoken for, so "staging first, then
production" below is the shape to grow into, not what happens today — right now
`npm run db:push` goes straight at the database customers use. Until a second
project exists, treat `--dry` as mandatory rather than advisory.

### Keys are the new format

This project was created after Supabase replaced the anon/`service_role` JWTs
with `sb_publishable_…` and `sb_secret_…`. Same database roles, same RLS
behaviour, and our code takes either as an opaque string, so nothing in the
codebase cares. Two things follow:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` now holds a *publishable* key. The name is
  kept for continuity with `lib/env.ts`; it is no longer literally the anon JWT.
- The legacy keys are announced for retirement in early 2027. A project that
  still issues them will need both rotated before then.

### Vercel

1. Import the GitHub repository at [vercel.com/new](https://vercel.com/new). The framework is detected; no build settings to change.
2. Add the environment variables from `.env.example` under Settings → Environment Variables. `NEXT_PUBLIC_APP_URL` must be the real deployment URL — booking links, calendar invites and reminder emails are all built from it, so `localhost` here means every link a customer receives is broken.
3. Point `SUPABASE_*` at the **production** Supabase project, not staging.

**Know what the free tier is.** Hobby is licensed for non-commercial use only. That is a licence term, not a usage meter, so nothing warns you — the moment the platform charges a tenant, it needs Pro at $20/month. D-013 has the detail, and two consequences for later work: functions time out at 10 seconds, and Hobby cron is daily-only, which is why the reminder scheduler is `pg_cron` inside Supabase rather than Vercel Cron.

### Schema

```powershell
npm run db:push -- --dry
```

```powershell
npm run db:push
```

Staging first, with the E2E suite against it, then production.

### The two scheduled jobs

Both exist because of the free tier, and both need repository secrets:

| Workflow | Secret | Why |
|---|---|---|
| `keepalive.yml` | `SUPABASE_DB_URL` | A free Supabase project pauses after 7 idle days. A paused project is a total outage your tenant finds before you do. Runs every 3 days, and *writes* rather than reads, so `platform_heartbeat.last_seen_at` is evidence the schedule is alive. |
| `backup.yml` | `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE` | The free tier has no automated backups and no PITR. This **is** the backup strategy. |

⚠️ **Read the comment at the top of `backup.yml` before enabling it.** The dump holds every tenant's patient names, phone numbers and clinical notes. It is encrypted with AES-256 before it leaves the job, and the job refuses to run without a passphrase of at least 24 characters — because **workflow artifacts on a public repository can be downloaded by anyone who can see the repository**. The encryption is not belt-and-braces there; it is the only thing between a public URL and a medical record. Store the passphrase somewhere that is not this repository, or the backup is worthless. If you would rather that data never passed through GitHub, change the upload step; the dump and encrypt steps stay as they are.

Rehearse a restore quarterly and record the date in [RUNBOOK.md](RUNBOOK.md). An unrehearsed backup is a guess.

---

## 7. Things that will bite you

**`anon` is public.** The publishable key ships in the browser bundle by design, so "what can `anon` read" is "what can anyone on the internet read". Never grant it a base table.

**Don't reach for `lib/supabase/admin.ts`.** It bypasses RLS entirely. Four sanctioned callers: tenant signup, the notification worker, payment verification, the Super Admin console. Everything else uses `lib/supabase/server.ts`. The `server-only` import makes the build fail if it is ever pulled into a Client Component, which is the single most dangerous mistake available here.

**Never hardcode a timezone.** Times are stored as `timestamptz` and rendered in the tenant's own `businesses.timezone`. `Asia/Dhaka` is the default, not a constant. The spec hardcodes it in its RPC formatting (defect B-20); the booking-code trigger deliberately uses the tenant's local date, which is why the fixture has a New York tenant.

**Never hardcode a user-facing noun.** See §4.

**Don't log a phone number, email address or token in full.** `lib/logger.ts` has `redactPhone`, `redactEmail` and `redactToken`. Logs are the easiest PII leak to create by accident, and the reschedule token is a bearer credential — it is the only thing standing between a stranger and a customer's appointment.

**Supabase error codes are Postgres SQLSTATEs.** `23P01` is `exclusion_violation`, which `mapPostgresError` turns into `SLOT_TAKEN` so the customer is told to pick another time instead of seeing a 500. `23505` is `unique_violation`. `42501` is RLS refusing a write.

**One business per owner, for now.** Enforced in `register_business`. Multi-business owners are a real case but need a tenant switcher and a plan that prices them, so the limit is explicit rather than accidental. `lib/auth/session.ts` is the single place that would learn about it.

---

## 8. Known gaps in what is built

Honest list, so none of these is discovered as a surprise:

- **A `staff` member can read the whole tenant customer list.** Narrowing it needs an `EXISTS` against `bookings` on every row, which belongs with the rest of the RBAC split in Phase 7. Recorded in `0015_rls_policies.sql` where it applies.
- **No status-transition guard on bookings** — any status can currently become any other (defect M-12). Phase 2.
- **No Content-Security-Policy.** A useful one needs per-request nonces for Next's inline bootstrap, and a broken CSP fails by silently blocking the booking form. Phase 10.
- **Sentry is installed but inert** without a DSN, and `next.config.ts` is deliberately not wrapped with `withSentryConfig` yet because source-map upload needs a build-time token. Phase 10. Every PII collection category is explicitly switched off — note that Sentry v11 **removed `sendDefaultPii`** in favour of a `dataCollection` object whose fields all default to `true`, so dropping the old idiom silently opts you into collecting request bodies and local variables (D-005).
- **Development shares the staging Supabase project**, because the free tier allows two. A careless `npm run db:push` during development changes staging.
