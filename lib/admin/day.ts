import "server-only";

import type { MemberContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayIn, zonedDayRange } from "@/lib/time/zone";

/**
 * The day sheet: what a receptionist needs to see on opening the screen.
 *
 * Read through the caller's own session, so Row-Level Security decides what
 * counts — a provider's "today" is their own column of the diary, the front
 * desk's is the whole clinic, and a member pinned to a branch sees that branch
 * (migration 0022). None of that is re-implemented here, which is the point:
 * a dashboard that applied its own idea of visibility would eventually
 * disagree with the list screen, and one of the two would be wrong.
 */

export interface DayBooking {
  id: string;
  booking_code: string;
  status: string;
  start_time: string;
  end_time: string;
  total_price: number;
  customers: { full_name: string; phone: string } | null;
  services: { name: string } | null;
  staff_resources: { name: string } | null;
}

export interface DaySheet {
  date: string;
  total: number;
  pending: number;
  completed: number;
  noShows: number;
  /** Money actually taken today, not money booked — see below. */
  collected: number;
  upcoming: DayBooking[];
}

const SELECT = `id, booking_code, status, start_time, end_time, total_price,
                customers (full_name, phone),
                services (name),
                staff_resources (name)`;

export async function loadDaySheet(member: MemberContext, now = new Date()): Promise<DaySheet> {
  const supabase = await createClient();
  const date = todayIn(member.timezone, now);
  const { start, end } = zonedDayRange(date, date, member.timezone);

  const { data } = await supabase
    .from("bookings")
    .select(SELECT)
    .eq("business_id", member.businessId)
    .gte("start_time", start)
    .lt("start_time", end)
    .order("start_time", { ascending: true });

  const bookings = (data ?? []) as unknown as DayBooking[];
  const live = bookings.filter((b) => b.status !== "cancelled");

  return {
    date,
    total: live.length,
    pending: live.filter((b) => b.status === "pending").length,
    completed: live.filter((b) => b.status === "completed").length,
    noShows: live.filter((b) => b.status === "no_show").length,
    // Deliberately only completed appointments. A revenue figure that counted
    // everything booked would read high all morning and fall as the day's
    // no-shows land, which is the opposite of useful — and it is the number an
    // owner would quote to a bank.
    collected: live
      .filter((b) => b.status === "completed")
      .reduce((sum, b) => sum + Number(b.total_price ?? 0), 0),
    upcoming: live
      .filter(
        (b) =>
          new Date(b.start_time).getTime() >= now.getTime() &&
          ["pending", "confirmed", "checked_in"].includes(b.status),
      )
      .slice(0, 8),
  };
}
