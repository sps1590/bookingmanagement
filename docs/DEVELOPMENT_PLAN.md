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

### Mapping to the spec's own roadmap

| Spec roadmap | This plan |
|---|---|
| Phase 1: Core MVP (Weeks 1–4) | Phases 0 → 4 |
| Phase 2: Automation & Exports (Weeks 5–7) | Phases 5 → 6 |
| Phase 3: Monetization & Scale (Weeks 8–10) | Phases 7 → 9 |
| *(not in spec)* | Phase 10: Hardening & launch |

Total: **11–12 weeks** for one full-time developer. The spec's 10 weeks is achievable only if you drop the staff portal (Phase 7) or payments (Phase 8.3).

---

## 1. Phase summary

| # | Phase | Length | Ships |
|---|---|---|---|
| 0 | Foundations & environment | 3 days | Deployed empty app, CI green, Supabase linked |
| 1 | Database core & multi-tenancy | 1 week | Migrations, RLS, tenant signup, onboarding wizard |
| 2 | Scheduling engine | 1 week | Hardened slot RPCs, zero double-booking under load |
| 3 | Public booking portal | 1 week | A stranger can book online end-to-end |
| 4 | Admin dashboard & booking ops | 1 week | Reception desk runs a real day on it — **MVP** |
| 5 | Notification & reminder engine | 1.5 weeks | SMS/WhatsApp/Email queue, 24h + 1h reminders |
| 6 | Self-service manage & exports | 1 week | Token reschedule/cancel, XLSX/CSV/PDF, daily digest |
| 7 | Staff portal & RBAC hardening | 1 week | Staff sees only own queue; role policies proven |
| 8 | Monetization: plans, quotas, payments | 1.5 weeks | Plan limits enforced, deposits via bKash/SSLCommerz/Stripe |
| 9 | Waitlist, analytics, multi-branch, domains | 1 week | Scale features + Super Admin console |
| 10 | Hardening, QA & launch | 1 week | Load-tested, security-reviewed, monitored, live |

---

## 2. Phase 0 — Foundations & environment (3 days)

**Goal:** an empty but *deployed* app with CI, so that from Phase 1 onward every commit is verifiable in a real environment.

### Tasks

