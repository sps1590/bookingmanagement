import "server-only";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting for the public, unauthenticated endpoints.
 *
 * `create_booking_atomic` already caps how many open bookings one *customer*
 * may hold, but that only binds once a customer record exists. It does nothing
 * against a script posting under a thousand invented phone numbers, and the
 * public portal hands out the business id needed to try.
 *
 * The counter lives in Postgres (migration 0021), not in Redis or Vercel KV.
 * The whole stack is the free tier and there is no durable key-value store in
 * it; a limiter held in a serverless function's memory resets on every cold
 * start, which is a limiter that does not limit.
 *
 * ## What is deliberately not here
 *
 * Phone OTP. The plan lists it as optional per tenant (defect N-02: the spec
 * names it and never specifies provider, expiry or attempt limits). Every
 * route to a one-time code costs money — SMS has no free tier for
 * business-initiated messages anywhere this product ships, which is the same
 * finding that removed SMS reminders in D-009/D-010. Adding it would mean
 * adding the first paid dependency to a stack whose premise is that there
 * isn't one. So the abuse story is: a per-IP and per-phone limit here, the
 * per-customer cap in the database, and email confirmation as the weak proof
 * of identity. Documented as D-018 rather than left as a silent omission.
 */

/**
 * Requests per window, by scope. Tuned for a booking form, not an API.
 *
 * These are abuse ceilings and nothing else — they exist to stop a script,
 * not to ration a clinic. The first numbers here (10 bookings an hour per IP)
 * were a real ceiling on real use: a hospital, a campus or an office shares
 * one public address, so a busy morning of patients booking from the building
 * wifi looks like one caller making its eleventh request. The limit is now
 * far above anything a human crowd produces and still far below what a script
 * does in a minute.
 *
 * Per phone stays comparatively tight on purpose: one number holding a
 * tenant's whole day is the abuse signal that actually matters, and a real
 * person booking for their whole family is well under ten.
 */
export const LIMITS = {
  /** A shared office or hospital connection is one IP and many people. */
  bookingsPerIp: { limit: 120, windowSeconds: 3600 },
  /** The same number booking repeatedly is the abuse signal that matters. */
  bookingsPerPhone: { limit: 12, windowSeconds: 3600 },
  /** Browsing availability is cheap, but not free — this is a database call. */
  slotsPerIp: { limit: 1200, windowSeconds: 3600 },
} as const;

/**
 * The caller's IP, as far as it can be known behind a proxy.
 *
 * `x-forwarded-for` is client-controllable in general; on Vercel the platform
 * overwrites it, so the leftmost entry is the real peer. Anywhere else this is
 * a hint rather than a fact — which is why it is one signal among several and
 * not the only gate.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Consume one unit from a bucket, raising `RATE_LIMITED` when it is spent.
 *
 * Fails **open** on a database error, and says so loudly in the log. A limiter
 * that takes the booking form down when it cannot reach its counter table has
 * turned a defence against abuse into an outage for every real customer, which
 * is a worse trade than letting a burst through.
 */
export async function enforceRateLimit(
  bucket: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
  message = "Too many attempts. Please wait a few minutes and try again.",
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      logger.error("ratelimit.unavailable", { bucket, error: error.message });
      return;
    }

    if (data === false) {
      logger.warn("ratelimit.exceeded", { bucket, limit, windowSeconds });
      throw new ApiError(ErrorCode.RATE_LIMITED, message);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error("ratelimit.failed", {
      bucket,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
