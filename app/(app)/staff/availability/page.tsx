import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/time/zone";

import { LeaveRequest } from "./leave-request";

export const metadata: Metadata = { title: "My hours" };
export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * A provider's own hours, and asking for time off.
 *
 * Hours are read-only here on purpose. A provider who can rewrite their own
 * working week can quietly make themselves unbookable, and the first anyone
 * knows is a customer finding an empty calendar. Changing them is an admin
 * action under Settings.
 *
 * Leave is a *request* (defect M-14). The spec gave staff a request flow and
 * the table no state to hold it in, so a request either blocked the diary the
 * instant it was typed or did nothing at all. A pending row changes nothing
 * until somebody approves it — which is what "request" has to mean for the
 * clinic to be able to say no.
 */
export default async function StaffAvailability() {
  const member = await requireMember();
  if (!member.onboardingComplete) redirect("/app/onboarding");

  const supabase = await createClient();
  const today = todayIn(member.timezone);

  const { data: me } = await supabase
    .from("staff_resources")
    .select("id, name")
    .eq("business_id", member.businessId)
    .eq("user_id", member.userId)
    .maybeSingle();

  if (!me) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10">
        <p className="rounded-md border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Your login is not linked to a {member.terminology.staff.toLowerCase()} record yet. An
          owner can link it under Settings.
        </p>
      </main>
    );
  }

  const [{ data: rules }, { data: leave }] = await Promise.all([
    supabase
      .from("availability_rules")
      .select("id, day_of_week, start_time, end_time, is_break")
      .eq("staff_id", me.id)
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("availability_overrides")
      .select("id, override_date, reason, status")
      .eq("staff_id", me.id)
      .gte("override_date", today)
      .order("override_date"),
  ]);

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{me.name}</h1>
        <Link href="/staff" className="text-sm underline underline-offset-4">
          My day
        </Link>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-medium tracking-wide uppercase">My week</h2>
        {(rules ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            No hours set, so nothing can be booked with you. Ask an owner to set them.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
            {(rules ?? []).map((rule) => (
              <li key={rule.id} className="px-4 py-2">
                <span className="inline-block w-24 font-medium">{DAYS[rule.day_of_week]}</span>
                {rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}
                {rule.is_break ? (
                  <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800">
                    break
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Read-only. Ask an owner or manager to change these.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium tracking-wide uppercase">Time off</h2>

        {(leave ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing requested.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
            {(leave ?? []).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="font-medium">{entry.override_date}</span>
                  {entry.reason ? (
                    <span className="text-neutral-500"> · {entry.reason}</span>
                  ) : null}
                </span>
                <span
                  className={
                    entry.status === "approved"
                      ? "text-xs text-green-700 dark:text-green-500"
                      : entry.status === "rejected"
                        ? "text-xs text-neutral-400 line-through"
                        : "text-xs text-amber-700 dark:text-amber-500"
                  }
                >
                  {entry.status}
                </span>
              </li>
            ))}
          </ul>
        )}

        <LeaveRequest staffId={me.id} businessId={member.businessId} minDate={today} />

        <p className="mt-2 text-xs text-neutral-500">
          A request changes nothing until it is approved — your calendar stays open until then.
        </p>
      </section>
    </main>
  );
}
