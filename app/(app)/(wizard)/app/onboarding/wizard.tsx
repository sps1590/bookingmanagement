"use client";

import { useActionState } from "react";

import { inputClass } from "@/components/ui/field";
import type { Terminology } from "@/lib/terminology";

import {
  goLive,
  saveDetails,
  saveFirstService,
  saveWorkingHours,
  type ActionState,
} from "./actions";
import { SUPPORTED_TIMEZONES } from "./timezones";

const STEPS = [
  { id: "details", label: "Business details" },
  { id: "first_service", label: "First service" },
  { id: "working_hours", label: "Working hours" },
  { id: "go_live", label: "Go live" },
] as const;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface WizardBusiness {
  name: string;
  slug: string;
  phone: string;
  address: string | null;
  timezone: string;
  currency: string;
  businessCode: string;
  step: string;
  providerDefault: string;
  serviceCount: number;
  workingDayCount: number;
  appUrl: string;
}

export function Wizard({
  business,
  terminology,
}: {
  business: WizardBusiness;
  terminology: Terminology;
}) {
  const index = Math.max(
    0,
    STEPS.findIndex((s) => s.id === business.step),
  );

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
      <ol className="mb-8 flex items-center gap-2 text-xs">
        {STEPS.map((step, i) => (
          <li key={step.id} className="flex flex-1 items-center gap-2">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full font-mono ${
                i < index
                  ? "bg-success text-success-foreground"
                  : i === index
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < index ? "✓" : i + 1}
            </span>
            <span className="hidden sm:inline">{step.label}</span>
            {i < STEPS.length - 1 ? <span className="bg-border h-px flex-1" /> : null}
          </li>
        ))}
      </ol>

      {business.step === "details" ? (
        <DetailsStep business={business} />
      ) : business.step === "first_service" ? (
        <ServiceStep business={business} terminology={terminology} />
      ) : business.step === "working_hours" ? (
        <HoursStep terminology={terminology} />
      ) : (
        <GoLiveStep business={business} terminology={terminology} />
      )}
    </div>
  );
}

function DetailsStep({ business }: { business: WizardBusiness }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveDetails, {});

  return (
    <form
      action={action}
      className="bg-card border-border/70 elevated space-y-6 rounded-2xl border p-5 sm:p-6"
    >
      <Header
        title="Business details"
        blurb={`Your booking page will live at ${business.appUrl}/book/<your address>. Customers see this, so use the name they know you by.`}
      />
      <Problem state={state} />

      <Field label="Business name" name="name" error={state.fieldErrors?.name}>
        <input name="name" defaultValue={business.name} required className={control} />
      </Field>

      <Field
        label="Booking page address"
        name="slug"
        hint="Lowercase letters, numbers and hyphens. Changing it later breaks links you have shared."
        error={state.fieldErrors?.slug}
      >
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground shrink-0 text-xs">/book/</span>
          <input name="slug" defaultValue={business.slug} required className={control} />
        </div>
      </Field>

      <Field label="Phone" name="phone" error={state.fieldErrors?.phone}>
        <input name="phone" defaultValue={business.phone} required className={control} />
      </Field>

      <Field label="Address" name="address" error={state.fieldErrors?.address}>
        <textarea
          name="address"
          rows={2}
          defaultValue={business.address ?? ""}
          className={control}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Timezone"
          name="timezone"
          hint="Every appointment time is shown in this zone."
          error={state.fieldErrors?.timezone}
        >
          <select name="timezone" defaultValue={business.timezone} className={control}>
            {SUPPORTED_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Currency" name="currency" error={state.fieldErrors?.currency}>
          <input
            name="currency"
            defaultValue={business.currency}
            maxLength={3}
            required
            className={control}
          />
        </Field>
      </div>

      <Submit pending={pending}>Save and continue</Submit>
    </form>
  );
}

function ServiceStep({
  business,
  terminology,
}: {
  business: WizardBusiness;
  terminology: Terminology;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveFirstService, {});

  return (
    <form
      action={action}
      className="bg-card border-border/70 elevated space-y-6 rounded-2xl border p-5 sm:p-6"
    >
      <Header
        title={`Your first ${terminology.booking.toLowerCase()}`}
        blurb={`One is enough to get going — you can add the rest afterwards. ${business.serviceCount > 0 ? `You already have ${business.serviceCount}.` : ""}`}
      />
      <Problem state={state} />

      <Field label="Service name" name="name" error={state.fieldErrors?.name}>
        <input name="name" required className={control} placeholder="Consultation" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="How long does it take?"
          name="durationMinutes"
          hint="Minutes"
          error={state.fieldErrors?.durationMinutes}
        >
          <input
            name="durationMinutes"
            type="number"
            min={5}
            max={1440}
            defaultValue={30}
            required
            className={control}
          />
        </Field>

        <Field label={`Price (${business.currency})`} name="price" error={state.fieldErrors?.price}>
          <input
            name="price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={0}
            required
            className={control}
          />
        </Field>
      </div>

      <fieldset className="border-border bg-muted/30 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">Gaps around it</legend>
        <p className="text-muted-foreground mb-3 text-xs">
          Time held before and after, for setup or cleaning. The booking page will never offer a
          slot that eats into these, and the database refuses one even if two people try to book the
          last two slots at the same moment.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Before" name="bufferBefore" hint="Minutes">
            <input
              name="bufferBefore"
              type="number"
              min={0}
              max={480}
              defaultValue={0}
              className={control}
            />
          </Field>
          <Field label="After" name="bufferAfter" hint="Minutes">
            <input
              name="bufferAfter"
              type="number"
              min={0}
              max={480}
              defaultValue={0}
              className={control}
            />
          </Field>
        </div>
      </fieldset>

      <Field
        label={`Who performs it? (${terminology.staff})`}
        name="providerName"
        hint="You, for now. Add colleagues from the dashboard later."
        error={state.fieldErrors?.providerName}
      >
        <input
          name="providerName"
          defaultValue={business.providerDefault}
          required
          className={control}
        />
      </Field>

      <Submit pending={pending}>Save and continue</Submit>
    </form>
  );
}

