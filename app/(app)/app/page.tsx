import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { loadDaySheet } from "@/lib/admin/day";
import { requireMember } from "@/lib/auth/session";
import { clientEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * The day sheet: what the business looks like today.
 *
 * Every noun comes from the tenant's terminology, so a dentist reads
 * "Patients" and a salon reads "Clients" without either string appearing in
 * this file.
 *
 * Read under the caller's own session, so the figures are whatever Row-Level
 * Security says this person may see — the front desk's "today" is the whole
 * clinic, a provider's is their own column of it. Re-deriving visibility here
 * would eventually disagree with the list screen, and one of the two would be
 * lying.
 *
 * Not yet here, and listed so the gap is visible rather than assumed: the
 * Realtime subscription that makes a new online booking appear unprompted.
 * Until it lands, this page is accurate on load and stale afterwards.
 */
export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const member = await requireMember();
  const { welcome } = await searchParams;

  if (!member.onboardingComplete) redirect("/app/onboarding");

  const t = member.terminology;
  const bookingUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/book/${member.slug}`;
  const day = await loadDaySheet(member);

  const money = new Intl.NumberFormat("en", {
    style: "currency",
    currency: member.currency || "BDT",
    maximumFractionDigits: 0,
  });
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {welcome === "1" ? (
        <div className="mb-8 rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-800 dark:text-green-300">
          <p className="font-medium">Your booking page is live.</p>
          <p className="mt-1">
            Share{" "}
            <a href={bookingUrl} className="break-all underline">
              {bookingUrl}
            </a>{" "}
            with your {t.customerPlural.toLowerCase()}.
          </p>
        </div>
      ) : null}

      <p className="font-mono text-xs tracking-widest text-neutral-500 uppercase">
        {member.businessCode} · {member.role}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{member.businessName}</h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        Set up and live. Times below are shown in {member.timezone}.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Card term={`Today's ${t.bookingPlural.toLowerCase()}`} value={String(day.total)} />
        <Card term="Awaiting approval" value={String(day.pending)} />
        <Card term="Completed" value={String(day.completed)} />
        {/* Completed only. A figure that counted everything booked would read
            high all morning and fall as the day's no-shows land — the wrong
            direction for the number an owner quotes to a bank. */}
        <Card term="Collected" value={money.format(day.collected)} />
      </dl>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium tracking-wide uppercase">Still to come today</h2>
          <Link href="/app/bookings" className="text-sm underline underline-offset-4">
            All {t.bookingPlural.toLowerCase()}
          </Link>
        </div>

        {day.upcoming.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {day.total === 0
              ? `Nothing booked today.`
              : `Everything today is done or past its time.`}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {day.upcoming.map((booking) => (
              <li key={booking.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                <span className="w-14 shrink-0 font-medium">
                  {clock.format(new Date(booking.start_time))}
                </span>
                <span className="grow truncate">
                  {booking.customers?.full_name ?? "—"}
                  <span className="text-neutral-500"> · {booking.services?.name ?? "—"}</span>
                </span>
                <span className="shrink-0 text-xs text-neutral-500 capitalize">
                  {booking.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 space-y-2 text-sm">
        <Link href="/app/calendar" className="block underline">
          Day calendar
        </Link>
        <Link href="/app/bookings" className="block underline">
          {t.bookingPlural} and check-in
        </Link>
        <Link href="/app/customers" className="block underline">
          {t.customerPlural}
        </Link>
        <Link href="/app/analytics" className="block underline">
          Analytics
        </Link>
        <Link href="/app/settings/services" className="block underline">
          Settings
        </Link>
        <Link href="/app/onboarding" className="block underline">
          Review setup
        </Link>
        <a href={bookingUrl} className="block underline">
          View public booking page
        </a>
      </div>
    </main>
  );
}

function Card({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <dt className="text-xs text-neutral-500">{term}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
