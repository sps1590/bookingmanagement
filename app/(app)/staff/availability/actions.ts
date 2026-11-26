"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { describeWriteError } from "@/lib/api/write-error";

export interface LeaveState {
  error?: string;
  ok?: string;
}

/**
 * Asking for a day off (defect M-14).
 *
 * Written through the RLS client, and the policy is what makes this safe
 * rather than this function: `status = 'pending'` and `staff_id =
 * current_staff_id(...)` are in the WITH CHECK, so a provider cannot file
 * leave for a colleague and cannot file it pre-approved. Repeating those rules
 * here would be a second copy to drift; they are stated once, in the policy.
 */
export async function requestLeave(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  const member = await requireMember();

  const parsed = z
    .object({
      staffId: z.uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().trim().max(200).optional(),
    })
    .safeParse({
      staffId: formData.get("staffId"),
      date: formData.get("date"),
      reason: String(formData.get("reason") ?? ""),
    });

  if (!parsed.success) return { error: "Pick a date." };

  const supabase = await createClient();
  const { error } = await supabase.from("availability_overrides").insert({
    business_id: member.businessId,
    staff_id: parsed.data.staffId,
    override_date: parsed.data.date,
    is_closed: true,
    reason: parsed.data.reason || null,
    status: "pending",
    requested_by: member.userId,
  });

  if (error) {
    if (error.code === "23505") return { error: "You have already asked for that day." };
    return { error: "That request could not be sent." };
  }

  revalidatePath("/staff/availability");
  return { ok: "Requested. Your calendar stays open until it is approved." };
}

/**
 * Approving or refusing one.
 *
 * Admins only, checked here because there is no policy that can express it:
 * the row already exists and the UPDATE policy on this table is about the
 * tenant, not about who may change a decision field.
 */
export async function decideLeave(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  const member = await requireMember();

  if (member.role !== "owner" && member.role !== "manager") {
    return { error: "Only an owner or manager can decide this." };
  }

  const parsed = z
    .object({ id: z.uuid(), decision: z.enum(["approved", "rejected"]) })
    .safeParse({ id: formData.get("id"), decision: formData.get("decision") });

  if (!parsed.success) return { error: "Unknown request." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("availability_overrides")
    .update({
      status: parsed.data.decision,
      decided_by: member.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("business_id", member.businessId);

  if (error) return { error: describeWriteError(error) };

  revalidatePath("/app/settings/leave");
  revalidatePath("/staff/availability");
  return { ok: parsed.data.decision === "approved" ? "Approved." : "Declined." };
}
