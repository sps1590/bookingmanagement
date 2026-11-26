"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The day calendar: one column per provider, drag a card to move it.
 *
 * ## Why this is not FullCalendar
 *
 * FullCalendar's day and week views are free; the *resource* views — a column
 * per provider, which is the entire point of a clinic calendar — are a paid
 * plugin. Taking that on would put the first licence cost into a stack whose
 * premise is that there isn't one (docs/FREE_STACK.md), to render a grid that
 * is a hundred lines of CSS and two drag handlers. So it is written here, and
 * the trade is recorded rather than discovered later by whoever reads the
 * invoice.
 *
 * ## The failure it is built around
 *
 * Dropping a card onto a time that is not free. The move is **not** applied
 * optimistically: the card stays where it is until the server agrees. An
 * optimistic calendar that rolls back looks, to a receptionist glancing up,
 * a great deal like one that worked — and the appointment they think they
 * moved is still at ten o'clock. The plan's exit criterion is that a rejected
 * drop returns the card to its origin, and the surest way to return it is
 * never to have moved it.
 *
 * Availability is not re-checked here either. `admin_reschedule_booking`
 * (0020) runs the same gate a customer gets, so a drop onto a lunch break is
 * refused by the database rather than by a copy of its rules living in a
 * component.
 */

export interface CalendarBooking {
  id: string;
  code: string;
  staffId: string;
  start: string;
  end: string;
  status: string;
  customer: string;
  service: string;
  colour: string | null;
}

export interface CalendarStaff {
  id: string;
  name: string;
}

const SLOT_MINUTES = 15;
/** Tailwind h-6 — kept here because the geometry below depends on it. */
const SLOT_REM = 1.5;

export function DayGrid({
  bookings,
  staff,
  date,
  timezone,
  openHour = 8,
  closeHour = 21,
  canMove,
}: {
  bookings: CalendarBooking[];
  staff: CalendarStaff[];
  date: string;
  timezone: string;
  openHour?: number;
  closeHour?: number;
  canMove: boolean;
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const rows = ((closeHour - openHour) * 60) / SLOT_MINUTES;

  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  /** Minutes from the top of the grid, read in the tenant's own zone. */
  function offsetOf(iso: string): number {
    const [h, m] = clock.format(new Date(iso)).split(":").map(Number);
    return (h - openHour) * 60 + m;
  }

  async function drop(row: number, staffId: string) {
    if (!dragging || busy) return;

    const minutes = openHour * 60 + row * SLOT_MINUTES;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    const startTime = new Date(
      `${date}T${hh}:${mm}:00${offsetSuffix(timezone, date)}`,
    ).toISOString();

    setBusy(true);
    setProblem(null);

    try {
      const response = await fetch(`/api/v1/admin/bookings/${dragging}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime, staffId }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.success) {
        // Nothing moved, so there is nothing to put back.
        setProblem(body?.error?.message ?? "That move was refused.");
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
      setDragging(null);
    }
  }

  if (staff.length === 0) {
    return (
      <p className="border-border bg-muted/30 text-muted-foreground mt-6 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
        No providers yet. Add one under Settings.
      </p>
    );
  }

  return (
    <>
      {problem ? (
        <p
          role="alert"
          className="bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning mt-4 rounded-lg px-4 py-2 text-sm ring-1 ring-inset"
        >
          {problem}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <div
          className="border-border bg-card elevated grid min-w-[640px] overflow-hidden rounded-xl border"
          style={{ gridTemplateColumns: `4rem repeat(${staff.length}, minmax(10rem, 1fr))` }}
        >
          {/* Header */}
          <div className="border-border bg-muted/60 sticky top-0 border-b p-2 text-xs backdrop-blur" />
          {staff.map((person) => (
            <div
              key={person.id}
              className="border-border bg-muted/60 sticky top-0 truncate border-b border-l p-2 text-xs font-semibold backdrop-blur"
            >
              {person.name}
            </div>
          ))}

          {/* Time gutter: one cell, hour labels drawn at their own offsets. */}
          <div className="relative" style={{ height: `${rows * SLOT_REM}rem` }}>
            {Array.from({ length: closeHour - openHour }, (_, i) => (
              <div
                key={i}
                className="text-muted-foreground/70 tabular absolute right-2 -translate-y-1/2 text-[10px]"
                style={{ top: `${i * 4 * SLOT_REM}rem` }}
              >
                {String(openHour + i).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* One positioned container per provider: drop targets underneath,
          appointment cards on top. An appointment is not one slot long, so
          putting cards inside cells would split them across rows and lose
          which row owns them. */}
          {staff.map((person) => (
            <div
              key={person.id}
              className="border-border relative border-l"
              style={{ height: `${rows * SLOT_REM}rem` }}
            >
              {Array.from({ length: rows }, (_, row) => (
                <div
                  key={row}
                  onDragOver={canMove ? (e) => e.preventDefault() : undefined}
                  onDrop={canMove ? () => void drop(row, person.id) : undefined}
                  className={`absolute inset-x-0 ${
                    row % 4 === 0 ? "border-border border-t" : ""
                  } ${dragging ? "hover:bg-accent" : ""}`}
                  style={{ top: `${row * SLOT_REM}rem`, height: `${SLOT_REM}rem` }}
                />
              ))}

              {bookings
                .filter((booking) => booking.staffId === person.id)
                .map((booking) => {
                  const top = offsetOf(booking.start);
                  const height = Math.max(
                    SLOT_MINUTES,
                    offsetOf(booking.end) - offsetOf(booking.start),
                  );

                  return (
                    <div
                      key={booking.id}
                      draggable={canMove && booking.status !== "cancelled"}
                      onDragStart={() => setDragging(booking.id)}
                      onDragEnd={() => setDragging(null)}
                      title={`${booking.code} · ${booking.customer} · ${booking.service} · ${booking.status.replace("_", " ")}`}
                      className="border-border bg-card elevated absolute inset-x-1 cursor-grab overflow-hidden rounded-lg border px-1.5 py-1 text-[11px]"
                      style={{
                        top: `${(top / SLOT_MINUTES) * SLOT_REM}rem`,
                        height: `${(height / SLOT_MINUTES) * SLOT_REM}rem`,
                        borderLeftColor: booking.colour ?? "#2563EB",
                        borderLeftWidth: "3px",
                        opacity: booking.status === "cancelled" ? 0.4 : 1,
                      }}
                    >
                      <span className="block truncate font-medium">{booking.customer}</span>
                      <span className="text-muted-foreground block truncate">
                        {booking.service}
                      </span>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {canMove ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Drag a card to move it. The appointment only moves once the server accepts it, so a
          refused move leaves it exactly where it was.
        </p>
      ) : (
        <p className="text-muted-foreground mt-3 text-xs">
          Your role can view the day but not move appointments.
        </p>
      )}
    </>
  );
}

/**
 * The tenant's UTC offset on a given date, as `+06:00`.
 *
 * Computed from the zone rather than assumed, so a tenant on America/New_York
 * is not an hour out on either side of a daylight-saving change.
 */
function offsetSuffix(timeZone: string, date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const asLocal = new Date(probe.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  const minutes = Math.round((asLocal.getTime() - asUtc.getTime()) / 60000);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}
