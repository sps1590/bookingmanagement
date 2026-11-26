# Decision log

Choices that depart from the source spec, or that later phases should not quietly reverse. Newest last.

---

## D-001 — Next.js 16 instead of the spec's Next.js 15

**Date:** 2026-11-24 (Phase 0)
**Status:** Accepted

The spec's recommended stack names "Next.js 15 (App Router)". Scaffolding on 15 installed `next@15.5.29`, which npm resolves from the `backport` dist-tag — 15 is in maintenance — and whose bundled `postcss` carries four advisories, one high severity (`GHSA-qx2v-qp2m-jg93` plus three source-map path-traversal issues). `npm audit fix` resolves them only by upgrading to 16.

The practical exposure was low: those advisories bite when PostCSS processes untrusted CSS, and this app processes its own. But leaving them in place meant either no `npm audit` gate in CI or a permanent exception to one, and a platform handling patient appointment data should be able to run a clean audit.

Day one of a greenfield repo is the cheapest moment to pick a major version. Chose `next@16.4.6` (latest stable) with React 19.1 and Tailwind 4; audit is clean.

**Consequence:** later phases must check Next 16 compatibility when adding FullCalendar (Phase 4) and `@react-pdf/renderer` (Phase 6). If either blocks, downgrading to the 15 backport line is still possible, at the cost of reinstating the audit exception.

---

## D-002 — shadcn/ui on Base UI, not Radix

**Date:** 2026-11-24 (Phase 0)
**Status:** Accepted (follows upstream)

The plan described shadcn/ui as "built on Radix UI + Tailwind". The current shadcn CLI defaults to the `base-nova` style, which generates components against `@base-ui/react` and a `cn` package rather than Radix primitives. This is upstream's current default, so it was accepted as-is rather than forced back to Radix.

**Consequence:** when copying component recipes from older shadcn documentation or blog posts, the imports will differ. Component APIs are close but not identical to Radix.

---

## D-003 — The `shadcn` package is a devDependency, not a runtime one

**Date:** 2026-11-24 (Phase 0)
**Status:** Accepted

`shadcn init` added `shadcn@4.23.0` to `dependencies`, putting a CLI into the runtime dependency tree and bringing a moderate `minimatch` DoS advisory with it (via `ts-morph`).

Removing it outright broke the build: `app/globals.css` contains `@import "shadcn/tailwind.css"`, and that file is a real 637-line Tailwind 4 layer — custom `data-*` variants, the `scroll-fade` and `shimmer` utilities, accordion keyframes — that the generated components rely on. Vendoring 637 lines of upstream CSS to avoid one moderate advisory is the worse trade.

Settled on `devDependencies`, which is accurate: it is consumed at build time and never bundled. CI's audit gate is `--audit-level=high`, so the moderate advisory does not mask a real one.

Add components with `npx shadcn@latest add <component>`.

`@base-ui/react`, `cn`, `class-variance-authority`, `lucide-react` and `tw-animate-css` are genuine runtime dependencies and stay in `dependencies`.

---

## D-004 — `@types/node` pinned to v24, not v20

**Date:** 2026-11-24 (Phase 0)
**Status:** Accepted

create-next-app pins `@types/node@^20`, which conflicts with Vitest 5's peer requirement of `^22 || >=24`. Since the project targets Node 24 (and CI runs 24), the v20 pin was simply wrong. Raised to `^24` rather than installing with `--legacy-peer-deps`, which would have left the type definitions describing a different runtime than the one executing the code.

---

## D-005 — Sentry is installed but inert without a DSN

**Date:** 2026-11-24 (Phase 0)
**Status:** Accepted

`instrumentation.ts` and `instrumentation-client.ts` initialize Sentry only when a DSN is present, so local development and CI stay quiet and the app has no hard dependency on a Sentry account existing. `next.config.ts` is deliberately **not** wrapped with `withSentryConfig` yet, because source-map upload needs `SENTRY_AUTH_TOKEN` in the build environment; Phase 10 turns that on.

Session Replay is disabled on purpose, and every `dataCollection` category is explicitly switched off. The public portal collects patient names, phone numbers and visit notes; an error reporter must not become a second, unaudited copy of that data.

