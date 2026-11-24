import { describe, expect, it } from "vitest";

import { ApiError, ErrorCode, mapPostgresError, statusForCode } from "@/lib/api/errors";
import { redactEmail, redactPhone, redactToken } from "@/lib/logger";

describe("error code status mapping", () => {
  it("maps a lost slot race to 409 rather than a server error", () => {
    expect(statusForCode(ErrorCode.SLOT_TAKEN)).toBe(409);
  });

  it("maps plan limits to 402 so the client can show an upgrade prompt", () => {
    expect(statusForCode(ErrorCode.PLAN_LIMIT_REACHED)).toBe(402);
  });

  it("defaults unknown codes to 500", () => {
    expect(statusForCode("NOT_A_REAL_CODE" as ErrorCode)).toBe(500);
  });
});

describe("mapPostgresError", () => {
  it("translates the double-booking GIST violation into SLOT_TAKEN", () => {
    // 23P01 = exclusion_violation, raised by the prevent_double_booking
    // constraint. This must never reach the customer as a 500.
    const mapped = mapPostgresError({ code: "23P01", message: "conflicting key value" });
    expect(mapped).toBeInstanceOf(ApiError);
    expect(mapped.code).toBe(ErrorCode.SLOT_TAKEN);
    expect(mapped.status).toBe(409);
  });

  it("translates an RLS denial into FORBIDDEN", () => {
    expect(mapPostgresError({ code: "42501" }).code).toBe(ErrorCode.FORBIDDEN);
  });

  it("falls back to INTERNAL for unrecognised codes", () => {
    expect(mapPostgresError({ code: "XX000", message: "boom" }).code).toBe(ErrorCode.INTERNAL);
  });
});

describe("log redaction", () => {
  it("never logs a full phone number", () => {
    const redacted = redactPhone("+8801711000000");
    expect(redacted).not.toContain("1711000000");
    expect(redacted.startsWith("+88017")).toBe(true);
  });

  it("never logs a full reschedule token", () => {
    const token = "a".repeat(48);
    expect(redactToken(token).length).toBeLessThan(token.length);
  });

  it("masks the local part of an email", () => {
    expect(redactEmail("tanvir@example.com")).toBe("t***@example.com");
  });
});
