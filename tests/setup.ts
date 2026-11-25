import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import "@testing-library/jest-dom/vitest";

// Deterministic env for unit tests. Anything that needs a real Supabase
// instance belongs in tests/db (SQL) or tests/e2e (Playwright), not here.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.LOG_LEVEL ??= "error";

// Testing Library only auto-cleans when Vitest globals are on, and they are
// deliberately off here. Without this, a second `render` in the same file
// leaves the first still mounted and queries find two of everything — which
// fails as "found multiple elements", a message that points at the test
// rather than at the missing cleanup.
afterEach(() => {
  cleanup();
});
