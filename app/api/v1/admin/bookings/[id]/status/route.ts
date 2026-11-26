import { z } from "zod";

import { ApiError, ErrorCode, mapPostgresError } from "@/lib/api/errors";
import { parseBody, route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { ANY_MEMBER, requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

/**
 * `PATCH /api/v1/admin/bookings/:id/status`
 *
 * Check-in, complete, no-show, cancel — the four buttons a receptionist spends
 * the day pressing.
 *
 * Every rule lives in `set_booking_status` (0020): the legal transitions, the
 * role test that mirrors the RLS policy, the audit row, and the notification
 * re-queue. This handler does not re-implement any of them, which is the point
 * — a second copy of "which status may follow which" would drift, and the
 * drift would show up as a cancelled appointment someone marked as attended.
 *
 * Called with the caller's own session rather than the service key, so the
 * function sees a real `auth.uid()` and the audit trail names a person rather
 * than "the system".
 */

const bodySchema = z.object({
  status: z.enum(["pending", "confirmed", "checked_in", "completed", "cancelled", "no_show"]),
  reason: z.string().trim().max(500).optional(),
});

export const PATCH = route(
  "admin.bookings.status",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole(request, ANY_MEMBER);

    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, "That is not a booking id.");
    }

    const body = await parseBody(request, bodySchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_booking_status", {
      p_booking_id: id,
      p_new_status: body.status,
      p_reason: body.reason || undefined,
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

    return ok({ bookingId: id, status: data });
  },
);
