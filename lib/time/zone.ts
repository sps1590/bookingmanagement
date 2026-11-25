/**
 * Calendar days in a tenant's timezone, as instants.
 *
 * Every date a tenant types — a filter, a day sheet, an override — is a
 * wall-clock day in their own zone, and every timestamp in the database is an
 * instant. Converting between the two is the single most repeated operation in
 * this product and the easiest to get subtly wrong: comparing a `timestamptz`
 * against a bare date uses the *server's* midnight, which in Dhaka is six
 * hours into the working day. A "today" filter built that way silently drops
 * the morning's appointments.
 */

/**
 * The instant at which a named calendar day begins in a zone.
 *
 * Derived by probing rather than by a fixed offset, so it stays correct across
 * a DST boundary — America/New_York crosses one twice a year, and on those two
 * days a hardcoded offset is an hour out in the direction nobody checks.
 */
export function zonedDayStart(day: string, timeZone: string): Date {
  const probe = new Date(`${day}T00:00:00Z`);
  const asLocal = new Date(probe.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(probe.getTime() - (asLocal.getTime() - asUtc.getTime()));
}

/** Today's calendar date in a zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Shift a YYYY-MM-DD date by whole days, staying a calendar date. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Half-open [start, end) covering one or more calendar days in a zone. */
export function zonedDayRange(from: string, to: string, timeZone: string) {
  return {
    start: zonedDayStart(from, timeZone).toISOString(),
    end: zonedDayStart(addDays(to, 1), timeZone).toISOString(),
  };
}
