"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { PublicService, PublicStaff } from "@/lib/public/tenant";
import type { Terminology } from "@/lib/terminology";

/**
 * The booking flow: provider, date, time, details.
 *
 * ## Why one route rather than four
 *
 * The plan's route table lists `/book/[slug]/[serviceId]`, `/slots` and
 * `/confirm` as separate pages. This keeps them as steps on one route, with
 * the choices in the query string so a URL is still shareable and the back
 * button still works. The reason is the plan's own constraint two bullets
 * later: most bookings arrive from phones on Bangladeshi mobile data, and four
 * server round trips to choose one appointment is the difference between
 * finishing and giving up. Recorded as D-019.
 *
 * ## The failure this is built around
 *
 * `SLOT_TAKEN`. Between the grid rendering and the customer tapping Confirm,
 * someone else can take the slot — that is not an edge case, it is the busy
 * hour. The database refuses it (the exclusion constraint in 0007), and what
 * matters here is that the person is told plainly, the grid refreshes
 * underneath them, and they are one tap from another time. A dead end or a
 * stack trace at that moment loses the booking.
 */

interface Props {
  slug: string;
  services: PublicService[];
  staff: PublicStaff[];
  terminology: Terminology;
  timezone: string;
  currency: string;
}

interface Slot {
  start: string;
  end: string;
  staffId: string;
}

type Phase = "idle" | "loading" | "submitting";

const ANY = "any";

