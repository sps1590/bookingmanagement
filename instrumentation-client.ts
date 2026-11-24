import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side error tracking. Inert without NEXT_PUBLIC_SENTRY_DSN.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,

    // Session Replay stays off: the public booking portal collects patient
    // names, phone numbers and visit notes, and a replay would record them
    // keystroke by keystroke.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // See the comment in instrumentation.ts — these default to true in
    // Sentry v11 and are switched off on purpose.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
