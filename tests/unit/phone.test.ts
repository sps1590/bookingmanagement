import { describe, expect, it } from "vitest";

import {
  callingCodeForTimezone,
  E164,
  formatPhoneForDisplay,
  normalisePhone,
  PhoneFormatError,
  tryNormalisePhone,
} from "@/lib/phone";

/**
 * Phone normalisation exists to make `UNIQUE (business_id, phone)` mean
 * something. Without one canonical format, `01711000000` and `+8801711000000`
 * are the same patient and two rows — two visit histories, and the reminder
 * going to whichever row today's booking attached to.
 *
 * So the test that matters most is not "does it accept a valid number" but
 * "do all the ways a receptionist types one number collapse to the same
 * string".
 */
describe("normalisePhone", () => {
  it("collapses every way a Bangladeshi number gets typed into one value", () => {
    const expected = "+8801711000000";

    for (const input of [
      "01711000000",
      "01711-000000",
      "017 1100 0000",
      "+8801711000000",
      "+880 1711 000000",
      "8801711000000",
      "008801711000000",
      "(017) 1100-0000",
    ]) {
      expect(normalisePhone(input), `input: ${input}`).toBe(expected);
    }
  });

  it("reads a local number against the tenant's own dialling code", () => {
    // The same digits mean different numbers in different countries, so the
    // calling code has to come from the tenant rather than from a constant.
    expect(normalisePhone("2125550123", "1")).toBe("+12125550123");
    expect(normalisePhone("(212) 555-0123", "1")).toBe("+12125550123");
    expect(normalisePhone("09876543210", "91")).toBe("+919876543210");
  });

  it("leaves an already-international number from another country alone", () => {
    expect(normalisePhone("+12125550123")).toBe("+12125550123");
    expect(normalisePhone("+442071234567")).toBe("+442071234567");
  });

  it("rejects what cannot be read as a number rather than guessing", () => {
    for (const input of ["", "   ", "abc", "+", "12", "++8801711000000", "+0801711000000"]) {
      expect(() => normalisePhone(input), `input: ${JSON.stringify(input)}`).toThrow(
        PhoneFormatError,
      );
    }
  });

  it("produces something the database CHECK constraint will accept", () => {
    // The regex here is a copy of the one in the migrations. If they ever
    // disagree, normalisation starts producing values the database refuses at
    // insert time — which surfaces as a 500 on a booking, not a form error.
    for (const input of ["01711000000", "2125550123", "+442071234567"]) {
      expect(E164.test(normalisePhone(input))).toBe(true);
    }
  });

  it("reports a usable message instead of throwing, for form validation", () => {
    const bad = tryNormalisePhone("nonsense");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/country code/i);

    const good = tryNormalisePhone("01711000000");
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value).toBe("+8801711000000");
  });
});

describe("callingCodeForTimezone", () => {
  it("maps the zones the product actually offers", () => {
    expect(callingCodeForTimezone("Asia/Dhaka")).toBe("880");
    expect(callingCodeForTimezone("America/New_York")).toBe("1");
    expect(callingCodeForTimezone("Europe/London")).toBe("44");
  });

  it("falls back rather than failing on an unknown zone", () => {
    // A timezone is not a dialling plan, so this is a guess by design. It must
    // never throw: the onboarding form shows the resolved number back to the
    // tenant, so a wrong guess is visible before it is saved.
    expect(callingCodeForTimezone("Antarctica/Troll")).toBe("880");
    expect(callingCodeForTimezone(null)).toBe("880");
    expect(callingCodeForTimezone(undefined)).toBe("880");
  });
});

describe("formatPhoneForDisplay", () => {
  it("groups digits for the front desk", () => {
    expect(formatPhoneForDisplay("+8801711000000")).toBe("+880 1711-000000");
    expect(formatPhoneForDisplay("+12125550123")).toBe("+1 (212) 555-0123");
  });

  it("passes through anything it does not recognise", () => {
    expect(formatPhoneForDisplay("+442071234567")).toBe("+442071234567");
    expect(formatPhoneForDisplay("not a number")).toBe("not a number");
  });
});
