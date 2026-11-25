import { z } from "zod";

import { ApiError, ErrorCode, mapPostgresError } from "@/lib/api/errors";
import { parseBody, route } from "@/lib/api/handler";
import { LIMITS, clientIp, enforceRateLimit } from "@/lib/api/rate-limit";
import { ok } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * `PATCH /api/v1/public/manage/:token/reschedule`
 *
 * The guest's own change. Everything that decides whether it is allowed lives
 * in `reschedule_booking_by_token` (0020): the cutoff, the reschedule limit,
 * the availability gate the spec left out entirely (defect B-19), and the
 * token rotation that stops a forwarded link being replayed (M-11).
 *
 * Rate-limited by IP because the token is the only credential here and a
 * 48-character hex string is worth guessing at only if you can guess quickly.
 * The limit makes that pointless without inconveniencing a customer who
 * changes their mind twice.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  startTime: z.iso.datetime({ offset: true }),
});

export const PATCH = route(
  "public.manage.reschedule",
  async (request: Request, context: { params: Promise<{ token: string }> }) => {
    const { token } = await context.params;
    const body = await parseBody(request, bodySchema);

    await enforceRateLimit(`manage:ip:${clientIp(request)}`, LIMITS.bookingsPerIp);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reschedule_booking_by_token", {
      p_token: token,
      p_start_time: body.startTime,
    });

    if (error) {
      if (error.code === "BK001") {
        const code = error.message as ErrorCode;
        throw new ApiError(
          code in ErrorCode ? code : ErrorCode.VALIDATION_FAILED,
          error.details ?? "That change was refused.",
        );
      }
      throw mapPostgresError(error);
    }

    const moved = Array.isArray(data) ? data[0] : data;
    if (!moved) throw new ApiError(ErrorCode.NOT_FOUND, "That booking link is not valid.");

    // The new token is returned once, to the browser that just used the old
    // one. It is never logged — see redactToken in lib/logger.ts.
    return ok({
      bookingId: moved.booking_id,
      startTime: moved.start_time,
      endTime: moved.end_time,
      manageToken: moved.reschedule_token,
      reschedulesLeft: moved.reschedules_left,
    });
  },
);
