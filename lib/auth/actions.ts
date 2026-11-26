"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Sign out.
 *
 * There was no way to do this. The application had no sign-out anywhere —
 * not in a menu, not on the dashboard — so the only way off a shared
 * reception computer was to clear the browser's cookies. For software holding
 * a clinic's patient list that is not a missing convenience, it is a missing
 * control.
 *
 * A server action rather than a client call so the cookie is cleared by the
 * response that performs the redirect; clearing it in the browser and then
 * navigating leaves a window in which the proxy still sees a session.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
