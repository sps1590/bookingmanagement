import { z } from "zod";

import { ApiError, ErrorCode, mapPostgresError } from "@/lib/api/errors";
import { parseBody, route } from "@/lib/api/handler";
import { LIMITS, clientIp, enforceRateLimit } from "@/lib/api/rate-limit";
import { ok } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * `POST /api/v1/public/manage/:token/cancel`
 *
 * Defect B-11: the spec lists this endpoint in its API table and provides no
 * SQL behind it, so cancelling online simply did not exist. The rules live in
 * `cancel_booking_by_token` (0020) — the cutoff, the audit row, and silencing
 * the queued reminders, because reminding somebody about an appointment they
 * cancelled is worse than sending nothing at all.
 *
 * Cancelling an already-cancelled booking succeeds quietly. That is the
 * customer pressing the button twice on a slow connection, not an error worth
 * showing them.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const POST = route(
  "public.manage.cancel",
  async (request: Request, context: { params: Promise<{ token: string }> }) => {
    const { token } = await context.params;
    const body = await parseBody(request, bodySchema);

    await enforceRateLimit(`manage:ip:${clientIp(request)}`, LIMITS.bookingsPerIp);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancel_booking_by_token", {
      p_token: token,
      p_reason: body.reason || undefined,
    });

    if (error) {
      if (error.code === "BK001") {
        const code = error.message as ErrorCode;
        throw new ApiError(
          code in ErrorCode ? code : ErrorCode.VALIDATION_FAILED,
          error.details ?? "That could not be cancelled.",
        );
      }
      throw mapPostgresError(error);
    }

    const cancelled = Array.isArray(data) ? data[0] : data;
    if (!cancelled) throw new ApiError(ErrorCode.NOT_FOUND, "That booking link is not valid.");

    return ok({ bookingId: cancelled.booking_id, status: cancelled.status });
  },
);
