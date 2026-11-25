import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { clientEnv } from "@/lib/env";
import { loadPublicTenant } from "@/lib/public/tenant";
import { resolveTerminology } from "@/lib/terminology";

/**
 * Confirmation.
 *
 * Two things the customer leaves with: the booking code, which reception reads
 * off a phone screen, and the manage link, which is the only credential a
 * guest has for changing or cancelling. The link is built from the token in
 * the query string — it is never looked up here, because looking it up by
 * booking code would mean anyone who guessed a code could take control of
 * someone else's appointment.
 *
 * The page is deliberately thin on detail. It does not re-fetch the booking,
 * so it cannot be used to confirm whether a given code exists; everything
 * shown was handed to this browser by the request that created it.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking confirmed",
  // A confirmation page carries a one-time credential in its URL. Keeping it
  // out of search indexes is the cheap half of protecting it.
  robots: { index: false, follow: false },
};

export default async function BookingSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug, code } = await params;
  const { t: token } = await searchParams;

  const loaded = await loadPublicTenant(slug);
  if (!loaded) notFound();

  const { business } = loaded;
  const terms = resolveTerminology(business.terminology_config, business.business_type);
  const manageUrl = token ? `${clientEnv.NEXT_PUBLIC_APP_URL}/manage/${token}` : null;

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="text-sm text-neutral-500">{business.name}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        Your {terms.booking.toLowerCase()} is booked
      </h1>

      <div className="mt-8 rounded-md border border-neutral-200 px-5 py-6 text-center dark:border-neutral-800">
        <p className="text-xs tracking-wide text-neutral-500 uppercase">Booking code</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-widest">{code}</p>
        <p className="mt-2 text-xs text-neutral-500">Show this at reception.</p>
      </div>

      {manageUrl ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium">Need to change it?</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Use this link to reschedule or cancel. Keep it to yourself — anyone with it can change
            this {terms.booking.toLowerCase()}.
          </p>
          <p className="mt-2 rounded-md bg-neutral-100 px-3 py-2 font-mono text-xs break-all dark:bg-neutral-900">
            {manageUrl}
          </p>
        </section>
      ) : (
        <p className="mt-8 text-sm text-neutral-600 dark:text-neutral-400">
          Your confirmation email has the link for changing or cancelling this{" "}
          {terms.booking.toLowerCase()}.
        </p>
      )}

      <p className="mt-10 text-xs text-neutral-400">
        Calendar invites and reminder emails arrive with Phase 5. Until then, the booking is
        recorded and reception can see it.
      </p>

      <Link
        href={`/book/${slug}`}
        className="mt-8 inline-block text-sm underline underline-offset-4"
      >
        Book another
      </Link>
    </main>
  );
}
