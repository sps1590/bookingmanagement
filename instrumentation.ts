import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error tracking.
 *
 * Inert without SENTRY_DSN, so local development and CI stay quiet and the
 * app never depends on a Sentry account existing. Phase 10 turns on
 * source-map upload, which additionally needs SENTRY_AUTH_TOKEN at build time.
 */
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

    // Sentry v11 collects user info, cookies, headers, request/response
    // bodies, query params, DB query data and local stack-frame variables by
    // DEFAULT. On this platform all of those routinely carry patient names,
    // phone numbers, visit notes and reschedule tokens, so every category is
    // switched off deliberately. We want stack traces, not a second
    // unaudited copy of the tenants' customer data.
    //
    // Before enabling any of these, check what it would capture from
    // /api/v1/public/:slug/bookings.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
