import "server-only";

import { logger } from "@/lib/logger";
import { serverEnv } from "@/lib/env";

/**
 * One interface, several implementations, all free.
 *
 * §1.5 removed SMS and WhatsApp from the product because neither has a free
 * tier for business-initiated messages in this market — that is the single
 * decision that shapes this file. What remains:
 *
 *   - **email** — Resend (3,000/month free) or Brevo (300/day free). The
 *     primary customer channel, and the one that carries the calendar invite.
 *   - **push** — VAPID web push. No account, no service, no ceiling, and the
 *     only channel that costs nothing at any volume.
 *   - **telegram** — Bot API, free and unlimited. Right for staff digests,
 *     wrong for customers, who will not link a bot to book a haircut.
 *   - **log** — writes to the console. The default, so a developer running
 *     this locally never emails a real patient by accident.
 *
 * The seam is kept deliberately wide. A tenant who funds their own SMS gateway
 * later is one more implementation of `Channel` and a config flag, not a
 * refactor of everything that queues a message.
 */

export interface Outgoing {
  to: string;
  subject?: string | null;
  body: string;
  /** Attached to email only; ignored elsewhere. */
  icsAttachment?: { filename: string; content: string } | null;
}

export interface SendResult {
  ok: boolean;
  provider: string;
  providerId?: string;
  error?: string;
}

export interface Channel {
  send(message: Outgoing): Promise<SendResult>;
}

/** The default. Never sends; always succeeds. */
const logChannel: Channel = {
  async send(message) {
    logger.info("notify.log", {
      // The recipient is deliberately not logged in full: this runs on a
      // platform for medical appointments and the log is the easiest leak.
      to: redactRecipient(message.to),
      subject: message.subject ?? null,
      bytes: message.body.length,
      ics: Boolean(message.icsAttachment),
    });
    return { ok: true, provider: "log", providerId: "logged" };
  },
};

function redactRecipient(value: string): string {
  const at = value.indexOf("@");
  if (at > 1) return `${value.slice(0, 2)}***${value.slice(at)}`;
  return `${value.slice(0, 3)}***`;
}

/**
 * Resend.
 *
 * Attachments go as base64 in the JSON body, which is why the invite is built
 * as a string rather than streamed — it is a few hundred bytes and the
 * simplicity is worth more than the allocation.
 */
function resendChannel(apiKey: string, from: string): Channel {
  return {
    async send(message) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject ?? "Your appointment",
            text: message.body,
            ...(message.icsAttachment
              ? {
                  attachments: [
                    {
                      filename: message.icsAttachment.filename,
                      content: Buffer.from(message.icsAttachment.content, "utf8").toString(
                        "base64",
                      ),
                    },
                  ],
                }
              : {}),
          }),
        });

        const payload = (await response.json().catch(() => null)) as { id?: string } | null;

        if (!response.ok) {
          return {
            ok: false,
            provider: "resend",
            error: `HTTP ${response.status}`,
          };
        }
        return { ok: true, provider: "resend", providerId: payload?.id };
      } catch (error) {
        return {
          ok: false,
          provider: "resend",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/** Brevo, as the second free option. 300 a day rather than 3,000 a month. */
function brevoChannel(apiKey: string, from: string): Channel {
  return {
    async send(message) {
      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { email: from },
            to: [{ email: message.to }],
            subject: message.subject ?? "Your appointment",
            textContent: message.body,
            ...(message.icsAttachment
              ? {
                  attachment: [
                    {
                      name: message.icsAttachment.filename,
                      content: Buffer.from(message.icsAttachment.content, "utf8").toString(
                        "base64",
                      ),
                    },
                  ],
                }
              : {}),
          }),
        });

        const payload = (await response.json().catch(() => null)) as { messageId?: string } | null;

        if (!response.ok) {
          return { ok: false, provider: "brevo", error: `HTTP ${response.status}` };
        }
        return { ok: true, provider: "brevo", providerId: payload?.messageId };
      } catch (error) {
        return {
          ok: false,
          provider: "brevo",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/** Telegram, for staff digests. The chat id is the "recipient". */
function telegramChannel(token: string): Channel {
  return {
    async send(message) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: message.to,
            text: message.subject ? `*${message.subject}*\n\n${message.body}` : message.body,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
        });

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          result?: { message_id?: number };
          description?: string;
        } | null;

        if (!response.ok || payload?.ok === false) {
          return {
            ok: false,
            provider: "telegram",
            error: payload?.description ?? `HTTP ${response.status}`,
          };
        }
        return {
          ok: true,
          provider: "telegram",
          providerId: payload?.result?.message_id?.toString(),
        };
      } catch (error) {
        return {
          ok: false,
          provider: "telegram",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Which channel handles a given message.
 *
 * Falls back to the log channel rather than throwing. A misconfigured provider
 * should leave a trail and let the booking stand; failing the send would retry
 * four times and then mark a message failed for a reason nobody can act on
 * from the delivery log.
 */
export function channelFor(kind: string): Channel {
  const env = serverEnv();

  if (kind === "telegram") {
    return env.TELEGRAM_BOT_TOKEN ? telegramChannel(env.TELEGRAM_BOT_TOKEN) : logChannel;
  }

  if (kind !== "email") return logChannel;

  const from = env.MAIL_FROM;
  if (!from) return logChannel;

  if (env.NOTIFY_EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
    return resendChannel(env.RESEND_API_KEY, from);
  }
  if (env.NOTIFY_EMAIL_PROVIDER === "brevo" && env.BREVO_API_KEY) {
    return brevoChannel(env.BREVO_API_KEY, from);
  }
  return logChannel;
}

/** True when email is really being sent, so the shared allowance applies. */
export function emailIsLive(): boolean {
  const env = serverEnv();
  if (!env.MAIL_FROM) return false;
  return (
    (env.NOTIFY_EMAIL_PROVIDER === "resend" && Boolean(env.RESEND_API_KEY)) ||
    (env.NOTIFY_EMAIL_PROVIDER === "brevo" && Boolean(env.BREVO_API_KEY))
  );
}
