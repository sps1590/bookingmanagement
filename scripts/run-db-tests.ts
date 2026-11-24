#!/usr/bin/env tsx
/**
 * Runs the SQL assertion suite in tests/db against a PostgreSQL database.
 *
 * These tests live in the database rather than in the JS client because what
 * they test *is* the database's behaviour. A policy that reads correctly in
 * review and a policy that actually blocks a cross-tenant SELECT are different
 * things, and the gap between them is a patient-data breach.
 *
 *   npm run test:db                  assert against the schema already there
 *   npm run test:db -- --fresh       build the schema from zero first
 *
 * ## No Docker, no psql
 *
 * The previous version shelled out to `psql`, which meant either Docker
 * Desktop or a PostgreSQL client install. This one speaks the wire protocol
 * through `pg`, so `npm ci` is the only prerequisite (docs/DECISIONS.md D-014).
 *
 * `--fresh` applies scripts/sql/supabase-shim.sql and then every migration in
 * order, which is what proves the migration chain still builds from nothing —
 * the guarantee `supabase db reset` used to give. CI uses it against a
 * throwaway Postgres service container. Point it at a database you are willing
 * to lose: it is additive, but it is not idempotent.
 *
 * Without `--fresh`, each file runs inside a transaction that is always rolled
 * back, so pointing this at a hosted staging project leaves nothing behind.
 * Not at production, though — a ROLLBACK does not undo a sequence advancing,
 * and there is no reason to take the risk.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client, type ClientConfig } from "pg";
import { redactDbUrl, resolveDbUrl } from "./lib/db-url";

const FRESH = process.argv.includes("--fresh");
const ROOT = process.cwd();
const TEST_DIR = path.join(ROOT, "tests", "db");
const MIGRATION_DIR = path.join(ROOT, "supabase", "migrations");
const SHIM = path.join(ROOT, "scripts", "sql", "supabase-shim.sql");
// Prepended inside every test's transaction. Lives in a subdirectory so the
// glob below does not pick it up and run it as a test of its own.
const FIXTURE = path.join(TEST_DIR, "_shared", "fixture.sql");

let DB_URL: string;
try {
  DB_URL = resolveDbUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function clientConfig(): ClientConfig {
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(DB_URL);
  if (isLocal) return { connectionString: DB_URL };

  // Supabase issues the direct database endpoint a certificate that is not in
  // the public trust store, so strict verification fails unless the project CA
  // is supplied. Set PGSSLROOTCERT to the downloaded CA to verify properly;
  // otherwise the connection is still encrypted but unauthenticated, which is
  // the accepted trade for a test harness and nothing else. Application code
  // never uses this path — it goes through the Supabase client over HTTPS.
  const ca = process.env.PGSSLROOTCERT;
  return {
    connectionString: DB_URL,
    ssl: ca ? { ca: readFileSync(ca, "utf8") } : { rejectUnauthorized: false },
  };
}

function sqlFilesIn(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
}

interface PgError extends Error {
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
}

function describe(error: unknown): string {
  const e = error as PgError;
  const parts = [e.message];
  if (e.detail) parts.push(`DETAIL: ${e.detail}`);
  if (e.hint) parts.push(`HINT: ${e.hint}`);
  if (e.code) parts.push(`SQLSTATE: ${e.code}`);
  return parts.join("\n    ");
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(clientConfig());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function buildSchema(): Promise<void> {
  const migrations = sqlFilesIn(MIGRATION_DIR);
  if (migrations.length === 0) throw new Error("No migrations found to apply.");

  await withClient(async (client) => {
    process.stdout.write("  shim: supabase-shim.sql ... ");
    await client.query(readFileSync(SHIM, "utf8"));
    console.log("ok");

    for (const file of migrations) {
      process.stdout.write(`  migrate: ${file} ... `);
      // One transaction per migration, matching how the Supabase CLI applies
      // them: a migration either lands whole or not at all.
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(path.join(MIGRATION_DIR, file), "utf8"));
        await client.query("COMMIT");
        console.log("ok");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.log("FAILED");
        throw new Error(`${file}\n    ${describe(error)}`);
      }
    }

    const seed = path.join(ROOT, "supabase", "seed.sql");
    try {
      const body = readFileSync(seed, "utf8");
      process.stdout.write("  seed: seed.sql ... ");
      await client.query(body);
      console.log("ok");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return;
      throw error;
    }
  });
}

async function runTests(): Promise<number> {
  const files = sqlFilesIn(TEST_DIR);

  if (files.length === 0) {
    console.log("No database tests found in tests/db.");
    return 0;
  }

  let fixture = "";
  try {
    fixture = readFileSync(FIXTURE, "utf8");
  } catch {
    // No shared fixture: every test builds its own world.
  }

  let failed = 0;

  for (const file of files) {
    process.stdout.write(`  ${file} ... `);
    // A fresh connection per file, so a test that changes role or sets a GUC
    // cannot leak that state into the next one.
    try {
      await withClient(async (client) => {
        await client.query("BEGIN");
        try {
          if (fixture) await client.query(fixture);
          await client.query(readFileSync(path.join(TEST_DIR, file), "utf8"));
        } finally {
          // Always. These tests insert tenants, users and bookings; none of it
          // is meant to survive the assertion that needed it.
          await client.query("ROLLBACK").catch(() => {});
        }
      });
      console.log("pass");
    } catch (error) {
      failed += 1;
      console.log("FAIL");
      console.error(`    ${describe(error)}`);
    }
  }

  console.log(`\n${files.length - failed}/${files.length} database tests passed.`);
  return failed;
}

async function main(): Promise<void> {
  console.log(`Target: ${redactDbUrl(DB_URL)}${FRESH ? "  (building schema from zero)" : ""}\n`);

  if (FRESH) await buildSchema();

  const failed = await runTests();
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`\n${describe(error)}`);
  process.exit(1);
});
