import { expect, test } from "@playwright/test";

/**
 * Phase 0 smoke test: the app boots and serves a page.
 *
 * Phase 3 replaces this file's role with the real guest-booking journey
 * (landing -> service -> staff/date -> slot -> details -> confirmation) and
 * the two-browser slot race described in the plan's Phase 3 exit criteria.
 */
test("the app responds and renders", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator("body")).toBeVisible();
});

test("health endpoint reports ok", async ({ request }) => {
  const response = await request.get("/api/v1/health");
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data.status).toBe("ok");
});
