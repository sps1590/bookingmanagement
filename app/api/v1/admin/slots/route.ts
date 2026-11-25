import { z } from "zod";

import { mapPostgresError } from "@/lib/api/errors";
import { parseQuery, route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { DESK, requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

/**
 * `GET /api/v1/admin/slots?serviceId=&staffId=&date=`
 *
 * Free times as the front desk sees them: `get_desk_slots` (0023) lifts the
 * minimum lead time and the advance window, which are courtesies to a customer
 * booking online rather than facts about whether the provider is free. A
 * walk-in is by definition inside the lead time, and the public endpoint would
 * have filtered out every slot the person standing at the counter could
 * actually take.
 *
 * Everything that describes real availability still applies — working hours,
 * breaks, holidays, leave, the service mapping, and the exclusion constraint
 * at the end of it. The desk cannot book a provider into their lunch.
 */

export const dynamic = "force-dynamic";

const querySchema = z.object({
  serviceId: z.uuid(),
  staffId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
});

export const GET = route("admin.slots", async (request: Request) => {
  const member = await requireRole(request, DESK);
  const query = parseQuery(request, querySchema);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_desk_slots", {
    p_business_id: member.businessId,
    p_service_id: query.serviceId,
    p_staff_id: query.staffId,
    p_date: query.date,
  });

  if (error) throw mapPostgresError(error);

  return ok({
    date: query.date,
    timezone: member.timezone,
    slots: (data ?? []).map((s) => ({ start: s.slot_start, end: s.slot_end })),
  });
});
