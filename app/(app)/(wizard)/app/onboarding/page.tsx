import { Suspense } from "react";
import { ConsolePageSkeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { clientEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { Wizard, type WizardBusiness } from "./wizard";

export const metadata: Metadata = { title: "Set up your business" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<ConsolePageSkeleton rows={4} />}>
      <OnboardingPageContent />
    </Suspense>
  );
}

async function OnboardingPageContent() {
  const member = await requireMember();

  // Finished tenants have no business here. Sending them to the dashboard
  // rather than showing a completed wizard avoids the one genuinely confusing
  // outcome: re-running "go live" on a business that is already live.
  if (member.onboardingComplete) redirect("/app");

  const supabase = await createClient();

  const [{ data: business }, { count: serviceCount }, { count: workingDays }] = await Promise.all([
    supabase
      .from("businesses")
      .select("name, slug, phone, address, timezone, currency, business_code, onboarding_step")
      .eq("id", member.businessId)
      .single(),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("business_id", member.businessId)
      .eq("is_active", true),
    supabase
      .from("availability_rules")
      .select("id", { count: "exact", head: true })
      .eq("business_id", member.businessId)
      .eq("is_break", false),
  ]);

  if (!business) redirect("/signup?resume=1");

  const model: WizardBusiness = {
    name: business.name,
    slug: business.slug,
    phone: business.phone,
    address: business.address,
    timezone: business.timezone,
    currency: business.currency,
    businessCode: business.business_code,
    step: business.onboarding_step,
    providerDefault: member.email?.split("@")[0] ?? business.name,
    serviceCount: serviceCount ?? 0,
    workingDayCount: workingDays ?? 0,
    appUrl: clientEnv.NEXT_PUBLIC_APP_URL,
  };

  return <Wizard business={model} terminology={member.terminology} />;
}
