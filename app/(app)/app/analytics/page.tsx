import { Suspense } from "react";
import { ConsolePageSkeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LineChart, Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, PageShell, SectionHeading, Stat } from "@/components/ui/page";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/time/zone";

export const metadata: Metadata = { title: "Analytics" };
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
export default function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  return (
    <Suspense fallback={<ConsolePageSkeleton stats rows={5} />}>
      <AnalyticsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AnalyticsPageContent({
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
      <PageShell width="narrow">
        <PageHeader title="Analytics" />
        <EmptyState
          className="mt-8"
          icon={<Lock aria-hidden />}
          title={
            error.code === "BK001"
              ? "Only an owner or manager can see this"
              : "Those figures could not be loaded"
          }
          description={
            error.code === "BK001"
              ? "Revenue is kept from the front desk deliberately. Ask an owner or a manager to look."
              : "Try again in a moment. Nothing has been changed."
          }
        />
      </PageShell>
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
    <PageShell>
      <PageHeader
        title="Analytics"
        description={`${from} to ${to}, in ${member.timezone}.`}
        actions={
          <div
            role="group"
            aria-label="Period"
            className="bg-muted inline-flex rounded-lg p-0.5 text-sm"
          >
            {[7, 30, 90].map((option) => (
              <Link
                key={option}
                href={`/app/analytics?days=${option}`}
                aria-current={option === days ? "true" : undefined}
                className={
                  option === days
                    ? "bg-card text-foreground elevated rounded-[0.55rem] px-3 py-1.5 font-medium"
                    : "text-muted-foreground hover:text-foreground rounded-[0.55rem] px-3 py-1.5 transition-colors"
                }
              >
                {option} days
              </Link>
            ))}
          </div>
        }
      />

      {!s || Number(s.total_bookings) === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<LineChart aria-hidden />}
          title="Nothing in that period yet"
          description={`Once ${t.bookingPlural.toLowerCase()} start landing, this page shows what was completed, what was missed, and when your busiest hours are.`}
        />
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label={t.bookingPlural} value={String(s.total_bookings)} tone="brand" />
            <Stat label="Completed" value={`${s.completion_rate ?? 0}%`} tone="success" />
            <Stat
              label="No-shows"
              value={`${s.no_show_rate ?? 0}%`}
              tone={Number(s.no_show_rate ?? 0) > 10 ? "warning" : "default"}
            />
            <Stat label="Collected" value={money.format(Number(s.collected))} />
          </dl>

          <dl className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label={t.customerPlural} value={String(s.distinct_customers)} />
            <Stat
              label="Came back"
              value={String(s.repeat_customers)}
              hint="Booked more than once"
            />
            <Stat label="Cancelled" value={String(s.cancelled)} />
            <Stat
              label="Booked value"
              value={money.format(Number(s.estimated))}
              hint="Including what is still to come"
            />
          </dl>

          <section className="mt-10">
            <SectionHeading
              title="Busiest hours"
              description={`Where a second ${t.staff.toLowerCase()} would earn their keep.`}
            />
            <Card className="mt-4">
              <ul className="space-y-1.5 p-4 sm:p-5">
                {hours.map((hour) => (
                  <li key={hour.hour_of_day} className="flex items-center gap-3 text-xs">
                    <span className="tabular text-muted-foreground w-11 shrink-0">
                      {String(hour.hour_of_day).padStart(2, "0")}:00
                    </span>
                    <span className="bg-muted h-4 grow overflow-hidden rounded-full">
                      <span
                        className="bg-chart-1 block h-full rounded-full"
                        style={{ width: `${(Number(hour.bookings) / busiest) * 100}%` }}
                      />
                    </span>
                    <span className="tabular w-6 shrink-0 text-right font-medium">
                      {hour.bookings}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </>
      )}
    </PageShell>
  );
}
