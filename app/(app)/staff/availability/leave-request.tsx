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
        <span className="text-muted-foreground text-xs">Day</span>
        <input
          type="date"
          name="date"
          min={minDate}
          required
          className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/25 mt-1 min-h-10 rounded-lg border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
        />
      </label>

      <label className="block grow">
        <span className="text-muted-foreground text-xs">Reason (optional)</span>
        <input
          name="reason"
          placeholder="Family wedding"
          className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/25 mt-1 min-h-10 w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
        />
      </label>

      <Submit />

      {state.error ? (
        <p role="alert" className="text-destructive w-full text-xs">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-success w-full text-xs">{state.ok}</p> : null}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50"
    >
      {pending ? "Sending…" : "Ask for the day off"}
    </button>
  );
}
