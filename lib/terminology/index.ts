import { z } from "zod";

/**
 * Industry terminology.
 *
 * A dentist's "Patient" is a salon's "Client" and a workshop's "Customer". The
 * spec calls this "zero-code industry adaptation" and it is the main reason one
 * codebase can serve six trades — but only if no component ever hardcodes a
 * noun. One `<h2>Appointments</h2>` in a shared screen and a hair salon is
 * reading medical language about its own bookings.
 *
 * So: labels resolve from the tenant's `businesses.terminology_config`, with
 * this registry as the default for their industry. The config is the authority,
 * because a tenant may rename anything — a diagnostic centre that calls a
 * booking a "Serial" is right and we are not.
 */

export const INDUSTRIES = [
  "doctor",
  "dentist",
  "salon",
  "parlor",
  "consultant",
  "workshop",
  "other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const industrySchema = z.enum(INDUSTRIES);

export interface Terminology {
  /** One person who books. "Patient", "Client". */
  customer: string;
  customerPlural: string;
  /** One person or thing that is booked. "Dentist", "Stylist", "Technician". */
  staff: string;
  staffPlural: string;
  /** One reservation. "Dental Appointment", "Service Booking", "Serial". */
  booking: string;
  bookingPlural: string;
  /** Where it happens. "Chamber", "Dental Chair", "Service Bay". */
  resource: string;
}

/**
 * From the spec's §1.2 table, with plurals added — the spec gives only
 * singulars, and every list heading in the product needs a plural, which is
 * exactly the gap that invites a hardcoded `+ "s"` somewhere in a component.
 * "Serial" pluralises to "Serials" but "Consultation" does not become
 * "Consultation Slots" by any rule, so they are written out.
 */
const REGISTRY: Record<Industry, Terminology> = {
  doctor: {
    customer: "Patient",
    customerPlural: "Patients",
    staff: "Doctor",
    staffPlural: "Doctors",
    booking: "Consultation",
    bookingPlural: "Consultations",
    resource: "Chamber",
  },
  dentist: {
    customer: "Patient",
    customerPlural: "Patients",
    staff: "Dentist",
    staffPlural: "Dentists",
    booking: "Dental Appointment",
    bookingPlural: "Dental Appointments",
    resource: "Dental Chair",
  },
  salon: {
    customer: "Client",
    customerPlural: "Clients",
    staff: "Stylist",
    staffPlural: "Stylists",
    booking: "Service Booking",
    bookingPlural: "Service Bookings",
    resource: "Styling Chair",
  },
  parlor: {
    customer: "Client",
    customerPlural: "Clients",
    staff: "Beautician",
    staffPlural: "Beauticians",
    booking: "Session",
    bookingPlural: "Sessions",
    resource: "Treatment Room",
  },
  consultant: {
    customer: "Client",
    customerPlural: "Clients",
    staff: "Consultant",
    staffPlural: "Consultants",
    booking: "Advisory Slot",
    bookingPlural: "Advisory Slots",
    resource: "Meeting Room",
  },
  workshop: {
    customer: "Customer",
    customerPlural: "Customers",
    staff: "Technician",
    staffPlural: "Technicians",
    booking: "Service Slot",
    bookingPlural: "Service Slots",
    resource: "Service Bay",
  },
  other: {
    customer: "Customer",
    customerPlural: "Customers",
    staff: "Provider",
    staffPlural: "Providers",
    booking: "Appointment",
    bookingPlural: "Appointments",
    resource: "Station",
  },
};

export const DEFAULT_TERMINOLOGY: Terminology = REGISTRY.other;

/** Human-readable industry names, for the onboarding picker. */
export const INDUSTRY_LABELS: Record<Industry, string> = {
  doctor: "Doctor / Medical Clinic",
  dentist: "Dental Clinic",
  salon: "Hair Salon / Barbershop",
  parlor: "Beauty Parlor / Spa",
  consultant: "Consultant / Law Firm",
  workshop: "Auto Workshop / Repair",
  other: "Something else",
};

export function terminologyFor(industry: Industry): Terminology {
  return REGISTRY[industry] ?? DEFAULT_TERMINOLOGY;
}

/**
 * The shape stored in `businesses.terminology_config`.
 *
 * Deliberately permissive: the column is JSONB written by an earlier version
 * of this code, by a tenant through the settings screen, and — for the three
 * fixture tenants — by hand. A label the product has since renamed must not
 * crash a page, so unknown keys pass through and missing ones fall back.
 */
const storedTerminologySchema = z
  .object({
    customer: z.string().min(1).optional(),
    customerPlural: z.string().min(1).optional(),
    staff: z.string().min(1).optional(),
    staffPlural: z.string().min(1).optional(),
    booking: z.string().min(1).optional(),
    bookingPlural: z.string().min(1).optional(),
    resource: z.string().min(1).optional(),
  })
  .passthrough();

/**
 * Resolve the labels for a tenant: their stored overrides on top of their
 * industry's defaults, and the neutral set under both.
 *
 * Never throws. A page that cannot work out whether to say "Patient" should
 * say "Customer", not return a 500 — the words are presentation, and the
 * appointment underneath them is what matters.
 */
export function resolveTerminology(
  stored: unknown,
  industry: Industry | string | null | undefined,
): Terminology {
  const base = terminologyFor(
    industrySchema.safeParse(industry).success ? (industry as Industry) : "other",
  );

  const parsed = storedTerminologySchema.safeParse(stored ?? {});
  if (!parsed.success) return base;

  const overrides = parsed.data;

  return {
    customer: overrides.customer ?? base.customer,
    customerPlural:
      overrides.customerPlural ?? pluralise(overrides.customer) ?? base.customerPlural,
    staff: overrides.staff ?? base.staff,
    staffPlural: overrides.staffPlural ?? pluralise(overrides.staff) ?? base.staffPlural,
    booking: overrides.booking ?? base.booking,
    bookingPlural: overrides.bookingPlural ?? pluralise(overrides.booking) ?? base.bookingPlural,
    resource: overrides.resource ?? base.resource,
  };
}

/**
 * Last resort for a tenant who renamed a singular and not its plural, which
 * the settings screen allows. English enough to be better than showing the
 * wrong word, crude enough that the registry above is always preferred.
 */
function pluralise(word: string | undefined): string | undefined {
  if (!word) return undefined;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** What signup writes into `businesses.terminology_config`. */
export function terminologyConfigFor(industry: Industry): Terminology {
  return { ...terminologyFor(industry) };
}
