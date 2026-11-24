#!/usr/bin/env tsx
/**
 * Applies pending migrations to a Supabase project.
 *
 *   npm run db:push            apply to SUPABASE_DB_URL
 *   npm run db:push -- --dry   list what would be applied
 *
 * `supabase db push --db-url` connects directly to Postgres, so this needs no
 * Docker and no `supabase link` (docs/DECISIONS.md D-014).
 *
 * Migrations are forward-only. If one has already reached this database, write
 * a new migration rather than editing it — the CLI tracks applied versions in
 * `supabase_migrations.schema_migrations` and will not reapply an edited file,
 * so an edit silently diverges staging from production.
 */
import process from "node:process";
import { redactDbUrl, resolveDbUrl } from "./lib/db-url";
import { runSupabase } from "./lib/supabase-cli";

const DRY = process.argv.includes("--dry");

function main(): void {
  const url = resolveDbUrl();
  console.log(`Target: ${redactDbUrl(url)}${DRY ? "  (dry run)" : ""}\n`);

  // `--remote=<url>` targets a database by connection string, which needs no
  // `supabase link` and no project password prompt. A bare `--remote` would
  // mean "the linked project" instead.
  const args = ["db", "push", `--remote=${url}`];
  if (DRY) args.push("--dry-run");

  runSupabase(args);
}

try {
  main();
} catch (error) {
  // The CLI prints its own diagnostics to stderr; add nothing but the exit code.
  if (error instanceof Error && "status" in error) process.exit(Number(error.status) || 1);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
