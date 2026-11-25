import { z } from "zod";

import { ApiError, ErrorCode, mapPostgresError } from "@/lib/api/errors";
import { route, parseBody } from "@/lib/api/handler";
import { LIMITS, clientIp, enforceRateLimit } from "@/lib/api/rate-limit";
import { created } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { callingCodeForTimezone, tryNormalisePhone } from "@/lib/phone";
import { requirePublicTenant } from "@/lib/public/tenant";
import { createClient } from "@/lib/supabase/server";

/**
 * `POST /api/v1/public/:slug/bookings`
 *
 * The one endpoint on the public portal that writes. Everything that decides
 * whether the booking is legitimate lives in `create_booking_atomic` (0019) —
 * ten gates, ending with the exclusion constraint. This handler's job is the
 * part the database cannot do: know who is asking.
 *
 * Two limits, because they catch different things. Per IP stops one machine
 * scripting the form; per phone stops a distributed attempt converging on one
 * number, and also stops a frustrated customer double-submitting their way
 * into four appointments.
 *
 * ## Why the admin client here
 *
 * `create_booking_atomic` is granted to `anon`, so the anon client would work.
 * The service key is used anyway for one reason: the rate limit check must not
 * be something the caller can decline to perform. Keeping both calls on the
 * server side of the same client makes that obvious rather than incidental.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  serviceId: z.uuid(),
  // Null, not absent, is how the portal says "Any Available" (defect B-14).
  staffId: z.uuid().nullish(),
  branchId: z.uuid().nullish(),
  startTime: z.iso.datetime({ offset: true }),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(1).max(32),
  customerEmail: z.email().max(254).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
});

export const POST = route(
  "public.bookings.create",
  async (request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const body = await parseBody(request, bodySchema);

    const ip = clientIp(request);
    await enforceRateLimit(`book:ip:${ip}`, LIMITS.bookingsPerIp);

    const { business } = await requirePublicTenant(slug);

    // Normalised before it reaches the database, because `customers` is unique
    // on (business_id, phone): without one canonical form, `01711000000` and
    // `+8801711000000` are one patient and two records, and the reminder goes
    // to whichever row today's booking happened to attach to.
    const parsed = tryNormalisePhone(body.customerPhone, callingCodeForTimezone(business.timezone));
    if (!parsed.ok) {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, parsed.message);
    }
    const phone = parsed.value;

    await enforceRateLimit(
      `book:phone:${phone}`,
      LIMITS.bookingsPerPhone,
      "That number has made several bookings recently. Please call us instead.",
    );

    // The anon client, not the service role. `create_booking_atomic` is
    // SECURITY DEFINER and granted to `anon` precisely so this path needs no
    // privilege: it does every check itself, and the one thing the service
    // key would add here is the ability for a bug in this file to write to
    // any tenant. It also made the booking form fail with "Invalid API key"
    // when that key was wrong, which is a strange way for a public page to
    // break.
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_booking_atomic", {
      p_business_id: business.id,
      p_service_id: body.serviceId,
      // NULL means "Any Available", and the function resolves it to a real
      // provider before its own gates run. The generated types mark the
      // parameter required because the SQL gives it no default — it cannot,
      // being positional ahead of parameters that have none — so the null is
      // spelled out here rather than hidden behind an optional.
      p_staff_id: (body.staffId ?? null) as unknown as string,
      p_start_time: body.startTime,
      p_customer_name: body.customerName,
      p_customer_phone: phone,
      p_customer_email: body.customerEmail || undefined,
      p_customer_notes: body.notes || undefined,
      p_branch_id: body.branchId ?? undefined,
      p_source: "online",
    });

    if (error) {
      // BK001 carries a canonical ErrorCode as its message; the sentence a
      // human reads is in `details`. Anything else goes through the Postgres
      // mapper, which turns 23P01 into SLOT_TAKEN rather than a 500.
      if (error.code === "BK001") {
        const code = error.message as ErrorCode;
        throw new ApiError(
          code in ErrorCode ? code : ErrorCode.VALIDATION_FAILED,
          error.details ?? "That booking could not be made.",
        );
      }
      logger.warn("booking.rejected", { slug, code: error.code });
      throw mapPostgresError(error);
    }

    const booking = Array.isArray(data) ? data[0] : data;
    if (!booking) {
      throw new ApiError(ErrorCode.INTERNAL, "The booking was not created.");
    }

    // The token is the guest's only credential for /manage/:token — it stands
    // in for a password. It is returned once, to the person who just booked,
    // and never logged (see logger.ts redactToken).
    return created({
      bookingId: booking.booking_id,
      code: booking.booking_code,
      status: booking.status,
      manageToken: booking.reschedule_token,
      staffId: booking.staff_id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      timezone: business.timezone,
    });
  },
);
