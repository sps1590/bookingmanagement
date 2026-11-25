import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request, and keeps signed-out
 * visitors out of the tenant application.
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
 * `getUser()` rather than `getSession()`: the former verifies the JWT with the
 * auth server, the latter only decodes whatever is in the cookie. A cookie is
 * attacker-supplied input, and this check is what stands in front of the
 * tenant dashboard.
 *
 * Reads `process.env` directly instead of importing `lib/env`. Next's docs are
 * explicit that proxy code may be deployed to a CDN edge separately from the
 * render path and should not lean on shared modules, and there is no reason to
 * pull a Zod schema into this bundle to read two strings.
 */
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isTenantArea =
    pathname.startsWith("/app") ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/superadmin");

  if (isTenantArea && !user) {
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

  if (user && !resuming && (pathname === "/login" || pathname === "/signup")) {
    const app = request.nextUrl.clone();
    app.pathname = "/app";
    app.search = "";
    return NextResponse.redirect(app);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images and the public booking portal.
     * `/book/*` is deliberately excluded: it is the anonymous customer
     * journey, it must feel instant, and an auth round trip on it would add
     * latency to the one page that has to be fast.
     */
    "/((?!_next/static|_next/image|favicon.ico|book/|api/v1/public/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
