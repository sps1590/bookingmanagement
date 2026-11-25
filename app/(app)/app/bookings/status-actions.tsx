"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * The four buttons a receptionist presses all day.
 *
 * Only the transitions the database will actually accept are offered.
 * `booking_status_transition_allowed` (0020) is the authority — completed,
 * cancelled and no-show are terminal — and showing a button that is going to
 * be refused teaches people to ignore errors.
 *
 * No optimistic update. A status change is one round trip on a desk machine,
 * and the honest failure here is a refusal the receptionist needs to read: a
 * row that flips to "Completed" and quietly flips back is how a day's takings
 * end up wrong.
 */

const NEXT: Record<string, { value: string; label: string }[]> = {
  pending: [
    { value: "confirmed", label: "Confirm" },
    { value: "cancelled", label: "Cancel" },
    { value: "no_show", label: "No-show" },
  ],
  confirmed: [
    { value: "checked_in", label: "Check in" },
    { value: "completed", label: "Complete" },
    { value: "no_show", label: "No-show" },
    { value: "cancelled", label: "Cancel" },
  ],
  checked_in: [
    { value: "completed", label: "Complete" },
    { value: "no_show", label: "No-show" },
  ],
};

export function StatusActions({ bookingId, status }: { bookingId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const options = NEXT[status] ?? [];
  if (options.length === 0) {
    return <span className="text-xs text-neutral-400">No further changes</span>;
  }

  async function apply(next: string) {
    setProblem(null);

    const response = await fetch(`/api/v1/admin/bookings/${bookingId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.success) {
      setProblem(body?.error?.message ?? "That change was refused.");
      return;
    }

    // Re-render the server component so the row, the counts at the top and
    // the customer's no-show tally all move together. Patching one of them
    // here would leave the other two stale on screen.
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={pending}
          onClick={() => void apply(option.value)}
          className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
        >
          {option.label}
        </button>
      ))}
      {problem ? (
        <span role="alert" className="text-xs text-amber-700 dark:text-amber-500">
          {problem}
        </span>
      ) : null}
    </div>
  );
}
