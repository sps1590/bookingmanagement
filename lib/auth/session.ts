import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveTerminology, type Industry, type Terminology } from "@/lib/terminology";

/**
 * Who is asking, and which tenant are they asking about.
 *
 * Every screen in the tenant application needs both, and getting the second
 * one wrong is the whole ballgame — so the business is always read back
 * through the RLS client rather than taken from a cookie, a header or a URL
 * segment. If the policies would not return the row, this code does not see
 * it either.
 */

export interface MemberContext {
  userId: string;
  email: string | null;
  businessId: string;
  businessCode: string;
  businessName: string;
  slug: string;
  industry: Industry;
  timezone: string;
  currency: string;
  role: "owner" | "manager" | "receptionist" | "staff";
  onboardingStep: string;
  onboardingComplete: boolean;
  terminology: Terminology;
}

export async function getMemberContext(): Promise<MemberContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // One business per owner for now (enforced in register_business), so the
  // first active membership is the only one. When the tenant switcher arrives,
  // this is the function that learns about it — not thirty call sites.
  const { data: membership } = await supabase
    .from("business_members")
    .select("role, business_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const { data: business } = await supabase
    .from("businesses")
    .select(
      "id, business_code, name, slug, business_type, timezone, currency, terminology_config, onboarding_step, onboarding_completed_at",
    )
    .eq("id", membership.business_id)
    .maybeSingle();

  if (!business) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    businessId: business.id,
    businessCode: business.business_code,
    businessName: business.name,
    slug: business.slug,
    industry: business.business_type as Industry,
    timezone: business.timezone,
    currency: business.currency,
    role: membership.role as MemberContext["role"],
    onboardingStep: business.onboarding_step,
    onboardingComplete: business.onboarding_completed_at !== null,
    terminology: resolveTerminology(business.terminology_config, business.business_type),
  };
}

/**
 * For pages that cannot render without a tenant.
 *
 * A signed-in user with no membership is a real state, not a bug: signup
 * creates the Auth identity first, so an interrupted signup leaves exactly
 * this. Sending them to /signup lets them finish rather than meeting an error
 * they can do nothing about.
 */
export async function requireMember(): Promise<MemberContext> {
  const context = await getMemberContext();

  if (!context) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/signup?resume=1" : "/login");
  }

  return context;
}
