import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/time/zone";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

/**
 * The numbers an owner asks for.
 *
 * Behind `analytics_summary`, which checks the role itself — Row-Level
 * Security filters rows and never columns, so "a receptionist cannot see
 * revenue" has to be a function that refuses rather than a query the UI is
 * trusted not to make. A receptionist reaching this page gets the refusal from
 * the database, not a blank screen that happens to hide it.
 *
 * Rates are over appointments that were *meant* to happen. A cancellation is
 * not a failure to complete — counting it as one makes a clinic that
 * reschedules politely look worse than one that lets people turn up to a
 * locked door.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const member = await requireMember();
  if (!member.onboardingComplete) redirect("/app/onboarding");

  const params = await searchParams;
  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const to = todayIn(member.timezone);
  const from = addDays(to, -days + 1);

  const supabase = await createClient();

  const [{ data: summary, error }, { data: peak }] = await Promise.all([
    supabase.rpc("analytics_summary", {
      p_business_id: member.businessId,
      p_from: from,
      p_to: to,
    }),
    supabase.rpc("analytics_peak_hours", {
      p_business_id: member.businessId,
      p_from: from,
      p_to: to,
    }),
  ]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-6 rounded-md border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
          {error.code === "BK001"
            ? "Only an owner or manager can see this."
            : "Those figures could not be loaded."}
        </p>
      </main>
    );
  }

  const s = (Array.isArray(summary) ? summary[0] : summary) ?? null;
  const hours = peak ?? [];
  const busiest = Math.max(1, ...hours.map((h) => Number(h.bookings)));

  const money = new Intl.NumberFormat("en", {
    style: "currency",
    currency: member.currency || "BDT",
    maximumFractionDigits: 0,
  });
  const t = member.terminology;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <div className="flex gap-3 text-sm">
          {[7, 30, 90].map((option) => (
            <Link
              key={option}
              href={`/app/analytics?days=${option}`}
              className={
                option === days
                  ? "font-medium underline underline-offset-4"
                  : "underline underline-offset-4"
              }
            >
              {option} days
            </Link>
          ))}
          <Link href="/app" className="underline underline-offset-4">
            Dashboard
          </Link>
        </div>
      </div>

      <p className="mt-1 text-xs text-neutral-500">
        {from} to {to} · {member.timezone}
      </p>

      {!s || Number(s.total_bookings) === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Nothing in that period yet.
        </p>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t.bookingPlural} value={String(s.total_bookings)} />
            <Stat label="Completed" value={`${s.completion_rate ?? 0}%`} />
            <Stat label="No-shows" value={`${s.no_show_rate ?? 0}%`} />
            <Stat label="Collected" value={money.format(Number(s.collected))} />
          </dl>

          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t.customerPlural} value={String(s.distinct_customers)} />
            <Stat label="Came back" value={String(s.repeat_customers)} />
            <Stat label="Cancelled" value={String(s.cancelled)} />
            <Stat label="Booked value" value={money.format(Number(s.estimated))} />
          </dl>

          <section className="mt-10">
            <h2 className="text-sm font-medium tracking-wide uppercase">Busiest hours</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Where a second {t.staff.toLowerCase()} would earn their keep.
            </p>
            <ul className="mt-3 space-y-1">
              {hours.map((hour) => (
                <li key={hour.hour_of_day} className="flex items-center gap-3 text-xs">
                  <span className="w-10 shrink-0 tabular-nums">
                    {String(hour.hour_of_day).padStart(2, "0")}:00
                  </span>
                  <span
                    className="h-3 rounded-sm bg-neutral-800 dark:bg-neutral-200"
                    style={{ width: `${(Number(hour.bookings) / busiest) * 100}%` }}
                  />
                  <span className="text-neutral-500 tabular-nums">{hour.bookings}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
