/**
 * The timezone list, in a module of its own.
 *
 * It lived in `actions.ts` next to the schema that validates against it, which
 * reads well and does not work: that file is `"use server"`, and a server
 * module may only export functions. Everything else becomes a server
 * reference on the client — so the wizard's `SUPPORTED_TIMEZONES.map(...)`
 * was calling `.map` on a remote procedure stub, and the whole onboarding
 * screen died with "d.map is not a function" before it rendered a pixel.
 *
 * Nobody saw it because nobody ever got that far: the only route to this
 * screen is finishing signup, and signup had been failing on the deployment
 * for a different reason entirely.
 *
 * The list is deliberately short rather than the full IANA database. It
 * covers where this product is actually used, and a search box over 400 zone
 * names is a worse answer for a clinic in Dhaka than fourteen entries with
 * theirs at the top.
 */
export const TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Colombo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
] as const;

export const SUPPORTED_TIMEZONES: readonly string[] = TIMEZONES;
