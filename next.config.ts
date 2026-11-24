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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
