# Booking Management

Multi-tenant SaaS booking and appointment platform for appointment-based businesses — clinics, dental practices, salons, spas, consultants and workshops. Each business gets a Business ID, a branded public booking portal, staff schedules, conflict-free slot booking, automated reminders and one-click booking exports.

**Status: Phase 0 complete — scaffold only.** No schema, no booking flow yet. See [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) for the 11-phase build order and the exit criteria for each phase.

**Runs entirely on free tiers.** No paid service, and nothing that needs a card on file. [docs/FREE_STACK.md](docs/FREE_STACK.md) is the authority on what that permits; it is also why there is no SMS channel.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS 4, shadcn/ui (Base UI primitives) |
| Backend | Supabase free — PostgreSQL 17, Auth, Row-Level Security, Edge Functions, Realtime |
| Scheduler | `pg_cron` + Edge Functions |
| Notifications | Email (Resend/Brevo), web push (VAPID), Telegram, `.ics` calendar invites |
| Testing | Vitest (unit), Playwright (E2E), psql (RLS & concurrency) |
| Hosting | Netlify free + Supabase free, GitHub Actions CI |

Deliberate deviations from the source spec's recommended stack are recorded in [docs/DECISIONS.md](docs/DECISIONS.md) — the significant ones being Next 16 instead of 15, and dropping SMS, WhatsApp and the payment gateways on cost grounds.

## Getting started

```bash
npm install
cp .env.example .env.local
```

Start the local database (requires Docker Desktop running):

```bash
npm run db:start
```

That prints an API URL, anon key and service-role key — paste them into `.env.local`. Then:

```bash
npm run dev
```

The app serves at http://localhost:3000, with a liveness probe at `/api/v1/health`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run verify` | Format, lint, typecheck and unit tests — run before pushing |
| `npm test` | Unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:db` | RLS and concurrency assertions via psql |
| `npm run db:reset` | Rebuild the local schema from migrations + seed |
| `npm run db:types` | Regenerate `lib/supabase/types.ts` — run after every migration |

## Layout

```
app/(public)/book/[slug]      Customer booking portal          Phase 3
app/(public)/manage/[token]   Self-service reschedule/cancel   Phase 6
app/(app)/app                 Admin & receptionist dashboard   Phase 4
app/(app)/staff               Staff queue                      Phase 7
app/(app)/superadmin          SaaS owner console               Phase 9
app/api/v1                    REST API (spec Part III)
lib/supabase                  server.ts (RLS) · client.ts · admin.ts (service-role)
lib/api                       Response envelope, error codes, handler wrapper
supabase/migrations           Forward-only schema. The source of truth.
tests/{unit,e2e,db}           Vitest · Playwright · psql
```

## Three rules worth knowing before you commit

**No service enters the project without an entry in [docs/FREE_STACK.md](docs/FREE_STACK.md).** Its table records the real limit and the behaviour at that limit. A service that needs a card to start is not free, it is a bill with a delay — and "free for personal use" is a licence restriction, not a discount, which is why this project is not on Vercel.


**Schema changes go in `supabase/migrations/`, never the hosted SQL Editor.** CI rebuilds the database from zero on every pull request; a schema you cannot rebuild is a schema you cannot test.

**`lib/supabase/admin.ts` bypasses Row-Level Security.** RLS is the only thing separating one clinic's patient records from another's. Use `lib/supabase/server.ts` unless you are writing tenant signup, the notification worker, a payment webhook or the Super Admin console — and when you do use the admin client, scope every query by `business_id` yourself.
