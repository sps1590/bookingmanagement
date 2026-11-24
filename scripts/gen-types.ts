#!/usr/bin/env tsx
/**
 * Regenerates lib/supabase/types.ts from the live schema.
 *
 *   npm run db:types
 *
 * Uses the Supabase CLI's `--db-url` mode, which connects straight to Postgres.
 * The `--local` mode would have been the obvious choice, but it starts a
 * container, and this project does not use Docker (docs/DECISIONS.md D-014).
 *
 * CI regenerates and diffs this file, so a schema change with stale types
 * fails the build rather than surfacing as a type error in whichever feature
 * happens to touch the new column next.
 */
import { writeFileSync } from "node:fs";
import process from "node:process";
import { redactDbUrl, resolveDbUrl } from "./lib/db-url";
import { runSupabase } from "./lib/supabase-cli";

const OUT = process.argv[2] ?? "lib/supabase/types.ts";

function main(): void {
  const url = resolveDbUrl();
  console.log(`Generating types from ${redactDbUrl(url)} -> ${OUT}`);

  // `--remote=<url>` rather than the older `--db-url`, which the CLI
  // deprecated in 3.x and drops in 4.
  const types = runSupabase(["gen", "types", "typescript", `--remote=${url}`], {
    capture: true,
  });

  if (!types.includes("export type Database")) {
    throw new Error(
      "The Supabase CLI returned something that does not look like generated types:\n" +
        types.slice(0, 400),
    );
  }

  writeFileSync(OUT, types, "utf8");
  console.log(`Wrote ${types.split("\n").length} lines.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
