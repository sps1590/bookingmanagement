"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { toggleBusiness, type SuspendState } from "./actions";

/**
 * Suspend or restore, with the consequence spelled out on the button.
 *
 * Suspending stops new bookings immediately and leaves the existing diary
 * untouched, which is said here rather than left to be discovered — an
 * operator who thinks they are cancelling tomorrow's appointments will act
 * very differently from one who knows they are not.
 */
export function SuspendToggle({
  businessId,
  name,
  active,
}: {
  businessId: string;
  name: string;
  active: boolean;
}) {
  const [state, formAction] = useActionState<SuspendState, FormData>(toggleBusiness, {});

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="active" value={String(!active)} />
      <input type="hidden" name="note" value={`${active ? "Suspended" : "Restored"}: ${name}`} />
      <Submit active={active} />
      {state.error ? (
        <span role="alert" className="text-destructive text-xs">
          {state.error}
        </span>
      ) : null}
      {state.ok ? <span className="text-success text-xs">{state.ok}</span> : null}
    </form>
  );
}

function Submit({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={
        active
          ? "Stops new bookings at once. Appointments already in the diary are untouched."
          : "Lets this tenant take bookings again."
      }
      className="border-border bg-card hover:border-primary/40 hover:text-primary min-h-8 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50"
    >
      {pending ? "Saving…" : active ? "Suspend" : "Restore"}
    </button>
  );
}
