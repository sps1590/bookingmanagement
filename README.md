# Booking Management

Multi-tenant SaaS booking and appointment platform for appointment-based businesses — clinics, dental practices, salons, spas, consultants and workshops. Each business gets a Business ID, a branded public booking portal, staff schedules, conflict-free slot booking, automated reminders and one-click booking exports.

**Status: Phase 1 complete.** The schema, Row-Level Security, tenant signup and the onboarding wizard are in. A business can be created through the UI and its public page resolves; choosing a time and booking it is Phase 3. See [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) for the 11-phase build order and each phase's exit criteria.

**Runs on free tiers, with one asterisk.** Everything is free today; Vercel's Hobby tier is licensed for non-commercial use, so the first paying tenant means $20/month for Pro. [docs/FREE_STACK.md](docs/FREE_STACK.md) is the authority on every service, its real limit, and what happens when you reach it — it is also why there is no SMS channel.

New here? [docs/USER_GUIDE.md](docs/USER_GUIDE.md) is for people running a business on it. [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) is for people working on it.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS 4, shadcn/ui (Base UI primitives) |
| Backend | Supabase free — PostgreSQL 17, Auth, Row-Level Security, Edge Functions, Realtime |
| Scheduler | `pg_cron` inside Supabase |
| Notifications | Email (Resend/Brevo), web push (VAPID), Telegram, `.ics` calendar invites |
| Testing | Vitest (unit), Playwright (E2E), SQL assertions over `pg` (RLS & concurrency) |
| Hosting | Vercel + Supabase, GitHub Actions CI |

No Docker anywhere in the workflow. Deliberate deviations from the source spec are recorded in [docs/DECISIONS.md](docs/DECISIONS.md) — the significant ones being Next 16 instead of 15, dropping SMS, WhatsApp and the payment gateways on cost grounds, and narrowing the Super Admin role so it cannot read patient data through an ambient session.

## Getting started

You need a free Supabase project. Nothing is installed locally beyond Node 24.

```powershell
npm install
```

```powershell
Copy-Item .env.example .env.local
```

Fill in four values from your Supabase dashboard — the project URL and anon key from **Project Settings → API**, the service-role key from the same page, and the direct connection string from **Project Settings → Database → Connection string → URI**. Then apply the schema:

```powershell
npm run db:push
```

```powershell
npm run dev
```

Open http://localhost:3000/signup and create a business. That walks the real signup path — `register_business`, the terminology registry, the slug generator and the publish gate — which is better test data than any fixture, and is why no demo tenant is seeded.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run verify` | Format, lint, typecheck and unit tests — run before pushing |
| `npm test` | Unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:db` | RLS and integrity assertions against `SUPABASE_DB_URL` |
| `npm run test:db -- --fresh` | Build the schema from zero, then assert — what CI does |
| `npm run db:push` | Apply pending migrations |
| `npm run db:types` | Regenerate `lib/supabase/types.ts` — run after every migration |

## Layout

```
app/(auth)/signup             Tenant signup                    Phase 1
app/(app)/app/onboarding      Five-step setup wizard           Phase 1
app/(public)/book/[slug]      Customer booking portal          Phase 3
app/(public)/manage/[token]   Self-service reschedule/cancel   Phase 6
app/(app)/app                 Admin & receptionist dashboard   Phase 4
app/(app)/staff               Staff queue                      Phase 7
app/(app)/superadmin          SaaS owner console               Phase 9
app/api/v1                    REST API (spec Part III)
lib/supabase                  server.ts (RLS) · client.ts · admin.ts (service-role)
lib/api                       Response envelope, error codes, handler wrapper
lib/terminology               Industry label registry — no noun is hardcoded
supabase/migrations           Forward-only schema. The source of truth.
scripts/sql/supabase-shim.sql Lets the schema build on a plain Postgres, for CI
tests/{unit,e2e,db}           Vitest · Playwright · SQL assertions
```

## Four rules worth knowing before you commit

**No service enters the project without an entry in [docs/FREE_STACK.md](docs/FREE_STACK.md).** Its table records the real limit and the behaviour at that limit. A service that needs a card to start is not free, it is a bill with a delay — and check the licence as well as the price, which is the whole story behind Vercel Hobby.

**Schema changes go in `supabase/migrations/`, never the hosted SQL Editor.** CI rebuilds the database from zero on every pull request; a schema you cannot rebuild is a schema you cannot test.

**`lib/supabase/admin.ts` bypasses Row-Level Security.** RLS is the only thing separating one clinic's patient records from another's. Use `lib/supabase/server.ts` unless you are writing tenant signup, the notification worker, a payment webhook or the Super Admin console — and when you do use the admin client, scope every query by `business_id` yourself.

**RLS filters rows, never columns.** This is the single most expensive thing to forget here, and it is how the source spec came to publish every staff member's personal phone number to anonymous visitors. Anything the public needs gets a curated view with an explicit column list — see `supabase/migrations/0014_public_views.sql`.
