"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface SuspendState {
  error?: string;
  ok?: string;
}

/**
 * Suspending or restoring a tenant.
 *
 * The authority check is inside `set_business_active` rather than here:
 * `is_platform_admin()` is what the database tests, and a second copy in this
 * file would be a second thing to keep true. This action only carries the
 * request and the note.
 */
export async function toggleBusiness(
  _prev: SuspendState,
  formData: FormData,
): Promise<SuspendState> {
  await requireMember();

  const parsed = z
    .object({ businessId: z.uuid(), active: z.enum(["true", "false"]), note: z.string().max(200) })
    .safeParse({
      businessId: formData.get("businessId"),
      active: formData.get("active"),
      note: String(formData.get("note") ?? ""),
    });

  if (!parsed.success) return { error: "Unknown tenant." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_business_active", {
    p_business_id: parsed.data.businessId,
    p_active: parsed.data.active === "true",
    p_note: parsed.data.note || undefined,
  });

  if (error) {
    return {
      error: error.code === "BK001" ? "Only a platform operator can do that." : "That failed.",
    };
  }

  revalidatePath("/superadmin");
  return { ok: parsed.data.active === "true" ? "Restored." : "Suspended." };
}
