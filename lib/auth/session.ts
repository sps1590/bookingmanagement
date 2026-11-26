import "server-only";

import { cache } from "react";
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
 *
 * ## Why this file is wrapped in `cache()`
 *
 * This lookup used to cost three sequential network round trips to Supabase —
 * `auth.getUser()`, then the membership, then the business — and it was called
 * once by the console layout and again by whichever page rendered inside it.
 * Six round trips before a screen began fetching its own data. Against a
 * database on another continent that was most of a page load; even next door
 * it is six chances to wait.
 *
 * React's `cache()` scopes a result to one request, so the layout and the page
 * now share one lookup, and the membership and business arrive together in a
 * single embedded select. Three round trips became one, and six became one.
 *
 * `cache()` is per-request, not a cache in the stale-data sense: nothing here
 * survives the response, so a role change or a rename is visible on the next
 * navigation. That matters — this is the function that decides what somebody
 * is allowed to see.
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

interface EmbeddedBusiness {
  id: string;
  business_code: string;
  name: string;
  slug: string;
  business_type: string;
  timezone: string;
  currency: string;
  terminology_config: unknown;
  onboarding_step: string;
  onboarding_completed_at: string | null;
}

/**
 * The signed-in Auth user, once per request.
 *
 * `getUser()` is a call to Supabase, not a cookie read — it verifies the
 * access token with the Auth server rather than trusting whatever the browser
 * sent, which is the behaviour we want and the reason it costs a round trip.
 * Deduplicating it is the cheap half of that trade.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getMemberContext = cache(async (): Promise<MemberContext | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  // One business per owner for now (enforced in register_business), so the
  // first active membership is the only one. When the tenant switcher arrives,
  // this is the function that learns about it — not thirty call sites.
  //
  // The business comes back embedded through the foreign key rather than in a
  // second query. `!inner` makes a membership whose business is invisible to
  // this caller return no row at all, which is the same answer the two-query
  // version gave and one trip instead of two. RLS still applies to both sides
  // of the join; PostgREST does not get to see past it either.
  const { data: membership } = await supabase
    .from("business_members")
    .select(
      `role,
       businesses!inner (
         id, business_code, name, slug, business_type, timezone, currency,
         terminology_config, onboarding_step, onboarding_completed_at
       )`,
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  // PostgREST returns a to-one embed as an object. The generated types are not
  // always sure of that, so the shape is asserted once, here, instead of at
  // every field below.
  const business = membership.businesses as unknown as EmbeddedBusiness | null;
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
});

/**
 * For pages that cannot render without a tenant.
 *
 * A signed-in user with no membership is a real state, not a bug: signup
 * creates the Auth identity first, so an interrupted signup leaves exactly
 * this. Sending them to /signup lets them finish rather than meeting an error
 * they can do nothing about.
 *
 * The user is read from the cached lookup above rather than fetched again, so
 * the unhappy path costs nothing extra.
 */
export async function requireMember(): Promise<MemberContext> {
  const context = await getMemberContext();

  if (!context) {
    const user = await getAuthUser();
    redirect(user ? "/signup?resume=1" : "/login");
  }

  return context;
}
