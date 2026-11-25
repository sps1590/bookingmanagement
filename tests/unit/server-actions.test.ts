import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A `"use server"` module may export async functions and nothing else.
 *
 * Export a constant from one and the code still compiles, the build still
 * passes, and the client receives a server reference where it expected the
 * value. The onboarding wizard did exactly this with its timezone list, so
 * `SUPPORTED_TIMEZONES.map(...)` ran `.map` on a remote procedure stub and
 * the first screen every new tenant sees crashed before it rendered — a
 * failure nobody met until a tenant was finally created on the deployment.
 *
 * TypeScript will not catch it: the types are correct on both sides. So it is
 * caught here, by reading the files.
 *
 * Type-only exports are fine. They are erased before the module ever reaches
 * a bundler, so `export interface ActionState` costs nothing.
 */

const ROOT = process.cwd();
const SEARCH = ["app", "lib"];

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

/** `export const x = …`, but not `export const x = async …`. */
const VALUE_EXPORT = /^export\s+(const|let|var|class)\s+(?!.*=\s*async\b)([A-Za-z0-9_$]+)/gm;

describe('"use server" modules', () => {
  const files = SEARCH.flatMap((dir) => walk(path.join(ROOT, dir))).filter((file) =>
    /^["']use server["']/.test(readFileSync(file, "utf8").trimStart()),
  );

  it("there are some, or this test is asserting nothing", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => path.relative(ROOT, f)))("%s exports only functions", (relative) => {
    const source = readFileSync(path.join(ROOT, relative), "utf8");
    const offenders = [...source.matchAll(VALUE_EXPORT)].map((m) => `${m[1]} ${m[3]}`);

    expect(
      offenders,
      `${relative} is a server module, so these reach the client as server references rather than values. Move them to a plain module and import from both sides.`,
    ).toEqual([]);
  });
});