/** Local YYYY-MM-DD for a date, in the tenant's zone rather than the device's. */
function isoDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function partOfDay(start: string, timeZone: string): "Morning" | "Afternoon" | "Evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(
      new Date(start),
    ),
  );
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export function BookingFlow({ slug, services, staff, terminology, timezone, currency }: Props) {
  const router = useRouter();

  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [staffId, setStaffId] = useState<string>(ANY);
  const [date, setDate] = useState<string>(() => isoDate(new Date(), timezone));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [monthOpen, setMonthOpen] = useState<Record<string, boolean>>({});

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);

  // Only the providers who perform the chosen service should be offerable.
  // The database refuses the rest (defect M-01), but offering them and then
  // refusing is a worse way to find out.
  const offerableStaff = staff;

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: currency || "BDT",
        maximumFractionDigits: 0,
      }),
    [currency],
  );

  const timeOf = useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso)),
    [timezone],
  );

  // A request id, so a slow response for a date the customer has already
  // navigated away from cannot overwrite the grid they are looking at.
  const requestRef = useRef(0);

  const loadSlots = useCallback(async () => {
    if (!serviceId || !date) return;
    const ticket = ++requestRef.current;

    setPhase("loading");
    setProblem(null);

    try {
      const params = new URLSearchParams({ serviceId, date });
      if (staffId !== ANY) params.set("staffId", staffId);

      const response = await fetch(`/api/v1/public/${slug}/slots?${params}`, {
        cache: "no-store",
      });
      const body = await response.json();

      if (ticket !== requestRef.current) return;

      if (!response.ok || !body.success) {
        setSlots([]);
        setProblem(body?.error?.message ?? "Could not load times. Please try again.");
        return;
      }
      setSlots(body.data.slots as Slot[]);
    } catch {
      if (ticket === requestRef.current) {
        setProblem("Could not reach the server. Check your connection and try again.");
      }
    } finally {
      if (ticket === requestRef.current) setPhase("idle");
    }
  }, [slug, serviceId, date, staffId]);

  useEffect(() => {
    // react-hooks/set-state-in-effect cannot see through the async function:
    // it flags the `setPhase("loading")` inside `loadSlots` as a synchronous
    // setState in an effect. Fetching when the service, provider or date
    // changes is what effects are for — synchronising with an external system
    // — and the alternative the rule wants, deriving slots during render, is
    // not available for data that lives on a server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSlots();
  }, [loadSlots]);

  // Clearing the chosen slot belongs with the change that invalidated it, not
  // in an effect: 10:00 with Dr Rahman on Tuesday is not the same appointment
  // as 10:00 with anyone on Wednesday, and carrying the selection across would
  // submit a time the customer never picked.
  function choose<T>(set: (value: T) => void) {
    return (value: T) => {
      setChosen(null);
      set(value);
    };
  }

  // Which days of the shown month can be booked at all (defect M-13), so the
  // date input does not invite a tap on a holiday.
  useEffect(() => {
    if (!serviceId || !date) return;
    const [year, month] = date.split("-").map(Number);
    const params = new URLSearchParams({ serviceId, year: String(year), month: String(month) });
    if (staffId !== ANY) params.set("staffId", staffId);

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/v1/public/${slug}/month?${params}`, {
          cache: "no-store",
        });
        const body = await response.json();
        if (cancelled || !response.ok || !body.success) return;
        const map: Record<string, boolean> = {};
        for (const d of body.data.days as { date: string; available: boolean }[]) {
          map[d.date] = d.available;
        }
        setMonthOpen(map);
      } catch {
        // A calendar without the closed days greyed out still works; it just
        // costs a tap to find out. Not worth an error banner.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, staffId, date]);

  // Availability goes stale while a tab sits open. Refreshing on focus is
  // cheaper than letting someone return after lunch to a grid of slots that
  // are all gone.
  useEffect(() => {
    const onFocus = () => void loadSlots();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadSlots]);

  const grouped = useMemo(() => {
    const out: Record<string, Slot[]> = { Morning: [], Afternoon: [], Evening: [] };
    for (const slot of slots) out[partOfDay(slot.start, timezone)].push(slot);
    return out;
  }, [slots, timezone]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!chosen || !service) return;

    setPhase("submitting");
    setProblem(null);

    try {
      const response = await fetch(`/api/v1/public/${slug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          staffId: staffId === ANY ? null : staffId,
          startTime: chosen.start,
          customerName: name,
          customerPhone: phone,
          customerEmail: email || undefined,
          notes: notes || undefined,
        }),
      });
      const body = await response.json();

      if (!response.ok || !body.success) {
        const code = body?.error?.code;

        // The race this whole design exists to survive. Say so plainly, put
        // the fresh grid back, and leave them one tap from another time.
        if (code === "SLOT_TAKEN" || code === "SLOT_UNAVAILABLE") {
          setChosen(null);
          await loadSlots();
          setProblem("That time was just taken. Here are the times still free.");
          return;
        }

        setProblem(body?.error?.message ?? "That booking could not be made.");
        return;
      }

      const { code, manageToken } = body.data;
      router.push(`/book/${slug}/success/${code}?t=${encodeURIComponent(manageToken)}`);
    } catch {
      setProblem("Could not reach the server. Your booking was not made — please try again.");
    } finally {
      setPhase("submitting" === phase ? "idle" : "idle");
    }
  }

  if (services.length === 0) return null;

  const dayIsClosed = monthOpen[date] === false;

  return (
    <form onSubmit={submit} className="mt-8 space-y-8">
      <fieldset>
        <legend className="text-sm font-medium tracking-wide uppercase">
          1. Choose a {terminology.booking.toLowerCase()}
        </legend>
        <div className="mt-3 grid gap-2">
          {services.map((s) => (
            <label
              key={s.id}
              className={`flex cursor-pointer items-baseline justify-between gap-4 rounded-md border px-4 py-3 ${
                s.id === serviceId
                  ? "border-neutral-900 dark:border-neutral-100"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <span>
                <input
                  type="radio"
                  name="service"
                  value={s.id}
                  checked={s.id === serviceId}
                  onChange={() => choose(setServiceId)(s.id)}
                  className="sr-only"
                />
                <span className="text-sm font-medium">{s.name}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {s.duration_minutes} minutes
                  {s.deposit_required > 0 ? ` · ${money.format(s.deposit_required)} deposit` : null}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium">
                {s.price > 0 ? money.format(s.price) : "—"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium tracking-wide uppercase">
          2. {terminology.staff} and day
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-neutral-500">{terminology.staff}</span>
            <select
              value={staffId}
              onChange={(e) => choose(setStaffId)(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            >
              {/* Defect B-14: the spec offered this and had nothing behind it. */}
              <option value={ANY}>Any available</option>
              {offerableStaff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.title ? ` — ${person.title}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-neutral-500">Date</span>
            <input
              type="date"
              value={date}
              min={isoDate(new Date(), timezone)}
              onChange={(e) => choose(setDate)(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            />
            {dayIsClosed ? (
              <span className="mt-1 block text-xs text-amber-700 dark:text-amber-500">
                Closed or fully booked that day.
              </span>
            ) : null}
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium tracking-wide uppercase">3. Pick a time</legend>

        <div aria-live="polite" className="mt-3">
          {phase === "loading" ? (
            <p className="text-sm text-neutral-500">Checking what is free…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nothing free on that day. Try another date
              {staffId !== ANY ? `, or choose "Any available"` : ""}.
            </p>
          ) : (
            <div className="space-y-4">
              {(["Morning", "Afternoon", "Evening"] as const).map((part) =>
                grouped[part].length === 0 ? null : (
                  <div key={part}>
                    <p className="text-xs text-neutral-500">{part}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {grouped[part].map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => setChosen(slot)}
                          aria-pressed={chosen?.start === slot.start}
                          className={`rounded-md border px-3 py-2 text-sm ${
                            chosen?.start === slot.start
                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                              : "border-neutral-200 dark:border-neutral-800"
                          }`}
                        >
                          {timeOf(slot.start)}
                        </button>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </fieldset>

      <fieldset disabled={!chosen} className={chosen ? "" : "opacity-50"}>
        <legend className="text-sm font-medium tracking-wide uppercase">4. Your details</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs text-neutral-500">Full name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">Mobile number</span>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="01711 000000"
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">Email (for your confirmation)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-neutral-500">Anything we should know? (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            />
          </label>
        </div>
      </fieldset>

      {problem ? (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {problem}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!chosen || phase === "submitting"}
        className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {phase === "submitting"
          ? "Confirming…"
          : chosen
            ? `Confirm ${timeOf(chosen.start)} on ${date}`
            : "Pick a time first"}
      </button>

      <p className="text-center text-xs text-neutral-400">All times are {timezone}.</p>
    </form>
  );
}
