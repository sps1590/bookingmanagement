import { Suspense } from "react";
import { ConsolePageSkeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { todayIn, zonedDayRange } from "@/lib/time/zone";

export const metadata: Metadata = { title: "Day sheet" };
/**
 * The daily serial sheet, for the clipboard at reception.
 *
 * Printed through the browser rather than rendered by a PDF library. That is
 * not laziness: the sheet has to carry Bangla customer names, and a PDF
 * renderer prints what its embedded font has glyphs for — missing ones become
 * boxes, and nobody finds out until the sheet is on the desk. The browser
 * already has the fonts, already knows A4, and the output is identical on the
 * one machine that matters, which is the one connected to the printer.
 *
 * Grouped by provider because that is how the day is actually worked, with a
 * notes column because somebody always writes on it.
 */
export default function PrintSheet({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return (
    <Suspense fallback={<ConsolePageSkeleton rows={8} />}>
      <PrintSheetContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PrintSheetContent({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const member = await requireMember();
  if (!member.onboardingComplete) redirect("/app/onboarding");

  const params = await searchParams;
  const valid = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date);
  const date = valid ? params.date! : todayIn(member.timezone);
  const { start, end } = zonedDayRange(date, date, member.timezone);

  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      `booking_code, start_time, status,
     customers (full_name, phone),
     services (name),
     staff_resources (id, name)`,
    )
    .eq("business_id", member.businessId)
    .gte("start_time", start)
    .lt("start_time", end)
    .neq("status", "cancelled")
    .order("start_time");

  const bookings = data ?? [];

  const byStaff = new Map<string, { name: string; rows: typeof bookings }>();
  for (const booking of bookings) {
    const provider = booking.staff_resources as unknown as { id: string; name: string } | null;
    const key = provider?.id ?? "unassigned";
    const entry = byStaff.get(key) ?? { name: provider?.name ?? "Unassigned", rows: [] };
    entry.rows.push(booking);
    byStaff.set(key, entry);
  }

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const heading = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 print:px-0 print:py-0">
      <style>{`
      @media print {
       @page { size: A4 portrait; margin: 14mm; }
       .no-print { display: none !important; }
       /* A provider's list must not break across pages mid-column; a sheet
         where Dr Rahman's afternoon is on page two is a sheet somebody
         loses. */
       section { break-inside: avoid; }
       body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>

      <div className="no-print mb-6 flex items-center justify-between gap-3">
        <a href="/app/bookings" className="text-sm underline underline-offset-4">
          Back
        </a>
        <span className="text-muted-foreground text-xs">
          Use your browser&rsquo;s print dialogue.
        </span>
      </div>

      <header className="border-b border-neutral-300 pb-3">
        <h1 className="text-xl font-semibold">{member.businessName}</h1>
        <p className="text-sm">
          {heading} · {bookings.length} appointment{bookings.length === 1 ? "" : "s"} ·{" "}
          {member.timezone}
        </p>
      </header>

      {bookings.length === 0 ? (
        <p className="mt-8 text-sm">Nothing booked.</p>
      ) : (
        [...byStaff.values()].map((group) => (
          <section key={group.name} className="mt-6">
            <h2 className="text-sm font-semibold">{group.name}</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-300 text-left">
                  <th className="w-10 py-1 font-medium">#</th>
                  <th className="w-16 py-1 font-medium">Time</th>
                  <th className="py-1 font-medium">Name</th>
                  <th className="w-32 py-1 font-medium">Phone</th>
                  <th className="py-1 font-medium">Service</th>
                  <th className="w-40 py-1 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((booking, index) => {
                  const customer = booking.customers as unknown as {
                    full_name: string;
                    phone: string;
                  } | null;
                  return (
                    <tr key={booking.booking_code} className="border-b border-neutral-200">
                      <td className="py-1.5">{index + 1}</td>
                      <td className="py-1.5">{time.format(new Date(booking.start_time))}</td>
                      <td className="py-1.5">{customer?.full_name ?? "—"}</td>
                      <td className="py-1.5">
                        {customer?.phone ? formatPhoneForDisplay(customer.phone) : "—"}
                      </td>
                      <td className="py-1.5">
                        {(booking.services as unknown as { name: string } | null)?.name ?? "—"}
                      </td>
                      {/* Left blank on purpose: this is the column somebody
                  writes in with a pen. */}
                      <td className="py-1.5" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))
      )}
    </main>
  );
}
