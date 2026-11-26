import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatPhoneForDisplay } from "@/lib/phone";
import { loadPublicTenant } from "@/lib/public/tenant";
import { resolveTerminology } from "@/lib/terminology";

import { Skeleton } from "@/components/ui/skeleton";

import { BookingFlow } from "./booking-flow";

/**
 * The public booking portal.
 *
 * Every read goes through the curated views from migration 0014, never the
 * base tables. That is the fix for defect B-05: this page runs for anonymous
 * visitors, and `staff_resources` holds each provider's personal phone number
 * and email address. `public_staff` has no such columns to leak.
 *
 * ## What is static, what is cached, and what is neither
 *
 * The gradient, the column and the card frames below are prerendered and
 * served from the edge before anything is read. The tenant's own content —
 * name, welcome message, services, providers — comes from
 * `loadPublicTenant`, which carries `use cache` and a per-tenant tag, so on
 * any visit after the first it costs no database traffic either.
 *
 * What is never cached is availability. Which times are free is fetched by
 * the client from `/api/v1/public/:slug/slots` on every look, because a slot
 * grid that is thirty seconds stale is a customer tapping a time that has
 * gone.
 *
 * ## The 404 this no longer returns
 *
 * `notFound()` below runs at request time, after the prerendered shell has
 * already started the response with a 200, so an unknown slug now answers
 * **200** rather than 404. That is Cache Components working as documented,
 * not a bug to fix here: `connection()` does not help, because the shell
 * comes from the layouts above this file, and the documentation is explicit
 * that `instant = false` does not help either.
 *
 * Next.js injects `<meta name="robots" content="noindex">` into the streamed
 * response instead, which is what actually keeps non-existent booking pages
 * out of search results, and which Google documents as sufficient. The other
 * property this page cares about also survives: an unpublished tenant and a
 * mistyped slug still render identically, so the portal is no more of an
 * enumeration oracle than it was.
 *
 * The trade was made deliberately and is written up in D-022.
 */

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

export default function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <div className="from-background via-background to-accent/40 min-h-dvh bg-gradient-to-b">
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <Suspense fallback={<PortalSkeleton />}>
          <Portal params={params} />
        </Suspense>
      </main>
    </div>
  );
}

/** The frame this page is made of, before the tenant is known. */
function PortalSkeleton() {
  return (
    <>
      <div className="flex flex-col items-center">
        <Skeleton className="size-12 rounded-2xl" />
        <Skeleton className="mt-4 h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-72" />
      </div>
      <div className="mt-10 space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="mt-6 h-4 w-28" />
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      </div>
    </>
  );
}

async function Portal({ params }: { params: Promise<{ slug: string }> }) {
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
    <>
      <header className="text-center">
        <span
          className="bg-primary text-primary-foreground mx-auto grid size-12 place-items-center rounded-2xl text-lg font-bold"
          aria-hidden
        >
          {business.name.trim().charAt(0).toUpperCase()}
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance">{business.name}</h1>
        {branding.welcome_message ? (
          <p className="text-muted-foreground mx-auto mt-3 max-w-prose text-sm leading-relaxed text-pretty">
            {branding.welcome_message}
          </p>
        ) : null}
        <p className="text-muted-foreground mt-4 text-sm">
          {business.phone ? (
            <a
              href={`tel:${business.phone}`}
              className="hover:text-primary underline-offset-4 hover:underline"
            >
              {formatPhoneForDisplay(business.phone)}
            </a>
          ) : null}
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
        <section className="mt-10">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            {t.staffPlural}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {staff.map((person) => (
              <li
                key={person.id}
                className="border-border bg-card flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm"
              >
                <span
                  className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold"
                  aria-hidden
                >
                  {person.name.trim().charAt(0).toUpperCase()}
                </span>
                <span>
                  <span className="block font-medium">{person.name}</span>
                  {person.title ? (
                    <span className="text-muted-foreground block text-xs">{person.title}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {branches.length > 1 ? (
        <section className="mt-10">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            Locations
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {branches.map((branch) => (
              <li key={branch.id}>
                <span className="font-medium">{branch.name}</span>
                {branch.address ? (
                  <span className="text-muted-foreground"> · {branch.address}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="text-muted-foreground/70 mt-10 text-center text-xs">
        All times are shown in {business.timezone}.
      </footer>
    </>
  );
}
