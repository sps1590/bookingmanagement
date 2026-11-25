import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatPhoneForDisplay } from "@/lib/phone";
import { loadPublicTenant } from "@/lib/public/tenant";
import { resolveTerminology } from "@/lib/terminology";

import { BookingFlow } from "./booking-flow";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadPublicTenant(slug);

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
  const loaded = await loadPublicTenant(slug);

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

      <BookingFlow
        slug={business.slug}
        services={services}
        staff={staff}
        terminology={t}
        timezone={business.timezone}
        currency={business.currency ?? "BDT"}
      />

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

      <footer className="mt-8 text-xs text-neutral-400">
        All times are shown in {business.timezone}.
      </footer>
    </main>
  );
}
