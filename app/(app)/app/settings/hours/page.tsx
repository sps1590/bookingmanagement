import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/time/zone";

import { ActionForm, Submit } from "../action-form";
import { addClosure, addHours, removeClosure, removeHours } from "../actions";

export const dynamic = "force-dynamic";

// 0 = Sunday, matching Postgres EXTRACT(DOW) and JavaScript getDay(), so
// nothing has to translate at either boundary.
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The working week, and the days you are shut.
 *
 * Two kinds of entry, and the difference matters more than it looks. A
 * *working block* is when someone is available; a *break* is subtracted from
 * whatever block contains it. So a 10:00–18:00 block with a 13:00–14:00 break
 * offers morning and afternoon, and a 60-minute appointment is never offered
 * at 12:30 because it would run into lunch.
 *
 * Times are wall-clock in the tenant's own zone, which is why a clinic that
 * opens at 10:00 still opens at 10:00 after a daylight-saving change. The
 * conversion to real instants happens once, in `working_windows` (0018).
 *
 * A closure with nobody named shuts the whole business for that date and beats
 * any per-person leave on the same day.
 */
export default async function HoursSettings() {
  const member = await requireMember();
  const supabase = await createClient();
  const today = todayIn(member.timezone);

  const [{ data: staff }, { data: rules }, { data: closures }] = await Promise.all([
    supabase
      .from("staff_resources")
      .select("id, name")
      .eq("business_id", member.businessId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("availability_rules")
      .select("id, staff_id, day_of_week, start_time, end_time, is_break")
      .eq("business_id", member.businessId)
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("availability_overrides")
      .select("id, staff_id, override_date, reason")
      .eq("business_id", member.businessId)
      .gte("override_date", today)
      .order("override_date"),
  ]);

  const people = staff ?? [];
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const t = member.terminology;

  if (people.length === 0) {
    return (
      <p className="mt-8 rounded-md border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Add a {t.staff.toLowerCase()} first — hours belong to a person, not to the business.
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-10">
      {people.map((person) => {
        const mine = (rules ?? []).filter((r) => r.staff_id === person.id);

        return (
          <section key={person.id}>
            <h2 className="text-sm font-medium tracking-wide uppercase">{person.name}</h2>

            {mine.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">
                No hours set, so nothing can be booked with them.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
                {mine.map((rule) => (
                  <li key={rule.id} className="flex items-center justify-between gap-4 px-4 py-2">
                    <span>
                      <span className="inline-block w-24 font-medium">
                        {DAYS[rule.day_of_week]}
                      </span>
                      {rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}
                      {rule.is_break ? (
                        <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800">
                          break
                        </span>
                      ) : null}
                    </span>
                    <ActionForm action={removeHours}>
                      <input type="hidden" name="id" value={rule.id} />
                      <Submit subtle label="Remove" />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}

            <ActionForm
              action={addHours}
              resetOnSuccess
              className="mt-3 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="staffId" value={person.id} />
              <label className="block">
                <span className="text-xs text-neutral-500">Day</span>
                <select
                  name="day"
                  className="mt-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
                >
                  {DAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <TimeField label="From" name="start" defaultValue="10:00" />
              <TimeField label="To" name="end" defaultValue="18:00" />
              <label className="flex items-center gap-1.5 pb-2 text-sm">
                <input type="checkbox" name="isBreak" />
                Break
              </label>
              <Submit subtle label="Add" />
            </ActionForm>
          </section>
        );
      })}

      <section>
        <h2 className="text-sm font-medium tracking-wide uppercase">Closed days</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Holidays and leave. Leaving the person blank shuts the whole business that day.
        </p>

        {(closures ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing coming up.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
            {(closures ?? []).map((closure) => (
              <li key={closure.id} className="flex items-center justify-between gap-4 px-4 py-2">
                <span>
                  <span className="font-medium">{closure.override_date}</span>
                  <span className="text-neutral-500">
                    {" "}
                    · {closure.staff_id ? (nameOf.get(closure.staff_id) ?? "—") : "whole business"}
                    {closure.reason ? ` · ${closure.reason}` : null}
                  </span>
                </span>
                <ActionForm action={removeClosure}>
                  <input type="hidden" name="id" value={closure.id} />
                  <Submit subtle label="Remove" />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}

        <ActionForm
          action={addClosure}
          resetOnSuccess
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <label className="block">
            <span className="text-xs text-neutral-500">Date</span>
            <input
              type="date"
              name="date"
              min={today}
              required
              className="mt-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">Who</span>
            <select
              name="staffId"
              className="mt-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            >
              <option value="">Whole business</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block grow">
            <span className="text-xs text-neutral-500">Reason (optional)</span>
            <input
              name="reason"
              placeholder="Eid holiday"
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            />
          </label>
          <Submit subtle label="Mark closed" />
        </ActionForm>
      </section>
    </div>
  );
}

function TimeField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-500">{label}</span>
      <input
        type="time"
        name={name}
        defaultValue={defaultValue}
        required
        className="mt-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
      />
    </label>
  );
}
