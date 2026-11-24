# Contributing

## Before you push

```bash
npm run verify
```

Format, lint, typecheck and unit tests. CI runs the same checks plus the database and E2E stages.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). The type prefix is what makes the history readable at phase boundaries.

```
feat(booking): add slot grid to public portal
fix(slots): respect staff_services mapping in availability
chore(ci): cache Playwright browsers
docs(plan): record Next 16 decision
refactor(api): extract shared notification queueing
test(db): add buffer enforcement regression
```

Scopes in use: `booking`, `slots`, `tenancy`, `rls`, `notify`, `exports`, `payments`, `admin`, `staff`, `api`, `ci`, `plan`, `docs`.

## Branches

Branch from `main`, one branch per phase task. `main` is protected and requires CI green.

```
phase1/tenancy-migrations
phase2/slot-engine-gates
```

## Adding a UI component

```bash
npx shadcn@latest add dialog
```

The CLI is intentionally not a project dependency (see [docs/DECISIONS.md](docs/DECISIONS.md) D-003). Generated files land in `components/ui/` and are excluded from Prettier and some lint rules — treat them as vendored.

## Changing the database

Migrations are numbered `NNNN_name.sql` and applied in filename order.

1. Create the next file by hand: `supabase/migrations/0018_whatever.sql`.
2. Start it with `SET search_path = public, extensions, pg_temp;` so DDL resolution does not depend on which role runs it.
3. Write forward-only SQL. Never edit a migration that has reached staging — the CLI records applied versions and will not reapply an edited file, so the edit silently diverges staging from production.
4. `npm run test:db -- --fresh` against a throwaway database — proves the whole chain still applies from zero.
5. `npm run db:types` — regenerate types and commit the result. CI fails if it is stale.
6. Add or update the matching assertions in `tests/db/`.

**If you add a table, write its grants.** New tables arrive with none (see [docs/DECISIONS.md](docs/DECISIONS.md) D-016), so PostgREST will return "permission denied" until you do. That is deliberate: the alternative default is a table readable by `anon`, and since RLS filters rows but never columns, readable means *every column*.

**If you add a `SECURITY DEFINER` function, pin `SET search_path`.** Without it, a role that can create objects in an earlier schema can shadow a table name and have your function run their code as `postgres`. `tests/db/0001_schema_invariants.sql` fails if you forget.

If a change touches RLS, the test comes first. A policy that reads correctly in review and a policy that actually blocks a cross-tenant `SELECT` are different things, and the gap between them is a patient-data breach. Prove the test has teeth by breaking the thing it guards and watching it fail — that is how the B-03 buffer test was validated.

## Three things that will fail review

**Adding a dependency on a paid service.** See [docs/FREE_STACK.md](docs/FREE_STACK.md), which every new service must be added to with its real limit. Check the licence terms as well as the price — "free for personal use" is a restriction, not a discount, which is the entire story of Vercel Hobby (D-013). If a capability has no free option, say so and change the product, as D-009 did for SMS.

**Importing `lib/supabase/admin.ts` outside tenant signup, the notification worker, payment verification or the Super Admin console.** It bypasses Row-Level Security, which is the only boundary between one clinic's records and another's.

**Hardcoding a user-facing label or a timezone.** Labels come from the tenant's `terminology_config` — a dentist's "Patient" is a salon's "Client". Times are rendered in the business's own `timezone` column, never in `'Asia/Dhaka'` literally, even though that is the default. The source spec gets both of these wrong in its SQL (defects B-20 and the terminology layer in §1.2); we are not copying that.
