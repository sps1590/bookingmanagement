import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the link in a Supabase email lands.
 *
 * The project requires a confirmed address before a first sign-in, which is
 * the right default for software that will hold medical appointments: it is
 * the only thing stopping somebody registering a clinic under an address they
 * do not own. The cost is that there has to be somewhere for the link to go,
 * and until now there was not — the confirmation redirected to whatever the
 * Site URL happened to be, with the session in a URL fragment no server can
 * read, so a correctly confirmed account arrived nowhere.
 *
 * Two shapes arrive here and both are handled, because which one it is
 * depends on dashboard configuration that is easy to change by accident:
 *
 *   * `?code=` — the PKCE exchange. `@supabase/ssr` sets a verifier cookie
 *     when the account is created, so this only completes in the browser that
 *     signed up. That is a feature: a forwarded link cannot take over the
 *     account.
 *   * `?token_hash=&type=` — the template form, which works in any browser.
 *
 * After the session exists, the destination depends on how far the person
 * got. Signup creates the identity first and the business second, so an
 * interrupted signup leaves an account that owns nothing; sending that person
 * to `/app` would show them an empty shell. They go back to the signup form,
 * which knows how to finish the job.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let verified = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
    if (error) logger.warn("auth.confirm.exchange_failed", { error: error.message });
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    verified = !error;
    if (error) logger.warn("auth.confirm.verify_failed", { error: error.message });
  }

  if (!verified) {
    // Expired, already used, or opened in a different browser than the one
    // that signed up. Say so on the login page rather than failing blankly.
    return NextResponse.redirect(new URL("/login?confirm=failed", url.origin));
  }

  // A confirmed account with no business is an interrupted signup, not a
  // broken one.
  const { data: membership } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const next = membership?.business_id ? "/app" : "/signup?resume=1";
  return NextResponse.redirect(new URL(next, url.origin));
}
