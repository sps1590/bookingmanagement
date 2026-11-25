import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requirePublicTenant } from "@/lib/public/tenant";
import { resolveTerminology } from "@/lib/terminology";

/**
 * `GET /api/v1/public/:slug`
 *
 * Everything the booking portal needs to render itself: the business, its
 * services, its providers, its branches, and the resolved terminology so a
 * dentist's screens say "Patient" where a salon's say "Client".
 *
 * Reads only the curated views (migration 0014). `public_staff` deliberately
 * carries no phone or email — that is defect B-05, where the spec published
 * every provider's personal contact details to anonymous visitors.
 */

export const dynamic = "force-dynamic";

export const GET = route(
  "public.tenant",
  async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const { business, services, staff, branches } = await requirePublicTenant(slug);

    return ok({
      business: {
        id: business.id,
        slug: business.slug,
        name: business.name,
        type: business.business_type,
        phone: business.phone,
        address: business.address,
        timezone: business.timezone,
        currency: business.currency,
        branding: business.branding_config,
        rules: business.booking_rules,
      },
      terminology: resolveTerminology(business.terminology_config, business.business_type),
      services,
      staff,
      branches,
    });
  },
);