function HoursStep({ terminology }: { terminology: Terminology }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveWorkingHours, {});

  return (
    <form
      action={action}
      className="bg-card border-border/70 elevated space-y-6 rounded-2xl border p-5 sm:p-6"
    >
      <Header
        title="Working hours"
        blurb={`When are you open? This is what the booking page turns into bookable slots, minus anything already taken and minus each ${terminology.booking.toLowerCase()}'s gaps.`}
      />
      <Problem state={state} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Open on</legend>
        {state.fieldErrors?.days ? (
          <p className="text-destructive mb-2 text-xs">{state.fieldErrors.days}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((day, index) => (
            <label
              key={day}
              className="border-border hover:border-primary/40 has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors"
            >
              <input
                type="checkbox"
                name="days"
                value={index}
                defaultChecked={index >= 0 && index <= 4}
                className="sr-only"
              />
              {day.slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Opens" name="startTime" error={state.fieldErrors?.startTime}>
          <input name="startTime" type="time" defaultValue="10:00" required className={control} />
        </Field>
        <Field label="Closes" name="endTime" error={state.fieldErrors?.endTime}>
          <input name="endTime" type="time" defaultValue="18:00" required className={control} />
        </Field>
      </div>

      <fieldset className="border-border bg-muted/30 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">Daily break (optional)</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label="From" name="breakStart" error={state.fieldErrors?.breakStart}>
            <input name="breakStart" type="time" defaultValue="13:00" className={control} />
          </Field>
          <Field label="To" name="breakEnd" error={state.fieldErrors?.breakEnd}>
            <input name="breakEnd" type="time" defaultValue="14:00" className={control} />
          </Field>
        </div>
      </fieldset>

      <Submit pending={pending}>Save and continue</Submit>
    </form>
  );
}

function GoLiveStep({
  business,
  terminology,
}: {
  business: WizardBusiness;
  terminology: Terminology;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(goLive, {});
  const url = `${business.appUrl}/book/${business.slug}`;

  return (
    <form
      action={action}
      className="bg-card border-border/70 elevated space-y-6 rounded-2xl border p-5 sm:p-6"
    >
      <Header
        title="Ready to go live"
        blurb="Until you publish, your booking page is not reachable — so nobody can book a half-configured diary."
      />
      <Problem state={state} />

      <dl className="divide-border/70 border-border bg-card elevated divide-y overflow-hidden rounded-xl border text-sm">
        <Row term="Business" value={business.name} />
        <Row term="Reference" value={business.businessCode} />
        <Row term={terminology.bookingPlural} value={`${business.serviceCount} service(s)`} />
        <Row term="Open" value={`${business.workingDayCount} day(s) a week`} />
        <Row term="Timezone" value={business.timezone} />
        <Row term="Booking page" value={url} />
      </dl>

      <div className="bg-warning/15 text-warning-foreground dark:text-warning rounded-xl px-3.5 py-3 text-xs leading-relaxed">
        <strong>About reminders.</strong> This platform sends them by email, browser notification
        and calendar invite. It does not send SMS — no SMS gateway in Bangladesh has a free tier,
        and we would rather tell you that than bill you for it. A customer who gives only a phone
        number cannot be reminded automatically, so ask for an email where you can.
      </div>

      <Submit pending={pending}>Publish my booking page</Submit>
    </form>
  );
}

const control = inputClass;

function Header({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{blurb}</p>
    </div>
  );
}

function Problem({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p
      role="alert"
      className="bg-destructive/10 text-destructive ring-destructive/20 rounded-lg px-3 py-2 text-sm ring-1 ring-inset"
    >
      {state.error}
    </p>
  );
}

function Field({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-muted-foreground mt-1.5 text-xs">{hint}</p> : null}
      {error ? <p className="text-destructive mt-1.5 text-xs">{error}</p> : null}
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-50"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-2">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="text-right font-medium break-all">{value}</dd>
    </div>
  );
}
