import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, PartyPopper, Sparkles } from "lucide-react";

import { CopyLink } from "@/components/app/copy-link";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, PageShell, SectionHeading, Stat } from "@/components/ui/page";
import { Skeleton, SkeletonList, SkeletonStats } from "@/components/ui/skeleton";
import { loadDaySheet } from "@/lib/admin/day";
import { requireMember } from "@/lib/auth/session";
import { clientEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Dashboard" };

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
 * ## What is static and what streams
 *
 * This component takes no `await` at all, so the column, the section headings
 * and the shape of the figures are prerendered and served immediately. Three
 * things need this request and stream in behind them: the welcome banner
 * (which reads `searchParams`), the title block (the business name, and the
 * date, which depends on when you asked), and the day itself.
 *
 * Even "today" is request-time data here, which is easy to forget: a page
 * prerendered at deploy time would say whatever day it was built on, and keep
 * saying it. Cache Components refuses to prerender `new Date()` for exactly
 * that reason, and it is right to.
 *
 * Not yet here, and listed so the gap is visible rather than assumed: the
 * Realtime subscription that makes a new online booking appear unprompted.
 * Until it lands, this page is accurate on load and stale afterwards.
 */
export default function AppHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  return (
    <PageShell>
      <Suspense fallback={null}>
        <WelcomeBanner searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<HeaderSkeleton />}>
        <DayHeader />
      </Suspense>

      <Suspense
        fallback={
          <>
            <div className="mt-8">
              <SkeletonStats />
            </div>
            <div className="mt-10">
              <SkeletonList rows={4} />
            </div>
          </>
        }
      >
        <Today />
      </Suspense>
    </PageShell>
  );
}

/**
 * Shown once, straight after the wizard publishes the booking page.
 *
 * In its own boundary because it reads `searchParams`, and a query parameter
 * that is absent on almost every visit should not hold up the title block.
 */
async function WelcomeBanner({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  if (welcome !== "1") return null;

  const member = await requireMember();
  const t = member.terminology;
  const bookingUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/book/${member.slug}`;

  return (
    <div className="bg-success/10 ring-success/20 mb-8 rounded-xl px-5 py-4 ring-1 ring-inset">
      <p className="text-success flex items-center gap-2 font-semibold">
        <PartyPopper className="size-4" aria-hidden />
        Your booking page is live.
      </p>
      <p className="mt-1.5 text-sm">
        Share it with your {t.customerPlural.toLowerCase()} and they can book themselves in.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={bookingUrl}
          target="_blank"
          rel="noreferrer"
          className="text-success text-sm font-medium break-all underline underline-offset-4"
        >
          {bookingUrl}
        </a>
        <CopyLink value={bookingUrl} />
      </div>
    </div>
  );
}

async function DayHeader() {
  const member = await requireMember();

  // A tenant that has not finished the wizard has no day sheet to show. This
  // runs inside a boundary, so the redirect reaches the browser after the
  // frame — one flash of an empty console for a brand-new business, once.
  if (!member.onboardingComplete) redirect("/app/onboarding");

  const today = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <PageHeader
      eyebrow={today}
      title={member.businessName}
      description={`Everything below is today, in ${member.timezone}.`}
      actions={
        <Link
          href="/app/calendar"
          className="border-border bg-card hover:border-primary/40 hover:text-primary inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
        >
          <CalendarDays className="size-4" aria-hidden />
          Open diary
        </Link>
      }
    />
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-8 w-full max-w-sm" />
      <Skeleton className="h-3.5 w-full max-w-md" />
    </div>
  );
}

/** Today's figures, and the rest of today's list. */
async function Today() {
  const member = await requireMember();
  const t = member.terminology;
  const day = await loadDaySheet(member);
  const bookingUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/book/${member.slug}`;

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
    <>
      <dl className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={`Today's ${t.bookingPlural.toLowerCase()}`} value={day.total} tone="brand" />
        <Stat
          label="Awaiting approval"
          value={day.pending}
          tone={day.pending > 0 ? "warning" : "default"}
          hint={day.pending > 0 ? "Needs a decision" : undefined}
        />
        <Stat label="Completed" value={day.completed} tone="success" />
        {/* Completed only. A figure that counted everything booked would read
        high all morning and fall as the day's no-shows land — the wrong
        direction for the number an owner quotes to a bank. */}
        <Stat label="Collected" value={money.format(day.collected)} hint="Completed only" />
      </dl>

      <section className="mt-10">
        <SectionHeading
          title="Still to come today"
          actions={
            <Link
              href="/app/bookings"
              className="text-primary text-sm font-medium underline-offset-4 hover:underline"
            >
              All {t.bookingPlural.toLowerCase()}
            </Link>
          }
        />

        {day.upcoming.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<Sparkles aria-hidden />}
            title={day.total === 0 ? "Nothing booked today" : "Today is done"}
            description={
              day.total === 0
                ? `Share your booking page and ${t.customerPlural.toLowerCase()} can fill it themselves — or take one at the desk from the ${t.bookingPlural.toLowerCase()} screen.`
                : "Everything today is finished or past its time."
            }
            action={
              day.total === 0 ? <CopyLink value={bookingUrl} label="Copy booking link" /> : null
            }
          />
        ) : (
          <Card className="mt-4 overflow-hidden">
            <ul className="divide-border/70 divide-y">
              {day.upcoming.map((booking) => (
                <li
                  key={booking.id}
                  className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3 transition-colors sm:px-5"
                >
                  <span className="tabular text-primary w-14 shrink-0 text-sm font-semibold">
                    {clock.format(new Date(booking.start_time))}
                  </span>
                  <span className="min-w-0 grow">
                    <span className="block truncate text-sm font-medium">
                      {booking.customers?.full_name ?? "—"}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {booking.services?.name ?? "—"}
                    </span>
                  </span>
                  <StatusBadge status={booking.status} className="shrink-0" />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
