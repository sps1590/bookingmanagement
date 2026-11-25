import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; created?: string; confirm?: string }>;
}) {
  const { next, created, confirm } = await searchParams;

  return (
    <LoginForm
      // Only ever a path within this app. An open redirect here would let a
      // phishing link land on a convincing login page and then bounce the
      // signed-in user somewhere else entirely.
      next={next?.startsWith("/") && !next.startsWith("//") ? next : "/app"}
      justCreated={created === "1"}
      // The confirmation link did not work: expired, already used, or opened
      // in a different browser than the one that signed up.
      confirmFailed={confirm === "failed"}
    />
  );
}
