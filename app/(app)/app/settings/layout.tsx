import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings shell.
 *
 * The role check is here as well as in every action, which is on purpose: a
 * receptionist should not be shown a price list they cannot change and then
 * told off for trying. The actions still check, because a nav that hides a
 * link is a courtesy and never a control.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  if (!member.onboardingComplete) redirect("/app/onboarding");

  const t = member.terminology;
  const admin = member.role === "owner" || member.role === "manager";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Link href="/app" className="text-sm underline underline-offset-4">
          Dashboard
        </Link>
      </div>

      {admin ? (
        <nav className="mt-4 flex flex-wrap gap-4 border-b border-neutral-200 pb-3 text-sm dark:border-neutral-800">
          <Link href="/app/settings/services" className="underline underline-offset-4">
            Services
          </Link>
          <Link href="/app/settings/staff" className="underline underline-offset-4">
            {t.staffPlural}
          </Link>
          <Link href="/app/settings/hours" className="underline underline-offset-4">
            Opening hours
          </Link>
          <Link href="/app/settings/leave" className="underline underline-offset-4">
            Time off
          </Link>
        </nav>
      ) : (
        <p className="mt-4 rounded-md border border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          Only an owner or manager can change settings. Ask one of them.
        </p>
      )}

      {admin ? children : null}
    </div>
  );
}
