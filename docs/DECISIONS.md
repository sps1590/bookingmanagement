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
