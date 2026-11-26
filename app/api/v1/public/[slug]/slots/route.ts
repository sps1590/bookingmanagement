import { z } from "zod";

import { route, parseQuery } from "@/lib/api/handler";
import { LIMITS, clientIp, enforceRateLimit } from "@/lib/api/rate-limit";
import { ok } from "@/lib/api/response";
import { requirePublicBusiness } from "@/lib/public/tenant";
import { publicClient } from "@/lib/supabase/public";

/**
 * `GET /api/v1/public/:slug/slots?serviceId=&date=&staffId=`
 *
 * Free times for one service on one date. `staffId` omitted means the portal's
 * "Any Available" option, which is defect B-14: the spec offers it on screen
 * and its RPC requires a staff id.
 *
 * The answer is never cached. A slot grid that is thirty seconds stale is a
 * customer tapping a time that has gone, and the recovery from that — a
 * refetch and an inline "that one just went" — is strictly worse than being
 * right the first time.
 */

const querySchema = z.object({
  serviceId: z.uuid(),
  // A plain date in the tenant's own timezone, which is what the picker shows.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  staffId: z.uuid().optional(),
  branchId: z.uuid().optional(),
});

export const GET = route(
  "public.slots",
  async (request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const query = parseQuery(request, querySchema);

    // The limiter and the tenant lookup are independent, so they go together
    // rather than one after the other. This route runs on every tap of a date
    // in the picker, and it used to spend two sequential round trips — one to
    // a counter table, one to a view — before it began looking for a slot.
    // A read performed for a caller who turns out to be over the limit is
    // thrown away; a second of waiting on the common path is not recoverable.
    const [, business] = await Promise.all([
      enforceRateLimit(`slots:ip:${clientIp(request)}`, LIMITS.slotsPerIp),
      requirePublicBusiness(slug),
    ]);
    const supabase = publicClient();

    if (query.staffId) {
      const { data, error } = await supabase.rpc("get_available_slots", {
        p_business_id: business.id,
        p_service_id: query.serviceId,
        p_staff_id: query.staffId,
        p_date: query.date,
      });
      if (error) throw error;

      return ok({
        date: query.date,
        timezone: business.timezone,
        slots: (data ?? []).map((s) => ({
          start: s.slot_start,
          end: s.slot_end,
          staffId: query.staffId,
        })),
      });
    }

    const { data, error } = await supabase.rpc("get_available_slots_any", {
      p_business_id: business.id,
      p_service_id: query.serviceId,
      p_date: query.date,
      p_branch_id: query.branchId ?? undefined,
    });
    if (error) throw error;

    // "Any Available" returns one row per provider per slot. The grid wants one
    // button per time, so collapse to the first provider offered for each —
    // the RPC orders by sort_order, so that is the tenant's own preference
    // rather than whichever row the planner returned first.
    const seen = new Map<string, { start: string; end: string; staffId: string }>();
    for (const row of data ?? []) {
      if (!seen.has(row.slot_start)) {
        seen.set(row.slot_start, {
          start: row.slot_start,
          end: row.slot_end,
          staffId: row.staff_id,
        });
      }
    }

    return ok({
      date: query.date,
      timezone: business.timezone,
      slots: [...seen.values()],
    });
  },
);
