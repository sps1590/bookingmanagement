import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ActionForm, Submit } from "../action-form";
import { saveStaff, setStaffServices } from "../actions";

export const dynamic = "force-dynamic";

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
export default async function StaffSettings() {
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
    <div className="mt-8 space-y-10">
      <section>
        <h2 className="text-sm font-medium tracking-wide uppercase">{t.staffPlural}</h2>

        {people.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nobody yet. Add someone below — until there is at least one person with working hours,
            nothing can be booked.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {people.map((person) => {
              const ticked = catalogue.filter((s) => mapped.has(`${person.id}:${s.id}`));

              return (
                <li
                  key={person.id}
                  className="rounded-md border border-neutral-200 px-4 py-3 dark:border-neutral-800"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{person.name}</p>
                      {person.title ? (
                        <p className="text-xs text-neutral-500">{person.title}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-xs text-neutral-500">
                      {ticked.length === 0
                        ? "No services — not bookable"
                        : `${ticked.length} service${ticked.length === 1 ? "" : "s"}`}
                    </p>
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs underline underline-offset-4">
                      Edit
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
                      <p className="text-xs text-neutral-500">Performs</p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {catalogue.length === 0 ? (
                          <span className="text-xs text-neutral-400">Add a service first.</span>
                        ) : (
                          catalogue.map((service) => (
                            <label key={service.id} className="flex items-center gap-1.5 text-sm">
                              <input
                                type="checkbox"
                                name="serviceId"
                                value={service.id}
                                defaultChecked={mapped.has(`${person.id}:${service.id}`)}
                              />
                              {service.name}
                              {service.is_active ? null : (
                                <span className="text-[11px] text-neutral-400">(not offered)</span>
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
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium tracking-wide uppercase">Add someone</h2>
        <ActionForm
          action={saveStaff}
          resetOnSuccess
          className="mt-3 grid gap-3 rounded-md border border-neutral-200 p-4 sm:grid-cols-2 dark:border-neutral-800"
        >
          <Field label="Name" name="name" required />
          <Field label="Title" name="title" />
          <Field label="Phone" name="phone" hint="Never shown on the public booking page." />
          <Field label="Email" name="email" hint="Never shown on the public booking page." />
          <div className="sm:col-span-2">
            <Submit label={`Add ${t.staff.toLowerCase()}`} />
          </div>
        </ActionForm>
        <p className="mt-2 text-xs text-neutral-500">
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
    <label className="block">
      <span className="text-xs text-neutral-500">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
      />
      {hint ? <span className="mt-1 block text-[11px] text-neutral-400">{hint}</span> : null}
    </label>
  );
}
