"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

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
      <label className="block">
        <span className="text-xs text-neutral-500">Notes</span>
        <textarea
          name="notes"
          defaultValue={notes}
          rows={4}
          placeholder="Allergies, preferences, anything the next person should know."
          className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
        />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <Save />
        {state.error ? (
          <span role="alert" className="text-xs text-amber-700 dark:text-amber-500">
            {state.error}
          </span>
        ) : null}
        {state.ok ? (
          <span className="text-xs text-green-700 dark:text-green-500">{state.ok}</span>
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
      className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
    >
      {pending ? "Saving…" : "Save notes"}
    </button>
  );
}
