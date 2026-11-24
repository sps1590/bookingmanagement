import { z } from "zod";

/**
 * Phone number normalisation to E.164.
 *
 * This exists because of one constraint: `UNIQUE (business_id, phone)` on
 * `customers`. Without a single canonical format that constraint is
 * decorative — `01711000000`, `+8801711000000` and `017 1100 0000` are one
 * patient and three rows, and the receptionist ends up with three visit
 * histories for the same person while the reminder goes to whichever row
 * today's booking happened to attach to.
 *
 * The database enforces the format with a CHECK. This module is what lets a
 * receptionist still type `01711-000000` at the desk, the way they always
 * have, and have it land correctly.
 *
 * Deliberately not a library. libphonenumber is 500 KB for validation we do
 * not need: the question here is "which digits identify this person", not
 * "is this a valid mobile prefix in Sylhet".
 */

/** The format the database accepts. Keep in step with the CHECK constraints. */
export const E164 = /^\+[1-9][0-9]{7,14}$/;

export const e164Schema = z
  .string()
  .regex(E164, "Must be an international number, for example +8801711000000");

/**
 * Bangladesh. The platform's market, and the assumption a bare `017…` is read
 * under. A tenant outside it passes its own code — see `callingCodeForTimezone`.
 */
export const DEFAULT_CALLING_CODE = "880";

export class PhoneFormatError extends Error {
  constructor(public readonly input: string) {
    super(
      "That does not look like a phone number. Enter it with the country code, " +
        "for example +8801711000000.",
    );
    this.name = "PhoneFormatError";
  }
}

/**
 * Normalise user input to E.164, or throw.
 *
 * Handles what people actually type: spaces, dashes, brackets, a leading `00`
 * instead of `+`, and the national trunk `0`.
 */
export function normalisePhone(input: string, callingCode = DEFAULT_CALLING_CODE): string {
  const raw = (input ?? "").trim();
  if (!raw) throw new PhoneFormatError(input);

  // Keep a leading + and digits; drop the punctuation people type.
  const cleaned = raw.replace(/[^\d+]/g, "");

  let digits: string;

  if (cleaned.startsWith("+")) {
    digits = cleaned.slice(1);
  } else if (cleaned.startsWith("00")) {
    // International prefix used in much of the world.
    digits = cleaned.slice(2);
  } else if (cleaned.startsWith("0")) {
    // National trunk code: 01711000000 -> 8801711000000
    digits = callingCode + cleaned.slice(1);
  } else if (cleaned.startsWith(callingCode)) {
    // Already carries the country code, without a +.
    digits = cleaned;
  } else {
    // A bare subscriber number.
    digits = callingCode + cleaned;
  }

  // A second `+` anywhere, or any stray non-digit, means we misread it.
  if (!/^\d+$/.test(digits)) throw new PhoneFormatError(input);

  const candidate = `+${digits}`;
  if (!E164.test(candidate)) throw new PhoneFormatError(input);

  return candidate;
}

/** Non-throwing variant for form validation. */
export function tryNormalisePhone(
  input: string,
  callingCode = DEFAULT_CALLING_CODE,
): { ok: true; value: string } | { ok: false; message: string } {
  try {
    return { ok: true, value: normalisePhone(input, callingCode) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof PhoneFormatError ? error.message : "Invalid phone number.",
    };
  }
}

/**
 * Best guess at a tenant's calling code from its timezone, used only to choose
 * how to read a locally-formatted number during onboarding.
 *
 * A guess, not a lookup: a timezone is not a dialling plan, and
 * America/New_York covers one country while Asia/Dhaka happens to cover
 * exactly one. Everything outside this short list falls back to Bangladesh,
 * and the onboarding form shows the resolved number back to the tenant so a
 * wrong guess is visible before it is saved rather than after.
 */
const CALLING_CODE_BY_ZONE: Record<string, string> = {
  "Asia/Dhaka": "880",
  "Asia/Kolkata": "91",
  "Asia/Karachi": "92",
  "Asia/Kathmandu": "977",
  "Asia/Colombo": "94",
  "Asia/Dubai": "971",
  "Asia/Riyadh": "966",
  "Asia/Singapore": "65",
  "Asia/Kuala_Lumpur": "60",
  "Europe/London": "44",
  "America/New_York": "1",
  "America/Chicago": "1",
  "America/Los_Angeles": "1",
  "Australia/Sydney": "61",
};

export function callingCodeForTimezone(timezone: string | null | undefined): string {
  return CALLING_CODE_BY_ZONE[timezone ?? ""] ?? DEFAULT_CALLING_CODE;
}

/**
 * For display at the desk: `+8801711000000` -> `+880 1711-000000`.
 *
 * Presentation only. What is stored and compared is always E.164 — see
 * `lib/logger.ts` for how this is redacted in logs, which is a different
 * question again.
 */
export function formatPhoneForDisplay(e164: string): string {
  if (!E164.test(e164)) return e164;

  if (e164.startsWith("+880") && e164.length === 14) {
    return `+880 ${e164.slice(4, 8)}-${e164.slice(8)}`;
  }
  if (e164.startsWith("+1") && e164.length === 12) {
    return `+1 (${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
  }
  return e164;
}
