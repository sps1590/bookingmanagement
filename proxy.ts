import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the Supabase session alive, and keeps signed-out visitors off the
 * tenant application.
 *
 * Named `proxy` rather than `middleware`: Next 16 deprecated the middleware
 * file convention in favour of this one, and warns on every build until you
 * move.
 *
 * The refresh has to happen here rather than in a Server Component, because
 * Server Components cannot write cookies. Without it an access token expires
 * mid-session and the user is bounced to the login page while still holding a
 * perfectly good refresh token.
 *
 * ## Why this no longer calls `getUser()` on every request
 *
 * It used to, and the reasoning was sound as far as it went: `getUser()`
 * verifies the JWT with the auth server while `getSession()` only decodes
 * whatever is in the cookie, and a cookie is attacker-supplied input.
 *
 * What that reasoning missed is where the boundary actually is. This file runs
 * before *every* request in its matcher — including each client-side
 * navigation, which fetches its payload over the network like any other — so
 * it was putting a round trip to Supabase Auth in front of every click in the
 * product. Against a database in Singapore and functions that were running in
 * Virginia, that single call was a quarter of a second on its own, paid before
 * any page began to load.
 *
 * And it was not buying the security it looked like it was. The redirect below
 * is a courtesy: it sends a signed-out visitor to the login form instead of
 * letting them watch a dashboard fail to load. The actual boundary is further
 * in and unchanged — every page calls `requireMember()` and every API route
 * calls `requireRole()`, both of which go through `getMemberContext()` and
 * verify the user against the auth server, and Row-Level Security decides
 * every row either of them can read. A forged cookie gets past the redirect
 * here and then gets nothing: `requireMember()` sends it to /login, and RLS
 * returns no rows to an identity the auth server will not confirm. This is
 * also what Next's own documentation asks for — treat the proxy as a fast
 * path, never as the gate.
 *
 * So the cookie is read locally, which is free, and the auth server is called
 * only when the access token is close enough to expiry to be worth rotating.
 * On the overwhelming majority of requests this function now touches no
 * network at all.
 *
 * Reads `process.env` directly instead of importing `lib/env`. Next's docs are
 * explicit that proxy code may be deployed to a CDN edge separately from the
 * render path and should not lean on shared modules, and there is no reason to
 * pull a Zod schema into this bundle to read two strings.
 */

/**
 * Refresh this far ahead of expiry.
 *
 * Long enough that a request which arrives just inside the window still holds
 * a valid token by the time it reaches the database, and short enough that an
 * idle tab is not refreshing for the sake of it.
 */
const REFRESH_WINDOW_SECONDS = 300;

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Misconfigured rather than unauthenticated. Failing open here would serve
  // the dashboard to anyone; failing closed at least says what is wrong.
  if (!url || !key) {
    return new NextResponse("Supabase environment variables are not configured.", {
      status: 500,
    });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Reads the cookie and talks to nobody. Used for two things only: whether a
  // session is present at all, and when its access token runs out. Never as
  // proof of identity — see the note above.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;
  const isTenantArea =
    pathname.startsWith("/app") ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/superadmin");

  if (isTenantArea && !session) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    // Come back here after signing in, so a bookmarked page is not lost.
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  // A signed-in visitor has no business on the forms that create a session —
  // with one exception. `requireMember()` sends a signed-in account that owns
  // nothing to /signup?resume=1 so it can finish an interrupted signup, and
  // bouncing that back to /app is an infinite redirect between the two. The
  // state is reachable whenever the identity is created and the business is
  // not: a closed laptop, a failed transaction, or an address confirmed from
  // an email after the fact.
  const resuming = pathname === "/signup" && request.nextUrl.searchParams.get("resume") === "1";

  // And the second exception, which exists because this function now trusts
  // the cookie's own arithmetic rather than asking the auth server. An access
  // token can still be inside its hour while the account behind it has been
  // deleted or suspended, and then `requireMember()` — which does ask — sends
  // the request back here with nothing to show for it. Redirecting that to
  // /app would bounce it between the two forever, so `requireMember()` marks
  // the bounce and this lets the login page through.
  const expired = request.nextUrl.searchParams.get("expired") === "1";

  if (session && !resuming && !expired && (pathname === "/login" || pathname === "/signup")) {
    const app = request.nextUrl.clone();
    app.pathname = "/app";
    app.search = "";
    return NextResponse.redirect(app);
  }

  if (session) {
    const secondsLeft = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000);

    // Close to expiry: spend the one round trip, and send the rotated cookies
    // back on the response, where the browser will actually keep them.
    if (secondsLeft <= REFRESH_WINDOW_SECONDS) {
      await supabase.auth.getUser();
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images, the public booking portal and
     * the API.
     *
     * `/book/*` is deliberately excluded: it is the anonymous customer
     * journey, it must feel instant, and an auth round trip on it would add
     * latency to the one page that has to be fast.
     *
     * `/api/*` is excluded too. Every route under `/api/v1/admin` authenticates
     * itself through `requireRole()`, which verifies the user against the auth
     * server, so running this first added a hop and decided nothing — and a
     * proxy-level redirect to /login is the wrong answer to an API call
     * anyway, where the caller wants a 401 envelope it can read.
     */
    "/((?!_next/static|_next/image|favicon.ico|book/|api/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
