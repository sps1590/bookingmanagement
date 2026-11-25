# Development Plan — Multi-Tenant SaaS Booking & Appointment Management System

**Source spec:** `SaaS_Booking_Management_System_Master_Spec_EN.docx` (v1.0, 24 Nov 2026)
**Plan version:** 1.0 — 24 Nov 2026
**Repo:** `C:\Users\misex\Downloads\projects\booking_management` (greenfield, empty)

---

## 0. How to use this plan

The spec gives you *what* to build (SRS, SQL, API list, screen list). This plan gives you *the order to build it in*, with an exit test for every phase so you never move forward on a broken foundation.

Rules of engagement:

1. **Never start a phase until the previous phase's Exit Criteria all pass.** Each phase ends with something demonstrable.
2. **Phase 1 and 2 are not negotiable and not parallelisable.** Tenancy and the slot engine are the whole product; everything else is UI on top.
3. **The spec's SQL is a draft, not production code.** Section 13 lists the defects found in it. The blockers (B-prefix) must be fixed inside the phase where they are listed, before that phase's exit test.
4. Build **vertically**: one feature end-to-end (DB → RPC → API route → UI → test) rather than all DB, then all API. Each phase below is already sliced that way.
5. **Everything runs on free tiers.** [FREE_STACK.md](FREE_STACK.md) is the authority on what that permits, and no service enters the project without an entry in its table. This constraint already removed SMS, WhatsApp, Vercel, Stripe and the payment gateways from the spec's recommended stack — see §1.5.

### Mapping to the spec's own roadmap

| Spec roadmap | This plan |
|---|---|
| Phase 1: Core MVP (Weeks 1–4) | Phases 0 → 4 |
| Phase 2: Automation & Exports (Weeks 5–7) | Phases 5 → 6 |
| Phase 3: Monetization & Scale (Weeks 8–10) | Phases 7 → 9 |
| *(not in spec)* | Phase 10: Hardening & launch |

Total: **11–12 weeks** for one full-time developer. The spec's 10 weeks is achievable only if you drop the staff portal (Phase 7) or payments (Phase 8.3).

---

## 1.5 The zero-cost constraint

The platform runs entirely on free tiers. [FREE_STACK.md](FREE_STACK.md) holds the full audit — every service, its real limit, and the behaviour at that limit. The parts that change what gets built:

| Spec said | Reality | This plan does |
|---|---|---|
| Vercel hosting | Hobby tier is non-commercial only — a licence term, not a cap | **Vercel kept** by the owner's decision (D-013). Cost is zero until the first paying tenant, then $20/mo for Pro |
| SMS reminders | No free tier in Bangladesh, billed per message | **Dropped.** Email + web push + Telegram + `.ics` |
| WhatsApp reminders | Only user-initiated conversations are free; a reminder is a billed utility template | **Dropped** from the default build; adapter seam kept |
| Stripe / bKash / SSLCommerz | Stripe cannot pay out in BD; merchant accounts need registration and fees | Manual TrxID verification (Phase 8) |
| 3 Supabase projects | Free tier allows 2 | Local dev + staging + prod |
| PITR backups | Paid feature; free tier has none | Scheduled `pg_dump` from Phase 1 |

**The one that costs real product value is SMS.** The spec's no-show promise assumes you can reach a customer who gave you only a phone number; without SMS you cannot. The mitigation is to lean on the calendar invite — the customer's own calendar app then reminds them, free — plus an encouraged-but-optional email and a web push opt-in. FREE_STACK.md §3 sets out who each free channel actually reaches, and it is worth reading before Phase 3 designs the booking form, because that form is where the email address and the push opt-in have to be won.

Two obligations this creates early, which must not slide to a cleanup phase:

- **A keep-alive ping in Phase 1.** Free Supabase projects pause after 7 days idle, and a paused project is an outage a tenant discovers before you do.
- **A `pg_dump` backup job in Phase 1.** Free tier has no automated backups, and losing a clinic's appointment history is unrecoverable.

---

## 1. Phase summary

| # | Phase | Length | Ships | Status |
|---|---|---|---|---|
| 0 | Foundations & environment | 3 days | Deployed empty app, CI green, Supabase linked | **done**, bar the Vercel/Supabase accounts |
| 1 | Database core & multi-tenancy | 1 week | Migrations, RLS, tenant signup, onboarding wizard | **done** |
| 2 | Scheduling engine | 1 week | Hardened slot RPCs, zero double-booking under load |
| 3 | Public booking portal | 1 week | A stranger can book online end-to-end |
| 4 | Admin dashboard & booking ops | 1 week | Reception desk runs a real day on it — **MVP** |
| 5 | Notification & reminder engine | 1.5 weeks | Email/push/Telegram queue, 24h + 1h reminders |
| 6 | Self-service manage & exports | 1 week | Token reschedule/cancel, XLSX/CSV/PDF, daily digest |
| 7 | Staff portal & RBAC hardening | 1 week | Staff sees only own queue; role policies proven |
| 8 | Monetization: plans, quotas, payments | 1.5 weeks | Plan limits enforced, deposits via manual TrxID verification |
| 9 | Waitlist, analytics, multi-branch, domains | 1 week | Scale features + Super Admin console |
| 10 | Hardening, QA & launch | 1 week | Load-tested, security-reviewed, monitored, live |

---

## 2. Phase 0 — Foundations & environment (3 days)

**Goal:** an empty but *deployed* app with CI, so that from Phase 1 onward every commit is verifiable in a real environment.

### Tasks

