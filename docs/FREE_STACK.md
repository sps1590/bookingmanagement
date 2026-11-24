# Zero-cost stack

**Constraint:** the platform must run entirely on free tiers. No paid service, no trial that expires into a bill, no tier whose terms forbid the use we intend.

This document is the authority on that. Before adding any dependency or service to the project, it goes in the table below with its tier, its real limit, and what happens when that limit is hit. A service with no free tier does not get built in — it gets designed around.

Last audited: 2026-11-24.

---

## 1. What we use

| Need | Service | Free tier | Hard limit | When you hit it |
|---|---|---|---|---|
| Database, Auth, RLS, Edge Functions, Realtime | **Supabase** | Free | 500 MB DB · **2 projects** · 50k MAU · 5 GB egress/mo · no automated backups · pauses after 7 days idle | §4 keep-alive; §5 backups; prune `notification_logs` |
| Frontend + API hosting | **Vercel** | Free (Hobby) | 100 GB bandwidth/mo · 10s function timeout · 2 daily cron jobs · **non-commercial use only** | ⚠️ The licence, not a cap. Charging tenants requires Pro at $20/mo — see below and D-013 |
| CI | **GitHub Actions** | Free | Unlimited on **public** repos · 2,000 min/mo private | Make the repo public, or gate the database job to migration changes |
| Email delivery | **Resend** | Free | 3,000/mo · 100/day · 1 domain | Switch to Brevo (300/day) or add a second sender |
| Push notifications | **Web Push (VAPID)** | Free forever | None — it is a browser standard, not a service | n/a |
| Staff/owner alerts | **Telegram Bot API** | Free | Unlimited, ~30 msg/sec | n/a |
| Scheduled jobs | **Supabase `pg_cron`** | Free | Included | n/a |
| Error tracking | **Sentry** | Free (Developer) | 5k errors/mo · 1 project · 30-day retention | Already inert without a DSN; drop to logs only |
| Uptime checks | **GitHub Actions cron** | Free | — | n/a |
| Load testing | **k6 OSS** | Free | Run locally, no cloud account | n/a |
| Local database | **none** — hosted Supabase for dev, `postgres:17` service container in CI | Free | — | See D-014 |
| Domain | Host subdomain (`*.vercel.app`) | Free | Cosmetic only | Buy a domain later (~$10/yr) if you want |

Nothing above requires a card on file.

### The one thing that is not actually free

**Vercel Hobby is licensed for non-commercial use only.** It is free to use and will stay free; what it will not do is permit a SaaS that charges its tenants. That is a term of service rather than a usage meter, so there is no warning email and no throttle — the account is simply in breach, and the remedy is Pro at $20/month.

So the honest statement of this project's cost is: **zero until the first paying tenant, then $20/month.** Everything else in the table above stays free at that scale.

Vercel was chosen anyway, by the project owner, with that known (D-013 supersedes D-008). Netlify's free tier permits commercial use and remains the alternative if the $20 ever matters more than the preference; nothing in the repository is host-specific, and the security headers live in `next.config.ts` precisely so a move is a DNS change rather than a refactor.

---

## 2. What the original plan assumed, and why it had to change

| Assumed | Problem | Replaced with |
|---|---|---|
| ~~**Vercel** (spec §1.5)~~ | Hobby tier is **non-commercial only**. A SaaS charging tenants breaches those terms; Pro is ~$20/mo. | **Reversed on 2026-11-25:** the owner chose Vercel regardless (D-013). The analysis stands; the cost is accepted, not avoided |
| **Docker Desktop for local Postgres** | The owner does not want Docker in the workflow. | Hosted Supabase for development; `postgres:17` plus a shim for tests (D-014) |
| **SSL Wireless / BulkSMSBD / MimSMS** | No free tier exists for SMS in Bangladesh. Billed per message. | Dropped. See §3 |
| **Meta WhatsApp Cloud API** | Only *user-initiated* service conversations are free. A reminder is business-initiated → utility template → billed per message. | Dropped from the default build. Adapter interface kept |
| **Stripe** | Cannot receive payouts in Bangladesh. | Dropped |
| **bKash / SSLCommerz merchant API** | Requires business registration plus setup and per-transaction fees. | Manual payment verification. See §6 |
| **3 Supabase projects** (dev/staging/prod) | Free tier allows **2**. | Local Docker for dev + 1 hosted staging + 1 hosted prod = 2 hosted. See §4 |
| **PITR backups** (Phase 10) | Paid feature; free tier has no automated backups at all. | `pg_dump` on a GitHub Actions schedule. See §5 |

---

## 3. Notifications without SMS

This is the significant product consequence of the constraint, and it should be understood rather than discovered in Phase 5.

