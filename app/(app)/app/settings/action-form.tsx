"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import type { ActionState } from "./actions";

/**
 * A form bound to a server action, with its own result message.
 *
 * Settings screens are a dozen small forms on one page, and the thing that
 * makes them usable or not is whether you can tell *which* one saved. A single
 * banner at the top of the page cannot: you add a service, the page scrolls,
 * and a green tick appears somewhere above the fold. So each form carries its
 * own state and says what happened where it happened.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  // An "add" form that keeps its values invites the same row twice; an "edit"
  // form that clears them loses the context you were editing, so only the
  // former asks for this.
  //
  // Keyed on the state object rather than on the message: two successful adds
  // both say "Added.", and comparing the text would reset the first one and
  // leave the second full. `useActionState` hands back a new object each time,
  // which is the only thing here that reliably differs.
  useEffect(() => {
    if (resetOnSuccess && state.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-500">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="mt-2 text-xs text-green-700 dark:text-green-500">{state.ok}</p>
      ) : null}
    </form>
  );
}

export function Submit({ label, subtle = false }: { label: string; subtle?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        subtle
          ? "rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
          : "rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      }
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