- `git init`; `main` + branch protection; Conventional Commits.
- `create-next-app` — Next.js 15 App Router, TypeScript strict, Tailwind, Shadcn/UI, ESLint + Prettier.
- **Two** hosted Supabase projects — `staging` and `prod` — because the free tier allows two. `dev` is the local Docker stack. Install Supabase CLI; `supabase init`; `supabase link`.
- Decide migration discipline now: **all schema lives in `supabase/migrations/*.sql`**, never hand-typed in the SQL Editor. (The spec says "paste into the SQL Editor" — don't. You will need repeatable deploys and a rollback story.)
- Typed DB client: `supabase gen types typescript` wired to an `npm run db:types` script.
- Testing harness: Vitest (unit), Playwright (E2E), pgTAP or plain SQL assertion scripts (database).
- GitHub Actions: lint → typecheck → unit → schema built from zero on a `postgres:17` service container → RLS suite → Playwright. No Docker on the developer's machine (D-014). Keep the repo **public** if you can: Actions minutes are unlimited on public repos and capped at 2,000/month on private ones, and the database job is what eats them.
- Error tracking (Sentry) and structured server logging from day one.
- Seed script (`supabase/seed.sql`) creating 2 tenants, 3 staff, 5 services, 1 week of availability. Every later phase tests against this.

### Repo structure to establish

```
/app
  /(public)/book/[slug]/...      Portal 1: customer booking
  /(public)/manage/[token]/...   Self-service reschedule/cancel
  /(app)/app/...                 Portal 2: admin + receptionist
  /(app)/staff/...               Portal 3: staff queue
  /(app)/superadmin/...          Portal 4: SaaS owner console
  /api/v1/public/...
  /api/v1/admin/...
  /api/v1/superadmin/...
/components   ui/ (shadcn), booking/, calendar/, forms/
/lib
  supabase/     server.ts, client.ts, admin.ts (service-role, server-only)
  api/          handler wrapper, validation, error envelope
  auth/         session, role guards, tenant resolution
  slots/        client-side slot grouping + timezone helpers
  exports/      xlsx, csv, pdf builders
  notify/       channel adapters (sms, whatsapp, email)
  terminology/  industry label resolver
/supabase
  /migrations   0001_extensions.sql ... (numbered, forward-only)
  /functions    dispatch-notifications/, daily-digest/, waitlist-sweep/
  seed.sql
/docs           DEVELOPMENT_PLAN.md, API.md, SCHEMA.md, RUNBOOK.md
/tests          unit/, e2e/, db/
```

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # server only, never in a client bundle
NEXT_PUBLIC_APP_URL
RESEND_API_KEY / MAIL_FROM                     # email, the one paid-looking thing that is free
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT   # web push, no service required
TELEGRAM_BOT_TOKEN                             # optional, free
CRON_SECRET                      # shared secret for Edge Function invocation
```

No SMS, WhatsApp or payment-gateway variables: §1.5 removed all of them. Generate the VAPID pair once with `npx web-push generate-vapid-keys` — web push needs no account and no provider, which makes it the only notification channel with no limit at all.

### Exit criteria

- [x] Scaffold builds clean: `npm run build` from an empty `.next`, 0 npm audit findings.
- [x] CI defined with all five stages (`.github/workflows/ci.yml`).
- [x] Unit harness green (Vitest, 9 tests) and E2E green (Playwright, 4 tests across desktop + mobile).
- [x] Generated DB types placeholder imports cleanly; `npm run db:types` wired.
- [x] The migration chain applies from an empty database. `supabase db reset` was replaced by `npm run test:db -- --fresh`, which needs no Docker (D-014); verified against PostgreSQL 17.
- [ ] **Needs accounts:** `main` deploys automatically to a Vercel URL. Requires connecting the repo to Vercel and creating the two hosted Supabase projects (staging, prod).

Decisions taken during Phase 0 — including the move to Next 16 — are recorded in [DECISIONS.md](DECISIONS.md).

---

## 3. Phase 1 — Database core & multi-tenancy (1 week)

**Goal:** the 14-table schema exists as migrations, RLS genuinely isolates tenants (proven by tests, not by inspection), and a new business can sign up and complete onboarding.

### 3.1 Schema migrations

Port spec SQL Block 1 into numbered migrations, **with the corrections below applied**:

| Migration | Contents |
|---|---|
| `0001_extensions` | `btree_gist`, `pgcrypto`. `uuid-ossp` and `citext` deliberately unused — D-011 |
| `0002_plans` | `subscription_plans` + seed free/pro/enterprise |
| `0003_tenancy` | `businesses`, `business_members`, `branches`, `platform_admins` *(new — B-22)* |
| `0004_catalog` | `services`, `staff_resources`, `staff_services` |
| `0005_availability` | `availability_rules`, `availability_overrides` |
| `0006_crm` | `customers` |
| `0007_bookings` | `bookings` + `booking_history` + GIST exclusion |
| `0008_waitlist` | `waitlist_entries` |
| `0009_notifications` | `notification_templates`, `notification_logs` |
| `0010_payments` | `payments`, `subscription_invoices` *(new — B-24)*. No `sms_topups`: with no SMS channel there is nothing to top up (D-009) |
| `0011_indexes` | all performance indexes |
| `0012_triggers` | `updated_at` triggers *(M-06)*, booking-code counter *(B-15)*, last-owner guard, frozen payment claims *(D-010)* |
| `0013_rls_helpers` | the six functions every policy is written in terms of |
| `0014_public_views` | `public_businesses` / `_branches` / `_services` / `_staff` — the B-05 fix |
| `0015_rls_policies` | grants and policies, in one reviewable file |
| `0016_platform_ops` | `platform_heartbeat`, for the keep-alive job |
| `0017_register_business` | transactional tenant signup — §3.3 |

Required changes to the spec's DDL:

- **B-03 — buffers are not enforced by the database.** The spec computes free slots using `buffer_before/after_minutes`, but stores `slot_range = tstzrange(start_time, end_time)` and puts the GIST exclusion on *that*. Two concurrent requests can therefore land back-to-back and silently violate the sterilisation/cleanup gap. Fix: persist the buffers on the booking row and exclude on the blocked range.

```sql
-- shift_minutes is required: `timestamptz - interval` is STABLE, not
-- IMMUTABLE, so the obvious inline expression is rejected with
-- "generation expression is not immutable". See docs/DECISIONS.md D-017.
CREATE FUNCTION shift_minutes(ts TIMESTAMPTZ, mins INT)
RETURNS TIMESTAMPTZ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = public, extensions, pg_temp
AS $$ SELECT ts + make_interval(mins => mins) $$;

buffer_before_minutes INT NOT NULL DEFAULT 0,
buffer_after_minutes  INT NOT NULL DEFAULT 0,
blocked_range TSTZRANGE GENERATED ALWAYS AS (
  tstzrange(shift_minutes(start_time, -buffer_before_minutes),
            shift_minutes(end_time,    buffer_after_minutes), '[)')
) STORED,
CONSTRAINT prevent_double_booking EXCLUDE USING GIST (
  business_id WITH =, staff_id WITH =, blocked_range WITH &&
) WHERE (status IN ('pending','confirmed','checked_in'))
```

> **Correction, 2026-11-25.** An earlier revision of this plan inlined
> `start_time - make_interval(...)` directly in the generated column. That does not
> compile on any PostgreSQL version — verified against 17. The immutable wrapper above
> is what shipped in `0007_bookings.sql`.

- **B-15 — booking-code collisions.** `'BK-' || YYMMDD || 4 hex` against `UNIQUE (business_id, booking_code)` will collide (birthday collision around 300 bookings/day) and the RPC has no retry, so the customer sees a 500. Use a per-business daily sequence, or loop up to 5 times on `unique_violation`.
- **B-16 — notification worker double-send.** Add `attempts INT NOT NULL DEFAULT 0`, `locked_at TIMESTAMPTZ`, `last_error TEXT` to `notification_logs`; the worker claims rows with `FOR UPDATE SKIP LOCKED` (Phase 5).
- **B-22 — Super Admin has no implementation.** Add `platform_admins (user_id UUID PRIMARY KEY REFERENCES auth.users)` and `is_platform_admin()`; every RLS policy gains `OR is_platform_admin()`.
- **B-24 — payments tables are missing entirely** although the spec sells deposits and subscription tiers. Create them now (unused until Phase 8) so you never have to migrate a live `bookings` table later.
- **M-06** — `created_at`/`updated_at` exist but no trigger maintains `updated_at`. Add one shared trigger function.
- **M-15** — add `CHECK (is_closed OR (custom_start_time IS NOT NULL AND custom_end_time > custom_start_time))` on `availability_overrides`.

### 3.2 RLS — rewrite, don't copy

The spec's RLS block has two real security holes. Treat its policies as a sketch.

- **B-05 — public policies leak private columns.** `CREATE POLICY "Public can view active businesses" ON businesses FOR SELECT USING (is_active = TRUE)` hands every anonymous visitor `sms_balance`, `plan_id`, `booking_rules` and the owner's email. The same pattern on `staff_resources` publishes **every staff member's personal phone and email** — a PII breach on a platform for doctors. Fix: revoke public SELECT on the base tables and expose `public_businesses`, `public_branches`, `public_services`, `public_staff` as views listing only safe columns; grant `anon` on the views only.
- **B-23 — staff can read and edit the whole tenant.** `ON bookings FOR ALL USING (is_business_member(business_id))` contradicts the spec's own RBAC matrix ("Service Provider / Staff — Own Schedule Only"). Write the role-aware policy shape now; the full split lands in Phase 7.
- **B-09 — missing `SET search_path`.** Every `SECURITY DEFINER` function must carry `SET search_path = public, pg_temp`, or a tenant able to create objects can hijack name resolution and run code as the definer. Non-optional.
- **B-21 — `business_members` has no INSERT/UPDATE/DELETE policy**, so an owner cannot invite a receptionist. Add admin-scoped write policies.
- **B-25 — `subscription_plans` never gets `ENABLE ROW LEVEL SECURITY`** (it is absent from the ALTER list), so PostgREST exposes the whole table. Enable it with an explicit public-read policy for `is_active = TRUE`.
- Add helpers alongside the spec's two: `current_business_ids()`, `has_role(business_id, roles[])`, `is_platform_admin()`.

### 3.3 Tenant signup & onboarding

- `POST /api/v1/auth/register-business` — transactionally create the `auth.users` row, `businesses` (generate `BIZ-####` + collision-safe slug), `business_members` (owner), a default `branches` row, the industry `terminology_config`, and the default `notification_templates` for that industry.
- Industry template registry in `lib/terminology/` — the spec's six industries (doctor, dentist, salon, parlor, consultant, workshop) plus `other`. Terminology resolves server-side and flows through a `TerminologyProvider` context so no label is ever hardcoded in a component.
- Onboarding wizard (`/app/onboarding`): Industry → Business details → First service → Working hours → Go live. Resumable; progress stored on the business row.
- Auth: Supabase Auth email + password for staff and admins. Customers stay guest-first (phone, optional OTP) — don't force account creation on a patient booking a serial.

### 3.4 Free-tier survival jobs

Both of these exist because of the hosting constraint (§1.5), and both belong here — the moment a hosted project exists — not in Phase 10.

- **Keep-alive.** A GitHub Actions workflow on a 3-day schedule hits `/api/v1/health` and runs a trivial query against prod. Free Supabase projects pause after 7 days idle, and a paused project is an outage your tenant finds before you do.
- **Backups.** A daily workflow runs `pg_dump` against prod, encrypts the output, and uploads it as a workflow artifact (90-day retention, free). The free tier has no automated backups whatsoever, and a clinic's lost appointment history cannot be reconstructed. The dump contains every tenant's customer records: encrypt it, and never let it reach a public repo.
- Rehearse a restore into the local Docker instance before Phase 10 signs off. An unrehearsed backup is a guess.

### 3.5 Database tests (the point of this phase)

Write these in `tests/db/` and run them in CI:

- Tenant A's JWT selects 0 rows from Tenant B's `bookings`, `customers`, `notification_logs`.
- The `anon` role selects 0 rows from `customers`, `bookings`, `notification_logs`, `business_members`.
- Anonymous SELECT on staff data returns **no phone or email column** (regression test for B-05).
- A `staff` role cannot UPDATE another staff member's booking.
- A non-member cannot UPDATE `businesses`.
- A `platform_admins` member can read across tenants.

### Exit criteria

- [x] The migration chain builds every table, policy, view and seed from an empty database. 17 migrations, 20 tables, 38 policies, 4 curated views, verified against PostgreSQL 17 via `npm run test:db -- --fresh`.
- [x] Every RLS test passes, and CI fails if any regresses — 10 suites in `tests/db/`, run by the `database` job on a `postgres:17` service container. Each was validated by breaking the thing it guards: reintroducing the spec's `slot_range` constraint makes the B-03 suites fail with the real-world consequence named.
- [x] Signup produces a `BIZ-####` code from a sequence, a collision-safe slug, an owner membership, a default branch, industry terminology and seeded notification templates — all in one transaction (`register_business`, migration 0017), asserted in `tests/db/0010_register_business.sql`.
- [x] The five-step wizard is resumable from `businesses.onboarding_step`, and publishing gates public visibility: `public_businesses` filters on `onboarding_completed_at`, so a half-configured clinic is unreachable. `/book/[slug]` resolves and renders the tenant's own services, providers and labels.
- [x] Free-tier survival jobs exist: `keepalive.yml` (every 3 days, writes to `platform_heartbeat`) and `backup.yml` (daily encrypted `pg_dump`). **Both need repository secrets set before they do anything** — see §3.4 and the warning at the top of `backup.yml`.
- [ ] **Needs a hosted project:** `npm run db:push` against staging and production. Verified against PostgreSQL 17 but not yet against Supabase itself.

Beyond the plan, Phase 1 also added composite foreign keys for tenant integrity (D-015), a last-active-owner guard, frozen payment claims (D-010), and closed default privileges for future tables (D-016). Phase 1 decisions are D-011 to D-017.

---

## 4. Phase 2 — Scheduling engine (1 week)

**Goal:** the booking RPCs are production-grade and double-booking is impossible under concurrency. This is the single highest-risk phase; budget the full week.

### 4.1 `get_available_slots` — harden

Port the spec's function, then fix:

- **B-14 — "Any Available" provider has no backend.** Portal 1 Screen 2 offers *'Any Available'*, but the RPC requires `p_staff_id`. Add `get_available_slots_any(p_business_id, p_service_id, p_date, p_branch_id)` returning `(slot_start, slot_end, staff_id)`, iterating only staff mapped to that service through `staff_services`.
- **M-01 — `staff_services` is ignored**, so a dentist can be booked for a haircut. Add the join, and honour `custom_duration_minutes` / `custom_price`.
- **M-02 — `booking_rules` is defined but unused.** Enforce `max_advance_days` (reject dates beyond the window).
- **M-03 — no minimum lead time.** The spec only checks `v_cursor > NOW()`, which permits booking a slot 60 seconds out. Add `min_lead_minutes`.
- **B-20 — timezone is hardcoded.** The RPCs format with `AT TIME ZONE 'Asia/Dhaka'` while `businesses.timezone` exists and already defaults to it. Read the column everywhere, or the product breaks for the first tenant outside Dhaka.
- **Branch scoping** — filter staff by `branch_id` when supplied.
- **M-05 — performance.** The nested `NOT EXISTS` per candidate slot is O(slots × bookings). Pre-load the day's bookings and breaks into arrays and test in memory. Target **under 150 ms for a 12-hour day at 15-minute granularity**.

### 4.2 `create_booking_atomic` — rewrite

This is the spec's most serious hole. As written the function is `SECURITY DEFINER`, callable by `anon`, takes `p_business_id` and `p_start_time` straight from the client, and inserts after **no validation at all** beyond the GIST overlap check.

**B-06 — consequences as specified:** anyone can book 03:00 on a closed Friday, book a doctor who is on Eid leave, book a service that staff member doesn't perform, book 400 days out, and exceed the tenant's plan quota — and can script thousands of such rows against any business ID they can read from the public portal.

Required gates, in order, before the INSERT:

1. Business exists and `is_active`.
2. Service exists, `is_active`, and belongs to the business.
3. Staff exists, `is_active`, belongs to the business, and is mapped to the service.
4. `p_start_time` is within `max_advance_days` and beyond `min_lead_minutes`.
5. `p_start_time` appears in `get_available_slots(...)` for that staff/service/date — the one authoritative check, covering working hours, breaks and date overrides.
6. Plan quota: the tenant's confirmed bookings this month are below `max_monthly_bookings`.
7. Abuse control: reject if the same phone already holds more than N active future bookings with this tenant.
8. `status` derived from `booking_rules.auto_confirm` — the spec hardcodes `'confirmed'` and ignores its own flag.
9. Persist `buffer_before/after_minutes` from the service (needed by B-03).
10. Catch `exclusion_violation` and return a clean `SLOT_TAKEN` error rather than a raw Postgres exception.

Also rate-limit the public endpoint (by IP and phone) in the API layer, and require phone OTP before insert for tenants that enable it.

### 4.3 `reschedule_booking_by_token` — fix

- **B-19 — no availability validation.** Same hole as B-06: a customer can self-reschedule to 04:00 on a holiday, because only the GIST overlap is checked. Must re-run gate 5.
- **B-18 — reminders are lost.** The function cancels all queued reminders, then queues only the "rescheduled" confirmation. The 24h and 1h reminders are **never re-created**, directly contradicting §1.4B ("new reminders are scheduled"). Extract a shared `queue_booking_notifications(booking_id)` and call it from create, self-reschedule and admin-reschedule.
- **M-04** — enforce a `max_reschedules` rule; `reschedule_count` is incremented but never checked.
- **M-11** — rotate `reschedule_token` after a successful change so a forwarded link can't be replayed.

### 4.4 Functions the spec names but never defines

- **B-11 `cancel_booking_by_token`** — the API table lists `POST /api/v1/public/bookings/:token/cancel`, but no SQL exists for it. Write it: cutoff check against `min_cancel_hours`, status → `cancelled`, cancel queued reminders, audit row, notify staff, trigger the waitlist sweep.
- `admin_reschedule_booking` — bypasses the customer cutoff (per the API table) but must still validate availability; used by calendar drag-and-drop.
- **M-12 `set_booking_status`** — guards the legal transitions of §1.4B (`pending → confirmed → checked_in → completed`, plus `cancelled` / `no_show`) and writes `booking_history`. The spec defines the workflow but nothing enforces it, so today any status can jump to any other.

### 4.5 Concurrency test suite (the exit gate)

- 50 parallel `create_booking_atomic` calls for the **same** staff and slot → exactly 1 success, 49 clean `SLOT_TAKEN`.
- 50 parallel calls for adjacent slots whose buffers overlap → buffer respected (regression for B-03).
- Reschedule into a slot while another client books it → exactly one wins.
- Cancel, then immediately rebook the freed slot → succeeds.
- Property test: 500 random bookings across 5 staff over 2 weeks → assert zero overlapping `blocked_range` per staff.

### Exit criteria

- [x] All five concurrency tests pass repeatedly. CI runs **three** passes on
      every push (`npm run test:concurrency -- --repeat 3`); the ten-pass run
      is `--repeat 10` and belongs to sign-off, not to every push.
- [x] Every gate in 4.2 has a failing-case test — `tests/db/0012_booking_gates.sql`.
- [x] `get_available_slots` under 150 ms on a full day with 40 existing
      bookings. Asserted, not benchmarked by hand: the last check in
      `scripts/run-concurrency-tests.ts` fills a day with 40 appointments and
      fails over budget. It guards against a regression to the spec's
      correlated `NOT EXISTS` per candidate slot, which is fine on an empty
      day and quadratic on a busy one — so it would pass every other test.
- [x] A second tenant on `America/New_York` produces correct slots
      (`tests/db/0011_slot_engine.sql`, defect B-20). Message *times* render
      through `businesses.timezone` in `queue_booking_notifications`; the
      rendering itself is exercised in `0013`, and Phase 5 owns delivery.

Carried into later phases rather than done here, and listed so they are not
mistaken for finished: API-layer rate limiting by IP and phone, and the phone
OTP gate before insert (§4.2, last paragraph), both of which belong with the
public portal in Phase 3; and the waitlist sweep on cancellation, which needs
the matching logic Phase 9 builds.

---

## 5. Phase 3 — Public booking portal (1 week)

**Goal:** a stranger with a link books an appointment and receives a code. Spec Portal 1, screens 1–5.

### Routes and API

| Route | Spec endpoint |
|---|---|
| `/book/[slug]` | `GET /api/v1/public/:slug` |
| `/book/[slug]/[serviceId]` | — |
| `/book/[slug]/slots` | `GET /api/v1/public/:slug/slots` |
| `/book/[slug]/confirm` | `POST /api/v1/public/:slug/bookings` |
| `/book/[slug]/success/[code]` | — |

All public routes read from the Phase-1 safe views, never the base tables.

### Screens

1. **Landing and service selection** — logo, address, map link, branding colours from `branding_config`, service cards grouped by `category` with duration and price. All labels terminology-driven.
2. **Provider and date picker** — staff cards (name, title, avatar — *no phone or email*) plus **"Any Available"** backed by `get_available_slots_any`. **M-13:** the date picker needs to grey out closed days, which no spec endpoint supports — add a lightweight `get_month_availability` RPC, otherwise the calendar invites clicks on holidays.
3. **Slot grid** — grouped Morning / Afternoon / Evening in the business timezone; revalidate on window focus; show a Waitlist CTA when the day is empty (wired in Phase 9).
4. **Customer details** — name, phone (BD format `+8801XXXXXXXXX`, validated with libphonenumber), optional email, notes; optional OTP where the tenant requires it (**N-02:** the spec mentions OTP but never specifies provider, expiry or attempt limits — decide and document here); deposit step stubbed for Phase 8.
5. **Confirmation** — booking code, QR for reception check-in, "Add to Google Calendar" / `.ics` download, and the `/manage/:token` link.

### Cross-cutting

- Server-render the landing and service pages for SEO and speed; per-tenant `generateMetadata` and OG image.
- Zod validation at every API boundary; one uniform `{ success, data | error: { code, message, details } }` envelope.
- Mobile-first — expect most bookings from phones in Bangladesh; test on a throttled 3G profile.
- Accessibility: slot grid fully keyboard-navigable, `aria-live` on availability updates.
- `SLOT_TAKEN` must re-fetch slots and show an inline "that slot just went — pick another", never a crash or a dead end.

### Exit criteria

- [ ] Playwright: a full guest booking on a seeded tenant produces a DB row and a booking code.
- [ ] Two browsers racing the same slot → one succeeds, the other is told gracefully and recovers.
- [ ] Closed days, break times and leave overrides never appear as bookable.
- [ ] Lighthouse mobile ≥ 90 performance and ≥ 95 accessibility on the landing page.
- [ ] Two tenants of different industries render different terminology and branding from the same code.

---

## 6. Phase 4 — Admin dashboard & booking ops (1 week) → **MVP**

**Goal:** a receptionist runs a full working day on the system without anyone touching SQL. Spec Portal 2, screens 2–6.

### Screens

1. **Executive overview** (`/app`) — KPI cards (today's bookings, pending, completed, revenue), upcoming queue, Quick Walk-In button. Supabase Realtime subscription so a new online booking appears without a refresh.
2. **Interactive calendar** (`/app/calendar`) — FullCalendar, Day/Week/Month, resource columns per staff, colour-coded by status or service, drag-and-drop calling `admin_reschedule_booking` with an optimistic update and rollback on `SLOT_TAKEN`.
3. **Booking list** (`/app/bookings`) — server-side paginated table; filters for date range (Today / Tomorrow / This Week / Custom), branch, staff, service, status, payment status, and search on phone or booking code; inline status toggles (Check-In / Complete / No-Show) through `set_booking_status`.
4. **Walk-in / phone booking** — staff-side booking drawer; `booking_source = 'walk_in' | 'phone'`; may override the customer cutoff but never the availability gates.
5. **Services, staff and schedule setup** (`/app/settings/*`) — CRUD for services (duration, buffers, price, deposit, colour), staff (profile plus `staff_services` mapping), the weekly availability matrix, and date overrides for Eid and leave.
6. **Customer CRM** (`/app/customers`) — searchable directory, visit history, total spend, notes, no-show flag. **M-07:** `customers.no_show_count` exists but nothing writes it — add a trigger on booking status change.

### Platform work

- Role guards: a single `requireRole(businessId, roles)` server helper; every `/api/v1/admin/*` route passes through it and asserts that `X-Business-ID` matches an actual membership. Never trust the header alone.
- Branch switcher and tenant context in the app shell.
- Audit: every admin mutation writes a `booking_history` row.

### Exit criteria — the MVP gate

- [ ] One real pilot business is onboarded and takes bookings for a week.
- [ ] A receptionist can create, reschedule, check in, complete and no-show a booking entirely in the UI.
- [ ] Drag-and-drop onto an occupied slot is rejected cleanly and the card returns to its origin.
- [ ] A manager of Branch A cannot see Branch B's bookings.
- [ ] A new online booking appears on the dashboard within 5 seconds, unprompted.

---

## 7. Phase 5 — Notification & reminder engine (1.5 weeks)

**Goal:** the three-way communication of spec §1.4C actually sends, reliably and idempotently.

### 7.1 Queue worker

- Edge Function `dispatch-notifications`, invoked by `pg_cron` every minute, authenticated with `CRON_SECRET`.
- **B-16 — claim rows safely.** The spec's `SELECT ... WHERE status='queued' AND scheduled_at <= NOW() LIMIT 50` **will double-send** whenever a run overlaps the next tick — and SMS reminders sent twice is exactly the complaint that loses a tenant:

```sql
UPDATE notification_logs SET status='sending', locked_at=NOW(), attempts=attempts+1
WHERE id IN (
  SELECT id FROM notification_logs
  WHERE status='queued' AND scheduled_at <= NOW()
  ORDER BY scheduled_at LIMIT 50 FOR UPDATE SKIP LOCKED
) RETURNING *;
```

- Exponential backoff on failure (1m, 5m, 30m, 2h), `max_attempts = 4`, then `failed` with `last_error`.
- Reaper: rows stuck in `sending` for over 10 minutes return to `queued`.
- **M-08 — the spec's SMS credit accounting is now moot.** `businesses.sms_balance` and `subscription_plans.monthly_sms_quota` exist in the schema but there is no SMS channel to spend them on (§1.5). Keep the columns — they are the natural home for a future tenant-funded gateway — but do not build quota logic for a channel that does not exist. What *does* need a cap is email: Resend's free tier is 3,000/month across all tenants, so track monthly email sends per business and degrade to push-only when the platform total approaches the ceiling.
- **Retention, built now.** `notification_logs` grows one row per message per recipient forever, against a 500 MB database. Add a job that deletes `sent` rows older than 90 days while rolling counts into a summary table. Build it with the table, not when the database fills.

### 7.2 Channel adapters

`lib/notify/` — one interface, three implementations, all free (§1.5 removed SMS and WhatsApp):

- **Email** (Resend free: 3,000/month, 100/day). The primary customer channel. Must attach the `.ics` invite.
- **Web Push** (VAPID). No service, no account, no limit — the only channel with no ceiling. Needs a service worker, a subscription table keyed to customer or staff user, and graceful handling of expired subscriptions (`410 Gone` → delete the row). Note the iOS caveat: Safari requires the site be added to the Home Screen before push works at all, so treat push as a bonus on iOS, never the only reminder.
- **Telegram** (Bot API, free, unlimited). Ideal for the staff morning digest and the owner's nightly summary — internal recipients who will happily link a bot. Few customers in Bangladesh will.

Each returns a normalised `{ ok, providerId, raw }` stored in `provider_response`. The interface keeps the seam the SMS and WhatsApp adapters would have used, so a tenant-funded gateway later is one new file and a config flag, not a refactor.

**The `.ics` calendar invite is the most important deliverable in this phase.** Without SMS, the customer's own calendar app is the only reminder mechanism that reaches someone who gave you nothing but a phone number and costs nothing to operate. Treat it as a first-class feature: a correct `VEVENT` with `VALARM` triggers at −24h and −1h, a stable `UID` so a reschedule updates the existing entry rather than creating a duplicate, `SEQUENCE` incremented on change, and `METHOD:CANCEL` on cancellation.

### 7.3 Templates and scheduling

- Merge-tag renderer: `{{customer_name}}`, `{{booking_code}}`, `{{date}}`, `{{time}}`, `{{service}}`, `{{staff}}`, `{{branch}}`, `{{manage_url}}`, `{{business_name}}`. Render in the **business timezone** (B-20) and support Bangla templates.
- `queue_booking_notifications(booking_id)` — the single source of truth for confirmation plus 24h and 1h reminders, honouring `notification_templates.is_enabled` and the per-channel toggles. Called by create, self-reschedule (B-18) and admin reschedule.
- **M-10 — the digests exist only in prose.** Write them: staff morning digest (08:00 business-local) and owner nightly summary (21:00), as two more `pg_cron` jobs over a `daily-digest` Edge Function.
- Settings UI (`/app/settings/notifications`) — channel toggles, template editor with live preview and a merge-tag picker, reminder timing, and a delivery log viewer with status filters and manual retry.

### Exit criteria

- [ ] Booking → confirmation email in the customer's inbox within 60 seconds, with a working `.ics` attachment.
- [ ] The `.ics` imports correctly into Google Calendar and the stock Android calendar, and its −24h/−1h alarms fire.
- [ ] A reschedule **updates** the existing calendar entry rather than creating a second one (stable `UID`, incremented `SEQUENCE`).
- [ ] Two deliberately overlapping worker runs send each message exactly once.
- [ ] A reschedule cancels the old reminders *and* queues new 24h/1h ones at the right times (regression for B-18).
- [ ] A simulated provider outage retries with backoff and settles; nothing is lost.
- [ ] Web push reaches an Android Chrome subscriber; an expired subscription is deleted rather than retried forever.
- [ ] Staff digest arrives over Telegram.
- [ ] The retention job prunes `sent` rows older than 90 days without losing aggregate counts.

---

## 8. Phase 6 — Self-service manage & exports (1 week)

**Goal:** customers manage their own bookings, and the business can carry a printed sheet to the reception desk. Completes the spec's own Phase 2.

### 8.1 Manage page (`/manage/[token]`)

- View status, service, staff, time, location, QR.
- **Reschedule** — pick a new slot from the same grid component as Phase 3, then call `reschedule_booking_by_token`. State the cutoff plainly ("changes allowed until 8:30 AM tomorrow") and disable the action once it has passed.
- **Cancel** — `cancel_booking_by_token` behind a confirm dialog with an optional reason.
- Token security: 48 hex characters (as specified), constant-time lookup, rate-limited by IP, rotated after each successful change (M-11), page marked `noindex`, and never expose other bookings for the same phone.

### 8.2 Export centre

- `GET /api/v1/admin/bookings/export?format=xlsx|csv|pdf` — accepts exactly the same filter params as the list endpoint, so what you see is what you export.
- XLSX via SheetJS: frozen header row, sensible column widths, status colour fills, a totals row, and a second sheet recording the filters used.
- CSV: UTF-8 **with BOM** — Excel in Bangladesh mangles Bangla customer names without it.
- PDF via `@react-pdf/renderer`: the "Daily Serial / Appointment Sheet" — business header, date, staff-grouped serial list, time, customer, phone, service, and a signature/notes column. A4 portrait, print-tested on real paper.
- Stream the response; cap at 10,000 rows and hand larger requests to a background job that emails a link.
- Gate on `features.exports` from the plan (Phase 8 wires enforcement; read the flag now).

### Exit criteria

- [ ] A customer reschedules from a phone in under 30 seconds, and both parties are notified.
- [ ] Cancelling after the cutoff is refused with a clear, human message.
- [ ] XLSX opens in Excel and Google Sheets with Bangla names intact.
- [ ] PDF prints correctly on A4 and matches the on-screen filtered list row for row.
- [ ] The owner receives the nightly digest with totals that reconcile against a direct SQL count.

---

## 9. Phase 7 — Staff portal & RBAC hardening (1 week)

**Goal:** close B-23. The spec promises "Own Schedule Only" for staff; the SQL as written gives them the entire tenant.

- Role-aware RLS on `bookings`, `customers`, `booking_history`:
  - `owner`, `manager` → the whole business (manager optionally branch-scoped).
  - `receptionist` → assigned branches, with no access to financial or analytics columns.
  - `staff` → only rows whose `staff_id` maps to their own `staff_resources.user_id`.
- Staff portal (`/staff`), mobile-first:
  - **My Today's Queue** — chronological list, one-tap Start / Complete / No-Show, click-to-call the customer, visible notes.
  - **My Availability** — weekly shifts read-only, plus a leave/break request flow writing to `availability_overrides`. **M-14:** the spec's "request leaves/breaks" has no state to approve — add a `status` column (`pending`/`approved`/`rejected`) and an owner approval screen.
- Staff invitation flow: owner invites by email → Supabase invite → first login links `auth.users` to the existing `staff_resources` row.
- Permission test matrix: 5 roles × ~20 actions, automated. **The matrix is the deliverable of this phase**, not the UI.

### Exit criteria

- [ ] A `staff` JWT selects only its own bookings — asserted at the SQL level, not merely hidden in the UI.
- [ ] A receptionist cannot read revenue or analytics endpoints.
- [ ] All ~100 cells of the permission matrix pass in CI.
- [ ] A staff member marks a booking complete from a phone and the owner's dashboard updates live.

---

## 10. Phase 8 — Monetization: plans, quotas, payments (1.5 weeks)

All of the money *movement* here is manual, because no payment gateway in Bangladesh is free to the platform (§1.5). All of the money *enforcement* is real code and gets built exactly as specified — that is the part that actually protects the business.

### 10.1 Plan enforcement

A shared layer that reads the tenant's plan and enforces `max_branches`, `max_staff`, `max_monthly_bookings` and the `features` JSONB (`exports`, `custom_domain`). Enforce **server-side in the RPC and in the API route** — never only by hiding a button. Over-limit responses return `PLAN_LIMIT_REACHED` with an upgrade CTA. Add a `plan_usage` view for the dashboard meter.

### 10.2 Subscription billing — manual

The tenant pays the platform owner directly (bKash, bank transfer, cash). The Super Admin console records the payment and sets `plan_id` plus an expiry date; a daily job downgrades expired tenants to Free. Still build: `subscription_invoices` as the record of what was charged and when, a grace period, and an explicit documented downgrade behaviour — decide what happens to staff 11–15 when a Pro plan lapses, because the spec does not say. Suspend the extra staff rather than deleting them.

### 10.3 Booking deposits — manual TrxID verification

This is how most small businesses in Bangladesh already take advance payment, so it is familiar to tenants rather than a compromise.

- Per-business toggle plus per-service `deposit_required`. The tenant displays their own bKash/Nagad number and the expected amount.
- Flow: customer pays from their own wallet → enters the transaction ID on the booking form → booking is created `pending` with `payment_status = 'unpaid'` → receptionist checks the TrxID against their own statement and marks it paid, which confirms the booking and fires `queue_booking_notifications`.
- A `pending` booking holds the slot (the GIST predicate already includes `pending`) and is released by a sweep job if unverified after the tenant's configured window.
- Keep the `PaymentGateway` interface from the original plan behind this flow, so a real merchant account plugs in later without reworking the booking lifecycle.

A manual flow needs guards that an automated gateway would have given you free:

- **TrxID unique per tenant** — someone will reuse one, by mistake or otherwise. Enforce it with a constraint, not a check in the UI.
- **Audited verification** — every mark-as-paid records which user did it and when. This is the one action in the product where a dishonest employee can steal money.
- **Amount expected vs amount claimed** shown side by side in the receptionist UI, so a 500 BDT deposit paid as 50 is caught at the desk.
- **Never auto-confirm on TrxID format alone.** A well-formed string is not a payment.

### Exit criteria

- [ ] A Free-tier tenant is blocked at booking 51 and at staff member 3, with a working upgrade path.
- [ ] A deposit booking stays `pending`, holds its slot, and confirms only after a named user verifies the TrxID.
- [ ] An unverified deposit booking releases the slot after the configured window.
- [ ] A duplicate TrxID is rejected by a database constraint.
- [ ] Every verification appears in the audit trail with the acting user.
- [ ] An expired subscription downgrades automatically and suspends rather than deletes the over-limit staff.
- [ ] Upgrade and downgrade recalculate limits immediately.

---

## 11. Phase 9 — Waitlist, analytics, multi-branch & Super Admin (1 week)

- **M-09 — waitlist automation.** `waitlist_entries` exists with a `notified` status but no logic anywhere. Build: join from the full-day state in Phase 3; on cancellation, find matching `waiting` entries for that date and service, notify FIFO with a short-lived claim link, mark `notified`, expire after N hours, then move to the next. Guard against notifying 50 people for one slot.
- **Analytics** (`GET /api/v1/admin/analytics/summary`): total bookings, completion rate, no-show percentage, peak-hours heatmap, staff utilisation, repeat-customer rate, estimated vs collected revenue, per-branch comparison. Move to materialised views refreshed hourly if the queries get heavy.
- **Multi-branch**: branch-scoped dashboards, cross-branch roll-up for owners, per-branch working hours.
- **Custom domain** (Enterprise): a domains table, verification, the Vercel domains API, and middleware resolving host → tenant. The *tenant* buys their own domain, so this costs the platform nothing; the platform's own URL stays a free `*.vercel.app` subdomain until a domain is worth ~$10/yr to you.
- **Super Admin console** (`/superadmin`, gated by `platform_admins`): tenant directory with booking counts and plans, plan and tier editor, SMS gateway usage, MRR, suspend/activate, and impersonation with an audit trail for support.

### Exit criteria

- [ ] Cancelling a booking notifies exactly one waitlisted customer, who can then claim the slot.
- [ ] Analytics figures reconcile with direct SQL counts on the seed data.
- [ ] A custom domain serves a tenant's portal over HTTPS.
- [ ] Super Admin can suspend a tenant, and that tenant's portal immediately stops accepting bookings.

---

## 12. Phase 10 — Hardening, QA & launch (1 week)

- **Load test** (k6): 200 concurrent slot queries plus 50 concurrent bookings on one tenant; 10,000 bookings/day across 50 tenants. Watch for GIST contention and slot-query latency.
- **Security review**: re-run the RLS matrix; verify the service-role key never reaches a client bundle; rate-limit every public endpoint; token brute-force check; OWASP pass on the public portal; confirm the B-05 and B-09 fixes are still in place.
- **Data**: verify the Phase 1 `pg_dump` job is still running and still restorable (PITR is a paid feature, so this job *is* the backup strategy), plus a written retention and deletion policy for customer PII (medical-adjacent data raises the stakes).
- **Observability**: Sentry free tier (5k errors/month, already inert without a DSN), a GitHub Actions cron uptime check, and alerts on queue depth, failed-notification rate, worker lag and deposit-verification backlog.
- **Free-tier headroom review**: current DB size against 500 MB, monthly egress against 5 GB, email sends against 3,000/month, Vercel bandwidth against 100 GB. Record the numbers so the first tenant growth spurt is a planned conversation and not an outage.
- **Docs**: `API.md`, `SCHEMA.md`, `RUNBOOK.md` (gateway outage, stuck queue, restore), a tenant onboarding guide, and a support playbook.
- **UAT**: three pilot businesses across three industries for one full week.
- **Launch**: staged rollout, pricing page, Terms and Privacy, support channel.

### Exit criteria

- [ ] Load targets met with p95 slot query under 300 ms.
- [ ] Zero critical or high findings open.
- [ ] A restore from backup rehearsed successfully.
- [ ] Three pilot businesses signed off.

---

## 13. Spec defects register

Found while reading the spec's SQL in Part II. **B** = blocker (fix before that phase's exit test), **M** = should fix, **N** = note.

| ID | Sev | Issue | Fix in |
|---|---|---|---|
| B-03 | Blocker | Buffers drive slot display but are absent from `slot_range` and the GIST constraint, so the DB permits buffer violations under concurrency | Phase 1 |
| B-05 | Blocker | Public RLS on `businesses` / `staff_resources` exposes `sms_balance`, `booking_rules`, and staff phone + email to anonymous users | Phase 1 |
| B-06 | Blocker | `create_booking_atomic` is anon-callable and validates nothing: closed days, staff leave, wrong staff-service pairing, 400-days-out, plan quota, abuse | Phase 2 |
| B-09 | Blocker | `SECURITY DEFINER` functions lack `SET search_path` → privilege-escalation risk | Phase 1 |
| B-11 | Blocker | `cancel_booking_by_token` appears in the API table but no SQL exists for it | Phase 2 |
| B-14 | Blocker | The UI offers "Any Available" staff; no RPC supports it | Phase 2 |
| B-15 | Blocker | 4-hex booking codes collide against a UNIQUE constraint with no retry → 500 to the customer | Phase 1 |
| B-16 | Blocker | Worker query lacks `FOR UPDATE SKIP LOCKED` → duplicate SMS on overlapping cron ticks | Phase 5 |
| B-18 | Blocker | Reschedule cancels all reminders and never re-queues 24h/1h, contradicting §1.4B | Phase 2 |
| B-19 | Blocker | `reschedule_booking_by_token` validates only GIST overlap, not availability | Phase 2 |
| B-20 | Blocker | `'Asia/Dhaka'` hardcoded in RPC message formatting despite `businesses.timezone` existing | Phase 2 |
| B-21 | Blocker | No write policy on `business_members` → an owner cannot invite staff | Phase 1 |
| B-22 | Blocker | Super Admin role specified but no table, function or policy path exists | Phase 1 |
| B-23 | Blocker | `bookings FOR ALL USING (is_business_member(...))` contradicts the spec's own "staff = own schedule only" | Phase 1 shape, Phase 7 full |
| B-24 | Blocker | No payments / invoices / top-up tables although deposits and tiers are sold | Phase 1 DDL, Phase 8 logic |
| B-25 | Blocker | `subscription_plans` never gets RLS enabled → exposed wholesale via PostgREST | Phase 1 |
| M-01 | Med | `get_available_slots` ignores `staff_services` → bookable for services staff don't perform | Phase 2 |
| M-02 | Med | `booking_rules.max_advance_days` and `auto_confirm` defined but never enforced | Phase 2 |
| M-03 | Med | No minimum lead time; a slot 60 seconds away is bookable | Phase 2 |
| M-04 | Med | `reschedule_count` tracked, never limited | Phase 2 |
| M-05 | Med | O(slots × bookings) nested `NOT EXISTS` inside the slot loop | Phase 2 |
| M-06 | Med | `updated_at` columns with no trigger to maintain them | Phase 1 |
| M-07 | Med | `customers.no_show_count` is never written | Phase 4 |
| M-08 | Med | `sms_balance` / `monthly_sms_quota` are never debited — now moot, there is no SMS channel (§1.5). The real cap to track is platform-wide email against Resend's 3,000/month | Phase 5 |
| M-09 | Med | Waitlist table with no automation, trigger or notify path | Phase 9 |
| M-10 | Med | Daily digests described in prose only; no function defined | Phase 5 |
| M-11 | Med | Reschedule token is not rotated, so forwarded links stay live | Phase 6 |
| M-12 | Med | No status-transition guard; any status can jump to any other | Phase 2 |
| M-13 | Med | Calendar cannot grey out closed days — no month-availability endpoint | Phase 3 |
| M-14 | Med | Staff leave "requests" have no approval state on `availability_overrides` | Phase 7 |
| M-15 | Med | `availability_overrides` doesn't validate custom times when `is_closed = false` | Phase 1 |
| N-01 | Note | `availability_rules` policy `FOR SELECT USING (TRUE)` publishes every tenant's schedule | Phase 1 |
| N-02 | Note | Guest OTP is mentioned but never specified (provider, expiry, attempt limits) | Phase 3 |
| N-03 | Note | Push listed as a notification channel with no implementation path — now promoted to a primary channel, since VAPID web push is the only free option with no ceiling | Phase 5 |
| N-04 | Note | Spec says "paste into the SQL Editor"; use versioned migrations instead | Phase 0 |

---

## 14. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Slot-engine correctness bugs reach production | Double-booked patients; trust destroyed on day one | Phase 2 concurrency suite in CI; GIST as the final backstop; property tests |
| **No SMS channel at all** (§1.5) | Customers who gave only a phone number get no reminder; the spec's core no-show promise is weakened | `.ics` calendar invite as the primary free reminder; encouraged email; web push opt-in; adapter seam ready for a tenant-funded gateway. Say this plainly during tenant onboarding |
| Email provider ceiling — 3,000/month across **all** tenants | Reminders silently stop as tenants are added | Track platform-wide monthly sends; alert at 80%; degrade to push + calendar rather than failing silently; a second free provider (Brevo) is a config change |
| Free Supabase project pauses after 7 days idle | Outage a tenant discovers before you do | Keep-alive workflow from Phase 1, not Phase 10 |
| No automated backups on the free tier | Unrecoverable loss of appointment history | Scheduled encrypted `pg_dump` from Phase 1; restore rehearsed before launch |
| 500 MB database ceiling | Writes fail once reached | `notification_logs` retention job built in Phase 5; headroom reviewed in Phase 10 |
| Timezone or DST handling | Wrong appointment times | Store `timestamptz` only; one timezone helper; test a non-Dhaka tenant from Phase 2 |
| RLS misconfiguration | Cross-tenant data leak, medical PII | RLS tests in CI; safe views for all public reads; quarterly policy review |
| Manual deposit verification | Employee theft, duplicate TrxIDs, wrong amounts accepted | Unique TrxID constraint per tenant; verification audited to a named user; expected vs claimed amount shown at the desk |
| Scope creep across 5 portals | Timeline slip | Hard MVP gate at Phase 4; Phases 7–9 are post-revenue |
| Spec SQL copied as-is | Ships every blocker in §13 | Treat §13 as a checklist, not reading material |

---

## 15. Immediate next actions

1. `git init` and scaffold Phase 0.
2. Create the dev Supabase project and write `0001_extensions.sql` through `0007_bookings.sql` **with the B-03, B-15, B-22, B-24 and M-15 corrections applied**.
3. Write the RLS test suite *before* writing the RLS policies.
4. Build `get_available_slots` and `create_booking_atomic` with every gate from §4.2, plus the concurrency suite, before any UI work begins.
