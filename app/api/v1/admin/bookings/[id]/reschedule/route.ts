import { z } from "zod";

import { ApiError, ErrorCode, mapPostgresError } from "@/lib/api/errors";
import { parseBody, route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { DESK, requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

/**
 * `PATCH /api/v1/admin/bookings/:id/reschedule`
 *
 * Moving an appointment from the desk, and what the calendar's drag-and-drop
 * will call when it arrives.
 *
 * `admin_reschedule_booking` (0020) bypasses the *customer's* cutoff — a
 * clinic is allowed to rearrange its own afternoon at short notice — but runs
 * the availability gate exactly as a customer would. The alternative is a
 * receptionist dropping an appointment onto a provider's lunch break with
 * nothing objecting, which the plan lists as an MVP gate for good reason.
 *
 * A collision comes back as `SLOT_TAKEN`, which is what the calendar needs in
 * order to roll the card back to where it came from rather than leaving the
 * screen disagreeing with the database.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  startTime: z.iso.datetime({ offset: true }),
  /** Moving between columns on the calendar changes the provider too. */
  staffId: z.uuid().nullish(),
  reason: z.string().trim().max(500).optional(),
});

export const PATCH = route(
  "admin.bookings.reschedule",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole(request, DESK);

    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, "That is not a booking id.");
    }

    const body = await parseBody(request, bodySchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_reschedule_booking", {
      p_booking_id: id,
      p_start_time: body.startTime,
      p_staff_id: body.staffId ?? undefined,
      p_reason: body.reason || undefined,
    });

    if (error) {
      if (error.code === "BK001") {
        const code = error.message as ErrorCode;
        throw new ApiError(
          code in ErrorCode ? code : ErrorCode.VALIDATION_FAILED,
          error.details ?? "That move was refused.",
        );
      }
      throw mapPostgresError(error);
    }

    const moved = Array.isArray(data) ? data[0] : data;
    if (!moved) throw new ApiError(ErrorCode.INTERNAL, "The booking was not moved.");

    return ok({
      bookingId: moved.booking_id,
      startTime: moved.start_time,
      endTime: moved.end_time,
      staffId: moved.staff_id,
    });
  },
);