- `git init`; `main` + branch protection; Conventional Commits.
- `create-next-app` — Next.js 15 App Router, TypeScript strict, Tailwind, Shadcn/UI, ESLint + Prettier.
- Three Supabase projects: `dev`, `staging`, `prod`. Install Supabase CLI; `supabase init`; `supabase link`.
- Decide migration discipline now: **all schema lives in `supabase/migrations/*.sql`**, never hand-typed in the SQL Editor. (The spec says "paste into the SQL Editor" — don't. You will need repeatable deploys and a rollback story.)
- Typed DB client: `supabase gen types typescript` wired to an `npm run db:types` script.
- Testing harness: Vitest (unit), Playwright (E2E), pgTAP or plain SQL assertion scripts (database).
- GitHub Actions: lint → typecheck → unit → `supabase db reset` on an ephemeral Postgres → pgTAP → Playwright → deploy preview to Vercel.
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
SMS_PROVIDER / SMS_API_KEY / SMS_SENDER_ID
WHATSAPP_PHONE_ID / WHATSAPP_TOKEN
RESEND_API_KEY / MAIL_FROM
SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASS
BKASH_APP_KEY / BKASH_APP_SECRET / BKASH_USERNAME / BKASH_PASSWORD
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
CRON_SECRET                      # shared secret for Edge Function invocation
```

### Exit criteria

- [x] Scaffold builds clean: `npm run build` from an empty `.next`, 0 npm audit findings.
- [x] CI defined with all five stages (`.github/workflows/ci.yml`).
- [x] Unit harness green (Vitest, 9 tests) and E2E green (Playwright, 4 tests across desktop + mobile).
- [x] Generated DB types placeholder imports cleanly; `npm run db:types` wired.
- [ ] **Blocked — needs Docker Desktop:** `supabase db reset` runs the migration chain + seed from scratch. Cannot be verified on this machine; `docker` is not installed. Install Docker Desktop before starting Phase 1, then run `npm run db:start && npm run db:reset`. The CI `database` job covers this on GitHub runners.
- [ ] **Needs accounts:** `main` deploys automatically to a Vercel URL. Requires connecting the repo to Vercel and creating the dev/staging/prod Supabase projects.

Decisions taken during Phase 0 — including the move to Next 16 — are recorded in [DECISIONS.md](DECISIONS.md).

---

## 3. Phase 1 — Database core & multi-tenancy (1 week)

**Goal:** the 14-table schema exists as migrations, RLS genuinely isolates tenants (proven by tests, not by inspection), and a new business can sign up and complete onboarding.

### 3.1 Schema migrations

Port spec SQL Block 1 into numbered migrations, **with the corrections below applied**:

| Migration | Contents |
|---|---|
| `0001_extensions` | `uuid-ossp`, `btree_gist`, `pgcrypto`, `citext` |
| `0002_plans` | `subscription_plans` + seed free/pro/enterprise |
| `0003_tenancy` | `businesses`, `business_members`, `branches`, `platform_admins` *(new — B-22)* |
| `0004_catalog` | `services`, `staff_resources`, `staff_services` |
| `0005_availability` | `availability_rules`, `availability_overrides` |
| `0006_crm` | `customers` |
| `0007_bookings` | `bookings` + `booking_history` + GIST exclusion |
| `0008_waitlist` | `waitlist_entries` |
| `0009_notifications` | `notification_templates`, `notification_logs` |
| `0010_payments` | `payments`, `subscription_invoices`, `sms_topups` *(new — B-24)* |
| `0011_indexes` | all performance indexes |
| `0012_triggers` | `updated_at` triggers *(M-06)*, booking-code sequence *(B-15)* |

Required changes to the spec's DDL:

- **B-03 — buffers are not enforced by the database.** The spec computes free slots using `buffer_before/after_minutes`, but stores `slot_range = tstzrange(start_time, end_time)` and puts the GIST exclusion on *that*. Two concurrent requests can therefore land back-to-back and silently violate the sterilisation/cleanup gap. Fix: persist the buffers on the booking row and exclude on the blocked range.

```sql
buffer_before_minutes INT NOT NULL DEFAULT 0,
buffer_after_minutes  INT NOT NULL DEFAULT 0,
blocked_range TSTZRANGE GENERATED ALWAYS AS (
  tstzrange(start_time - make_interval(mins => buffer_before_minutes),
            end_time   + make_interval(mins => buffer_after_minutes), '[)')
) STORED,
CONSTRAINT prevent_double_booking EXCLUDE USING GIST (
  business_id WITH =, staff_id WITH =, blocked_range WITH &&
) WHERE (status IN ('pending','confirmed','checked_in'))
```

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

### 3.4 Database tests (the point of this phase)

Write these in `tests/db/` and run them in CI:

- Tenant A's JWT selects 0 rows from Tenant B's `bookings`, `customers`, `notification_logs`.
- The `anon` role selects 0 rows from `customers`, `bookings`, `notification_logs`, `business_members`.
- Anonymous SELECT on staff data returns **no phone or email column** (regression test for B-05).
- A `staff` role cannot UPDATE another staff member's booking.
- A non-member cannot UPDATE `businesses`.
- A `platform_admins` member can read across tenants.

### Exit criteria

- [ ] `supabase db reset` builds all tables, policies and seeds cleanly from scratch.
- [ ] Every RLS test above passes, and CI fails if any regresses.
- [ ] A real signup through the UI produces a `BIZ-1042`-style code, a unique slug, a default branch, industry labels and seeded templates.
- [ ] The onboarding wizard completes and the public URL resolves (even if the page is still bare).

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

- [ ] All five concurrency tests pass repeatedly (run 10×).
- [ ] Every gate in 4.2 has a failing-case test.
- [ ] `get_available_slots` under 150 ms on a full day with 40 existing bookings.
- [ ] A second tenant on `America/New_York` produces correct slots and correctly formatted message times.

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
- **M-08 — SMS credits are never debited.** `businesses.sms_balance` and `subscription_plans.monthly_sms_quota` exist and are sold in the plan table, but nothing decrements them. Debit atomically on a successful send; skip and log when the balance is zero; alert the owner below a threshold.

### 7.2 Channel adapters

`lib/notify/` — one interface, four implementations: SMS (SSL Wireless / BulkSMSBD / MimSMS, provider-switchable per environment), WhatsApp (Meta Cloud API with pre-approved templates), Email (Resend or Postmark), Push (**N-03:** listed as a channel in the spec with no implementation path — defer, and say so on the roadmap). Each returns a normalised `{ ok, providerId, raw }` stored in `provider_response`.

### 7.3 Templates and scheduling

- Merge-tag renderer: `{{customer_name}}`, `{{booking_code}}`, `{{date}}`, `{{time}}`, `{{service}}`, `{{staff}}`, `{{branch}}`, `{{manage_url}}`, `{{business_name}}`. Render in the **business timezone** (B-20) and support Bangla templates.
- `queue_booking_notifications(booking_id)` — the single source of truth for confirmation plus 24h and 1h reminders, honouring `notification_templates.is_enabled` and the per-channel toggles. Called by create, self-reschedule (B-18) and admin reschedule.
- **M-10 — the digests exist only in prose.** Write them: staff morning digest (08:00 business-local) and owner nightly summary (21:00), as two more `pg_cron` jobs over a `daily-digest` Edge Function.
- Settings UI (`/app/settings/notifications`) — channel toggles, template editor with live preview and a merge-tag picker, reminder timing, and a delivery log viewer with status filters and manual retry.

### Exit criteria

- [ ] Booking → confirmation SMS in the customer's hands within 60 seconds (real gateway, staging number).
- [ ] Two deliberately overlapping worker runs send each message exactly once.
- [ ] A reschedule cancels the old reminders *and* queues new 24h/1h ones at the right times (regression for B-18).
- [ ] A simulated gateway outage retries with backoff and settles; nothing is lost.
- [ ] A zero-balance tenant: the send is skipped, logged and the owner alerted; the balance never goes negative.

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

### 10.1 Plan enforcement

A shared layer that reads the tenant's plan and enforces `max_branches`, `max_staff`, `max_monthly_bookings`, `monthly_sms_quota` and the `features` JSONB (`exports`, `whatsapp`, `custom_domain`). Enforce **server-side in the RPC and in the API route** — never only by hiding a button. Over-limit responses return `PLAN_LIMIT_REACHED` with an upgrade CTA. Add a `plan_usage` view for the dashboard meter.

### 10.2 Subscription billing

`subscription_invoices`, a monthly cron to generate them, payment capture, a grace period, and a documented downgrade behaviour — decide explicitly what happens to staff 11–15 when a Pro plan lapses, because the spec does not say. Plus SMS credit top-up packs writing to `sms_topups`.

### 10.3 Booking deposits

- Per-business toggle plus per-service `deposit_required`.
- Adapters behind one `PaymentGateway` interface: **SSLCommerz** and **bKash** (local) and **Stripe** (global).
- Flow: create the booking as `pending` → redirect to gateway → webhook confirms → status `confirmed` and `payment_status` updated → `queue_booking_notifications`. A `pending` booking holds the slot (the GIST predicate already includes `pending`) and expires through a sweep job after 15 minutes.
- Webhooks: signature-verified, idempotent by provider reference, logged to `payments`. Never trust a client-side success redirect.
- Refunds on cancellation, per the tenant's stated policy.

### Exit criteria

- [ ] A Free-tier tenant is blocked at booking 51 and at staff member 3, with a working upgrade path.
- [ ] Sandbox payments succeed on all three gateways and the webhook confirms the booking.
- [ ] An abandoned payment releases the slot within 15 minutes.
- [ ] Replaying a webhook does not double-credit.
- [ ] Upgrade and downgrade recalculate limits immediately.

---

## 11. Phase 9 — Waitlist, analytics, multi-branch & Super Admin (1 week)

- **M-09 — waitlist automation.** `waitlist_entries` exists with a `notified` status but no logic anywhere. Build: join from the full-day state in Phase 3; on cancellation, find matching `waiting` entries for that date and service, notify FIFO with a short-lived claim link, mark `notified`, expire after N hours, then move to the next. Guard against notifying 50 people for one slot.
- **Analytics** (`GET /api/v1/admin/analytics/summary`): total bookings, completion rate, no-show percentage, peak-hours heatmap, staff utilisation, repeat-customer rate, estimated vs collected revenue, per-branch comparison. Move to materialised views refreshed hourly if the queries get heavy.
- **Multi-branch**: branch-scoped dashboards, cross-branch roll-up for owners, per-branch working hours.
- **Custom domain** (Enterprise): a domains table, verification, the Vercel domain API, and middleware resolving host → tenant.
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
- **Data**: PITR enabled, a restore rehearsed, and a written retention and deletion policy for customer PII (medical-adjacent data raises the stakes).
- **Observability**: Sentry, uptime checks, and alerts on queue depth, failed-notification rate, worker lag and payment webhook failures.
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
| M-08 | Med | `sms_balance` / `monthly_sms_quota` are never debited | Phase 5 |
| M-09 | Med | Waitlist table with no automation, trigger or notify path | Phase 9 |
| M-10 | Med | Daily digests described in prose only; no function defined | Phase 5 |
| M-11 | Med | Reschedule token is not rotated, so forwarded links stay live | Phase 6 |
| M-12 | Med | No status-transition guard; any status can jump to any other | Phase 2 |
| M-13 | Med | Calendar cannot grey out closed days — no month-availability endpoint | Phase 3 |
| M-14 | Med | Staff leave "requests" have no approval state on `availability_overrides` | Phase 7 |
| M-15 | Med | `availability_overrides` doesn't validate custom times when `is_closed = false` | Phase 1 |
| N-01 | Note | `availability_rules` policy `FOR SELECT USING (TRUE)` publishes every tenant's schedule | Phase 1 |
| N-02 | Note | Guest OTP is mentioned but never specified (provider, expiry, attempt limits) | Phase 3 |
| N-03 | Note | Push listed as a notification channel with no implementation path | Deferred |
| N-04 | Note | Spec says "paste into the SQL Editor"; use versioned migrations instead | Phase 0 |

---

## 14. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Slot-engine correctness bugs reach production | Double-booked patients; trust destroyed on day one | Phase 2 concurrency suite in CI; GIST as the final backstop; property tests |
| SMS gateway unreliability in Bangladesh | Missed reminders, no-shows, angry tenants | Multi-provider adapter with failover; backoff; delivery logs visible to owners |
| Timezone or DST handling | Wrong appointment times | Store `timestamptz` only; one timezone helper; test a non-Dhaka tenant from Phase 2 |
| RLS misconfiguration | Cross-tenant data leak, medical PII | RLS tests in CI; safe views for all public reads; quarterly policy review |
| Payment webhook gaps | Lost revenue, stuck bookings | Idempotency keys; reconciliation job; sweep for abandoned `pending` |
| Scope creep across 5 portals | Timeline slip | Hard MVP gate at Phase 4; Phases 7–9 are post-revenue |
| Spec SQL copied as-is | Ships every blocker in §13 | Treat §13 as a checklist, not reading material |

---

## 15. Immediate next actions

1. `git init` and scaffold Phase 0.
2. Create the dev Supabase project and write `0001_extensions.sql` through `0007_bookings.sql` **with the B-03, B-15, B-22, B-24 and M-15 corrections applied**.
3. Write the RLS test suite *before* writing the RLS policies.
4. Build `get_available_slots` and `create_booking_atomic` with every gate from §4.2, plus the concurrency suite, before any UI work begins.
