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

  const source = stripNotices(types);
  writeFileSync(OUT, source, "utf8");
  console.log(`Wrote ${source.split("\n").length} lines.`);
}

/**
 * Drops anything the CLI printed before the generated source.
 *
 * The CLI writes advisory notices to **stdout**, not stderr, so capturing
 * stdout captures them too. Against CI's plain `postgres:17` container it
 * emits:
 *
 *     │
 *     ▲ Connected to 127.0.0.1 without TLS: the TLS connection failed or
 *       was rejected.
 *
 * Those two lines went straight into the .ts file, so the regenerated types
 * differed from the committed ones by two lines of English prose and CI
 * failed `Check generated types are current` on every push while the schema
 * and the types were perfectly in step. A staleness check that cries wolf
 * gets switched off, and then a genuinely stale types file ships.
 *
 * Both sides of that comparison run through this function, so the rule only
 * has to be deterministic, not clever: start the file at the first `export`.
 */
function stripNotices(raw: string): string {
  const lines = raw.split("\n");
  const start = lines.findIndex((line) => line.startsWith("export "));

  if (start > 0) {
    console.log(`Dropped ${start} line(s) of CLI notices before the generated source.`);
  }

  return lines.slice(start).join("\n");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
