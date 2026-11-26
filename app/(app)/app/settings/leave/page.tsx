import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/time/zone";

import { ActionForm, Submit } from "../action-form";
import { decideLeave } from "../../../staff/availability/actions";

export const dynamic = "force-dynamic";

/**
 * Deciding on time off (defect M-14).
 *
 * A pending request changes nothing — the provider's calendar stays open
 * until somebody here approves it. That is the whole point of giving the
 * request a state: without one, asking for leave and taking it were the same
 * action, and a clinic had no way to say "not that Thursday".
 */
export default async function LeaveSettings() {
  const member = await requireMember();
  const supabase = await createClient();
  const today = todayIn(member.timezone);

  const { data } = await supabase
    .from("availability_overrides")
    .select("id, override_date, reason, status, staff_id")
    .eq("business_id", member.businessId)
    .not("staff_id", "is", null)
    .gte("override_date", today)
    .order("status")
    .order("override_date");

  const requests = data ?? [];

  const { data: staff } = await supabase
    .from("staff_resources")
    .select("id, name")
    .eq("business_id", member.businessId);

  const nameOf = new Map((staff ?? []).map((person) => [person.id, person.name]));
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="mt-8 space-y-10">
      <section>
        <h2 className="text-sm font-medium tracking-wide uppercase">Waiting on you</h2>

        {pending.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">Nothing to decide.</p>
        ) : (
          <ul className="divide-border/70 border-border bg-card elevated mt-2 divide-y overflow-hidden rounded-xl border text-sm">
            {pending.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span>
                  <span className="font-medium">
                    {request.staff_id ? (nameOf.get(request.staff_id) ?? "—") : "—"}
                  </span>
                  <span className="text-muted-foreground"> · {request.override_date}</span>
                  {request.reason ? (
                    <span className="text-muted-foreground block text-xs">{request.reason}</span>
                  ) : null}
                </span>

                <span className="flex gap-2">
                  <ActionForm action={decideLeave}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <Submit subtle label="Approve" />
                  </ActionForm>
                  <ActionForm action={decideLeave}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <Submit subtle label="Decline" />
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium tracking-wide uppercase">Already decided</h2>
          <ul className="divide-border/70 border-border bg-card elevated mt-2 divide-y overflow-hidden rounded-xl border text-sm">
            {decided.map((request) => (
              <li key={request.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="font-medium">
                    {request.staff_id ? (nameOf.get(request.staff_id) ?? "—") : "—"}
                  </span>
                  <span className="text-muted-foreground"> · {request.override_date}</span>
                </span>
                <span
                  className={
                    request.status === "approved"
                      ? "text-success text-xs"
                      : "text-muted-foreground/70 text-xs"
                  }
                >
                  {request.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
