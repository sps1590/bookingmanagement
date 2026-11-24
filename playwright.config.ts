import { defineConfig, devices } from "@playwright/test";

// Pinned to 3100 rather than Next's default 3000. If another project is
// already serving on 3000, Next silently shifts to the next free port while
// Playwright keeps polling the one it was told about, and the whole suite
// dies on a webServer timeout that looks like a product bug.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Most bookings in Bangladesh arrive from a phone; the public portal is
    // tested at phone width from Phase 3 onward.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer: {
    command: process.env.CI ? `npm run start -- -p ${PORT}` : `npm run dev -- -p ${PORT}`,
    // Probe the API route, not `/`. In dev, Turbopack compiles routes on
    // demand, so a server that already answers `/` can still 404 an API
    // route that has not been compiled yet — which fails tests for a reason
    // that has nothing to do with the code under test.
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
