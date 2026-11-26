import { Suspense } from "react";
import { ConsolePageSkeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader, PageShell } from "@/components/ui/page";
import { addDays, todayIn, zonedDayRange } from "@/lib/time/zone";

import { DayGrid, type CalendarBooking } from "./day-grid";

export const metadata: Metadata = { title: "Calendar" };
/**
 * The day view.
 *
 * Read under the caller's own session, so a provider sees their own column and
 * the desk sees the clinic (defect B-23), and a member pinned to a branch sees
 * that branch (0022). The grid does not re-decide any of it.
 *
 * Only a day, not a week or a month. A week of columns-per-provider is
 * unreadable on the phone most of this product's users hold, and the two
 * questions a receptionist actually asks — "what is left today" and "where
 * can I put this" — are both about one day. The booking list covers the rest.
 */
export default function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  return (
    <Suspense fallback={<ConsolePageSkeleton rows={6} />}>
      <CalendarPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CalendarPageContent({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const member = await requireMember();
  if (!member.onboardingComplete) redirect("/app/onboarding");

  const params = await searchParams;
  const valid = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date);
  const date = valid ? params.date! : todayIn(member.timezone);
  const { start, end } = zonedDayRange(date, date, member.timezone);

  const supabase = await createClient();

  const [{ data: staff }, { data: bookings }] = await Promise.all([
    supabase
      .from("staff_resources")
      .select("id, name")
      .eq("business_id", member.businessId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("bookings")
      .select(
        `id, booking_code, staff_id, start_time, end_time, status,
      customers (full_name),
      services (name, color_hex)`,
      )
      .eq("business_id", member.businessId)
      .gte("start_time", start)
      .lt("start_time", end)
      .order("start_time"),
  ]);

  const cards: CalendarBooking[] = (bookings ?? []).map((booking) => ({
    id: booking.id,
    code: booking.booking_code,
    staffId: booking.staff_id,
    start: booking.start_time,
    end: booking.end_time,
    status: booking.status,
    customer: (booking.customers as unknown as { full_name: string } | null)?.full_name ?? "—",
    service: (booking.services as unknown as { name: string } | null)?.name ?? "—",
    colour: (booking.services as unknown as { color_hex: string } | null)?.color_hex ?? null,
  }));

  const t = member.terminology;
  const canMove =
    member.role === "owner" || member.role === "manager" || member.role === "receptionist";

  const heading = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Diary"
        title={heading}
        description={`${cards.length} ${
          cards.length === 1 ? t.booking.toLowerCase() : t.bookingPlural.toLowerCase()
        } · times in ${member.timezone}`}
        actions={
          <div className="border-border bg-card inline-flex items-center rounded-lg border">
            <Link
              href={`/app/calendar?date=${addDays(date, -1)}`}
              aria-label="Previous day"
              className="hover:text-primary grid size-9 place-items-center transition-colors"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <Link
              href="/app/calendar"
              className="border-border hover:text-primary border-x px-3 py-2 text-sm font-medium transition-colors"
            >
              Today
            </Link>
            <Link
              href={`/app/calendar?date=${addDays(date, 1)}`}
              aria-label="Next day"
              className="hover:text-primary grid size-9 place-items-center transition-colors"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        }
      />

      <DayGrid
        bookings={cards}
        staff={staff ?? []}
        date={date}
        timezone={member.timezone}
        canMove={canMove}
      />
    </PageShell>
  );
}