Worth knowing: Sentry v11 **removed `sendDefaultPii`** in favour of a granular `dataCollection` object whose fields — `userInfo`, `cookies`, `httpHeaders`, `httpBodies`, `urlQueryParams`, `databaseQueryData`, `queues`, `stackFrameVariables` — all **default to `true`**. The old `sendDefaultPii: false` idiom is now a type error, and simply dropping it silently opts you into collecting request bodies and local variables. Both instrumentation files therefore set each category to `false`/`[]` explicitly. Before re-enabling any of them, check what it would capture from `POST /api/v1/public/:slug/bookings`.

---

## D-006 — Playwright runs on port 3100, not 3000

**Date:** 2026-11-24 (Phase 0)
**Status:** Accepted

Another project on this machine serves on 3000. When that happens Next silently shifts to the next free port while Playwright keeps polling the port it was told about, and the suite dies on a `webServer` timeout that reads like a product failure. The test port is pinned to 3100 (override with `PLAYWRIGHT_PORT`).

The readiness probe is `/api/v1/health` rather than `/`, because in dev Turbopack compiles routes on demand: a server already answering `/` can still 404 an API route, which failed the first E2E run for a reason unrelated to the code.

---

## D-007 — The platform must run entirely on free tiers

**Date:** 2026-11-24 (after Phase 0)
**Status:** Accepted — constraint, set by the project owner

No paid service, no trial that expires into a bill, and no tier whose terms forbid the use we intend. [FREE_STACK.md](FREE_STACK.md) is the authority and holds the full audit; D-008 through D-010 record the choices this forced.

This is a hard constraint, not a preference, so it outranks the source spec's recommended stack wherever the two disagree.

---

## D-008 — Netlify, not Vercel

**Date:** 2026-11-24
**Status:** ~~Accepted~~ **Superseded by D-013** — the project owner chose Vercel on
2026-11-24. The licensing analysis below still stands and is the reason D-013 carries a
cost warning; it was overruled on preference, not on facts.

The spec recommends Vercel. Vercel's free Hobby tier is **non-commercial use only** — a licence restriction, not a usage limit — and this platform is intended to charge tenants. Staying on Hobby would mean either breaching the terms or migrating a production Next.js app under revenue pressure, which is the worst possible moment to do it.

Chose Netlify's free tier: commercial use permitted, official Next.js runtime support, 100 GB bandwidth and 300 build minutes a month. Build minutes are the real ceiling (~100 deploys/month), not bandwidth.

Cloudflare Workers was the alternative and has more headroom, but Next.js there runs through the OpenNext adapter rather than first-party support. For a solo developer, lower risk beats more headroom.

---

## D-009 — No SMS, and no WhatsApp either

**Date:** 2026-11-24
**Status:** Accepted — owner's decision on SMS, extended to WhatsApp for consistency

SMS in Bangladesh has no free tier: SSL Wireless, BulkSMSBD and MimSMS all bill per message. The owner chose to drop SMS entirely rather than route it through a tenant-funded gateway.

**WhatsApp was dropped for the same reason, and this needs stating because the spec lists it as a free-looking alternative.** Meta's Cloud API only gives free *user-initiated* service conversations. An appointment reminder is business-initiated, which makes it a utility template, which is billed per message. It has the same cost property as SMS, so leaving it in would have left a paid dependency inside a plan that claims to be free.

Remaining channels, all genuinely free: **email** (Resend 3,000/month), **web push** (VAPID — no service, no account, no ceiling), **Telegram** (Bot API, unlimited, best for staff and owner digests), and **`.ics` calendar invites**.

**The consequence is real and should not be glossed over.** The spec's no-show-reduction promise assumes you can reach a customer who gave you nothing but a phone number. Without SMS you cannot. The strongest free substitute is the calendar invite — the customer's own calendar app then does the reminding, at no cost to us — which is why the `.ics` file is treated as a first-class Phase 5 deliverable with stable `UID`, incremented `SEQUENCE` and `VALARM` triggers, rather than as a nice-to-have link.

