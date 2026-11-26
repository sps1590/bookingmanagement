import { Suspense } from "react";
import { ConsolePageSkeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StatusActions } from "@/app/(app)/app/bookings/status-actions";
import { StatusBadge } from "@/components/ui/badge";
import { requireMember } from "@/lib/auth/session";
import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { todayIn, zonedDayRange } from "@/lib/time/zone";

export const metadata: Metadata = { title: "My day" };
/**
 * The provider's own day, on a phone.
 *
 * What makes this safe is not this file. The query says "my bookings" only
 * because the policy on `bookings` already does — a provider sees rows whose
 * `staff_id` resolves to their own login and nothing else (defect B-23).
 * Running the same query as an owner returns the whole clinic, which is
 * exactly right and exactly why there is no `.eq("staff_id", …)` here to
 * forget.
 *
 * Mobile-first because that is where it is read: standing between
 * appointments, one-handed, on mobile data. Hence the phone number as a
 * tap-to-call link and the status buttons sized for a thumb.
 */
export default function StaffToday() {
  return (
    <Suspense fallback={<ConsolePageSkeleton stats rows={5} />}>
      <StaffTodayContent />
    </Suspense>
  );
}

async function StaffTodayContent() {
  const member = await requireMember();
  if (!member.onboardingComplete) redirect("/app/onboarding");

  const supabase = await createClient();
  const today = todayIn(member.timezone);
  const { start, end } = zonedDayRange(today, today, member.timezone);

  const { data } = await supabase
    .from("bookings")
    .select(
      `id, booking_code, status, start_time, end_time, customer_notes,
     customers (full_name, phone, notes),
     services (name, duration_minutes),
     staff_resources (name)`,
    )
    .gte("start_time", start)
    .lt("start_time", end)
    .neq("status", "cancelled")
    .order("start_time");

  const bookings = data ?? [];
  const t = member.terminology;

  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const heading = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const done = bookings.filter((b) => b.status === "completed").length;

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <Link
          href="/staff/availability"
          className="border-border bg-card hover:border-primary/40 hover:text-primary inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors"
        >
          My hours
        </Link>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {bookings.length}{" "}
        {bookings.length === 1 ? t.booking.toLowerCase() : t.bookingPlural.toLowerCase()}
        {bookings.length > 0 ? ` · ${done} done` : null} · {member.timezone}
      </p>

      {bookings.length === 0 ? (
        <p className="border-border bg-muted/30 text-muted-foreground mt-8 rounded-xl border border-dashed px-4 py-12 text-center text-sm">
          Nothing booked today. Enjoy it.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {bookings.map((booking) => {
            const customer = booking.customers as unknown as {
              full_name: string;
              phone: string;
              notes: string | null;
            } | null;
            const service = booking.services as unknown as { name: string } | null;

            return (
              <li
                key={booking.id}
                className="bg-card border-border/70 elevated rounded-xl border px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="tabular text-primary text-xl font-semibold">
                    {clock.format(new Date(booking.start_time))}
                  </span>
                  <StatusBadge status={booking.status} />
                </div>

                <p className="mt-1.5 font-medium">{customer?.full_name ?? "—"}</p>
                <p className="text-muted-foreground text-xs">{service?.name ?? "—"}</p>

                {customer?.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    className="text-primary mt-1.5 inline-block text-sm font-medium underline underline-offset-4"
                  >
                    {formatPhoneForDisplay(customer.phone)}
                  </a>
                ) : null}

                {/* The notes a provider needs to see before the person sits
              down — an allergy is useless on a screen nobody opens. */}
                {customer?.notes && customer.notes !== booking.customer_notes ? (
                  <p className="bg-warning/15 text-warning-foreground dark:text-warning mt-2.5 rounded-lg px-2.5 py-1.5 text-xs">
                    {customer.notes}
                  </p>
                ) : null}
                {booking.customer_notes ? (
                  <p className="text-muted-foreground mt-1 text-xs">{booking.customer_notes}</p>
                ) : null}

                <div className="mt-3">
                  <StatusActions bookingId={booking.id} status={booking.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
