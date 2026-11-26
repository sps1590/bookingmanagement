import { Suspense } from "react";
import { SettingsPageSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { hintClass, inputClass, labelClass } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/page";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ActionForm, Submit } from "../action-form";
import { saveStaff, setStaffServices } from "../actions";

/**
 * Providers, and which services each one performs.
 *
 * The tick boxes are the part that matters. `get_available_slots` joins
 * through `staff_services`, so an unticked service means this provider is
 * never offered for it — that is defect M-01, where the spec ignored the
 * table entirely and a hygienist could be booked for a root canal. A provider
 * with nothing ticked is bookable for nothing, which is the correct answer and
 * the one that confuses people, so the page says so.
 *
 * Contact details are stored here and never published: the public portal reads
 * `public_staff`, which has no phone or email column at all (defect B-05).
 */
export default function StaffSettings() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <StaffSettingsContent />
    </Suspense>
  );
}

async function StaffSettingsContent() {
  const member = await requireMember();
  const supabase = await createClient();

  const [{ data: staff }, { data: services }, { data: mappings }] = await Promise.all([
    supabase
      .from("staff_resources")
      .select("id, name, title, phone, email, is_active")
      .eq("business_id", member.businessId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("services")
      .select("id, name, is_active")
      .eq("business_id", member.businessId)
      .order("name"),
    supabase
      .from("staff_services")
      .select("staff_id, service_id")
      .eq("business_id", member.businessId),
  ]);

  const people = staff ?? [];
  const catalogue = services ?? [];
  const mapped = new Set((mappings ?? []).map((m) => `${m.staff_id}:${m.service_id}`));
  const t = member.terminology;

  return (
    <div className="mt-8 space-y-12">
      <section>
        <SectionHeading
          title={t.staffPlural}
          description="Add as many as you like. There is no limit on how many people a business can have."
        />

        {people.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            Nobody yet. Add someone below — until there is at least one person with working hours,
            nothing can be booked.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {people.map((person) => {
              const ticked = catalogue.filter((s) => mapped.has(`${person.id}:${s.id}`));

              return (
                <li key={person.id}>
                  <Card className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
                          aria-hidden
                        >
                          {person.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{person.name}</p>
                          {person.title ? (
                            <p className="text-muted-foreground truncate text-xs">{person.title}</p>
                          ) : null}
                        </div>
                      </div>
                      {ticked.length === 0 ? (
                        <Badge tone="warning">No services — not bookable</Badge>
                      ) : (
                        <Badge tone="success">
                          {ticked.length} service{ticked.length === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </div>

                    <details className="group mt-3">
                      <summary className="text-primary cursor-pointer list-none text-xs font-medium underline-offset-4 hover:underline">
                        Edit details and services
                      </summary>

                      <ActionForm action={saveStaff} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={person.id} />
                        <Field label="Name" name="name" defaultValue={person.name} required />
                        <Field label="Title" name="title" defaultValue={person.title ?? ""} />
                        <Field label="Phone" name="phone" defaultValue={person.phone ?? ""} />
                        <Field label="Email" name="email" defaultValue={person.email ?? ""} />
                        <div className="sm:col-span-2">
                          <Submit label="Save" />
                        </div>
                      </ActionForm>

                      <ActionForm action={setStaffServices} className="mt-4">
                        <input type="hidden" name="staffId" value={person.id} />
                        <p className={labelClass}>Performs</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {catalogue.length === 0 ? (
                            <span className={hintClass}>Add a service first.</span>
                          ) : (
                            catalogue.map((service) => (
                              <label
                                key={service.id}
                                className="border-border bg-card hover:border-primary/40 has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  name="serviceId"
                                  value={service.id}
                                  defaultChecked={mapped.has(`${person.id}:${service.id}`)}
                                  className="accent-primary size-4"
                                />
                                {service.name}
                                {service.is_active ? null : (
                                  <span className="text-muted-foreground text-[11px]">
                                    (not offered)
                                  </span>
                                )}
                              </label>
                            ))
                          )}
                        </div>
                        <div className="mt-3">
                          <Submit subtle label="Save services" />
                        </div>
                      </ActionForm>
                    </details>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          title="Add someone"
          description="Contact details stay inside your team — the public booking page has no column for them."
        />
        <ActionForm
          action={saveStaff}
          resetOnSuccess
          className="bg-card border-border/70 elevated mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
        >
          <Field label="Name" name="name" required />
          <Field label="Title" name="title" />
          <Field label="Phone" name="phone" hint="Never shown on the public booking page." />
          <Field label="Email" name="email" hint="Never shown on the public booking page." />
          <div className="sm:col-span-2">
            <Submit label={`Add ${t.staff.toLowerCase()}`} />
          </div>
        </ActionForm>
        <p className="text-muted-foreground mt-3 text-sm">
          Then tick their services above and set their hours under Opening hours. All three are
          needed before anyone can book them.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className={labelClass}>{label}</span>
      <input name={name} defaultValue={defaultValue} required={required} className={inputClass} />
      {hint ? <span className={`${hintClass} block`}>{hint}</span> : null}
    </label>
  );
}
