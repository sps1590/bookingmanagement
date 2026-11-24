/**
 * Resolves the database connection string for the CLI scripts.
 *
 * Loads `.env.local` if it is there, so `npm run db:push` works without
 * remembering to export anything, and does nothing if it is not, so CI can
 * supply the value as a secret. `process.loadEnvFile` is built into Node 20.12+
 * — no dotenv dependency, and nothing to keep in step with it.
 */
import process from "node:process";

export function loadLocalEnv(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Absent or unreadable. Environment variables already set still apply.
  }
}

export function resolveDbUrl(): string {
  loadLocalEnv();

  const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "SUPABASE_DB_URL is not set.\n\n" +
        "  Supabase dashboard > Project Settings > Database > Connection string > URI\n" +
        "  Put it in .env.local as SUPABASE_DB_URL=postgresql://...\n\n" +
        "This is the direct Postgres connection, used only by the migration and\n" +
        "type-generation scripts. The application itself never uses it — it talks\n" +
        "to Supabase over HTTPS. See docs/DEVELOPER_GUIDE.md.",
    );
  }

  return url;
}

/** Safe to print: hides the password. */
export function redactDbUrl(url: string): string {
  return url.replace(/:[^:@/]*@/, ":****@");
}
