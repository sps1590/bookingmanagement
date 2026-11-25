"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { callingCodeForTimezone, tryNormalisePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { TIMEZONES } from "./timezones";

/**
 * Onboarding wizard steps (plan §3.3).
 *
 * Each step writes its own slice and advances `businesses.onboarding_step`, so
 * progress lives in the database rather than in component state. A tenant who
 * closes the laptop at "working hours" and comes back tomorrow on their phone
 * resumes at working hours — which matters because this is the one flow every
 * single tenant walks through exactly once, while deciding whether the product
 * is worth their time.
 *
 * Every write goes through the RLS client. The owner is an admin of their own
 * business, so the policies in 0015 already permit exactly these writes, and
 * using the service role here would mean a bug in this file could touch
 * another tenant.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const detailsSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(5).max(30),
  address: z.string().trim().max(500).optional(),
  timezone: z.enum(TIMEZONES),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only.")
    .min(3)
    .max(90),
});

export async function saveDetails(_prev: ActionState, form: FormData): Promise<ActionState> {
  const member = await requireMember();

  const parsed = detailsSchema.safeParse({
    name: form.get("name"),
    phone: form.get("phone"),
    address: form.get("address") || undefined,
    timezone: form.get("timezone"),
    currency: form.get("currency"),
    slug: form.get("slug"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  // Read the number against the zone they just chose, not the one they had.
  const phone = tryNormalisePhone(parsed.data.phone, callingCodeForTimezone(parsed.data.timezone));
  if (!phone.ok) return { fieldErrors: { phone: phone.message } };

  const supabase = await createClient();

  const { error } = await supabase
    .from("businesses")
    .update({
      name: parsed.data.name,
      phone: phone.value,
      address: parsed.data.address ?? null,
      timezone: parsed.data.timezone,
      currency: parsed.data.currency,
      slug: parsed.data.slug,
      onboarding_step: "first_service",
    })
    .eq("id", member.businessId);

  if (error) {
    // The slug is the public booking URL and is unique platform-wide, so this
    // is a collision the tenant can fix rather than an internal fault.
    if (error.code === "23505") {
      return { fieldErrors: { slug: "That address is taken. Try another." } };
    }
    logger.error("onboarding.details_failed", {
      businessId: member.businessId,
      error: error.message,
    });
    return { error: "Could not save those details. Please try again." };
  }

  revalidatePath("/app/onboarding");
  return {};
}

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(150),
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  price: z.coerce.number().min(0).max(99_999_999),
  bufferBefore: z.coerce.number().int().min(0).max(480),
  bufferAfter: z.coerce.number().int().min(0).max(480),
  providerName: z.string().trim().min(2).max(150),
});

export async function saveFirstService(_prev: ActionState, form: FormData): Promise<ActionState> {
  const member = await requireMember();

  const parsed = serviceSchema.safeParse({
    name: form.get("name"),
    durationMinutes: form.get("durationMinutes"),
    price: form.get("price"),
    bufferBefore: form.get("bufferBefore") ?? 0,
    bufferAfter: form.get("bufferAfter") ?? 0,
    providerName: form.get("providerName"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .insert({
      business_id: member.businessId,
      name: parsed.data.name,
      duration_minutes: parsed.data.durationMinutes,
      price: parsed.data.price,
      buffer_before_minutes: parsed.data.bufferBefore,
      buffer_after_minutes: parsed.data.bufferAfter,
    })
    .select("id")
    .single();

  if (serviceError || !service) {
    logger.error("onboarding.service_failed", {
      businessId: member.businessId,
      error: serviceError?.message,
    });
    return { error: "Could not save that service. Please try again." };
  }

  // The owner becomes the first provider, linked to their own login, so
  // `current_staff_id()` resolves for them and the "own schedule only" policy
  // has something to match. Without this the next step has no provider to
  // attach working hours to.
  const { data: existing } = await supabase
    .from("staff_resources")
    .select("id")
    .eq("business_id", member.businessId)
    .limit(1)
    .maybeSingle();

  let staffId = existing?.id;

  if (!staffId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("business_id", member.businessId)
      .eq("is_default", true)
      .maybeSingle();

    const { data: staff, error: staffError } = await supabase
      .from("staff_resources")
      .insert({
        business_id: member.businessId,
        branch_id: branch?.id ?? null,
        user_id: member.userId,
        name: parsed.data.providerName,
      })
      .select("id")
      .single();

    if (staffError || !staff) {
      logger.error("onboarding.staff_failed", {
        businessId: member.businessId,
        error: staffError?.message,
      });
      return { error: "Could not save the provider. Please try again." };
    }
    staffId = staff.id;
  }

  // Defect M-01: the spec's slot generator ignores this mapping, which makes a
  // service bookable with staff who do not perform it. Phase 2 reads it, so it
  // has to be populated from the very first service.
  await supabase.from("staff_services").insert({
    business_id: member.businessId,
    staff_id: staffId,
    service_id: service.id,
  });

  await supabase
    .from("businesses")
    .update({ onboarding_step: "working_hours" })
    .eq("id", member.businessId);

  revalidatePath("/app/onboarding");
  return {};
}

const hoursSchema = z.object({
  days: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one day."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  breakEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

export async function saveWorkingHours(_prev: ActionState, form: FormData): Promise<ActionState> {
  const member = await requireMember();

  const parsed = hoursSchema.safeParse({
    days: form.getAll("days"),
    startTime: form.get("startTime"),
    endTime: form.get("endTime"),
    breakStart: form.get("breakStart") || undefined,
    breakEnd: form.get("breakEnd") || undefined,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { days, startTime, endTime, breakStart, breakEnd } = parsed.data;

  if (endTime <= startTime) {
    return { fieldErrors: { endTime: "Closing time must be after opening time." } };
  }

  const hasBreak = Boolean(breakStart && breakEnd);
  if (hasBreak) {
    if (breakEnd! <= breakStart!) {
      return { fieldErrors: { breakEnd: "The break must end after it starts." } };
    }
    if (breakStart! < startTime || breakEnd! > endTime) {
      return { fieldErrors: { breakStart: "The break has to fall inside working hours." } };
    }
  }

  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff_resources")
    .select("id")
    .eq("business_id", member.businessId)
    .limit(1)
    .maybeSingle();

  if (!staff) {
    return { error: "Add a service and provider first." };
  }

  // Replace rather than append: re-submitting the step should not leave the
  // previous week's rows behind, and two overlapping working blocks are
  // refused by the exclusion constraint anyway.
  await supabase
    .from("availability_rules")
    .delete()
    .eq("business_id", member.businessId)
    .eq("staff_id", staff.id);

  const rows = days.flatMap((day) => [
    {
      business_id: member.businessId,
      staff_id: staff.id,
      day_of_week: day,
      start_time: startTime,
      end_time: endTime,
      is_break: false,
    },
    ...(hasBreak
      ? [
          {
            business_id: member.businessId,
            staff_id: staff.id,
            day_of_week: day,
            start_time: breakStart!,
            end_time: breakEnd!,
            is_break: true,
          },
        ]
      : []),
  ]);

  const { error } = await supabase.from("availability_rules").insert(rows);

  if (error) {
    logger.error("onboarding.hours_failed", {
      businessId: member.businessId,
      error: error.message,
    });
    return { error: "Could not save those hours. Please try again." };
  }

  await supabase
    .from("businesses")
    .update({ onboarding_step: "go_live" })
    .eq("id", member.businessId);

  revalidatePath("/app/onboarding");
  return {};
}

/**
 * The last step, and the only one with an outward-facing effect: until this
 * runs, the tenant is invisible to customers. `public_businesses` filters on
 * `onboarding_completed_at IS NOT NULL` precisely so a half-configured clinic
 * with no services and no hours is never reachable at its public URL — a
 * customer who found an empty calendar there would conclude it was closed.
 */