The `lib/notify/` adapter interface deliberately keeps the seam SMS would have used. Adding a tenant-funded gateway later is one new file and a config flag.

---

## D-010 — Manual payment verification instead of a gateway

**Date:** 2026-11-24
**Status:** Accepted

Stripe cannot receive payouts in Bangladesh. bKash and SSLCommerz merchant accounts require business registration plus setup and per-transaction fees. None is free.

Deposits and platform subscriptions therefore use manual transaction-ID verification: the customer pays to the tenant's own bKash/Nagad number and enters the TrxID; a receptionist verifies it against their statement and marks the booking paid. This is already how most small businesses in Bangladesh operate, so it reads as familiar rather than as a compromise.

Plan *enforcement* — staff caps, booking caps, feature flags — is still real code in Phase 8. Only the money movement is manual.

A manual flow loses guards an automated gateway gives for free, so Phase 8 must add them explicitly: a TrxID unique per tenant enforced by a constraint, verification audited to a named user, and expected-versus-claimed amounts shown side by side at the desk. Marking a booking paid is the one action in this product where a dishonest employee can steal money.

The `PaymentGateway` interface stays, so a real merchant account plugs in behind the same seam later.

---

## D-011 — `uuid-ossp` and `citext` are installed but unused

**Date:** 2026-11-25 (Phase 1)
**Status:** Accepted

The spec's extension list is `uuid-ossp`, `btree_gist`, `pgcrypto`. Supabase preinstalls the first and `citext` besides, so this is a choice not to *call* them rather than not to install them.

`gen_random_uuid()` has been in core Postgres since 13 and the project targets 17. Reaching into `uuid-ossp` for `uuid_generate_v4()` would mean every primary key default depends on an extension whose schema we do not control: Supabase keeps it in `extensions`, a plain Postgres puts it in `public`, and a column default that resolves at DDL time would then behave differently depending on who ran the migration.

`citext` was considered for `businesses.slug`, where case-insensitive uniqueness genuinely matters — `/book/Dhaka-Dental` and `/book/dhaka-dental` must not be two tenants. A CHECK constraining the slug to lowercase achieves the same thing with no type dependency, and makes the rule visible in the DDL. Email lookups use an expression index on `lower(email)` instead.

`btree_gist` is not optional: without it the `prevent_double_booking` exclusion constraint cannot be created at all, because plain GiST has no equality operator class for `uuid`.

---

## D-012 — The Super Admin role reads configuration, not patient data

**Date:** 2026-11-25 (Phase 1)
**Status:** Accepted — a deliberate narrowing of what defect B-22 prescribes

The defects register says Super Admin should be implemented by giving every RLS policy `OR is_platform_admin()`. That is not what shipped. The clause appears only on SELECT policies, and only for configuration tables: businesses, memberships, branches, services, staff, availability, plans, payments and invoices. It is absent from `customers`, `bookings`, `booking_history`, `waitlist_entries` and `notification_logs`.

The argument for the full version is that the platform operator holds the service-role key anyway, so restricting the JWT path is theatre. The argument against — which won — is that a leaked or hijacked operator *session* is a different threat from a leaked service key, and there is no reason for a support engineer checking which plan a tenant is on to carry an ambient, unlogged read of every clinic's patient list and clinical notes while they do it.

Support that genuinely needs patient data still has it, through the service-role console, where the access is an explicit act in code rather than a property of being signed in.

It is also read-only. `is_platform_admin()` never appears in a write policy, so a platform admin cannot rename a tenant or edit its catalogue through RLS. `tests/db/0006_platform_admin_scope.sql` asserts both halves, because the risk with a documented limit is that someone later "fixes" it by adding the clause everywhere.

---

## D-013 — Vercel, not Netlify

**Date:** 2026-11-25
**Status:** Accepted — the project owner's choice, superseding D-008

The owner wants to deploy on Vercel. That is their call, and the build now targets it: security headers moved into `next.config.ts` so they apply on any host, and nothing in the repository is host-specific.

