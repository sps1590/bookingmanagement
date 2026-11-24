import { z } from "zod";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { parseBody, route } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { defaultTemplates } from "@/lib/notify/default-templates";
import { callingCodeForTimezone, normalisePhone, PhoneFormatError } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * One of the four sanctioned callers of the service-role client: at this point
 * there is no session and no membership row, so there is no RLS identity to
 * act as. Everything it writes goes through `register_business`, which does
 * the five inserts in one transaction (see migration 0017) — a half-created
 * tenant occupies its slug, has no owner, and cannot be retried by the person
 * who just signed up.
 *
 * The one thing that cannot be inside that transaction is the Auth identity:
 * only the Auth service can hash a password. So it is created first, and
 * deleted again if the transaction fails. That compensating delete is the
 * weakest point in the flow and is logged loudly when it does not work,
 * because the residue is an account that can sign in and owns nothing.
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

export const POST = route("auth.register-business", async (request) => {
  const body = await parseBody(request, bodySchema);
  const admin = createAdminClient();

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
  const createdUser = await admin.auth.admin.createUser({
    email: body.ownerEmail,
    password: body.ownerPassword,
    email_confirm: true,
    user_metadata: {
      full_name: body.ownerName ?? null,
      // Marks this identity as a tenant owner for later self-service flows.
      signup_source: "register-business",
    },
  });

  if (createdUser.error || !createdUser.data.user) {
    const message = createdUser.error?.message ?? "Could not create the account.";

    // Supabase reports an existing address with a 422 and a message rather
    // than a typed code. Tell the person their email is taken instead of
    // showing them an internal error — but say nothing about whether that
    // account owns a business, which would confirm an address to a stranger.
    if (/already (been )?registered|already exists/i.test(message)) {
      throw new ApiError(
        ErrorCode.ALREADY_REGISTERED,
        "An account with that email address already exists. Sign in instead, or use a different address.",
      );
    }

    logger.error("signup.auth_user_failed", { error: message });
    throw new ApiError(ErrorCode.INTERNAL, "Could not create the account. Please try again.");
  }

  const userId = createdUser.data.user.id;

  // 2. Everything else, in one transaction.
  const terminology = terminologyFor(body.industry);

  const { data, error } = await admin
    .rpc("register_business", {
      p_owner_user_id: userId,
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
    // Compensate: without this, the address is taken by an account that owns
    // nothing, and the person cannot sign up again with it.
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) {
      logger.error("signup.orphaned_auth_user", {
        userId,
        rpcError: error?.message,
        cleanupError: cleanup.error.message,
      });
    }

    if (error?.code === "23505" || /already owns a business/i.test(error?.message ?? "")) {
      throw new ApiError(ErrorCode.ALREADY_REGISTERED, "That account already owns a business.");
    }

    logger.error("signup.register_business_failed", { error: error?.message });
    throw new ApiError(
      ErrorCode.INTERNAL,
      "Could not finish setting up the business. Nothing was saved — please try again.",
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
