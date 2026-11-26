import { hintClass, inputClass, labelClass } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/page";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ActionForm, Submit } from "../action-form";
import { saveBookingRules } from "../actions";

export const dynamic = "force-dynamic";

/**
 * The rules the booking page plays by.
 *
 * These values have always existed — in a JSONB column, with defaults chosen
 * in migration 0003 and no screen anywhere to change them. So every business
 * on this deployment was running on somebody else's guesses: thirty days of
 * forward booking, two reschedules, three future appointments per person.
 * When the page refused a patient's six-month check-up there was nothing the
 * owner could do about it and nothing to point at.
 *
 * The numbers are enforced in the database (`create_booking_atomic` and the
 * slot engine read this column), so this form only chooses them. Nothing here
 * can be used to get around a rule — only to decide what the rule is.
 */
export default async function BookingRulesSettings() {
  const member = await requireMember();
  const supabase = await createClient();

  const { data } = await supabase
    .from("businesses")
    .select("booking_rules")
    .eq("id", member.businessId)
    .single();

  const rules = (data?.booking_rules ?? {}) as Record<string, unknown>;
  const num = (key: string, fallback: number) => {
    const value = Number(rules[key]);
    return Number.isFinite(value) ? value : fallback;
  };

  const t = member.terminology;
  const autoConfirm = rules.auto_confirm !== false;

  return (
    <div className="mt-8 space-y-12">
      <section>
        <SectionHeading
          title="How far ahead, and how much notice"
          description="These decide which times your booking page offers. Set them wide and it offers almost everything."
        />

        <ActionForm
          action={saveBookingRules}
          className="bg-card border-border/70 elevated mt-4 grid gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
        >
          <NumberField
            label="Book up to this many days ahead"
            name="maxAdvanceDays"
            value={num("max_advance_days", 180)}
            min={1}
            max={3650}
            hint="180 is six months. Put 3650 if you never want a horizon."
          />
          <NumberField
            label="Shortest notice before a slot (minutes)"
            name="minLeadMinutes"
            value={num("min_lead_minutes", 60)}
            min={0}
            max={43200}
            hint="Online only. Your front desk can always book someone standing in front of them."
          />
          <NumberField
            label={`Upcoming ${t.bookingPlural.toLowerCase()} one ${t.customer.toLowerCase()} may hold`}
            name="maxActivePerCustomer"
            value={num("max_active_per_customer", 10)}
            min={1}
            max={500}
            hint="A course of weekly sessions needs this as high as the course is long."
          />
          <NumberField
            label="Times a booking may be moved"
            name="maxReschedules"
            value={num("max_reschedules", 5)}
            min={0}
            max={50}
            hint="Counts only the customer's own changes, not yours."
          />
          <NumberField
            label="Reschedule cutoff (hours before)"
            name="minRescheduleHours"
            value={num("min_reschedule_hours", 2)}
            min={0}
            max={720}
          />
          <NumberField
            label="Cancellation cutoff (hours before)"
            name="minCancelHours"
            value={num("min_cancel_hours", 2)}
            min={0}
            max={720}
          />
          <NumberField
            label="Spacing between offered times (minutes)"
            name="slotIntervalMinutes"
            value={num("slot_interval_minutes", 15)}
            min={5}
            max={240}
            hint="The grid on your booking page. 15 means 10:00, 10:15, 10:30."
          />

          <label className="border-border bg-muted/30 flex cursor-pointer items-start gap-3 rounded-xl border p-3 sm:col-span-2">
            <input
              type="checkbox"
              name="autoConfirm"
              defaultChecked={autoConfirm}
              className="accent-primary mt-0.5 size-4"
            />
            <span>
              <span className={labelClass}>Confirm online bookings automatically</span>
              <span className={`${hintClass} mt-0.5 block`}>
                Off means every online booking waits for someone to approve it on the dashboard.
                Leave it on unless you have a reason — a {t.customer.toLowerCase()} who books at
                nine at night and hears nothing until morning usually phones.
              </span>
            </span>
          </label>

          <div className="sm:col-span-2">
            <Submit label="Save rules" />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}

function NumberField({
  label,
  name,
  value,
  min,
  max,
  hint,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={String(value)}
        min={min}
        max={max}
        required
        className={inputClass}
      />
      {hint ? <span className={`${hintClass} block`}>{hint}</span> : null}
    </label>
  );
}
