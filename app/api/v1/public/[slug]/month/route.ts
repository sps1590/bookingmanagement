import { z } from "zod";

import { route, parseQuery } from "@/lib/api/handler";
import { LIMITS, clientIp, enforceRateLimit } from "@/lib/api/rate-limit";
import { ok } from "@/lib/api/response";
import { requirePublicTenant } from "@/lib/public/tenant";
import { createClient } from "@/lib/supabase/server";

/**
 * `GET /api/v1/public/:slug/month?serviceId=&year=&month=&staffId=`
 *
 * Which days of a month can be booked. Defect M-13: the spec's calendar had no
 * endpoint behind it, so it either made thirty round trips or let people click
 * on days the clinic is shut.
 *
 * A day reported unavailable may be closed, a holiday, the provider's leave,
 * or simply full. The portal does not say which, and that is deliberate — a
 * calendar that distinguishes "Dr Rahman is on leave" from "fully booked"
 * publishes one person's movements to anyone with the link.
 */

export const dynamic = "force-dynamic";

const querySchema = z.object({
  serviceId: z.uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  staffId: z.uuid().optional(),
});

export const GET = route(
  "public.month",
  async (request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const query = parseQuery(request, querySchema);

    await enforceRateLimit(`month:ip:${clientIp(request)}`, LIMITS.slotsPerIp);

    const { business } = await requirePublicTenant(slug);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_month_availability", {
      p_business_id: business.id,
      p_service_id: query.serviceId,
      p_staff_id: query.staffId ?? undefined,
      p_year: query.year,
      p_month: query.month,
    });
    if (error) throw error;

    return ok({
      year: query.year,
      month: query.month,
      timezone: business.timezone,
      days: (data ?? []).map((d) => ({ date: d.day, available: d.has_slots })),
    });
  },
);
