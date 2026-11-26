import { z } from "zod";

import { ApiError, ErrorCode, mapPostgresError } from "@/lib/api/errors";
import { parseBody, parseQuery, route } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { DESK, requireRole } from "@/lib/auth/require-role";
import { callingCodeForTimezone, tryNormalisePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { addDays, zonedDayStart } from "@/lib/time/zone";

/**
 * The booking list, and taking a booking at the desk.
 *
 * ## Reads go through the caller's own session
 *
 * Not the service key. Row-Level Security is what keeps tenant A out of tenant
 * B and a provider out of a colleague's diary, and it only applies to a client
 * carrying the user's session. A list endpoint built on the admin client would
 * be one forgotten `.eq("business_id", …)` away from serving the whole
 * platform, and that filter is the kind of thing that survives review because
 * it looks obviously present.
 *
 * The business id is still passed explicitly — belt and braces, and it lets
 * the query planner use the tenant index rather than filtering after the fact.
 */

const STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
] as const;

const listSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(STATUSES).optional(),
  staffId: z.uuid().optional(),
  serviceId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid", "refunded"]).optional(),
  /** A booking code or part of a phone number. */
  q: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const GET = route("admin.bookings.list", async (request: Request) => {
  const member = await requireRole(request);
  const query = parseQuery(request, listSchema);

  const supabase = await createClient();

  let q = supabase
    .from("bookings")
    .select(
      `id, booking_code, status, payment_status, start_time, end_time, total_price,
       paid_amount, booking_source, customer_notes, branch_id,
       customers!inner (id, full_name, phone, no_show_count),
       services!inner (id, name, color_hex),
       staff_resources!inner (id, name)`,
      { count: "exact" },
    )
    .eq("business_id", member.businessId);

  // Dates arrive as the tenant's own calendar days and are turned into
  // instants here. Comparing a timestamptz against a bare date would use the
  // server's midnight, which in Dhaka is six hours into the working day.
  if (query.from) {
    q = q.gte("start_time", zonedDayStart(query.from, member.timezone).toISOString());
  }
  if (query.to) {
    q = q.lt("start_time", zonedDayStart(addDays(query.to, 1), member.timezone).toISOString());
  }

  if (query.status) q = q.eq("status", query.status);
  if (query.staffId) q = q.eq("staff_id", query.staffId);
  if (query.serviceId) q = q.eq("service_id", query.serviceId);
  if (query.branchId) q = q.eq("branch_id", query.branchId);
  if (query.paymentStatus) q = q.eq("payment_status", query.paymentStatus);

  if (query.q) {
    // A receptionist types either a booking code or the digits of a phone
    // number, and should not have to say which.
    const term = query.q.replace(/[%,()]/g, "");
    q = q.or(`booking_code.ilike.%${term}%,customers.phone.ilike.%${term}%`);
  }

  const offset = (query.page - 1) * query.pageSize;
  const { data, count, error } = await q
    .order("start_time", { ascending: true })
    .range(offset, offset + query.pageSize - 1);

  if (error) throw mapPostgresError(error);

  return ok({
    bookings: data ?? [],
    page: query.page,
    pageSize: query.pageSize,
    total: count ?? 0,
    timezone: member.timezone,
  });
});

const createSchema = z.object({
  serviceId: z.uuid(),
  staffId: z.uuid().nullish(),
  branchId: z.uuid().nullish(),
  startTime: z.iso.datetime({ offset: true }),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(1).max(32),
  customerEmail: z.email().max(254).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
  source: z.enum(["walk_in", "phone", "admin"]).default("walk_in"),
});

/**
 * A booking taken at the desk or over the phone.
 *
 * Goes through `create_booking_atomic` like any other, which matters: the desk
 * may override the *customer's* cutoff, but never the availability gates. A
 * receptionist who can book a provider into their lunch break is a receptionist
 * who will, under pressure, and the provider finds out when the patient
 * arrives.
 *
 * The one thing the desk skips is the public rate limiter — it exists to stop
 * scripts, and the person at the desk is signed in, named in the audit trail,
 * and already constrained by their role.
 */
export const POST = route("admin.bookings.create", async (request: Request) => {
  const member = await requireRole(request, DESK);
  const body = await parseBody(request, createSchema);

  const parsed = tryNormalisePhone(body.customerPhone, callingCodeForTimezone(member.timezone));
  if (!parsed.ok) {
    throw new ApiError(ErrorCode.VALIDATION_FAILED, parsed.message);
  }

  // As the signed-in member, which this path actually requires. 0023 lets
  // `walk_in`, `phone` and `admin` skip the customer's lead time only for a
  // member of the business, and it asks `auth.uid()` who that is. The service
  // role has no `auth.uid()`, so every walk-in booked through the desk was
  // refused as FORBIDDEN by the gate that was meant to permit it.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking_atomic", {
    p_business_id: member.businessId,
    p_service_id: body.serviceId,
    p_staff_id: (body.staffId ?? null) as unknown as string,
    p_start_time: body.startTime,
    p_customer_name: body.customerName,
    p_customer_phone: parsed.value,
    p_customer_email: body.customerEmail || undefined,
    p_customer_notes: body.notes || undefined,
    p_branch_id: body.branchId ?? undefined,
    p_source: body.source,
  });

  if (error) {
    if (error.code === "BK001") {
      const code = error.message as ErrorCode;
      throw new ApiError(
        code in ErrorCode ? code : ErrorCode.VALIDATION_FAILED,
        error.details ?? "That booking could not be made.",
      );
    }
    throw mapPostgresError(error);
  }

  const booking = Array.isArray(data) ? data[0] : data;
  if (!booking) throw new ApiError(ErrorCode.INTERNAL, "The booking was not created.");

  return created({
    bookingId: booking.booking_id,
    code: booking.booking_code,
    status: booking.status,
    staffId: booking.staff_id,
    startTime: booking.start_time,
    endTime: booking.end_time,
  });
});
