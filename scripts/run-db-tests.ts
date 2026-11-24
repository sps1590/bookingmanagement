#!/usr/bin/env tsx
/**
 * Runs every .sql file in tests/db against the local Supabase database.
 *
 * These are the Row-Level Security and concurrency assertions that the plan
 * makes the exit gate for Phases 1, 2 and 7. They have to run in the database
 * rather than through the JS client, because what we are testing *is* the
 * database's behaviour: a policy that looks right in review and a policy that
 * actually blocks a cross-tenant read are different things.
 *
 * Each file should raise an exception on failure (RAISE EXCEPTION, or an
 * ASSERT) so a non-zero psql exit code marks the run as failed.
 *
 *   npm run test:db
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const testDir = path.join(process.cwd(), "tests", "db");

function sqlFiles(): string[] {
  try {
    return readdirSync(testDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
}

function main(): void {
  const files = sqlFiles();

  if (files.length === 0) {
    console.log("No database tests yet — Phase 1 adds the RLS isolation suite to tests/db/.");
    return;
  }

  let failed = 0;

  for (const file of files) {
    const fullPath = path.join(testDir, file);
    process.stdout.write(`  ${file} ... `);
    try {
      execFileSync(
        "psql",
        [DB_URL, "--quiet", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-f", fullPath],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      console.log("pass");
    } catch (error) {
      failed += 1;
      console.log("FAIL");
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
      console.error(stderr.trim());
    }
  }

  console.log(`\n${files.length - failed}/${files.length} database tests passed.`);
  if (failed > 0) process.exit(1);
}

main();
