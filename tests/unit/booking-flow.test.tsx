import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BookingFlow } from "@/app/(public)/book/[slug]/booking-flow";
import { terminologyFor } from "@/lib/terminology";

/**
 * The booking flow, where the money is.
 *
 * These are component tests rather than browser tests for a reason worth
 * stating: the portal's landing page is server-rendered from Supabase, so a
 * Playwright run needs a real project with a seeded tenant. CI has placeholder
 * credentials, so a browser test of this flow would be skipped there — which
 * is the same as not having one. The riskiest logic is on the client, and it
 * can be exercised here on every push.
 *
 * The case that matters most is `SLOT_TAKEN`. Between the grid rendering and
 * the tap on Confirm, someone else can take the slot; that is the busy hour,
 * not an edge case, and what happens next decides whether the booking is lost.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const services = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Root Canal",
    category: null,
    description: null,
    duration_minutes: 60,
    price: 8000,
    deposit_required: 2000,
    color_hex: null,
  },
];

const staff = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Dr Rahman",
    title: "BDS, FCPS",
    avatar_url: null,
    branch_id: null,
  },
];

// 10:00, 14:00 and 18:00 in Asia/Dhaka (+06), so the three parts of the day
// are each represented exactly once.
const SLOTS = [
  { start: "2027-03-02T04:00:00+00:00", end: "2027-03-02T05:00:00+00:00", staffId: staff[0].id },
  { start: "2027-03-02T08:00:00+00:00", end: "2027-03-02T09:00:00+00:00", staffId: staff[0].id },
  { start: "2027-03-02T12:00:00+00:00", end: "2027-03-02T13:00:00+00:00", staffId: staff[0].id },
];

function renderFlow() {
  return render(
    <BookingFlow
      slug="dhaka-dental-care"
      services={services}
      staff={staff}
      terminology={terminologyFor("dentist")}
      timezone="Asia/Dhaka"
      currency="BDT"
    />,
  );
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

let calls: FetchCall[] = [];

/** Answers the slot and month endpoints; `onBook` decides what POST returns. */
function mockFetch(onBook: () => { status: number; body: unknown }, slots = SLOTS) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.includes("/bookings")) {
      const { status, body } = onBook();
      return new Response(JSON.stringify(body), { status });
    }
    if (url.includes("/month")) {
      return new Response(JSON.stringify({ success: true, data: { days: [] } }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ success: true, data: { slots, timezone: "Asia/Dhaka" } }),
      { status: 200 },
    );
  });
}

beforeEach(() => {
  calls = [];
  push.mockReset();
});

