import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { publicClient } from "@/lib/supabase/public";

/**
 * Reading a tenant as the public sees it.
 *
 * Every query here goes through the curated views from migration 0014 and
 * never a base table. That is defect B-05: `staff_resources` holds each
 * provider's personal mobile number and email address, and the spec published
 * that table to anonymous visitors. `public_staff` has no such columns to
 * leak, so the mistake is not available to make.
 *
 * It also uses the anon-key client rather than the admin client. The service
 * key bypasses Row-Level Security entirely, and a public endpoint is the last
 * place it belongs: a mistake in a filter here would expose every tenant
 * rather than return the wrong page.
 */

/**
 * The tag that drops a tenant's cached portal reads, and the reads themselves.
 *
 * The expensive part of the booking page is these queries, not the rendering,
 * and what they return changes a few times a year. `use cache` keeps them;
 * the `portal` profile in `next.config.ts` says for how long; and the tag is
 * the real mechanism — every settings write that changes what a customer
 * reads calls `updateTag` on it, so edits are live on the next request rather
 * than whenever the window happens to lapse.
 *
 * These functions read through a session-less client, which is what makes
 * them cacheable at all: a `use cache` scope may not touch cookies, and the
 * portal's output must not depend on who is looking.
 */
/**
 * How long a portal read may be reused when nobody has edited the tenant.
 *
 * `revalidate` is the backstop, not the mechanism — the tag below is. Five
 * minutes before the server refreshes in the background, an hour before a
 * stale copy stops being served at all.
 */
const PORTAL_CACHE = { stale: 300, revalidate: 300, expire: 3600 };

export function tenantTag(slug: string) {
  return `tenant:${slug}`;
}

export interface PublicService {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  duration_minutes: number;
  price: number;
  deposit_required: number;
  color_hex: string | null;
}

export interface PublicStaff {
  id: string;
  name: string;
  title: string | null;
  avatar_url: string | null;
  branch_id: string | null;
}

/**
 * The business row on its own.
 *
 * The slot grid needs an id and a timezone and nothing else, but it used to
 * call `loadPublicTenant` to get them — and so fetched every service, every
 * provider and every branch on each tap of a date. Three queries thrown away
 * per tap, which on a round trip of any length is the difference between a
 * grid that appears and a grid that arrives.
 */
export async function loadPublicBusiness(slug: string) {
  "use cache";
  cacheTag(tenantTag(slug));
  cacheLife(PORTAL_CACHE);

  const { data } = await publicClient()
    .from("public_businesses")
    .select(
      "id, slug, name, business_type, phone, address, timezone, currency, terminology_config, branding_config, booking_rules",
    )
    .eq("slug", slug)
    .maybeSingle();

  return data?.id ? data : null;
}

export async function requirePublicBusiness(slug: string) {
  const business = await loadPublicBusiness(slug);
  if (!business) throw new ApiError(ErrorCode.NOT_FOUND, "No such booking page.");
  return business;
}

/**
 * Everything the portal renders: the business, its services, its providers
 * and its branches.
 *
 * Cached rather than deduplicated. The portal asks for this twice on every
 * visit — once in `generateMetadata`, to put the business's name in the tab,
 * and again in the page — and before `use cache` that was two identical
 * lookups and four round trips for one render. Now it is none, on any visit
 * after the first.
 */
export async function loadPublicTenant(slug: string) {
  "use cache";
  cacheTag(tenantTag(slug));
  cacheLife(PORTAL_CACHE);

  const supabase = publicClient();

  const { data: business } = await supabase
    .from("public_businesses")
    .select(
      "id, slug, name, business_type, phone, address, timezone, currency, terminology_config, branding_config, booking_rules",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!business?.id) return null;

  const [{ data: services }, { data: staff }, { data: branches }] = await Promise.all([
    supabase
      .from("public_services")
      .select(
        "id, name, category, description, duration_minutes, price, deposit_required, color_hex",
      )
      .eq("business_id", business.id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("public_staff")
      .select("id, name, title, avatar_url, branch_id")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("public_branches")
      .select("id, name, address, phone, map_url")
      .eq("business_id", business.id),
  ]);

  return {
    business,
    services: (services ?? []) as PublicService[],
    staff: (staff ?? []) as PublicStaff[],
    branches: branches ?? [],
  };
}

/**
 * The same lookup for route handlers, which want an error rather than a null.
 *
 * A slug that does not resolve and a tenant that has not published yet are the
 * same 404 on purpose: whether a given business is registered here is not
 * public information, and a distinguishable response would make the portal an
 * enumeration oracle.
 */
export async function requirePublicTenant(slug: string) {
  const loaded = await loadPublicTenant(slug);
  if (!loaded) {
    throw new ApiError(ErrorCode.NOT_FOUND, "No such booking page.");
  }
  return loaded;
}
