import { ApiError, ErrorCode } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Nightly housekeeping.
 *
 * Four jobs that a paid platform would get from a scheduler and this one gets
 * from a GitHub Action, because the whole stack is the free tier:
 *
 *   * **Prune the notification log.** One row per message forever against a
 *     500 MB database. Ninety days of detail, older rolled into daily counts.
 *   * **Expire subscriptions.** Downgrade what has lapsed, after a grace
 *     period, suspending over-limit staff rather than deleting them.
 *   * **Release unverified deposits.** A `pending` booking holds its slot by
 *     design, so an unpaid one would hold it forever.
 *   * **Expire waitlist offers.** An unanswered offer leaves a row stuck in
 *     `notified` and the next person never hears anything.
 *
 * Every one is idempotent and safe to run late. GitHub drops scheduled runs
 * under load and never retries them, so a job here that needed to run exactly
 * once would eventually not run at all.
 *
 * Failures are reported per job rather than aborting the request: a prune that
 * fails should not stop a lapsed plan being downgraded.
 */

export const maxDuration = 120;

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

  // Constant time, so the secret cannot be guessed a byte at a time.
  if (offered.length !== configured.length) {
    throw new ApiError(ErrorCode.FORBIDDEN, "Not authorised.");
  }
  let diff = 0;
  for (let i = 0; i < offered.length; i += 1) {
    diff |= offered.charCodeAt(i) ^ configured.charCodeAt(i);
  }
  if (diff !== 0) throw new ApiError(ErrorCode.FORBIDDEN, "Not authorised.");
}

export const POST = route("cron.maintenance", async (request: Request) => {
  authorise(request);

  const supabase = createAdminClient();
  const results: Record<string, number | string> = {};

  const jobs: [string, () => PromiseLike<{ data: unknown; error: { message: string } | null }>][] =
    [
      ["prunedNotifications", () => supabase.rpc("prune_notification_logs", { p_days: 90 })],
      ["expiredSubscriptions", () => supabase.rpc("expire_subscriptions", { p_grace_days: 3 })],
      ["releasedDeposits", () => supabase.rpc("sweep_unverified_deposits", { p_hours: 2 })],
      ["expiredWaitlistOffers", () => supabase.rpc("expire_waitlist_offers")],
    ];

  for (const [name, run] of jobs) {
    try {
      const { data, error } = await run();
      results[name] = error ? `failed: ${error.message}` : Number(data ?? 0);
      if (error) logger.error("cron.maintenance.job", { job: name, error: error.message });
    } catch (error) {
      results[name] = `failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error("cron.maintenance.job", { job: name });
    }
  }

  logger.info("cron.maintenance", results);
  return ok(results);
});
