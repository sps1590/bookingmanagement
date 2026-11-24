/**
 * Structured JSON logging.
 *
 * One line per event so Netlify/Supabase log drains stay queryable. Never log a
 * customer phone, email or a reschedule token in full — this is a platform for
 * medical and personal appointments, and logs are the easiest PII leak to
 * create by accident. Use `redactPhone` / `redactToken` for identifiers you
 * genuinely need in order to correlate a request.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info") as LogLevel;
  return ORDER[configured] ?? ORDER.info;
}

export interface LogContext {
  /** Tenant the event belongs to. Always include it when one is in scope. */
  businessId?: string;
  bookingId?: string;
  requestId?: string;
  route?: string;
  durationMs?: number;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context: LogContext = {}): void {
  if (ORDER[level] < threshold()) return;

  const line = JSON.stringify({
    level,
    message,
    ts: new Date().toISOString(),
    ...context,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext & { error?: unknown }) => {
    const { error, ...rest } = context ?? {};
    emit("error", message, {
      ...rest,
      ...(error instanceof Error
        ? { errorName: error.name, errorMessage: error.message, stack: error.stack }
        : error !== undefined
          ? { error: String(error) }
          : {}),
    });
  },
};

/** `+8801711000000` -> `+88017*****00` */
export function redactPhone(phone: string): string {
  if (phone.length <= 6) return "***";
  return `${phone.slice(0, 6)}${"*".repeat(Math.max(0, phone.length - 8))}${phone.slice(-2)}`;
}

/** Keep only enough of a token to correlate log lines. */
export function redactToken(token: string): string {
  return token.length <= 8 ? "***" : `${token.slice(0, 6)}…`;
}

export function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}