describe("BookingFlow", () => {
  it("groups the day's slots into morning, afternoon and evening", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => ({ status: 200, body: {} })),
    );
    renderFlow();

    // Rendered in the tenant's zone, not the test machine's: 04:00 UTC is a
    // Dhaka morning and a New York evening, and the customer only ever sees
    // the tenant's clock.
    await waitFor(() => expect(screen.getByText("Morning")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "10:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "14:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "18:00" })).toBeInTheDocument();
    expect(screen.getByText("Afternoon")).toBeInTheDocument();
    expect(screen.getByText("Evening")).toBeInTheDocument();
  });

  it("sends what the customer chose, with the slot's own start time", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => ({
        status: 201,
        body: {
          success: true,
          data: {
            code: "DHK-0001",
            manageToken: "t".repeat(48),
            startTime: SLOTS[0].start,
            endTime: SLOTS[0].end,
          },
        },
      })),
    );

    const user = userEvent.setup();
    renderFlow();

    await waitFor(() => expect(screen.getByRole("button", { name: "10:00" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "10:00" }));

    await user.type(screen.getByLabelText(/Full name/i), "Nusrat Jahan");
    await user.type(screen.getByLabelText(/Mobile number/i), "01711000001");
    await user.click(screen.getByRole("button", { name: /^Confirm/ }));

    await waitFor(() => expect(push).toHaveBeenCalled());

    const post = calls.find((c) => c.url.includes("/bookings"));
    const body = JSON.parse(String(post?.init?.body));

    expect(body).toMatchObject({
      serviceId: services[0].id,
      startTime: SLOTS[0].start,
      customerName: "Nusrat Jahan",
      customerPhone: "01711000001",
      // "Any available" is the default, and null is how the portal says it —
      // defect B-14, which the spec offered on screen with nothing behind it.
      staffId: null,
    });

    // The token travels to the confirmation page so it can show the manage
    // link; the times travel so it can build a calendar invite without
    // looking the booking up by code.
    const [target] = push.mock.calls[0];
    expect(target).toContain("/book/dhaka-dental-care/success/DHK-0001");
    expect(target).toContain("t=tttt");
    expect(target).toContain(`s=${encodeURIComponent(SLOTS[0].start)}`);
  });

  it("recovers from SLOT_TAKEN instead of dead-ending", async () => {
    // The slot the customer chose is gone; the refreshed grid has the others.
    const remaining = SLOTS.slice(1);
    let booked = false;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });

      if (url.includes("/bookings")) {
        booked = true;
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "SLOT_TAKEN", message: "Someone else took it." },
          }),
          { status: 409 },
        );
      }
      if (url.includes("/month")) {
        return new Response(JSON.stringify({ success: true, data: { days: [] } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: { slots: booked ? remaining : SLOTS, timezone: "Asia/Dhaka" },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderFlow();

    await waitFor(() => expect(screen.getByRole("button", { name: "10:00" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "10:00" }));
    await user.type(screen.getByLabelText(/Full name/i), "Rafiq");
    await user.type(screen.getByLabelText(/Mobile number/i), "01711000002");
    await user.click(screen.getByRole("button", { name: /^Confirm/ }));

    // Told plainly, in a live region, and not navigated away.
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/just taken/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    // The grid is refreshed underneath: the taken slot is gone and the others
    // are one tap away.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "10:00" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "14:00" })).toBeInTheDocument();

    // And the stale choice is not still armed behind the error.
    expect(screen.getByRole("button", { name: /Pick a time first/ })).toBeDisabled();
  });

  it("drops the chosen slot when the day changes", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => ({ status: 200, body: {} })),
    );

    const user = userEvent.setup();
    renderFlow();

    await waitFor(() => expect(screen.getByRole("button", { name: "10:00" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "10:00" }));
    expect(screen.getByRole("button", { name: /^Confirm/ })).toBeEnabled();

    // 10:00 on Tuesday is not the same appointment as 10:00 on Wednesday.
    // Carrying the selection across would submit a time nobody picked.
    const date = screen.getByLabelText(/^Date/i);
    await user.clear(date);
    await user.type(date, "2027-03-03");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Pick a time first/ })).toBeDisabled(),
    );
  });

  it("is operable without a mouse, and announces what changed", async () => {
    // The accessibility exit criterion for this phase cannot be measured by
    // Lighthouse in CI — the landing page is server-rendered from Supabase
    // and CI has placeholder credentials, so there is no page to audit. These
    // are the properties that criterion is really about, asserted where they
    // can be: every control has a label, the grid takes focus from the
    // keyboard, selection state is exposed rather than implied by colour, and
    // availability changes are announced instead of appearing silently.
    vi.stubGlobal(
      "fetch",
      mockFetch(() => ({ status: 200, body: {} })),
    );

    const user = userEvent.setup();
    renderFlow();

    await waitFor(() => expect(screen.getByRole("button", { name: "10:00" })).toBeInTheDocument());

    const slot = screen.getByRole("button", { name: "10:00" });
    slot.focus();
    expect(slot).toHaveFocus();

    // Colour alone would leave a screen reader with three identical buttons.
    expect(slot).toHaveAttribute("aria-pressed", "false");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "10:00" })).toHaveAttribute("aria-pressed", "true");

    // Every input is reachable by its visible label, not by placeholder text.
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mobile number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Date/i)).toBeInTheDocument();

    // The slot grid is a live region: when availability changes under the
    // customer, somebody not watching the screen still hears it.
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toContainElement(screen.getByRole("button", { name: "14:00" }));
  });

  it("says so when a day has nothing free, and suggests the way out", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => ({ status: 200, body: {} }), []),
    );
    renderFlow();

    await waitFor(() => expect(screen.getByText(/Nothing free on that day/i)).toBeInTheDocument());
  });
});
