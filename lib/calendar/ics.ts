/**
 * Calendar invites, by hand.
 *
 * iCalendar is a 1998 text format with four rules that matter and a library
 * ecosystem out of all proportion to them. Writing it here keeps a dependency
 * out of the bundle and, more usefully, keeps the escaping visible — the bugs
 * in this format are all escaping bugs, and they surface as an invite that
 * silently fails to import rather than as an error anyone sees.
 *
 * The rules that are not optional:
 *
 *   1. CRLF line endings. Not "\n". Outlook rejects the file outright.
 *   2. Lines fold at 75 octets, continued by CRLF + a single space.
 *   3. `,` `;` `\` and newlines are escaped inside text values. A clinic
 *      called "Smile, Dental" otherwise truncates at the comma.
 *   4. UTC timestamps in basic format, `YYYYMMDDTHHMMSSZ`.
 *
 * Deliberately not included: an ORGANIZER with a mailto, which makes some
 * clients treat the event as a meeting invitation and send acceptances back to
 * an address the clinic may not monitor.
 */

export interface CalendarEvent {
  /** Stable across re-issues of the same booking, so an update replaces. */
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  /** Bumped when the booking is rescheduled, so clients accept the change. */
  sequence?: number;
}

function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Escapes the four characters iCalendar reserves inside a text value. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds a line to 75 octets. Counted in octets rather than characters because
 * the limit is a byte limit, and a Bengali business name is three bytes per
 * character — a 40-character name is 120 octets and would otherwise go out
 * unfolded.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;

  while (start < bytes.length) {
    // The first line takes 75 octets, continuations 74 (one is the leading
    // space). Step back to a character boundary so a multi-byte character is
    // never split across the fold.
    let take = Math.min(parts.length === 0 ? 75 : 74, bytes.length - start);
    while (take > 1 && (bytes[start + take] & 0xc0) === 0x80) take -= 1;

    parts.push(bytes.subarray(start, start + take).toString("utf8"));
    start += take;
  }

  return parts.join("\r\n ");
}

export function buildIcs(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Booking Management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${escapeText(event.url)}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * The "Add to Google Calendar" link.
 *
 * A URL rather than a file because tapping a downloaded .ics on Android opens
 * a file manager as often as a calendar, and the one-tap path is what decides
 * whether a reminder exists at all.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${stamp(event.start)}/${stamp(event.end)}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
