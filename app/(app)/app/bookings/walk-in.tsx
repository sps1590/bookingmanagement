"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { Field, Input, Select } from "@/components/ui/field";

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
 *
 * It opens as a dialog over the page rather than unfolding inline. Inline, it
 * grew out of the row of toolbar buttons it was rendered beside and squeezed
 * itself into whatever width was left; as an overlay it gets the room a form
 * with a slot grid in it needs, and the list underneath stays where it was
 * for when you close it again.
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

  // Escape closes it, as it does every other dialog the person has ever used.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      >
        <Plus className="size-4" aria-hidden />
        Walk-in
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />

      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Take a walk-in booking"
        className="bg-card elevated relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl p-5 text-left sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Walk-in</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Someone at the counter. Lead time does not apply here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Field label="Service" htmlFor="walkin-service">
            <Select
              id="walkin-service"
              value={serviceId}
              onChange={(e) => onServiceChange(e.target.value)}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Who" htmlFor="walkin-staff">
            <Select
              id="walkin-staff"
              value={staffId}
              onChange={(e) => choose(setStaffId)(e.target.value)}
            >
              {eligible.length === 0 ? <option value="">Nobody performs this</option> : null}
              {eligible.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Day" htmlFor="walkin-date">
            <Input
              id="walkin-date"
              type="date"
              value={date}
              onChange={(e) => choose(setDate)(e.target.value)}
            />
          </Field>
        </div>

        <div aria-live="polite" className="mt-4">
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Free times
          </p>
          {slots.length === 0 ? (
            <p className="border-border bg-muted/30 text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-sm">
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
                  className={`tabular min-h-10 rounded-lg border px-3 text-sm font-medium transition-colors ${
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

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="walkin-name" required>
            <Input
              id="walkin-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Mobile" htmlFor="walkin-phone" required>
            <Input
              id="walkin-phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="01711 000000"
              autoComplete="off"
            />
          </Field>
        </div>

        {problem ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive mt-3 rounded-lg px-3 py-2 text-sm"
          >
            {problem}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!chosen || busy}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {busy ? "Booking…" : chosen ? `Book ${time.format(new Date(chosen))}` : "Pick a time"}
        </button>
      </form>
    </div>
  );
}
