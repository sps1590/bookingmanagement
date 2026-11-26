import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import QRCode from "qrcode";

import { clientEnv } from "@/lib/env";
import { loadPublicTenant } from "@/lib/public/tenant";
import { resolveTerminology } from "@/lib/terminology";

import { CalendarLinks } from "./calendar-links";

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
  searchParams: Promise<{ t?: string; s?: string; e?: string }>;
}) {
  const { slug, code } = await params;
  const { t: token, s: startIso, e: endIso } = await searchParams;

  const loaded = await loadPublicTenant(slug);
  if (!loaded) notFound();

  const { business } = loaded;
  const terms = resolveTerminology(business.terminology_config, business.business_type);
  const manageUrl = token ? `${clientEnv.NEXT_PUBLIC_APP_URL}/manage/${token}` : null;

  // The QR encodes the booking code, not the manage link. Reception scans it
  // to find the appointment; the manage link is the customer's credential for
  // changing it, and a code held up at a desk is photographed by whoever is
  // behind them in the queue.
  const qr = await QRCode.toString(code, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const start = startIso ? new Date(startIso) : null;
  const end = endIso ? new Date(endIso) : null;
  const haveTimes = start && end && !Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf());

  const when = haveTimes
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: business.timezone,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(start)
    : null;

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="text-muted-foreground text-sm">{business.name}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        Your {terms.booking.toLowerCase()} is booked
      </h1>

      <div className="mt-8 rounded-md border border-neutral-200 px-5 py-6 text-center dark:border-neutral-800">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">Booking code</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-widest">{code}</p>
        <p className="text-muted-foreground mt-2 text-xs">Show this at reception.</p>

        <div
          aria-hidden="true"
          className="mx-auto mt-5 w-40 [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      </div>

      {when ? (
        <p className="mt-6 text-center text-sm">
          <span className="font-medium">{when}</span>
          <span className="text-muted-foreground block text-xs">{business.timezone}</span>
        </p>
      ) : null}

      {haveTimes ? (
        <CalendarLinks
          event={{
            uid: `${code}@${business.slug}`,
            start,
            end,
            title: `${terms.booking} — ${business.name}`,
            description: `Booking code ${code}.${manageUrl ? ` Manage: ${manageUrl}` : ""}`,
            location: business.address ?? undefined,
            url: manageUrl ?? undefined,
          }}
          fileName={`${business.slug}-${code}.ics`}
        />
      ) : null}

      {manageUrl ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium">Need to change it?</h2>
          <p className="text-muted-foreground dark:text-muted-foreground/70 mt-1 text-sm">
            Use this link to reschedule or cancel. Keep it to yourself — anyone with it can change
            this {terms.booking.toLowerCase()}.
          </p>
          <p className="mt-2 rounded-md bg-neutral-100 px-3 py-2 font-mono text-xs break-all dark:bg-neutral-900">
            {manageUrl}
          </p>
        </section>
      ) : (
        <p className="text-muted-foreground dark:text-muted-foreground/70 mt-8 text-sm">
          Your confirmation email has the link for changing or cancelling this{" "}
          {terms.booking.toLowerCase()}.
        </p>
      )}

      {/* The customer does not care which phase of a plan anything shipped in,
       and this line said so until now. What they need to know is that the
       calendar file above is the reliable reminder: email depends on the
       business having configured a sender, and this one may not have. */}
      <p className="text-muted-foreground/70 mt-10 text-xs">
        Add it to your calendar above — that reminder is yours and does not depend on us. Any email
        we send is in addition to it.
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
