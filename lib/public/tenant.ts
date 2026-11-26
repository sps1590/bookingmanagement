import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

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
 * How long a portal read may be reused, and the tag that drops it early.
 *
 * The expensive part of the booking page is these queries, not the rendering,
 * and what they return changes a few times a year. Caching the data rather
 * than the page is deliberate: the page still runs per request, so a slug
 * that does not exist still reaches `notFound()` and still answers 404. A
 * cached *page* cannot do that — once Next has begun streaming a response the
 * status is already sent, and an unknown booking link would answer 200 with a
 * not-found body. Search engines index that, and the end-to-end suite catches
 * it, which is how this was found.
 *
 * Five minutes is the backstop. The mechanism is the tag: every settings
 * write that changes what a customer reads calls `revalidateTag`, so edits
 * are live on the next request rather than within the window.
 */
export const CACHE_SECONDS = 300;

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
export const loadPublicBusiness = cache((slug: string) =>
  unstable_cache(
    async () => {
      const { data } = await publicClient()
        .from("public_businesses")
        .select(
          "id, slug, name, business_type, phone, address, timezone, currency, terminology_config, branding_config, booking_rules",
        )
        .eq("slug", slug)
        .maybeSingle();

      return data?.id ? data : null;
    },
    ["public-business", slug],
    { tags: [tenantTag(slug)], revalidate: CACHE_SECONDS },
  )(),
);

export async function requirePublicBusiness(slug: string) {
  const business = await loadPublicBusiness(slug);
  if (!business) throw new ApiError(ErrorCode.NOT_FOUND, "No such booking page.");
  return business;
}

/**
 * Wrapped in `cache()` because the portal asks for this twice on every visit:
 * once in `generateMetadata`, to put the business's name in the tab, and again
 * in the page itself. Two identical lookups, four round trips, for one render.
 */
export const loadPublicTenant = cache((slug: string) =>
  unstable_cache(
    async () => {
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
    },
    ["public-tenant", slug],
    { tags: [tenantTag(slug)], revalidate: CACHE_SECONDS },
  )(),
);

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
