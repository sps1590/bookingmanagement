import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { clientEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Tenant dashboard — a placeholder until Phase 4, which is where the day
 * sheet, the calendar and the booking operations live.
 *
 * It exists now because onboarding has to end somewhere, and because it is
 * where the labels get their first real outing: every noun on this page comes
 * from the tenant's terminology, so a dentist reads "Patients" and a salon
 * reads "Clients" without either string appearing in this file.
 */
export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const member = await requireMember();
  const { welcome } = await searchParams;

  if (!member.onboardingComplete) redirect("/app/onboarding");

  const t = member.terminology;
  const bookingUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/book/${member.slug}`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {welcome === "1" ? (
        <div className="mb-8 rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-800 dark:text-green-300">
          <p className="font-medium">Your booking page is live.</p>
          <p className="mt-1">
            Share{" "}
            <a href={bookingUrl} className="break-all underline">
              {bookingUrl}
            </a>{" "}
            with your {t.customerPlural.toLowerCase()}.
          </p>
        </div>
      ) : null}

      <p className="font-mono text-xs tracking-widest text-neutral-500 uppercase">
        {member.businessCode} · {member.role}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{member.businessName}</h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        Set up and live. Times below are shown in {member.timezone}.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
        <Card term={`Today's ${t.bookingPlural.toLowerCase()}`} value="—" note="Phase 4" />
        <Card term={t.customerPlural} value="—" note="Phase 4" />
        <Card term={t.staffPlural} value="—" note="Phase 7" />
        <Card term="Reminders sent" value="—" note="Phase 5" />
      </dl>

      <div className="mt-10 space-y-2 text-sm">
        <Link href="/app/onboarding" className="block underline">
          Review setup
        </Link>
        <a href={bookingUrl} className="block underline">
          View public booking page
        </a>
      </div>
    </main>
  );
}

function Card({ term, value, note }: { term: string; value: string; note: string }) {
  return (
    <div className="rounded-md border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <dt className="text-xs text-neutral-500">{term}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
      <p className="mt-1 font-mono text-[10px] tracking-wider text-neutral-400 uppercase">{note}</p>
    </div>
  );
}
