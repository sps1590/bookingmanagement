/**
 * Canonical API error codes.
 *
 * The client switches on `code`, never on `message` — messages are for humans
 * and get rewritten and translated. Keep this list as the single vocabulary
 * shared by route handlers, RPC wrappers and the UI.
 */
export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",

  /** The slot was taken between rendering the grid and submitting. Phase 2. */
  SLOT_TAKEN: "SLOT_TAKEN",
  /** Requested time is outside working hours, in a break, or on a closed day. */
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  /** Past the tenant's reschedule/cancel cutoff window. */
  CUTOFF_PASSED: "CUTOFF_PASSED",
  /** `max_advance_days` / `min_lead_minutes` violated. */
  OUTSIDE_BOOKING_WINDOW: "OUTSIDE_BOOKING_WINDOW",
  /** `max_reschedules` exhausted. */
  RESCHEDULE_LIMIT_REACHED: "RESCHEDULE_LIMIT_REACHED",
  /** Staff member does not perform the requested service. */
  STAFF_SERVICE_MISMATCH: "STAFF_SERVICE_MISMATCH",
  /** Subscription plan limit hit (staff, branches, monthly bookings). Phase 8. */
  PLAN_LIMIT_REACHED: "PLAN_LIMIT_REACHED",
  /** Tenant is out of SMS credit. Phase 5. */
  SMS_QUOTA_EXHAUSTED: "SMS_QUOTA_EXHAUSTED",
  /** Illegal booking status transition. Phase 2. */
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  PAYMENT_FAILED: "PAYMENT_FAILED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SLOT_TAKEN: 409,
  SLOT_UNAVAILABLE: 409,
  CUTOFF_PASSED: 422,
  OUTSIDE_BOOKING_WINDOW: 422,
  RESCHEDULE_LIMIT_REACHED: 422,
  STAFF_SERVICE_MISMATCH: 422,
  PLAN_LIMIT_REACHED: 402,
  SMS_QUOTA_EXHAUSTED: 402,
  INVALID_STATUS_TRANSITION: 422,
  PAYMENT_FAILED: 402,
};

export function statusForCode(code: ErrorCode): number {
  return STATUS[code] ?? 500;
}

/** Throw from anywhere inside a wrapped handler to produce a clean envelope. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return statusForCode(this.code);
  }
}

/**
 * Map a Postgres error to an API error.
 *
 * `23P01` is `exclusion_violation` — the GIST constraint that makes
 * double-booking impossible (spec §2.2). It surfacing here means two customers
 * raced for one slot, which is expected traffic, not a bug: the loser must get
 * a clean `SLOT_TAKEN` and a refreshed grid rather than a 500.
 */
export function mapPostgresError(error: { code?: string; message?: string }): ApiError {
  switch (error.code) {
    case "23P01":
      return new ApiError(
        ErrorCode.SLOT_TAKEN,
        "That time slot was just booked by someone else. Please choose another.",
      );
    case "23505":
      return new ApiError(ErrorCode.VALIDATION_FAILED, "That record already exists.");
    case "23503":
      return new ApiError(ErrorCode.NOT_FOUND, "A referenced record does not exist.");
    case "42501":
      return new ApiError(ErrorCode.FORBIDDEN, "You do not have access to this resource.");
    default:
      return new ApiError(ErrorCode.INTERNAL, error.message ?? "Unexpected database error.");
  }
}
