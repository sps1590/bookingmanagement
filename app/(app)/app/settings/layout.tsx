import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";

import { EmptyState, PageHeader, PageShell } from "@/components/ui/page";
import { requireMember } from "@/lib/auth/session";

import { SettingsTabs } from "./tabs";

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
    <PageShell>
      <PageHeader
        title="Settings"
        description="What you offer, who provides it, and when you are open. The booking page follows these immediately."
      />

      {admin ? (
        <>
          <SettingsTabs
            items={[
              { href: "/app/settings/services", label: "Services" },
              { href: "/app/settings/staff", label: t.staffPlural },
              { href: "/app/settings/hours", label: "Opening hours" },
              { href: "/app/settings/leave", label: "Time off" },
              { href: "/app/settings/rules", label: "Booking rules" },
            ]}
          />
          {children}
        </>
      ) : (
        <EmptyState
          className="mt-8"
          icon={<Lock aria-hidden />}
          title="Settings are for owners and managers"
          description="Prices, providers and opening hours change what every customer sees, so they are kept to the people accountable for them. Ask an owner or a manager."
        />
      )}
    </PageShell>
  );
}
