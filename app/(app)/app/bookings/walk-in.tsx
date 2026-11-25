"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Taking a booking at the desk.
 *
 * The times come from `/api/v1/admin/slots`, not the public endpoint, because
 * the public one applies the minimum lead time — so every slot a person
 * standing at the counter could actually take has already been filtered out of
 * it. What the desk gets instead lifts the lead time and the advance window
 * and keeps everything that describes real availability: hours, breaks,
 * holidays, leave, the service mapping, and the exclusion constraint.
 *
 * The provider is chosen explicitly rather than offering "any available". At
 * the counter somebody is standing in front of you and the answer is a
 * person, not a lottery.
 */

interface Option {
  id: string;
  name: string;
}

export function WalkIn({
  services,
  staff,
  staffServices,
  today,
  timezone,
}: {
  services: Option[];
  staff: Option[];
  /** `staffId:serviceId` pairs — who performs what (defect M-01). */
  staffServices: string[];
  today: string;
  timezone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  // Seeded rather than filled in by an effect: the first provider who performs
  // the first service is knowable at mount, and deriving it afterwards means a
  // render with an empty select that briefly says nobody can do this.
  const [staffId, setStaffId] = useState(
    () =>
      staff.find((person) => staffServices.includes(`${person.id}:${services[0]?.id}`))?.id ?? "",
  );
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const mapped = new Set(staffServices);
  // Only providers who perform the chosen service. The database refuses the
  // rest; offering them and then refusing is a worse way to find out.
  const eligible = staff.filter((person) => mapped.has(`${person.id}:${serviceId}`));

  const load = useCallback(async () => {
    if (!serviceId || !staffId || !date) {
      setSlots([]);
      return;
    }
    setProblem(null);

    const params = new URLSearchParams({ serviceId, staffId, date });
    const response = await fetch(`/api/v1/admin/slots?${params}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.success) {
      setSlots([]);
      setProblem(body?.error?.message ?? "Could not load times.");
      return;
    }
    setSlots(body.data.slots);
  }, [serviceId, staffId, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Changing the service can strip the chosen provider of their eligibility,
  // and that belongs with the change rather than in an effect reacting to it:
  // an effect would render once with a provider who cannot perform the newly
  // chosen service, which is exactly the state the database refuses.
  function onServiceChange(next: string) {
    setChosen(null);
    setServiceId(next);
    if (!staffServices.includes(`${staffId}:${next}`)) {
      setStaffId(staff.find((person) => staffServices.includes(`${person.id}:${next}`))?.id ?? "");
    }
  }

  function choose<T>(set: (value: T) => void) {
    return (value: T) => {
      setChosen(null);
      set(value);
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!chosen) return;

    setBusy(true);
    setProblem(null);

    try {
      const response = await fetch("/api/v1/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          staffId,
          startTime: chosen,
          customerName: name,
          customerPhone: phone,
          source: "walk_in",
        }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.success) {
        setProblem(body?.error?.message ?? "That booking could not be made.");
        // Someone else may have taken it between loading and confirming —
        // the same race the public portal survives, with the same answer.
        await load();
        setChosen(null);
        return;
      }

      setOpen(false);
      setName("");
      setPhone("");
      setChosen(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Walk-in
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium tracking-wide uppercase">Walk-in</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs underline underline-offset-4"
        >
          Close
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs text-neutral-500">Service</span>
          <select
            value={serviceId}
            onChange={(e) => onServiceChange(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-neutral-500">Who</span>
          <select
            value={staffId}
            onChange={(e) => choose(setStaffId)(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          >
            {eligible.length === 0 ? <option value="">Nobody performs this</option> : null}
            {eligible.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-neutral-500">Day</span>
          <input
            type="date"
            value={date}
            onChange={(e) => choose(setDate)(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          />
        </label>
      </div>

      <div aria-live="polite" className="mt-3">
        {slots.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nothing free. Check their hours under Settings, or try another day.
          </p>
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

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-neutral-500">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">Mobile</span>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="01711 000000"
            className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          />
        </label>
      </div>

      {problem ? (
        <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-500">
          {problem}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!chosen || busy}
        className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {busy ? "Booking…" : chosen ? `Book ${time.format(new Date(chosen))}` : "Pick a time"}
      </button>
    </form>
  );
}
