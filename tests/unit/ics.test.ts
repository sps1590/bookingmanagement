import { describe, expect, it } from "vitest";

import { buildIcs, googleCalendarUrl } from "@/lib/calendar/ics";

/**
 * Every bug in iCalendar is an escaping bug, and they all fail the same way:
 * the file imports with the wrong content, or silently fails to import, and
 * nobody finds out until the patient does not turn up.
 */

const base = {
  uid: "DHK-20261201-0007@dhaka-dental-care",
  start: new Date("2026-12-01T04:00:00Z"),
  end: new Date("2026-12-01T05:00:00Z"),
  title: "Dental Appointment",
};

describe("buildIcs", () => {
  it("uses CRLF throughout", () => {
    const ics = buildIcs(base);
    // Outlook rejects a file with bare newlines outright. Asserted by counting
    // rather than by regex: a single stray "\n" is the whole failure.
    const bare = ics.split("\r\n").join("").includes("\n");
    expect(bare).toBe(false);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("writes timestamps as UTC basic format", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("DTSTART:20261201T040000Z");
    expect(ics).toContain("DTEND:20261201T050000Z");
  });

  it("escapes the characters that would truncate a value", () => {
    // "Smile, Dental" is the realistic case: an unescaped comma ends the
    // value, and the clinic's name arrives in the calendar as "Smile".
    const ics = buildIcs({
      ...base,
      title: "Smile, Dental; Gulshan",
      description: "Line one\nLine two \\ backslash",
    });

    expect(ics).toContain("SUMMARY:Smile\\, Dental\\; Gulshan");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two \\\\ backslash");
  });

  it("folds long lines and keeps them re-joinable", () => {
    const long = "A dental appointment with a very long description ".repeat(4);
    const ics = buildIcs({ ...base, description: long });

    for (const line of ics.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }

    // Unfolding (CRLF + single space) must give the original value back.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:${long}`);
  });

  it("folds on character boundaries, not byte boundaries", () => {
    // A Bengali clinic name is three bytes per character. Splitting mid
    // character produces a replacement character in whatever imports it.
    const bengali = "ঢাকা ডেন্টাল কেয়ার বিশেষজ্ঞ চিকিৎসা কেন্দ্র";
    const ics = buildIcs({ ...base, title: bengali });

    expect(ics).not.toContain("�");
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${bengali}`);
  });

  it("omits optional fields rather than emitting empty ones", () => {
    const ics = buildIcs(base);
    // Scoped to the event body: the alarms below carry a DESCRIPTION of their
    // own, which is what a phone shows on the reminder, and asserting against
    // the whole file would make adding one look like a regression.
    const body = ics.slice(0, ics.indexOf("BEGIN:VALARM"));
    expect(body).not.toContain("DESCRIPTION:");
    expect(body).not.toContain("LOCATION:");
    // No ORGANIZER: some clients read one as a meeting invitation and send
    // acceptances to an address the clinic may not monitor.
    expect(ics).not.toContain("ORGANIZER");
  });

  it("carries reminders, because without SMS they are the only ones", () => {
    const ics = buildIcs(base);
    // -24h and -1h, matching the two reminder rows the queue creates. A
    // customer who gave us nothing but a phone number gets these and nothing
    // else, and they cost nothing to deliver.
    expect(ics).toContain("TRIGGER:-PT24H");
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
  });

  it("withdraws the event on cancellation instead of adding another", () => {
    const ics = buildIcs({ ...base, method: "CANCEL", sequence: 3 });

    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    // The UID is unchanged, which is what makes a client remove the entry it
    // already has rather than file a second one beside it.
    expect(ics).toContain(`UID:${base.uid}`);
    expect(ics).toContain("SEQUENCE:3");
    // No alarms on a cancellation: a client that kept them would remind
    // somebody about an appointment that is not happening.
    expect(ics).not.toContain("BEGIN:VALARM");
  });
});

describe("googleCalendarUrl", () => {
  it("carries the times in the format Google expects", () => {
    const url = new URL(googleCalendarUrl(base));
    expect(url.searchParams.get("dates")).toBe("20261201T040000Z/20261201T050000Z");
    expect(url.searchParams.get("text")).toBe("Dental Appointment");
  });

  it("encodes rather than drops punctuation in the title", () => {
    const url = new URL(googleCalendarUrl({ ...base, title: "Smile, Dental & Co" }));
    expect(url.searchParams.get("text")).toBe("Smile, Dental & Co");
  });
});
