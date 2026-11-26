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

type Tone = "primary" | "quiet" | "danger";

const NEXT: Record<string, { value: string; label: string; tone: Tone }[]> = {
  pending: [
    { value: "confirmed", label: "Confirm", tone: "primary" },
    { value: "cancelled", label: "Cancel", tone: "danger" },
    { value: "no_show", label: "No-show", tone: "quiet" },
  ],
  confirmed: [
    { value: "checked_in", label: "Check in", tone: "primary" },
    { value: "completed", label: "Complete", tone: "quiet" },
    { value: "no_show", label: "No-show", tone: "quiet" },
    { value: "cancelled", label: "Cancel", tone: "danger" },
  ],
  checked_in: [
    { value: "completed", label: "Complete", tone: "primary" },
    { value: "no_show", label: "No-show", tone: "quiet" },
  ],
};

/**
 * The likely action reads as the action. Four identical grey buttons make a
 * receptionist read all four every time; one filled button and the rest quiet
 * means the common case is a glance, and Cancel never sits under the thumb
 * that was aiming for Check in.
 */
const TONES: Record<Tone, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
  quiet: "border-border bg-card hover:border-primary/40 hover:text-primary",
  danger: "border-destructive/25 text-destructive bg-destructive/5 hover:bg-destructive/10",
};

export function StatusActions({ bookingId, status }: { bookingId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const options = NEXT[status] ?? [];
  if (options.length === 0) {
    return <span className="text-muted-foreground/70 text-xs">No further changes</span>;
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
          className={`min-h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${TONES[option.tone]}`}
        >
          {option.label}
        </button>
      ))}
      {problem ? (
        <span
          role="alert"
          className="bg-destructive/10 text-destructive w-full rounded-lg px-2 py-1 text-xs sm:w-auto"
        >
          {problem}
        </span>
      ) : null}
    </div>
  );
}
