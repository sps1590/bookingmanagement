"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { describeWriteError } from "@/lib/api/write-error";

export interface NotesState {
  error?: string;
  ok?: string;
}

/**
 * Saving a customer note.
 *
 * Through the RLS client, so the policies decide — members of the business may
 * write, nobody else, and the platform operator has no path here at all
 * (D-012). Nothing about the note is logged: on a medical tenant this field
 * holds the kind of detail that makes a log the easiest leak in the product.
 */
export async function saveCustomerNotes(
  _prev: NotesState,
  formData: FormData,
): Promise<NotesState> {
  const member = await requireMember();

  const parsed = z
    .object({
      customerId: z.uuid(),
      notes: z.string().max(2000),
    })
    .safeParse({
      customerId: formData.get("customerId"),
      notes: String(formData.get("notes") ?? ""),
    });

  if (!parsed.success) {
    return { error: "That note is too long to save." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ notes: parsed.data.notes.trim() || null })
    .eq("id", parsed.data.customerId)
    .eq("business_id", member.businessId);

  if (error) {
    logger.warn("customers.notes.failed", {
      businessId: member.businessId,
      code: error.code,
    });
    return { error: describeWriteError(error) };
  }

  revalidatePath("/app/customers");
  return { ok: "Saved." };
}
