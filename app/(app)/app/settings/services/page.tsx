import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ActionForm, Submit } from "../action-form";
import { saveService, setServiceActive } from "../actions";

export const dynamic = "force-dynamic";

/**
 * The price list.
 *
 * The two fields nobody expects to matter are the buffers. They are the gap
 * the database enforces around every appointment (defect B-03) — fifteen
 * minutes to sterilise a chair, ten to set up — and they are why the slot
 * picker will not offer back-to-back times. Changing them here does **not**
 * redraw appointments already booked: the buffers are copied onto the booking
 * row at the moment it is made, deliberately, so editing a service next month
 * cannot silently rewrite a diary that is already agreed.
 */
export default async function ServicesSettings() {
  const member = await requireMember();
  const supabase = await createClient();

  const { data } = await supabase
    .from("services")
    .select(
      "id, name, description, duration_minutes, buffer_before_minutes, buffer_after_minutes, price, deposit_required, color_hex, is_active",
    )
    .eq("business_id", member.businessId)
    .order("sort_order")
    .order("name");

  const services = data ?? [];
  const money = new Intl.NumberFormat("en", {
    style: "currency",
    currency: member.currency || "BDT",
    maximumFractionDigits: 0,
  });

  return (
    <div className="mt-8 space-y-10">
      <section>
        <h2 className="text-sm font-medium tracking-wide uppercase">What you offer</h2>

        {services.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Nothing yet. Add your first below.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {services.map((service) => (
              <li key={service.id} className="px-4 py-3">
                <details>
                  <summary className="flex cursor-pointer items-baseline justify-between gap-4">
                    <span>
                      <span className="text-sm font-medium">{service.name}</span>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {service.duration_minutes} min
                        {service.buffer_before_minutes || service.buffer_after_minutes
                          ? ` · gaps ${service.buffer_before_minutes}/${service.buffer_after_minutes} min`
                          : null}
                        {service.is_active ? null : " · not offered online"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium">
                      {service.price > 0 ? money.format(service.price) : "—"}
                    </span>
                  </summary>

                  <ActionForm action={saveService} className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={service.id} />
                    <Field label="Name" name="name" defaultValue={service.name} required />
                    <Field
                      label="Minutes"
                      name="durationMinutes"
                      type="number"
                      defaultValue={String(service.duration_minutes)}
                      required
                    />
                    <Field
                      label="Gap before (min)"
                      name="bufferBefore"
                      type="number"
                      defaultValue={String(service.buffer_before_minutes)}
                      hint="Setting-up time held before the appointment."
                    />
                    <Field
                      label="Gap after (min)"
                      name="bufferAfter"
                      type="number"
                      defaultValue={String(service.buffer_after_minutes)}
                      hint="Clean-up time held after it. Existing bookings keep the gaps they were made with."
                    />
                    <Field
                      label="Price"
                      name="price"
                      type="number"
                      defaultValue={String(service.price)}
                    />
                    <Field
                      label="Deposit"
                      name="depositRequired"
                      type="number"
                      defaultValue={String(service.deposit_required)}
                    />
                    <Field
                      label="Colour"
                      name="colorHex"
                      type="color"
                      defaultValue={service.color_hex}
                    />
                    <div className="sm:col-span-2">
                      <Submit label="Save" />
                    </div>
                  </ActionForm>

                  {/* Not a delete. Bookings reference services ON DELETE
                      RESTRICT, so removing one would either fail or take a
                      patient's history with it. */}
                  <ActionForm action={setServiceActive} className="mt-3">
                    <input type="hidden" name="id" value={service.id} />
                    <input type="hidden" name="active" value={String(!service.is_active)} />
                    <Submit
                      subtle
                      label={service.is_active ? "Stop offering online" : "Offer online again"}
                    />
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium tracking-wide uppercase">Add a service</h2>
        <ActionForm
          action={saveService}
          resetOnSuccess
          className="mt-3 grid gap-3 rounded-md border border-neutral-200 p-4 sm:grid-cols-2 dark:border-neutral-800"
        >
          <Field label="Name" name="name" required />
          <Field label="Minutes" name="durationMinutes" type="number" defaultValue="30" required />
          <Field label="Gap before (min)" name="bufferBefore" type="number" defaultValue="0" />
          <Field label="Gap after (min)" name="bufferAfter" type="number" defaultValue="0" />
          <Field label="Price" name="price" type="number" defaultValue="0" />
          <Field label="Deposit" name="depositRequired" type="number" defaultValue="0" />
          <Field label="Colour" name="colorHex" type="color" defaultValue="#2563EB" />
          <div className="sm:col-span-2">
            <Submit label="Add service" />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-500">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        step={type === "number" ? "any" : undefined}
        className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
      />
      {hint ? <span className="mt-1 block text-[11px] text-neutral-400">{hint}</span> : null}
    </label>
  );
}
