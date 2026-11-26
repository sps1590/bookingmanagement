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

test("an unknown booking slug is not indexable, and gives nothing away", async ({ page }) => {
  // This asserted a 404 status until Cache Components landed. It cannot any
  // more, and that is documented rather than broken: the prerendered shell
  // starts the response with a 200 before `notFound()` runs at request time,
  // and neither `connection()` nor `instant = false` changes that. D-022
  // records the trade.
  //
  // What the 404 was actually protecting still has to hold, so this asserts
  // those two things directly instead of asserting the status that used to
  // imply them.
  const response = await page.goto("/book/no-such-business-exists");

  // 1. Search engines must not index booking pages that do not exist. Next.js
  //    injects this in place of the status code, and Google documents it as
  //    sufficient. If it ever stops being injected, this test fails and the
  //    page starts being indexed — which is the failure worth catching.
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1, {
    timeout: 10_000,
  });

  // The other half — that a *real* booking page does not carry the tag, so
  // tenants do not all fall out of search together — needs a published
  // business, so it lives in booking.spec.ts behind E2E_TENANT_SLUG.
  //
  // The status is the documented 200; asserted so a silent change is visible.
  expect(response?.status()).toBe(200);
});
