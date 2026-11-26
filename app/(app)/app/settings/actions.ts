"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { callingCodeForTimezone, tryNormalisePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { describeWriteError } from "@/lib/api/write-error";

/**
 * Settings: services, providers, and the working week.
 *
 * Until this existed a tenant could not add a second service or change their
 * hours after onboarding without someone running SQL, which makes the product
 * a demo rather than something a clinic runs on.
 *
 * Every write goes through the RLS client under the signed-in user's session.
 * The policies in 0015 already say who may do what — admins manage the
 * catalogue, the desk does not — so this file does not re-decide it. Using the
 * service role here would mean one wrong `eq` could edit another tenant's
 * price list, and these are forms that will be edited under time pressure.
 *
 * ## Deactivate rather than delete
 *
 * A service or provider with appointments against it cannot be removed —
 * `bookings` references both `ON DELETE RESTRICT`, deliberately, because
 * deleting them would either destroy a patient's history or leave a booking
 * pointing at nothing. The forms offer "stop offering" instead, which clears
 * it from the public portal and leaves the past intact.
 */

export interface ActionState {
  error?: string;
  ok?: string;
}

const DESK_ONLY = "Only an owner or manager can change this.";

async function requireAdmin() {
  const member = await requireMember();
  if (member.role !== "owner" && member.role !== "manager") {
    return { member: null, error: DESK_ONLY } as const;
  }
  return { member, error: null } as const;
}

// --- Services --------------------------------------------------------------

const serviceSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  bufferBefore: z.coerce.number().int().min(0).max(480),
  bufferAfter: z.coerce.number().int().min(0).max(480),
  price: z.coerce.number().min(0).max(10_000_000),
  depositRequired: z.coerce.number().min(0).max(10_000_000),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#2563EB"),
});

export async function saveService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { member, error } = await requireAdmin();
  if (!member) return { error };

  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const input = parsed.data;

  // The database has the same rule (services_deposit_within_price). Saying it
  // here turns a constraint violation into a sentence a person can act on.
  if (input.depositRequired > input.price) {
    return { error: "A deposit cannot be more than the price." };
  }

  const supabase = await createClient();
  const row = {
    business_id: member.businessId,
    name: input.name,
    description: input.description || null,
    duration_minutes: input.durationMinutes,
    buffer_before_minutes: input.bufferBefore,
    buffer_after_minutes: input.bufferAfter,
    price: input.price,
    deposit_required: input.depositRequired,
    color_hex: input.colorHex,
  };

  const { error: writeError } = input.id
    ? await supabase.from("services").update(row).eq("id", input.id)
    : await supabase.from("services").insert(row);

  if (writeError) {
    logger.warn("settings.service.failed", {
      businessId: member.businessId,
      code: writeError.code,
    });
    return {
      error: describeWriteError(writeError, "That could not be saved. Check the values and try again."),
    };
  }

  revalidatePath("/app/settings/services");
  return { ok: input.id ? "Saved." : "Added." };
}

export async function setServiceActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { member, error } = await requireAdmin();
  if (!member) return { error };

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Unknown service." };
  const active = formData.get("active") === "true";

  const supabase = await createClient();
  const { error: writeError } = await supabase
    .from("services")
    .update({ is_active: active })
    .eq("id", id.data);

  if (writeError) return { error: "That could not be changed." };

  revalidatePath("/app/settings/services");
  return { ok: active ? "Offered again." : "No longer offered online." };
}

// --- Providers -------------------------------------------------------------

const staffSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(150),
  title: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.email().max(254).optional().or(z.literal("")),
});

export async function saveStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { member, error } = await requireAdmin();
  if (!member) return { error };

  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const input = parsed.data;

  let phone: string | null = null;
  if (input.phone) {
    const normalised = tryNormalisePhone(input.phone, callingCodeForTimezone(member.timezone));
    if (!normalised.ok) return { error: normalised.message };
    phone = normalised.value;
  }

  const supabase = await createClient();
  const row = {
    business_id: member.businessId,
    name: input.name,
    title: input.title || null,
    phone,
    email: input.email || null,
  };

  const { error: writeError } = input.id
    ? await supabase.from("staff_resources").update(row).eq("id", input.id)
    : await supabase.from("staff_resources").insert(row);

  if (writeError) {
    logger.warn("settings.staff.failed", { businessId: member.businessId, code: writeError.code });
    return { error: describeWriteError(writeError) };
  }

  revalidatePath("/app/settings/staff");
  return { ok: input.id ? "Saved." : "Added." };
}

/**
 * Which services a provider performs.
 *
 * This mapping is not cosmetic: `get_available_slots` joins through it, so an
 * unticked box means the provider is never offered for that service (defect
 * M-01, where the spec ignored the table and let a hygienist be booked for a
 * root canal).
 */
