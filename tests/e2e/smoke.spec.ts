import { expect, test } from "@playwright/test";

/**
 * Smoke tests: the app boots, the routes exist, and the two access rules that
 * hold without a database hold.
 *
 * These deliberately do not need a real Supabase project. CI runs them against
 * placeholder credentials, so anything that would require a live query is out
 * of scope here — the tenant journeys belong in Phase 3's suite, alongside the
 * two-browser slot race the plan makes that phase's exit criterion.
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

test("signup offers the industry choice and previews its labels", async ({ page }) => {
  await page.goto("/signup");

  // The industry picker is the first thing asked for, because it decides the
  // vocabulary of every screen afterwards and the wording of the seeded
  // notification templates.
  const industry = page.locator("select#industry");
  await expect(industry).toBeVisible();

  // Scoped to the preview line rather than searching the page for "Patient":
  // the word appears both in the paragraph and in the <strong> inside it, and
  // a bare getByText would match two elements and fail on strict mode.
  const preview = page.getByText(/Your screens will say/);

  await expect(preview).toContainText("Patient");
  await expect(preview).toContainText("Dental Appointment");

  // Changing the industry changes the vocabulary live, so the person can see
  // what their staff will read before committing to it.
  await industry.selectOption("salon");
  await expect(preview).toContainText("Client");
  await expect(preview).toContainText("Stylist");

  await industry.selectOption("workshop");
  await expect(preview).toContainText("Technician");
});

test("the tenant area is closed to anonymous visitors", async ({ page }) => {
  // Enforced in proxy.ts before any page renders. Worth asserting in a browser
  // rather than trusting the matcher: a regex that stops matching /app fails
  // silently and serves the dashboard to everyone.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
  await expect(page).toHaveURL(/next=%2Fapp/);
});

test("an unknown booking slug is a 404, not an error page", async ({ page }) => {
  // A slug that does not resolve is indistinguishable from a tenant that has
  // not published yet, and deliberately so: whether a given business is
  // registered here is not public information.
  const response = await page.goto("/book/no-such-business-exists");
  expect(response?.status()).toBe(404);
});
