import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * Set here rather than in a host config file so they apply identically on
 * Vercel, on any other host, and on `next start` locally — a header that only
 * exists in production is a header nobody tests.
 *
 * No Content-Security-Policy yet. A useful one needs per-request nonces for
 * Next's inline bootstrap scripts, and a broken CSP fails by silently
 * blocking the booking form rather than by erroring somewhere visible. It
 * belongs with the rest of the hardening in Phase 10.
 */
const securityHeaders = [
  // This app shows patient names and appointment times. Being framed by
  // another origin is how those get read by a page the tenant did not open.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The booking portal needs none of these.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Reschedule links are sent by email and carry a bearer token in the path.
  // Without this, a cross-origin referrer could leak it; with the policy above
  // plus this, it stays within the origin.
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  /**
   * Cache Components: Partial Prerendering as the default.
   *
   * Every route ships a static shell that is served immediately, with the
   * parts that depend on this request — who is signed in, what is booked
   * today — streamed in behind it. Data fetching becomes dynamic by default
   * and caching becomes explicit, which is why `dynamic = "force-dynamic"`
   * no longer appears anywhere in this app and why the booking portal's
   * queries carry `use cache` and a tag instead.
   *
   * It also brings React's `<Activity>` to client-side navigation, so a
   * filtered list or a half-typed form survives a trip to another screen and
   * back.
   *
   * The cost is recorded in D-022 and is not a detail: a request-time
   * `notFound()` can no longer set a 404, because the shell has already
   * started the response with a 200. `/book/[slug]` therefore answers 200
   * with `<meta name="robots" content="noindex">` for a slug that does not
   * exist. That was accepted deliberately.
   *
   * `partialPrefetching` is set explicitly because leaving it unset warns:
   * the first release of Cache Components shipped without it. Both become
   * the only behaviour in the next major version.
   */
  cacheComponents: true,
  partialPrefetching: true,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
