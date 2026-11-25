"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Reschedule and cancel, from a link.
 *
 * The slot grid is the same question the booking portal asks, through the
 * same public endpoint — a customer moving an appointment must not be offered
 * times a new customer would not be, and maintaining two ideas of
 * availability is how that happens.
 *
 * Cancellation is behind a confirm step with an optional reason. Not a modal:
 * on a phone a modal over a page someone reached from an email is one
 * mis-tap from a cancelled appointment, and the undo for that is a phone call
 * during opening hours.
 *
 * After a successful change the token in the URL is dead — the database
 * rotated it (M-11) — so this navigates to the new one rather than leaving
 * the page holding a link that no longer works.
 */
export function ManageBooking({
  token,
  businessSlug,
  serviceId,
  staffId,
  timezone,
  canReschedule,
  startTime,
}: {
  token: string;
  businessSlug: string;
  serviceId: string;
  staffId: string;
  timezone: string;
  canReschedule: boolean;
  startTime: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "move" | "cancel">("idle");
  const [date, setDate] = useState(() => isoDate(new Date(startTime), timezone));
  const [slots, setSlots] = useState<{ start: string }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (mode !== "move") return;
    setProblem(null);

    const params = new URLSearchParams({ serviceId, date, staffId });
    const response = await fetch(`/api/v1/public/${businessSlug}/slots?${params}`, {
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.success) {
      setSlots([]);
      setProblem(body?.error?.message ?? "Could not load times.");
      return;
    }
    setSlots(body.data.slots);
  }, [mode, businessSlug, serviceId, staffId, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });

  async function move() {
    if (!chosen) return;
    setBusy(true);
    setProblem(null);

    try {
      const response = await fetch(`/api/v1/public/manage/${token}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: chosen }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.success) {
        setProblem(body?.error?.message ?? "That change was refused.");
        // Somebody may have taken the slot while this page sat open.
        await load();
        setChosen(null);
        return;
      }

      // The old token is dead the moment the change lands.
      router.replace(`/manage/${body.data.manageToken}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setProblem(null);

    try {
      const response = await fetch(`/api/v1/public/manage/${token}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.success) {
        setProblem(body?.error?.message ?? "That could not be cancelled.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      {problem ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {problem}
        </p>
      ) : null}

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {canReschedule ? (
            <button
              type="button"
              onClick={() => setMode("move")}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Change the time
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMode("cancel")}
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800"
          >
            Cancel it
          </button>
        </div>
      ) : null}

      {mode === "move" ? (
        <div>
          <label className="block">
            <span className="text-xs text-neutral-500">New day</span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setChosen(null);
                setDate(e.target.value);
              }}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            />
          </label>

          <div aria-live="polite" className="mt-3">
            {slots.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing free that day. Try another.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setChosen(slot.start)}
                    aria-pressed={chosen === slot.start}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      chosen === slot.start
                        ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                        : "border-neutral-200 dark:border-neutral-800"
                    }`}
                  >
                    {time.format(new Date(slot.start))}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={!chosen || busy}
              onClick={() => void move()}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {busy ? "Moving…" : "Confirm the new time"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="rounded-md border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800"
            >
              Keep it as it is
            </button>
          </div>
        </div>
      ) : null}

      {mode === "cancel" ? (
        <div>
          <p className="text-sm">
            Cancel this appointment? The time is given back to someone else straight away.
          </p>
          <label className="mt-3 block">
            <span className="text-xs text-neutral-500">Reason (optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            />
          </label>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void cancel()}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="rounded-md border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800"
            >
              No, keep it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isoDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
