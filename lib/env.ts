import { z } from "zod";

/**
 * Validated environment access.
 *
 * Phase 0 intentionally keeps every integration secret optional so the app
 * boots and CI runs before any gateway account exists. Each phase that starts
 * using a secret should promote it from `.optional()` to required here, so a
 * misconfigured deploy fails at boot rather than at 2am in the reminder worker.
 *
 * Never import `serverEnv` from a Client Component — it reads secrets.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Phase 5 — notifications. Free channels only; see docs/FREE_STACK.md §3.
  // There is deliberately no SMS or WhatsApp config: neither has a free tier
  // for business-initiated reminders, so neither is in the product.
  //
  // `log` writes to the console instead of sending, so a dev run never emails
  // a real patient.
  NOTIFY_EMAIL_PROVIDER: z.enum(["resend", "brevo", "log"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().email().optional(),

  // Web push needs no provider account at all — generate the pair once with
  // `npx web-push generate-vapid-keys`. The only notification channel with
  // no ceiling.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // Staff/owner digests. Free and unlimited.
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // Edge Function / cron shared secret
  CRON_SECRET: z.string().min(16).optional(),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

function format(error: z.ZodError): never {
  const issues = error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
}

/** Safe in the browser bundle: only NEXT_PUBLIC_* values. */
export const clientEnv = (() => {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  });
  if (!parsed.success) format(parsed.error);
  return parsed.data;
})();

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

/**
 * Server-only secrets. Lazy so that merely importing this module in a shared
 * file does not crash a build that has no secrets configured yet.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never be called in the browser.");
  }
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) format(parsed.error);
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
