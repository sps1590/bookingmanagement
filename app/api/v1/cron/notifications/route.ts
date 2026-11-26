import { ApiError, ErrorCode } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { buildIcs } from "@/lib/calendar/ics";
import { clientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { channelFor, emailIsLive } from "@/lib/notify/channels";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The queue worker.
 *
 * Called on a schedule (`.github/workflows/notifications.yml`) rather than by
 * `pg_cron` + `pg_net`, for one reason: a scheduled GitHub Action is free,
 * visible, and already how this project keeps its database awake, whereas
 * wiring `pg_net` to call back into Vercel adds a moving part whose failures
 * are invisible from either side.
 *
 * ## Why it cannot double-send (defect B-16)
 *
 * It does not select rows and then mark them. `claim_notifications` (0024)
 * marks them `sending` in the same statement that selects them, with
 * `FOR UPDATE SKIP LOCKED`, so a second run arriving mid-flight steps over
 * what this one holds. The spec's version selected first, and two overlapping
 * runs — which happen the moment a run takes longer than the tick — both sent
 * the same fifty messages.
 *
 * ## Authentication
 *
 * A shared secret in a header, compared in constant time. Without
 * `CRON_SECRET` set the endpoint refuses rather than running open: a queue
 * drain anyone can trigger is a way to spend the platform's entire email
 * allowance in an afternoon.
 */

export const maxDuration = 60;

/** Resend's free tier, platform-wide. Also the Brevo daily figure × 10. */
const MONTHLY_EMAIL_ALLOWANCE = 3000;

/**
 * The shared secret, read straight from the environment.
 *
 * Deliberately not through `serverEnv()`: that validates the whole schema and
 * throws if anything unrelated is missing, which turns an unauthenticated
 * request into a 500 and tells a stranger that the deployment is
 * misconfigured. An authorisation gate must not depend on configuration it
 * does not use.
 */
function cronSecret(): string | undefined {
  const value = process.env.CRON_SECRET;
  return value && value.length > 0 ? value : undefined;
}

function authorise(request: Request): void {
  const configured = cronSecret();

  if (!configured) {
    throw new ApiError(ErrorCode.FORBIDDEN, "The scheduler is not configured on this deployment.");
  }

  const offered =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!timingSafeEqual(offered, configured)) {
    throw new ApiError(ErrorCode.FORBIDDEN, "Not authorised.");
  }
}

/** Constant-time compare, so the secret cannot be guessed a byte at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const POST = route("cron.notifications", async (request: Request) => {
  authorise(request);

  const supabase = createAdminClient();

  // Anything abandoned mid-send by a worker that died comes back first, so a
  // crash costs one cycle rather than the message.
  const { data: reaped } = await supabase.rpc("reap_stuck_notifications");

  const { data: claimed, error: claimError } = await supabase.rpc("claim_notifications", {
    p_limit: 25,
  });
  if (claimError) throw claimError;

  const live = emailIsLive();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of claimed ?? []) {
    // The email allowance is platform-wide, not per tenant, so it is consumed
    // here rather than counted per business. `skipped` rather than `failed`:
    // a limit is not a fault, and failing would retry against a provider that
    // is going to keep refusing.
    if (item.channel === "email" && live) {
      const { data: allowed } = await supabase.rpc("claim_email_allowance", {
        p_limit: MONTHLY_EMAIL_ALLOWANCE,
      });
      if (allowed === false) {
        await supabase.rpc("skip_notification", {
          p_id: item.id,
          p_reason: "Platform email allowance for this month is spent.",
        });
        skipped += 1;
        continue;
      }
    }

    const attachment =
      item.channel === "email" && item.booking_id
        ? await buildInvite(supabase, item.booking_id, item.event_type)
        : null;

    const result = await channelFor(item.channel).send({
      to: item.recipient_contact,
      subject: item.subject,
      body: item.message_body,
      icsAttachment: attachment,
    });

    await supabase.rpc("complete_notification", {
      p_id: item.id,
      p_ok: result.ok,
      p_provider: result.provider,
      p_provider_id: result.providerId ?? undefined,
      p_error: result.error ?? undefined,
    });

    if (result.ok) sent += 1;
    else failed += 1;
  }

  logger.info("cron.notifications", {
    claimed: claimed?.length ?? 0,
    reaped: reaped ?? 0,
    sent,
    failed,
    skipped,
  });

  return ok({ claimed: claimed?.length ?? 0, reaped: reaped ?? 0, sent, failed, skipped });
});

/**
 * The calendar invite that rides with the email.
 *
 * Without SMS this is the only reminder that reaches someone who gave us
 * nothing but a phone number, and it costs nothing to operate — so it is a
 * first-class part of the message rather than a nicety.
 *
 * The `UID` is stable across the booking's life and `SEQUENCE` is its
 * reschedule count, which is what makes a moved appointment *update* the
 * entry already in the customer's calendar instead of appearing beside it. A
 * cancellation goes out as `METHOD:CANCEL`, so the entry is withdrawn rather
 * than left sitting there.
 */
async function buildInvite(
  supabase: ReturnType<typeof createAdminClient>,
  bookingId: string,
  eventType: string,
): Promise<{ filename: string; content: string } | null> {
  const { data } = await supabase
    .from("bookings")
    .select(
      `booking_code, start_time, end_time, status, reschedule_count, reschedule_token,
       businesses (name, slug, address, timezone),
       services (name)`,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!data) return null;

  const business = data.businesses as unknown as {
    name: string;
    slug: string;
    address: string | null;
  } | null;
  const service = data.services as unknown as { name: string } | null;
  if (!business) return null;

  const cancelled = data.status === "cancelled" || eventType === "cancelled";

  const ics = buildIcs({
    uid: `${data.booking_code}@${business.slug}`,
    start: new Date(data.start_time),
    end: new Date(data.end_time),
    title: `${service?.name ?? "Appointment"} — ${business.name}`,
    description: `Booking code ${data.booking_code}.`,
    location: business.address ?? undefined,
    url: `${clientEnv.NEXT_PUBLIC_APP_URL}/manage/${data.reschedule_token}`,
    sequence: data.reschedule_count,
    method: cancelled ? "CANCEL" : "PUBLISH",
  });

  return { filename: `${business.slug}-${data.booking_code}.ics`, content: ics };
}
