import "server-only";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { createClient } from "@/lib/supabase/server";

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

export async function loadPublicTenant(slug: string) {
  const supabase = await createClient();

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
