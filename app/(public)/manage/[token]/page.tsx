import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminology } from "@/lib/terminology";

import { ManageBooking } from "./manage-booking";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your appointment",
  // The URL *is* the credential. Keeping it out of search indexes is the
  // cheap half of protecting it; the other half is that it rotates on every
  // successful change (defect M-11).
  robots: { index: false, follow: false },
};

/**
 * The only page a guest customer has.
 *
 * They have no account and no password — the token in the link is the whole
 * credential, which is why it is 192 bits, why the lookup returns exactly one
 * booking and never a list, and why an unknown token and a cancelled booking
 * produce the same 404. A response that distinguished them would be an oracle
 * for guessing.
 */
export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_booking_by_token", { p_token: token });
  const booking = Array.isArray(data) ? data[0] : null;

  if (!booking) notFound();

  const terms = resolveTerminology(booking.terminology, null);

  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: booking.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(booking.start_time));

  const open = booking.status === "pending" || booking.status === "confirmed";
  const changesLeft = Math.max(0, booking.max_reschedules - booking.reschedule_count);

  // Stated plainly rather than discovered by trying. "Until 8:30 tomorrow" is
  // something a person can plan around; "cutoff passed" after they have picked
  // a new time is not.
  const cutoff = (hours: number) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: booking.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(new Date(booking.start_time).getTime() - hours * 3600_000));

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <p className="text-muted-foreground text-sm">{booking.business_name}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {terms.booking} · {booking.booking_code}
      </h1>

      <dl className="mt-6 space-y-2 rounded-md border border-neutral-200 px-5 py-4 text-sm dark:border-neutral-800">
        <Row label="When" value={when} />
        <Row label="What" value={booking.service_name} />
        <Row label={terms.staff} value={booking.staff_name} />
        <Row label="Name" value={booking.customer_name} />
        {booking.business_address ? <Row label="Where" value={booking.business_address} /> : null}
        {booking.business_phone ? (
          <Row label="Call" value={formatPhoneForDisplay(booking.business_phone)} />
        ) : null}
        <Row label="Status" value={booking.status.replace("_", " ")} className="capitalize" />
      </dl>

      {open ? (
        <>
          <p className="text-muted-foreground mt-6 text-xs">
            Changes are allowed until {cutoff(booking.min_reschedule_hours)}, and cancellation until{" "}
            {cutoff(booking.min_cancel_hours)}.
            {changesLeft > 0
              ? ` You can change this ${changesLeft} more time${changesLeft === 1 ? "" : "s"}.`
              : " You have used all the changes allowed online — please call instead."}
          </p>

          <ManageBooking
            token={token}
            businessSlug={booking.business_slug}
            serviceId={booking.service_id}
            staffId={booking.staff_id}
            timezone={booking.timezone}
            canReschedule={changesLeft > 0}
            startTime={booking.start_time}
          />
        </>
      ) : (
        <p className="mt-6 rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          This {terms.booking.toLowerCase()} can no longer be changed online.
          {booking.business_phone
            ? ` Please call ${formatPhoneForDisplay(booking.business_phone)}.`
            : null}
        </p>
      )}
    </main>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-muted-foreground w-20 shrink-0">{label}</dt>
      <dd className={className}>{value}</dd>
    </div>
  );
}
