import { Suspense } from "react";
import { SettingsPageSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { hintClass, inputClass, labelClass } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/page";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ActionForm, Submit } from "../action-form";
import { saveService, setServiceActive } from "../actions";

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
export default function ServicesSettings() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <ServicesSettingsContent />
    </Suspense>
  );
}

async function ServicesSettingsContent() {
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
    <div className="mt-8 space-y-12">
      <section>
        <SectionHeading
          title="What you offer"
          description="Open a service to change its price, length or the gaps held around it."
        />

        {services.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">Nothing yet. Add your first below.</p>
        ) : (
          <Card className="mt-4 overflow-hidden">
            <ul className="divide-border/70 divide-y">
              {services.map((service) => (
                <li key={service.id}>
                  <details className="group">
                    <summary className="hover:bg-muted/40 flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 transition-colors sm:px-5">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{service.name}</span>
                          {service.is_active ? null : <Badge tone="neutral">Hidden online</Badge>}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block text-xs">
                          {service.duration_minutes} min
                          {service.buffer_before_minutes || service.buffer_after_minutes
                            ? ` · gaps ${service.buffer_before_minutes}/${service.buffer_after_minutes} min`
                            : null}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-sm font-semibold">
                        {service.price > 0 ? money.format(service.price) : "—"}
                      </span>
                    </summary>
                    <div className="bg-muted/25 px-4 py-4 sm:px-5">
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
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <SectionHeading
          title="Add a service"
          description="It appears on your booking page as soon as a provider is set to perform it."
        />
        <ActionForm
          action={saveService}
          resetOnSuccess
          className="bg-card border-border/70 elevated mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
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
    <label className="block space-y-1.5">
      <span className={labelClass}>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        step={type === "number" ? "any" : undefined}
        className={type === "color" ? `${inputClass} h-10 p-1` : inputClass}
      />
      {hint ? <span className={`${hintClass} block`}>{hint}</span> : null}
    </label>
  );
}
