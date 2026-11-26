import { expect, test } from "@playwright/test";

/**
 * A real guest booking, in a real browser, against a real database.
 *
 * ## Why this is opt-in
 *
 * The portal's landing page is server-rendered from Supabase. Playwright can
 * intercept what the *browser* requests, but not what the server fetches while
 * rendering, so there is no way to fake a tenant into this page — the test
 * needs an actual published business in an actual project.
 *
 * CI runs against placeholder credentials (see the env block in ci.yml), so
 * these would be skipped there whatever shape they took. Rather than pretend
 * otherwise, they are explicitly gated: set the two variables and they run,
 * locally or in a workflow that has a project to point at.
 *
 *     E2E_TENANT_SLUG=dhaka-dental-care npm run test:e2e
 *
 * The flow's own logic — slot grouping, SLOT_TAKEN recovery, the keyboard and
 * live-region behaviour — is covered on every push by the component tests in
 * tests/unit/booking-flow.test.tsx, which need no database.
 *
 * ## What it leaves behind
 *
 * A real booking, under a phone number in a range reserved for this suite. It
 * is not cleaned up: deleting it would need the service key, and a test that
 * holds the key that bypasses Row-Level Security is a worse idea than a row
 * someone removes from the dashboard. Point it at a staging tenant.
 */

const SLUG = process.env.E2E_TENANT_SLUG;

test.describe("guest booking", () => {
  test.skip(!SLUG, "Set E2E_TENANT_SLUG to a published tenant to run this against a real project.");

  test("a published booking page is indexable", async ({ page }) => {
    // The companion to the noindex assertion in smoke.spec.ts. Under Cache
    // Components, Next.js marks a not-found page `noindex` in place of the
    // 404 status it can no longer send (D-022). That is the right behaviour
    // for a slug that does not exist and a catastrophe for one that does —
    // if the tag ever leaked onto real pages, every tenant would quietly drop
    // out of search results with nothing visibly broken.
    await page.goto(`/book/${SLUG}`);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });

  test("a stranger with a link books an appointment and gets a code", async ({ page }) => {
    await page.goto(`/book/${SLUG}`);

    // The landing page is the SEO surface, so it must be server-rendered
    // rather than assembled after hydration.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const slots = page.locator("[aria-live='polite']");
    await expect(slots).toBeVisible();

    // The first free time on whichever day the picker opened on. If today is
    // full, step forward until something is offered — a tenant's calendar is
    // not the test's to arrange.
    let slot = slots.getByRole("button").first();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (await slot.isVisible().catch(() => false)) break;
      const date = page.getByLabel(/^Date/);
      const current = await date.inputValue();
      const next = new Date(`${current}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      await date.fill(next.toISOString().slice(0, 10));
      await page.waitForTimeout(500);
      slot = slots.getByRole("button").first();
    }
    await expect(slot).toBeVisible();

    const chosen = await slot.textContent();
    await slot.click();

    // A number in a range this suite reserves, so a leftover row is
    // recognisable in the tenant's customer list.
    const phone = `+8801700${String(Date.now()).slice(-6)}`;
    await page.getByLabel(/Full name/).fill("Playwright Guest");
    await page.getByLabel(/Mobile number/).fill(phone);

    await page.getByRole("button", { name: /^Confirm/ }).click();

    await expect(page).toHaveURL(/\/book\/.+\/success\//, { timeout: 15_000 });

    // The code is what reception reads off the customer's phone, so it has to
    // be on the page in a form a human can read back.
    const code = page.locator("p.font-mono").first();
    await expect(code).toBeVisible();
    await expect(code).not.toBeEmpty();

    // And the two things the customer leaves with.
    await expect(page.getByRole("link", { name: /Add to Google Calendar/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download calendar file/ })).toBeVisible();

    expect(chosen).toBeTruthy();
  });

  test("two customers racing the same slot: one wins, the other recovers", async ({ browser }) => {
    // The database-level race — fifty connections, exactly one winner — is
    // covered by scripts/run-concurrency-tests.ts. What this adds is the half
    // that suite cannot see: what the loser's browser does next.
    const [one, two] = await Promise.all([browser.newPage(), browser.newPage()]);

    for (const page of [one, two]) {
      await page.goto(`/book/${SLUG}`);
      await expect(page.locator("[aria-live='polite']")).toBeVisible();
    }

    const slotOf = (page: typeof one) =>
      page.locator("[aria-live='polite']").getByRole("button").first();

    const label = await slotOf(one).textContent();
    test.skip(!label, "No free slot to race for today.");

    // Both pick the same time, then submit as close to simultaneously as the
    // harness allows.
    for (const page of [one, two]) {
      await page
        .locator("[aria-live='polite']")
        .getByRole("button", { name: label!.trim(), exact: true })
        .click();
      await page.getByLabel(/Full name/).fill("Race Guest");
      await page
        .getByLabel(/Mobile number/)
        .fill(`+8801700${String(Date.now() + Math.random() * 1000).slice(-6)}`);
    }

    await Promise.all([
      one.getByRole("button", { name: /^Confirm/ }).click(),
      two.getByRole("button", { name: /^Confirm/ }).click(),
    ]);

    const landed = await Promise.all([
      one.waitForURL(/\/success\//, { timeout: 15_000 }).then(
        () => true,
        () => false,
      ),
      two.waitForURL(/\/success\//, { timeout: 15_000 }).then(
        () => true,
        () => false,
      ),
    ]);

    const winners = landed.filter(Boolean).length;
    expect(winners, "exactly one of the two may hold the slot").toBe(1);

    // The loser is told, in words, and is left with a usable grid rather than
    // an error page.
    const loser = landed[0] ? two : one;
    await expect(loser.getByRole("alert")).toContainText(/just taken|not available/i);
    await expect(loser.locator("[aria-live='polite']").getByRole("button").first()).toBeVisible();

    await Promise.all([one.close(), two.close()]);
  });
});
