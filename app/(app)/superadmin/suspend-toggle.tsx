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
        <span role="alert" className="text-xs text-amber-700 dark:text-amber-500">
          {state.error}
        </span>
      ) : null}
      {state.ok ? (
        <span className="text-xs text-green-700 dark:text-green-500">{state.ok}</span>
      ) : null}
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
      className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
    >
      {pending ? "Saving…" : active ? "Suspend" : "Restore"}
    </button>
  );
}
