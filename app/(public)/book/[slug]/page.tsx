import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminology } from "@/lib/terminology";

/**
 * The public booking portal — bare, for now. Phase 3 builds the slot picker
 * and the booking flow; this page exists so Phase 1 can prove the whole chain
 * works end to end: signup creates a tenant, the wizard publishes it, and the
 * slug resolves to a real page with the tenant's own services and labels.
 *
 * Every read goes through the curated views from migration 0014, never the
 * base tables. That is the fix for defect B-05: this page runs for anonymous
 * visitors, and `staff_resources` holds each provider's personal phone number
 * and email address. `public_staff` has no such columns to leak.
 */

async function loadBusiness(slug: string) {
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("public_businesses")
    .select(
      "id, slug, name, business_type, phone, address, timezone, currency, terminology_config, branding_config",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!business?.id) return null;

  const [{ data: services }, { data: staff }, { data: branches }] = await Promise.all([
    supabase
      .from("public_services")
      .select("id, name, category, description, duration_minutes, price, deposit_required")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("public_staff")
      .select("id, name, title, avatar_url")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("public_branches")
      .select("id, name, address, phone, map_url")
      .eq("business_id", business.id),
  ]);

  return { business, services: services ?? [], staff: staff ?? [], branches: branches ?? [] };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadBusiness(slug);

  if (!loaded) return { title: "Not found" };

  return {
    title: `Book with ${loaded.business.name}`,
    description:
      (loaded.business.branding_config as { welcome_message?: string } | null)?.welcome_message ??
      `Book an appointment with ${loaded.business.name}.`,
  };
}

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loaded = await loadBusiness(slug);

  // A slug that does not resolve is indistinguishable from a tenant that has
  // not published yet, and deliberately so: whether a given business name is
  // registered here is not public information.
  if (!loaded) notFound();

  const { business, services, staff, branches } = loaded;
  const t = resolveTerminology(business.terminology_config, business.business_type);
  const branding = (business.branding_config ?? {}) as {
    welcome_message?: string;
    primary_color?: string;
  };

  const currency = new Intl.NumberFormat("en", {
    style: "currency",
    currency: business.currency ?? "BDT",
    maximumFractionDigits: 0,
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{business.name}</h1>
        {branding.welcome_message ? (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {branding.welcome_message}
          </p>
        ) : null}
        <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
          {business.phone ? formatPhoneForDisplay(business.phone) : null}
          {business.address ? ` · ${business.address}` : null}
        </p>
      </header>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide uppercase">What would you like?</h2>
        {services.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nothing is bookable online just yet. Please call instead.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {services.map((service) => (
              <li key={service.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{service.name}</p>
                  {service.description ? (
                    <p className="mt-0.5 text-xs text-neutral-500">{service.description}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {service.duration_minutes} minutes
                    {service.deposit_required && service.deposit_required > 0
                      ? ` · ${currency.format(service.deposit_required)} deposit`
                      : null}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium">
                  {service.price && service.price > 0 ? currency.format(service.price) : "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {staff.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium tracking-wide uppercase">{t.staffPlural}</h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {staff.map((person) => (
              <li
                key={person.id}
                className="rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <span className="font-medium">{person.name}</span>
                {person.title ? (
                  <span className="block text-xs text-neutral-500">{person.title}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {branches.length > 1 ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium tracking-wide uppercase">Locations</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {branches.map((branch) => (
              <li key={branch.id}>
                <span className="font-medium">{branch.name}</span>
                {branch.address ? (
                  <span className="text-neutral-500"> · {branch.address}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 rounded-md bg-neutral-100 px-4 py-3 text-xs leading-relaxed text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
        Choosing a time and confirming a {t.booking.toLowerCase()} arrives in Phase 3. The slot
        engine behind it — including the gaps between appointments, which the database enforces
        rather than trusting this page to respect — lands in Phase 2.
      </p>

      <footer className="mt-8 text-xs text-neutral-400">
        All times are shown in {business.timezone}.
      </footer>
    </main>
  );
}
