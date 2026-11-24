/**
 * Runs the Supabase CLI without going through a shell.
 *
 * `npx supabase …` and `node_modules/.bin/supabase` both resolve to a `.cmd`
 * shim on Windows, and Node refuses to spawn a `.cmd` without `shell: true`
 * (CVE-2024-27980). Turning the shell on would mean the connection string —
 * which contains a password that may hold `&`, `^` or a quote — gets parsed by
 * cmd.exe before the CLI ever sees it. That is both a corruption bug and an
 * injection surface.
 *
 * The published package's `bin` is a plain JavaScript file, so the fix is to
 * run it with this process's own Node binary and pass arguments as a real
 * argv. Same behaviour on every platform, nothing to quote.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

function cliEntrypoint(): string {
  const pkgPath = require.resolve("supabase/package.json");
  const pkg = require("supabase/package.json") as { bin?: Record<string, string> | string };
  const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.supabase;

  if (!rel) {
    throw new Error(
      "The installed `supabase` package declares no bin entry. Run `npm ci` and try again.",
    );
  }

  return path.join(path.dirname(pkgPath), rel);
}

export interface RunOptions {
  /** Capture stdout instead of streaming it through. */
  capture?: boolean;
  maxBuffer?: number;
}

export function runSupabase(args: string[], options: RunOptions = {}): string {
  const result = execFileSync(process.execPath, [cliEntrypoint(), ...args], {
    encoding: "utf8",
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });

  return options.capture ? result : "";
}
