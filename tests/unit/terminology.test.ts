import { describe, expect, it } from "vitest";

import {
  INDUSTRIES,
  INDUSTRY_LABELS,
  resolveTerminology,
  terminologyConfigFor,
  terminologyFor,
} from "@/lib/terminology";

/**
 * The terminology layer is what lets one codebase serve six trades. Its
 * failure mode is not a crash — it is a hair salon reading medical language
 * about its own bookings, which looks like carelessness to the one person
 * deciding whether to pay for this.
 *
 * `resolveTerminology` is deliberately total: it never throws. The column it
 * reads is JSONB written by an earlier version of this code, by a tenant
 * through a settings screen, and by hand in fixtures. A page that cannot
 * decide whether to say "Patient" should say "Customer", not return a 500.
 */
describe("terminologyFor", () => {
  it("gives every industry a complete label set", () => {
    for (const industry of INDUSTRIES) {
      const t = terminologyFor(industry);
      for (const [key, value] of Object.entries(t)) {
        expect(value, `${industry}.${key}`).toBeTruthy();
        expect(value.trim(), `${industry}.${key}`).not.toBe("");
      }
      expect(INDUSTRY_LABELS[industry]).toBeTruthy();
    }
  });

  it("distinguishes the trades the spec names", () => {
    expect(terminologyFor("dentist").customer).toBe("Patient");
    expect(terminologyFor("salon").customer).toBe("Client");
    expect(terminologyFor("workshop").staff).toBe("Technician");
    expect(terminologyFor("consultant").resource).toBe("Meeting Room");
  });

  it("writes plurals out rather than deriving them", () => {
    // "Consultation" does not become "Consultation Slots" by any rule, which
    // is exactly why the registry carries both forms instead of appending "s"
    // somewhere in a component.
    expect(terminologyFor("doctor").bookingPlural).toBe("Consultations");
    expect(terminologyFor("dentist").bookingPlural).toBe("Dental Appointments");
  });
});

describe("resolveTerminology", () => {
  it("prefers the tenant's own words over their industry's defaults", () => {
    // A diagnostic centre that calls a booking a "Serial" is right, and we
    // are not.
    const t = resolveTerminology({ booking: "Serial", customer: "Patient" }, "doctor");
    expect(t.booking).toBe("Serial");
    expect(t.customer).toBe("Patient");
    // Untouched labels still come from the industry.
    expect(t.staff).toBe("Doctor");
  });

  it("derives a plural when a tenant renames only the singular", () => {
    // The settings screen allows this, so it has to produce something better
    // than the wrong word.
    expect(resolveTerminology({ booking: "Serial" }, "doctor").bookingPlural).toBe("Serials");
    expect(resolveTerminology({ customer: "Class" }, "other").customerPlural).toBe("Classes");
    expect(resolveTerminology({ staff: "Therapy" }, "other").staffPlural).toBe("Therapies");
  });

  it("falls back to the neutral set for an unknown industry", () => {
    const t = resolveTerminology({}, "something-we-removed");
    expect(t.customer).toBe("Customer");
    expect(t.booking).toBe("Appointment");
  });

  it("never throws on malformed stored config", () => {
    for (const stored of [
      null,
      undefined,
      {},
      "a string",
      42,
      [],
      { customer: "" },
      { customer: 5 },
    ]) {
      const t = resolveTerminology(stored, "dentist");
      expect(t.customer, `stored: ${JSON.stringify(stored)}`).toBeTruthy();
      expect(t.booking).toBeTruthy();
    }
  });

  it("ignores keys it does not know instead of rejecting the row", () => {
    const t = resolveTerminology({ booking: "Serial", somethingNew: "x" }, "doctor");
    expect(t.booking).toBe("Serial");
  });
});

describe("terminologyConfigFor", () => {
  it("produces what signup stores, as plain data", () => {
    const config = terminologyConfigFor("dentist");
    expect(config.customer).toBe("Patient");
    // Must survive a round trip through JSONB unchanged, since that is how it
    // reaches the database and comes back.
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
  });
});
