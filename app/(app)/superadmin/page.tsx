import type { Metadata } from "next";

import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { SuspendToggle } from "./suspend-toggle";

export const metadata: Metadata = { title: "Platform" };
export const dynamic = "force-dynamic";

/**
 * The operator console.
 *
 * Deliberately thin, and that is decision D-012 rather than an unfinished
 * screen: the platform operator reads configuration and never patient data.
 * There is no booking list here, no customer search and no impersonation,
 * because on a platform holding medical appointments the ability to read any
 * tenant's records "for support" is the ability to read them for anything.
 * The policies enforce it — this page could not show that data if it tried.
 *
 * What an operator can do: see who is signed up, which plan they are on, and
 * suspend a tenant who is not paying. Suspension stops new bookings at once
 * and leaves the existing diary alone, because suspending a business for
 * non-payment should not cancel a patient's appointment tomorrow.
 */
export default async function SuperAdmin() {
  const member = await requireMember();
  const supabase = await createClient();

  const { data: isOperator } = await supabase.rpc("is_platform_admin");

  if (!isOperator) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-xl font-semibold tracking-tight">Not for you</h1>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          This console is for platform operators. You are signed in as {member.email}.
        </p>
      </main>
    );
  }

  // `businesses` is readable by an operator through the policy in 0016;
  // `bookings` and `customers` are not, by design, which is why the counts
  // below come from the tenant's own plan usage rather than from their diary.
  const [{ data: tenants }, { data: audit }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, slug, business_type, timezone, is_active, created_at, plan_expires_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("platform_audit")
      .select("id, action, detail, created_at, target_business_id")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const rows = tenants ?? [];
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
      <p className="mt-1 text-xs text-neutral-500">
        {rows.length} tenant{rows.length === 1 ? "" : "s"} · configuration only, never their records
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Nobody has signed up yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {rows.map((tenant) => (
            <li
              key={tenant.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <span>
                <span className="text-sm font-medium">{tenant.name}</span>
                {tenant.is_active ? null : (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-900 dark:bg-red-950 dark:text-red-300">
                    suspended
                  </span>
                )}
                <span className="mt-0.5 block text-xs text-neutral-500">
                  /{tenant.slug} · {tenant.business_type} · {tenant.timezone} · joined{" "}
                  {when.format(new Date(tenant.created_at))}
                </span>
              </span>

              <SuspendToggle businessId={tenant.id} name={tenant.name} active={tenant.is_active} />
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide uppercase">Recent operator actions</h2>
        {(audit ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
            {(audit ?? []).map((entry) => (
              <li key={entry.id}>
                {when.format(new Date(entry.created_at))} · {entry.action}
                {entry.detail ? ` · ${entry.detail}` : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