**The cost consequence has to be stated plainly, because it contradicts D-007.** Vercel's free Hobby tier is licensed for **non-commercial use only**. That is a licence restriction rather than a usage cap, so it does not arrive as a warning or a throttle — the moment this platform charges a tenant, Hobby requires upgrading to Pro at $20/month. The zero-cost constraint therefore holds right up to the first paying customer, and not past it.

Two further Hobby limits matter for later phases, and are cheaper to know now than to discover in Phase 5:

- **Function duration is capped at 10 seconds.** The notification worker must stay under that or move into a Supabase Edge Function.
- **Vercel Cron on Hobby allows two jobs at daily granularity.** That cannot drive a one-hour-before reminder, so the reminder scheduler will be `pg_cron` inside Supabase rather than Vercel Cron.

Neither is a blocker. Both change what Phase 5 builds.

---

## D-014 — No Docker: hosted Supabase for development, plain Postgres for tests

**Date:** 2026-11-25
**Status:** Accepted — the project owner's constraint

The owner does not want Docker in the workflow. The Supabase CLI's local stack needs it, and so do `supabase db reset`, `supabase db diff` and `supabase gen types --local`. Those are gone.

What replaced them:

| Was | Needed Docker | Now |
|---|---|---|
| `supabase start` / `db reset` | yes | a hosted Supabase project; `npm run db:push` applies migrations over a direct connection |
| `supabase gen types --local` | yes | `npm run db:types`, which uses `--remote=<url>` |
| `psql -f tests/db/*.sql` | a Postgres client install | `npm run test:db`, which speaks the wire protocol through `pg` |
| "proves migrations apply from zero" | `db reset` | `npm run test:db -- --fresh`, which builds the schema from nothing |

The last row is the interesting one. `--fresh` applies `scripts/sql/supabase-shim.sql` and then every migration in order, so the from-zero guarantee survives the change. The shim supplies the only four things the schema needs from Supabase: an `auth` schema containing `auth.users`, `auth.uid()`, the three roles, and — easy to overlook — Supabase's open default grants on new tables in `public`.

That last one matters more than it looks. Migration 0015 exists precisely to *revoke* those grants. Had the shim not reproduced them, CI would be testing a database that started closed, and the test proving `anon` cannot read `customers` would pass for the wrong reason.

CI runs the suite against a `postgres:17` service container. That is Docker on GitHub's runner — free, invisible to the owner's machine, and not what the constraint was about.

One honest limitation: the shim is not Supabase, and it can drift. It is kept narrow and faithful on purpose (`auth.uid()` is a verbatim copy, fallback included), and the real check is that `npm run db:push` against the hosted project exercises the same migrations against the real thing.

---

## D-015 — Composite foreign keys on `(business_id, id)` throughout

**Date:** 2026-11-25 (Phase 1)
**Status:** Accepted — an addition, not in the spec

Every tenant-owned parent carries a redundant-looking `UNIQUE (business_id, id)`, and every child references it as a pair rather than referencing `id` alone.

The reason is a gap that is easy to miss: **Row-Level Security does not make a row coherent.** A booking with `business_id = A` and a `service_id` belonging to tenant B satisfies every policy, because the caller really is a member of A — nothing in RLS looks at whose service it is. The result is tenant B's service name and price on tenant A's invoice, from one mistyped identifier in application code.

Composite foreign keys make that unrepresentable rather than merely unlikely, which is a good trade for four unique indexes nobody queries. `tests/db/0009_tenant_integrity.sql` asserts it with the privileged role specifically so that RLS is not what is being measured.

The same reasoning produced the column-level UPDATE grant on `businesses`. A tenant admin legitimately administers their own row, so no policy can stop them setting their own `plan_id` to the enterprise tier — only a column privilege can.

---

## D-016 — New tables start with no grants