The spec's whole no-show-reduction promise (§1.4C) rests on reaching a customer who gave you nothing but a phone number. Without SMS, a phone number is no longer a delivery channel. Free channels and who they actually reach:

| Channel | Reaches | Cost | Caveat |
|---|---|---|---|
| **Email** | Customers who give an email | Free to 3,000/mo | Many walk-in customers in BD won't have or share one |
| **Web Push** | Anyone who allows notifications in the browser | Free | Needs opt-in at booking time. iOS requires the site be added to the Home Screen first — a real drop-off |
| **Telegram** | Staff and owners | Free | Excellent for internal digests; few BD customers will link a bot |
| **Booking confirmation page** | Everyone | Free | Not a reminder — it only works at the moment of booking |
| **`.ics` / Add to Google Calendar** | Anyone who adds it | Free | **The strongest free substitute.** The customer's own calendar app then sends the reminder, at no cost to us |

**The design response:** lean hard on the calendar invite and the printed/QR booking code, make email optional but strongly encouraged, and offer web push opt-in on the confirmation screen. Phase 5 builds `email`, `push` and `telegram` adapters behind the same interface the SMS adapter would have used, so adding a paid channel later is a config change and a new file — not a refactor.

**Be honest with tenants about this.** A clinic evaluating the platform will ask "do my patients get an SMS reminder?" and the answer is no, not unless they fund a gateway. Keep the adapter seam so that answer can become "yes, bring your own gateway" the day someone asks.

Phase 5's exit criteria change accordingly: no SMS assertions, and a new one proving the `.ics` attachment imports correctly into Google Calendar and the default Android calendar.

---

## 4. Living inside 2 Supabase projects

| Environment | Where |
|---|---|
| dev | Local, `npm run db:start` (Docker). Not a hosted project. |
| staging | Hosted Supabase project 1 |
| prod | Hosted Supabase project 2 |

Two consequences:

**Free projects pause after 7 days of inactivity.** A paused project returns errors until manually resumed, which for a live product means an outage discovered by a tenant. Mitigation: a GitHub Actions scheduled workflow hits `/api/v1/health` and runs a trivial query every 3 days. Add this in Phase 1, the moment a hosted project exists — not in Phase 10.

**500 MB and 5 GB egress are smaller than they look.** `notification_logs` is the table that will eat it: one row per message per recipient, forever. Add a retention job in Phase 5 that deletes `sent` rows older than 90 days, keeping aggregate counts in a summary table. Do this when you build the table, not when the database fills up.

---

## 5. Backups without PITR

Supabase free has no automated backups. Losing a tenant's appointment history is unrecoverable and unforgivable, so this is not optional.

A GitHub Actions workflow on a daily schedule runs `pg_dump` against prod and uploads the result as a workflow artifact (90-day retention, free) and/or commits an encrypted dump to a private repo. Build it in Phase 1 alongside the first migration, and rehearse a restore into the local Docker instance before Phase 10 signs off.

`pg_dump` output contains every tenant's customer records. Encrypt it, and never let the artifact land in a public repo.

---

## 6. Payments without a gateway

Phase 8 as written assumed bKash/SSLCommerz/Stripe. All three cost money or are unavailable. The free path, which is also how most small businesses in Bangladesh already operate:

**Booking deposits** — the tenant displays their own bKash/Nagad number. The customer pays, then enters the transaction ID in the booking form. The booking is created `pending` with `payment_status = 'unpaid'`; the receptionist verifies the TrxID against their own bKash statement and marks it paid. The slot is held by the existing `pending` status in the GIST predicate and released by the abandonment sweep. Zero platform cost, no gateway account, no PCI surface.

**Platform subscriptions** — identical pattern. The tenant pays the platform owner directly; the Super Admin console marks the plan active and sets an expiry. Plan *enforcement* (staff caps, booking caps, feature flags) is real code and still gets built in Phase 8 — only the money movement is manual.

Keep the `PaymentGateway` interface from the original plan. When a real merchant account becomes affordable, it plugs in behind the same seam.

A manual flow needs its own guards, which automated gateways give you for free: a TrxID must be unique across the tenant (someone will reuse one), the verification action must be audited to a named user, and the receptionist UI must show the amount expected versus claimed.

---

## 7. Rules

1. **No card on file, anywhere.** A service that requires one to start is not free; it is a bill with a delay.
2. **Check the terms, not just the price.** Vercel Hobby is free and still wrong for this project. "Free for personal use" is a licence restriction, not a discount.
3. **Every new service lands in §1 first**, with its real limit and the behaviour at that limit.
4. **Design for the limit, not the headroom.** The retention job and the keep-alive ping belong in the phase that creates the need, not in a cleanup phase that may never arrive.
5. **When free genuinely does not exist, say so out loud** and change the product, as §3 does for SMS. Do not leave a paid dependency sitting in a plan that claims to be free.
