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
          className="bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning mb-4 rounded-xl px-4 py-2.5 text-sm ring-1 ring-inset"
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
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors"
            >
              Change the time
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMode("cancel")}
            className="border-border bg-card hover:border-primary/40 hover:text-primary inline-flex min-h-10 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
          >
            Cancel it
          </button>
        </div>
      ) : null}

      {mode === "move" ? (
        <div>
          <label className="block">
            <span className="text-muted-foreground text-xs">New day</span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setChosen(null);
                setDate(e.target.value);
              }}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/25 mt-1 min-h-10 w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
            />
          </label>

          <div aria-live="polite" className="mt-3">
            {slots.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing free that day. Try another.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setChosen(slot.start)}
                    aria-pressed={chosen === slot.start}
                    className={`tabular min-h-11 rounded-xl border px-3.5 text-sm font-medium transition-colors ${
                      chosen === slot.start
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:border-primary/40 hover:text-primary"
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
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {busy ? "Moving…" : "Confirm the new time"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="border-border bg-card hover:border-primary/40 hover:text-primary inline-flex min-h-10 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
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
            <span className="text-muted-foreground text-xs">Reason (optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/25 mt-1 min-h-10 w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
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
              className="border-border bg-card hover:border-primary/40 hover:text-primary inline-flex min-h-10 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
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
