"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Field, Textarea } from "@/components/ui/field";

import { saveCustomerNotes, type NotesState } from "./actions";

/**
 * The notes field.
 *
 * On a dental or medical tenant this is where an allergy ends up, so it is
 * worth being careful about two things. It saves only when asked — no
 * autosave, because a half-typed "penicillin alle" committed on blur reads as
 * fact to whoever opens it next. And it never leaves the tenant: `customers`
 * is members-only under RLS, and the platform operator has no read path to it
 * at all (D-012).
 */
export function CustomerNotes({ customerId, notes }: { customerId: string; notes: string }) {
  const [state, formAction] = useActionState<NotesState, FormData>(saveCustomerNotes, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="customerId" value={customerId} />
      <Field
        label="Notes"
        htmlFor={`notes-${customerId}`}
        hint="Only your team can read this. It never appears on the booking page."
      >
        <Textarea
          id={`notes-${customerId}`}
          name="notes"
          defaultValue={notes}
          rows={4}
          placeholder="Allergies, preferences, anything the next person should know."
        />
      </Field>
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <Save />
        {state.error ? (
          <span role="alert" className="text-destructive text-xs">
            {state.error}
          </span>
        ) : null}
        {state.ok ? (
          <span role="status" className="text-success text-xs">
            {state.ok}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="border-border bg-card hover:border-primary/40 hover:text-primary min-h-8 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save notes"}
    </button>
  );
}