export async function goLive(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const member = await requireMember();
  const supabase = await createClient();

  const { count: services } = await supabase
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("business_id", member.businessId)
    .eq("is_active", true);

  const { count: hours } = await supabase
    .from("availability_rules")
    .select("id", { count: "exact", head: true })
    .eq("business_id", member.businessId)
    .eq("is_break", false);

  if (!services || !hours) {
    return {
      error: "You need at least one service and some working hours before customers can book.",
    };
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      onboarding_step: "complete",
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", member.businessId);

  if (error) {
    logger.error("onboarding.go_live_failed", {
      businessId: member.businessId,
      error: error.message,
    });
    return { error: "Could not publish your booking page. Please try again." };
  }

  logger.info("onboarding.completed", {
    businessId: member.businessId,
    businessCode: member.businessCode,
  });

  revalidatePath("/app/onboarding");
  revalidatePath(`/book/${member.slug}`);
  redirect("/app?welcome=1");
}

/** Go back a step. Harmless: every step is idempotent and overwrites. */
export async function goToStep(step: string): Promise<void> {
  const member = await requireMember();
  const allowed = ["details", "first_service", "working_hours", "go_live"];
  if (!allowed.includes(step)) return;

  const supabase = await createClient();
  await supabase.from("businesses").update({ onboarding_step: step }).eq("id", member.businessId);

  revalidatePath("/app/onboarding");
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}
