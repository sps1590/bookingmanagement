import { redirect } from "next/navigation";

/**
 * `/app/settings` has no screen of its own, and used to be a 404.
 *
 * Every link in the product points at one of the four sections, so nothing
 * inside the app reached this URL — but people type it, bookmark it, and
 * guess it from `/app/settings/hours`. Meeting them with "this page could not
 * be found" suggests the settings are gone rather than one level down.
 *
 * Services first because it is the one section a new business must fill in
 * before the booking page offers anything at all.
 */
export default function SettingsIndex() {
  redirect("/app/settings/services");
}
