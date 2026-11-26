"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, FormError, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({
  next,
  justCreated,
  confirmFailed,
}: {
  next: string;
  justCreated: boolean;
  confirmFailed?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });

    if (signInError) {
      // Deliberately does not say which half was wrong: that would turn this
      // form into an account-enumeration oracle for a patient database.
      setError("That email and password do not match an account.");
      setPending(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Welcome back. Your diary is where you left it.
        </p>
        {justCreated ? (
          <p className="bg-success/10 text-success mt-4 rounded-lg px-3 py-2 text-sm">
            Your business is set up. Sign in to finish configuring it.
          </p>
        ) : null}
        {confirmFailed ? (
          <p className="bg-warning/15 text-warning-foreground dark:text-warning mt-4 rounded-lg px-3 py-2 text-sm">
            That confirmation link did not work — it may have expired, been used already, or been
            opened in a different browser. Sign in below, or sign up again to get a new one.
          </p>
        ) : null}
      </div>

      {error ? <FormError>{error}</FormError> : null}

      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-muted-foreground text-center text-sm">
        New here?{" "}
        <a href="/signup" className="text-primary font-medium underline underline-offset-4">
          Create your business
        </a>
      </p>
    </form>
  );
}
