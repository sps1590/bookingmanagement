"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { requestLeave, type LeaveState } from "./actions";

/** Asking for a day off. Deliberately two fields and a button. */
export function LeaveRequest({
  staffId,
  businessId,
  minDate,
}: {
  staffId: string;
  businessId: string;
  minDate: string;
}) {
  const [state, formAction] = useActionState<LeaveState, FormData>(requestLeave, {});

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="businessId" value={businessId} />

      <label className="block">
        <span className="text-xs text-neutral-500">Day</span>
        <input
          type="date"
          name="date"
          min={minDate}
          required
          className="mt-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
        />
      </label>

      <label className="block grow">
        <span className="text-xs text-neutral-500">Reason (optional)</span>
        <input
          name="reason"
          placeholder="Family wedding"
          className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
        />
      </label>

      <Submit />

      {state.error ? (
        <p role="alert" className="w-full text-xs text-amber-700 dark:text-amber-500">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="w-full text-xs text-green-700 dark:text-green-500">{state.ok}</p>
      ) : null}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
    >
      {pending ? "Sending…" : "Ask for the day off"}
    </button>
  );
}
