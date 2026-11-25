"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { tryNormalisePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";
import { INDUSTRIES, INDUSTRY_LABELS, terminologyFor, type Industry } from "@/lib/terminology";

/**
 * Tenant signup — the first step of the onboarding wizard (plan §3.3).
 *
 * The industry choice is here rather than inside the wizard because it decides
 * the vocabulary of every screen that follows, and the seeded notification
 * templates are written with those nouns already substituted. Asking for it
 * after the account exists would mean either re-writing those templates or
 * showing a dentist the word "Customer" until they get round to changing it.
 *
 * Choosing it live previews the labels, so the person can see that "Patient"
 * is what their staff will read before they commit.
 */
export function SignupForm({ resume }: { resume: boolean }) {
  const router = useRouter();
  const [industry, setIndustry] = useState<Industry>("dentist");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const labels = terminologyFor(industry);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const phoneRaw = String(form.get("phone") ?? "");
    const email = String(form.get("ownerEmail") ?? "");
    const password = String(form.get("ownerPassword") ?? "");
    const timezone = String(form.get("timezone") ?? "Asia/Dhaka");

    // Normalise before sending so the person sees the problem next to the
    // field, rather than as a server error after a round trip.
    const phone = tryNormalisePhone(phoneRaw);
    if (!phone.ok) {
      setFieldErrors({ phone: phone.message });
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/v1/auth/register-business", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessName: form.get("businessName"),
          industry,
          ownerName: form.get("ownerName") || undefined,
          ownerEmail: email,
          ownerPassword: password,
          phone: phone.value,
          timezone,
        }),
      });

      const payload = (await response.json()) as
        | { success: true; data: { slug: string; businessCode: string } }
        | { success: false; error: { code: string; message: string } };

      if (!payload.success) {
        setError(payload.error.message);
        return;
      }

      // The account exists but this browser has no session yet: the API route
      // runs as the service role and deliberately does not mint one. Sign in
      // with the credentials just used, so the wizard opens signed in.
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // The tenant is created and intact; only the session failed. Send them
        // to log in rather than implying the signup did not work.
        router.push("/login?created=1");
        return;
      }

      router.push("/app/onboarding");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your business</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {resume
            ? "Your account exists but has no business yet. Finish setting it up below."
            : "Takes about two minutes. You can change any of it later."}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}

      <Field label="What kind of business is this?" htmlFor="industry">
        <select
          id="industry"
          name="industry"
          value={industry}
          onChange={(event) => setIndustry(event.target.value as Industry)}
          className={controlClass}
        >
          {INDUSTRIES.map((value) => (
            <option key={value} value={value}>
              {INDUSTRY_LABELS[value]}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-neutral-500">
          Your screens will say <strong>{labels.customer}</strong>, <strong>{labels.staff}</strong>{" "}
          and <strong>{labels.booking}</strong>.
        </p>
      </Field>

      <Field label="Business name" htmlFor="businessName">
        <input
          id="businessName"
          name="businessName"
          required
          minLength={2}
          maxLength={150}
          autoComplete="organization"
          className={controlClass}
          placeholder="Dhaka Dental Care"
        />
      </Field>

      <Field label="Business phone" htmlFor="phone" error={fieldErrors.phone}>
        <input
          id="phone"
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          className={controlClass}
          placeholder="01711 000000"
        />
      </Field>

      <input type="hidden" name="timezone" value="Asia/Dhaka" />

      <hr className="border-neutral-200 dark:border-neutral-800" />

      <Field label="Your name" htmlFor="ownerName">
        <input
          id="ownerName"
          name="ownerName"
          autoComplete="name"
          className={controlClass}
          placeholder="Dr Rahman"
        />
      </Field>

      <Field label="Your email" htmlFor="ownerEmail">
        <input
          id="ownerEmail"
          name="ownerEmail"
          type="email"
          required
          autoComplete="email"
          className={controlClass}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="ownerPassword"
        // In the trade's own words, like every other label on this page. A
        // salon owner reading "patient record" learns that this software was
        // written for somebody else.
        hint={`At least 10 characters. This account can see every ${labels.customer.toLowerCase()} record you store.`}
      >
        <input
          id="ownerPassword"
          name="ownerPassword"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={controlClass}
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Creating…" : "Create business"}
      </button>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <a href="/login" className="underline">
          Sign in
        </a>
      </p>
    </form>
  );
}

const controlClass =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-400";

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-xs text-neutral-500">{hint}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
