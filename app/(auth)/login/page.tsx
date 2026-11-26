import { Suspense } from "react";
import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; created?: string; confirm?: string }>;
}) {
  // The form itself is the same for everybody and is prerendered.
  // Only the notices driven by the query string need this request.
  return (
    <Suspense fallback={null}>
      <LoginPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginPageContent({
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
