import { buildIcs, googleCalendarUrl, type CalendarEvent } from "@/lib/calendar/ics";

/**
 * "Add to calendar", both ways people actually do it.
 *
 * The .ics is served from a `data:` URL rather than an endpoint. The
 * alternative — a route that formats whatever text it is sent — is a small
 * content-injection surface for no gain, and a route that looked the booking
 * up by code would answer "does this code exist" for anyone who guessed one.
 * Everything needed is already in this page.
 *
 * Why both: tapping a downloaded .ics on Android opens a file manager about as
 * often as a calendar, so the Google link is the one-tap path for most of this
 * product's customers. The file is for everyone else, and for desktop Outlook.
 */
export function CalendarLinks({ event, fileName }: { event: CalendarEvent; fileName: string }) {
  const ics = buildIcs(event);
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
      >
        Add to Google Calendar
      </a>
      <a
        href={href}
        download={fileName}
        className="rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
      >
        Download calendar file
      </a>
    </div>
  );
}