export async function setStaffServices(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { member, error } = await requireAdmin();
  if (!member) return { error };

  const staffId = z.uuid().safeParse(formData.get("staffId"));
  if (!staffId.success) return { error: "Unknown provider." };

  const wanted = formData
    .getAll("serviceId")
    .map(String)
    .filter((value) => z.uuid().safeParse(value).success);

  const supabase = await createClient();

  // Replace rather than reconcile. The table is a handful of rows per
  // provider, and a delete-then-insert is far easier to be sure of than a
  // diff — this is a mapping whose mistakes are invisible until a customer
  // cannot find an appointment.
  const { error: clearError } = await supabase
    .from("staff_services")
    .delete()
    .eq("staff_id", staffId.data);

  if (clearError) return { error: describeWriteError(clearError) };

  if (wanted.length > 0) {
    const { error: writeError } = await supabase.from("staff_services").insert(
      wanted.map((serviceId) => ({
        business_id: member.businessId,
        staff_id: staffId.data,
        service_id: serviceId,
      })),
    );
    if (writeError) {
      logger.warn("settings.staffServices.failed", {
        businessId: member.businessId,
        code: writeError.code,
      });
      return { error: describeWriteError(writeError) };
    }
  }

  revalidatePath("/app/settings/staff");
  return { ok: "Saved." };
}

// --- The working week ------------------------------------------------------

const hoursSchema = z.object({
  staffId: z.uuid(),
  day: z.coerce.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  isBreak: z.coerce.boolean().default(false),
});

export async function addHours(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { member, error } = await requireAdmin();
  if (!member) return { error };

  const parsed = hoursSchema.safeParse({
    staffId: formData.get("staffId"),
    day: formData.get("day"),
    start: formData.get("start"),
    end: formData.get("end"),
    isBreak: formData.get("isBreak") === "on",
  });
  if (!parsed.success) return { error: "Check the times and try again." };
  const input = parsed.data;

  if (input.end <= input.start) {
    return { error: "The finish time has to be after the start time." };
  }

  const supabase = await createClient();
  const { error: writeError } = await supabase.from("availability_rules").insert({
    business_id: member.businessId,
    staff_id: input.staffId,
    day_of_week: input.day,
    start_time: input.start,
    end_time: input.end,
    is_break: input.isBreak,
  });

  if (writeError) {
    // 23P01 is the exclusion constraint in 0005: two working blocks on one day
    // that overlap would make the slot generator emit the same time twice.
    if (writeError.code === "23P01") {
      return {
        error: input.isBreak
          ? "That break overlaps another break on the same day."
          : "Those hours overlap another block on the same day.",
      };
    }
    return { error: describeWriteError(writeError, "Those hours could not be saved.") };
  }

  revalidatePath("/app/settings/hours");
  return { ok: "Added." };
}

export async function removeHours(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { member, error } = await requireAdmin();
  if (!member) return { error };

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Unknown entry." };

  const supabase = await createClient();
  const { error: writeError } = await supabase
    .from("availability_rules")
    .delete()
    .eq("id", id.data);
  if (writeError) return { error: "That could not be removed." };

  revalidatePath("/app/settings/hours");
  return { ok: "Removed." };
}

/**
 * A closed day: a public holiday, or one provider's leave.
 *
 * `staff_id` empty means the whole business, which beats any per-provider
 * entry for that date — that precedence lives in `working_windows` (0018), not
 * here.
 */
export async function addClosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { member, error } = await requireAdmin();
  if (!member) return { error };

  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(formData.get("date"));
  if (!date.success) return { error: "Pick a date." };

  const rawStaff = String(formData.get("staffId") ?? "");
  const staffId = rawStaff && z.uuid().safeParse(rawStaff).success ? rawStaff : null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const supabase = await createClient();
  const { error: writeError } = await supabase.from("availability_overrides").insert({
    business_id: member.businessId,
    staff_id: staffId,
    override_date: date.data,
    is_closed: true,
    reason,
  });

  if (writeError) {
    if (writeError.code === "23505") return { error: "That date is already marked closed." };
    return { error: describeWriteError(writeError) };
  }

  revalidatePath("/app/settings/hours");
  return { ok: "Marked closed." };
}

export async function removeClosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { member, error } = await requireAdmin();
  if (!member) return { error };

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Unknown entry." };

  const supabase = await createClient();
  const { error: writeError } = await supabase
    .from("availability_overrides")
    .delete()
    .eq("id", id.data);
  if (writeError) return { error: "That could not be removed." };

  revalidatePath("/app/settings/hours");
  return { ok: "Removed." };
}
