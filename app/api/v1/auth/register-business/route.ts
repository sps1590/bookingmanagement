import { z } from "zod";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { parseBody, route } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { defaultTemplates } from "@/lib/notify/default-templates";
import { callingCodeForTimezone, normalisePhone, PhoneFormatError } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { industrySchema, terminologyConfigFor, terminologyFor } from "@/lib/terminology";

/**
 * The generated `Json` type demands an index signature, which a declared
 * interface does not have even when every field is JSON-safe. Narrowing
 * `Terminology` and `TemplateSeed` to satisfy it would mean giving up the
 * named fields that make them worth having, so the conversion happens here,
 * once, where both shapes are known to be plain data.
 */
const asJson = <T>(value: T): Json => value as unknown as Json;

/**
 * POST /api/v1/auth/register-business — tenant signup (plan §3.3).
 *
 * This route used to hold the service-role key: it created the Auth identity
 * with the admin API and wrote the tenant as a role that bypasses Row-Level
 * Security. It no longer touches that key, and the reason is worth keeping.
 *
 * A service key is one long string in a hosting provider's settings. When it
 * is wrong — truncated on paste, a trailing newline, copied from a different
 * project — Supabase answers "Invalid API key", and the only thing that
 * breaks is the ability to sign up. Every public page keeps working, so the
 * deployment looks healthy while the front door is welded shut. That is a
 * great deal of blast radius for a step that never needed the privilege:
 * signup is somebody creating their own account and their own business.
 *
 * So both halves now run with the publishable key:
 *
 *   1. `auth.signUp` creates the identity. The Auth service hashes the
 *      password exactly as the admin call did, and hands back a session.
 *   2. `register_my_business` (migration 0028) writes the five tables in one
 *      transaction as that session. It reads `auth.uid()` itself, so this
 *      route cannot name an owner, and `anon` has no EXECUTE on it.
 *
 * The compensating delete is gone with the admin client, so a failure between
 * the two steps leaves an account that owns nothing. That state was always
 * reachable — the old delete could fail too — and both the signup page and
 * the retry path below recover from it: sign in with the same credentials and
 * finish the transaction. An orphaned account is recoverable. A tenant nobody
 * owns is not, and that is still inside the transaction.
 */

const bodySchema = z.object({
  businessName: z.string().trim().min(2).max(150),
  industry: industrySchema,
  ownerName: z.string().trim().min(2).max(150).optional(),
  ownerEmail: z.string().trim().toLowerCase().email(),
  // Supabase Auth's own floor is 6; 10 is this product's, because a single
  // leaked owner password exposes an entire clinic's patient list.
  ownerPassword: z.string().min(10).max(200),
  phone: z.string().trim().min(5).max(30),
  timezone: z.string().trim().min(1).max(64).default("Asia/Dhaka"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .default("BDT"),
  /** Optional preferred URL slug; otherwise derived from the business name. */
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.")
    .min(3)
    .max(90)
    .optional(),
});

/** Supabase reports a taken address with a message, not a typed code. */
const TAKEN = /already (been )?registered|already exists|user already/i;

export const POST = route("auth.register-business", async (request) => {
  const body = await parseBody(request, bodySchema);
  const supabase = await createClient();

  // Read the number against the tenant's own dialling plan, so a New York
  // salon typing (212) 555-0002 is not stored as a Bangladeshi number.
  let phone: string;
  try {
    phone = normalisePhone(body.phone, callingCodeForTimezone(body.timezone));
  } catch (error) {
    if (error instanceof PhoneFormatError) {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, error.message, { field: "phone" });
    }
    throw error;
  }

  // 1. The Auth identity.
  const signUp = await supabase.auth.signUp({
    email: body.ownerEmail,
    password: body.ownerPassword,
    options: {
      data: {
        full_name: body.ownerName ?? null,
        // Marks this identity as a tenant owner for later self-service flows.
        signup_source: "register-business",
      },
    },
  });

  let hasSession = Boolean(signUp.data.session);

  if (signUp.error) {
    const message = signUp.error.message;

    if (!TAKEN.test(message)) {
      logger.error("signup.auth_user_failed", { error: message });
      throw new ApiError(ErrorCode.INTERNAL, "Could not create the account. Please try again.");
    }

    // The address is taken. Either this is somebody else's account, or it is
    // this person finishing a signup that failed after the identity existed.
    // The password tells the two apart, and only one of them can sign in.
    const signIn = await supabase.auth.signInWithPassword({
      email: body.ownerEmail,
      password: body.ownerPassword,
    });

    if (signIn.error || !signIn.data.session) {
      throw new ApiError(
        ErrorCode.ALREADY_REGISTERED,
        "An account with that email address already exists. Sign in instead, or use a different address.",
      );
    }

    hasSession = true;
    logger.info("signup.resumed", { reason: "the identity already existed" });
  }

  // Supabase withholds the session until the address is confirmed when
  // "Confirm email" is on for the project. Nothing is wrong with the request,
  // but the transaction below needs an identity to run as, so it must wait
  // for the link.
  if (!hasSession) {
    throw new ApiError(
      ErrorCode.EMAIL_CONFIRMATION_PENDING,
      "Your account was created. Confirm your email address from the message just sent, then sign in to finish setting up the business.",
    );
  }

  // 2. Everything else, in one transaction, as the owner themselves.
  const terminology = terminologyFor(body.industry);

  const { data, error } = await supabase
    .rpc("register_my_business", {
      p_name: body.businessName,
      p_industry: body.industry,
      p_phone: phone,
      p_email: body.ownerEmail,
      p_timezone: body.timezone,
      p_currency: body.currency,
      p_terminology: asJson(terminologyConfigFor(body.industry)),
      p_templates: asJson(defaultTemplates(terminology, body.businessName)),
      p_slug: body.slug,
    })
    .single();

  if (error || !data) {
    if (error?.code === "23505" || /already owns a business/i.test(error?.message ?? "")) {
      throw new ApiError(ErrorCode.ALREADY_REGISTERED, "That account already owns a business.");
    }

    logger.error("signup.register_business_failed", { error: error?.message });
    throw new ApiError(
      ErrorCode.INTERNAL,
      "Your account was created, but the business was not. Sign in and try again — nothing was half-saved.",
    );
  }

  logger.info("signup.completed", {
    businessId: data.business_id,
    businessCode: data.business_code,
    industry: body.industry,
  });

  return created({
    businessId: data.business_id,
    businessCode: data.business_code,
    slug: data.slug,
    publicUrl: `/book/${data.slug}`,
    nextStep: "details",
    terminology,
  });
});
