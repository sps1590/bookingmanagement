import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StatusActions } from "@/app/(app)/app/bookings/status-actions";
import { requireMember } from "@/lib/auth/session";
import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { todayIn, zonedDayRange } from "@/lib/time/zone";

export const metadata: Metadata = { title: "My day" };
export const dynamic = "force-dynamic";

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
export default async function StaffToday() {
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
    <main className="mx-auto max-w-xl px-5 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
        <Link href="/staff/availability" className="text-sm underline underline-offset-4">
          My hours
        </Link>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {bookings.length}{" "}
        {bookings.length === 1 ? t.booking.toLowerCase() : t.bookingPlural.toLowerCase()}
        {bookings.length > 0 ? ` · ${done} done` : null} · {member.timezone}
      </p>

      {bookings.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-neutral-300 px-4 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Nothing booked today.
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
                className="rounded-md border border-neutral-200 px-4 py-3 dark:border-neutral-800"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-semibold tabular-nums">
                    {clock.format(new Date(booking.start_time))}
                  </span>
                  <span className="text-xs text-neutral-500 capitalize">
                    {booking.status.replace("_", " ")}
                  </span>
                </div>

                <p className="mt-1 text-sm font-medium">{customer?.full_name ?? "—"}</p>
                <p className="text-xs text-neutral-500">{service?.name ?? "—"}</p>

                {customer?.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    className="mt-1 inline-block text-sm underline underline-offset-4"
                  >
                    {formatPhoneForDisplay(customer.phone)}
                  </a>
                ) : null}

                {/* The notes a provider needs to see before the person sits
                    down — an allergy is useless on a screen nobody opens. */}
                {customer?.notes ? (
                  <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {customer.notes}
                  </p>
                ) : null}
                {booking.customer_notes ? (
                  <p className="mt-1 text-xs text-neutral-500">{booking.customer_notes}</p>
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