**Date:** 2026-11-25 (Phase 1)
**Status:** Accepted

Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated`, so a table created by a migration arrives world-granted with RLS as the only thing in the way. Migration 0015 reverses that default for tables created afterwards.

This is a fail-closed choice with a real cost: add a table in a later phase, forget the grants, and PostgREST returns "permission denied" until you write them. That is an afternoon of confusion. The alternative is a table readable by `anon` until somebody notices — and since RLS filters rows but never columns, "readable" means every column, which is exactly how defect B-05 published every staff member's personal phone number.

An afternoon of confusion is the cheaper failure. CONTRIBUTING.md says so where someone adding a table will read it, and `tests/db/0001_schema_invariants.sql` fails if `anon` ever gains a base-table grant.

---

## D-017 — `blocked_range` needs an immutable minute-shift helper

**Date:** 2026-11-25 (Phase 1)
**Status:** Accepted

The fix for defect B-03 is to put the double-booking exclusion constraint on a buffer-inclusive generated range. The obvious expression for that range does not compile:

```sql
blocked_range TSTZRANGE GENERATED ALWAYS AS (
  tstzrange(start_time - make_interval(mins => buffer_before_minutes), ...)
) STORED
-- ERROR: generation expression is not immutable
```

`timestamptz - interval` is STABLE, not IMMUTABLE, because an interval carrying months or days resolves differently depending on the session time zone. Postgres therefore refuses the whole DDL. The snippet in the plan's §13 was written this way and has been corrected there.

`shift_minutes(ts, mins)` narrows the operation to the case that genuinely is immutable: a whole number of minutes is a pure time offset with no calendar fields, so shifting an absolute instant by it gives the same answer in every zone and on both sides of a DST boundary. The `int` parameter is what keeps that true — there is no way to hand the function a month.

So the IMMUTABLE label is accurate rather than a convenient lie. That distinction matters: a wrongly-labelled immutable function in an index expression produces corrupt indexes that return wrong rows, which here would mean a booking the constraint cannot see.

---

## D-018 — No phone OTP; layered limits instead

**Date:** 2026-11-25 (Phase 3)
**Status:** Accepted

The plan asks for optional phone OTP before a public booking is inserted, and records defect N-02 against it: the spec names OTP and never says which provider, what expiry, or how many attempts.

It is not being built, and the reason is the same finding that removed SMS reminders in D-009 and D-010. Every route to a one-time code on a phone costs money — there is no free tier for business-initiated SMS in this product's market — so adding OTP means adding the first paid dependency to a stack whose entire premise is that there is not one. A tenant on the free plan would be offered a toggle that cannot be switched on.

What guards the public booking endpoint instead, in layers:

- **Per IP**, 10 bookings an hour. Stops one machine scripting the form.
- **Per phone number**, 5 an hour. Stops a distributed attempt converging on one number, and stops a frustrated customer double-submitting into four appointments.
- **Per customer**, `max_active_per_customer` (default 3) open future bookings, enforced inside `create_booking_atomic`. Stops one person holding a tenant's week.
- **Email confirmation**, which is weak proof of identity but is proof that someone reachable asked.

The counters live in Postgres (`rate_limit_hits`, migration 0021) rather than Redis or Vercel KV, because the free stack contains no durable key-value store and a limiter held in a serverless function's memory resets on every cold start.

What this does not stop: a determined person with many phone numbers and many IPs booking a clinic's whole week. The honest mitigation for that is `auto_confirm = false`, which the tenant already controls and which makes every booking a request someone approves. Revisit if a tenant is actually attacked, or if the platform ever takes a paid dependency for another reason — at which point OTP costs one more integration rather than a change of premise.

---

## D-019 — The booking flow is one route, not four

**Date:** 2026-11-25 (Phase 3)
**Status:** Accepted

The plan's route table lists `/book/[slug]/[serviceId]`, `/book/[slug]/slots` and `/book/[slug]/confirm` as separate pages. They are steps on one route instead, with the choices in the query string.

The reason is the plan's own constraint, two bullets below that table: most bookings arrive from phones on Bangladeshi mobile data, and the suite is meant to be tested on a throttled 3G profile. Four server round trips to choose one appointment is several seconds of staring at a blank screen, repeated at every step, and the measurable consequence is people leaving partway.

What is kept from the multi-page design: the landing page is still server-rendered for SEO and first paint, the choices are still in the URL so a link is shareable and the back button works, and the confirmation is still its own route — `/book/[slug]/success/[code]` — because it is a page people return to and screenshot.

The cost is that the flow is a client component, so the slot grid needs JavaScript. For a booking form that also needs it for the live availability refresh, that is not a new requirement.

---

## D-020 — No tenant is capped, and the rules are the tenant's own

**Date:** 2026-11-26 (post-launch)
**Status:** Accepted

A clinic running on this deployment could not add its third doctor. The Starter Free plan allowed two, migration 0026 enforced it with a constraint trigger exactly as designed, and the only remedy the product offered was an upgrade to a tier that cannot be bought — this platform has no billing and takes no paid dependency (D-009, D-018). The cap stopped the owner using their own software and gave them nothing in exchange.

Two separate kinds of limit were involved, and they are resolved differently.

**Platform caps** — `max_staff`, `max_branches`, `max_monthly_bookings` — are set to NULL on every tier in migration 0029, which the enforcement already reads as "no limit". The triggers, the per-tenant counting, the gate in `create_booking_atomic` and the `PLAN_LIMIT_REACHED` code all stay. Selling a tier later means writing a number into a row, not writing code. The column defaults become NULL too, so the next plan anybody inserts is not capped at two providers by accident.

A landmine came with it: `expire_subscriptions` paged past the free plan's allowance with `OFFSET (SELECT max_staff ...)`, and PostgreSQL treats `OFFSET NULL` as `OFFSET 0`. An uncapped free plan would have made a downgrade suspend every provider in the business rather than none. Guarded in 0029, and covered by tests/db/0020.

**Tenant rules** — `businesses.booking_rules` — are a different problem. They were never caps on a product tier; they are a business's own policy, and they had defaults from 0003 with no screen to change them. Thirty days of forward booking refuses a six-month check-up; three open bookings per customer refuses half a course of physiotherapy. Migration 0030 raises the defaults and Settings → Booking rules makes them editable, which is the actual fix: the numbers belong to whoever answers the phone, not to a migration.

What is deliberately *not* lifted: `min_lead_minutes` and the cancellation cutoffs, which are notice rather than ceiling and which the front desk can already bypass for someone standing at the counter (0023); and the abuse limits in `lib/api/rate-limit.ts`, which were raised — 10 bookings an hour per IP is one hospital's wifi on a busy morning — but not removed, because the public endpoint is unauthenticated and an unthrottled form is a gift to a script.

---

## D-021 — The function region, and the round trips nobody counted

**Date:** 2026-11-26 (post-launch)
**Status:** Accepted

The product was slow, and almost none of it was the code's fault in a way the code could see.

The database is in AWS `ap-southeast-1`. The serverless functions were running in `iad1` — Virginia — because that is Vercel's default and no deployment config said otherwise. Every query crossed the Pacific and came back. Measured from Dhaka against the live deployment: **410ms for `/api/v1/health`**, which touches nothing, and **1.5–2.6s for `/api/v1/public/:slug`**, which makes two waves of queries. `vercel.json` now pins functions to `sin1`, the same city as the database. It is five lines and it is the largest single change in this entry.

Region is a deployment decision that lives in the repository for the same reason the security headers do (see `next.config.ts`): a setting that exists only in a hosting dashboard is a setting nobody reviews and that the next deployment of this code will not have.

### Seven round trips before anything was drawn

Against a 250ms round trip, the count is the architecture.

`proxy.ts` called `auth.getUser()` on every request inside its matcher. That matcher covers client-side navigations too — those fetch their payload over the network like any other request — so there was one verification round trip in front of every click in the product. `getMemberContext()` cost three more (verify the user, read the membership, read the business), and it was called once by the console layout and again by the page inside it with nothing deduplicating them.

Now the proxy reads the session cookie locally and calls the auth server only inside a five-minute window before the access token expires; `getMemberContext()` is wrapped in React's `cache()`, so the layout and the page share one lookup, and the membership and business arrive together through the foreign key. Three where there were seven.

**This moved a security argument, so it is written down.** The old comment defended `getUser()` over `getSession()` on the grounds that a cookie is attacker-supplied and this check stands in front of the tenant dashboard. The first half is true; the second was not. Every page calls `requireMember()` and every `/api/v1/admin/*` route calls `requireRole()` — both go through `getMemberContext()`, which verifies against the auth server — and RLS decides every row either of them can read. A forged cookie gets past the redirect in the proxy and then gets nothing. Next's documentation asks for precisely this arrangement: the proxy is a fast path, never the gate. The redirect is a courtesy that saves a signed-out visitor from watching a dashboard fail to load. `/api/*` left the matcher entirely, since those routes authenticate themselves and a redirect to `/login` is the wrong answer to an API call.

### The portal's queries are cached; the page is not, and the slots never will be

The booking page read the business, its services, its providers and its branches on every visit — and twice per visit, because `generateMetadata` and the page each called the loader with nothing sharing the result. For data that changes a few times a year.

The first attempt cached the **page**, with `export const revalidate`. Two things were wrong with it, and both are worth keeping written down because neither was visible from the code.

It did not work. A dynamic segment with no `generateStaticParams` is classified `ƒ Dynamic` in this version, and `revalidate` on a dynamic route is ignored — the build output says so plainly once you look. The reason it appeared to work is worse: the measurement was `time_starttransfer`, and a `loading.tsx` had been added to the same route. What came back in 10ms was the skeleton being flushed. The database was still being read on every visit, after the status line had already gone out. A number that moves in the right direction for the wrong reason is the easiest kind of mistake to ship.

And the loading boundary broke the 404. Once Next.js begins streaming, the status is already sent, so `notFound()` could no longer answer — an unknown booking link returned **200** with a not-found body. The end-to-end suite caught it on the push; nothing local did, because the stale dev server from the previous build was still listening on the port Playwright reuses.

What is there now: the page renders per request, and its *queries* are cached by tag in `lib/public/tenant.ts`. A visit costs no database traffic and the whole response completes in 10–15ms, measured as total time; an unknown slug still answers 404; and the route has no `loading.tsx`, because a loading boundary is a commitment to stream and that commitment is what costs the status code.

Invalidation is by tag, and the stale window is zero. `revalidateTag(tag, "max")` — the profile the documentation recommends — marks an entry stale and lets the next request have the old copy while a fresh one is fetched behind it. Measured: change a price, load the booking page, see the old price once. For an owner who has just edited their own prices that is indistinguishable from the save having failed, which is the complaint this whole settings screen existed to end. `{ expire: 0 }` says nobody gets the stale copy; one request waits for the new rows.

The session-less client is also the only correct one here. The cookie-bound client meant the portal's output depended on who was looking: an owner browsing their own booking page carried their session into those queries, and RLS answered as that owner — the same URL, different rows, and a cache that could have stored one person's view for everyone.

What stays uncached is availability. Which times are free is fetched by the client from `/api/v1/public/:slug/slots`, which is never cached and never will be: a slot grid that is thirty seconds stale is a customer tapping a time that has gone. So a cached shell cannot offer an appointment that no longer exists. Every settings write that changes what a customer reads clears the tag, through one helper rather than eight call sites — a cache is only acceptable if every write that invalidates it says so, and "every" is easier to keep true in one function.

### Why it felt slower than it was

There was no `loading.tsx` and no `Suspense` anywhere in the console. Next.js had nothing to render between a click and the data, so it kept the previous screen on display — fully interactive, completely unchanged. The honest reading of "nothing happened" is that nothing happened, and people clicked again. Skeletons stand in now, shaped like the content that is coming so the page settles rather than jumps, and the dashboard streams its frame while the day's figures are still in flight. They pay twice over: a dynamic route is only prefetched as far as its nearest loading boundary, so adding one lets the router fetch each screen's shell before the click arrives.

### Not done here

This version of Next ships **Cache Components** (`cacheComponents` + `partialPrefetching`), which makes Partial Prerendering the default: a static shell served immediately with runtime data streamed in, and component state preserved across navigation. It is the framework's own answer to this complaint and it is the right destination.

It is not a flag flip. Data fetching becomes dynamic by default, every route segment config has to be migrated, and every page that reads cookies — which here means every console page, through `requireMember()` — must have that read moved inside a `<Suspense>` boundary or it blocks the prerender. There is a documented per-route opt-out (`instant = false`) so it can be done a screen at a time. That is its own pass, with its own verification, not a corner of this one.
