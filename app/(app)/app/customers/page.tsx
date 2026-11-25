import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { CustomerNotes } from "./notes";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

/**
 * The customer directory.
 *
 * Read under the caller's own session, which matters more here than anywhere
 * else in the app: this table holds names, phone numbers and free-text notes
 * that on a medical tenant are clinical. The policies in 0015 limit it to
 * members of the business, and the platform operator deliberately has no read
 * path to it at all (D-012). A service-role query here would quietly undo
 * both.
 *
 * The no-show count beside each name is the number that was always zero until
 * migration 0022 — it is on this screen that a receptionist decides whether to
 * ask for a deposit, so a counter nothing wrote was worse than no counter.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const member = await requireMember();
  if (!member.onboardingComplete) redirect("/app/onboarding");

  const params = await searchParams;
  const search = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 25;

  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, full_name, phone, email, notes, total_bookings, no_show_count, created_at", {
      count: "exact",
    })
    .eq("business_id", member.businessId);

  if (search) {
    // Name or phone, because a receptionist with somebody at the counter has
    // one of the two and no patience for choosing a field.
    const term = search.replace(/[%,()]/g, "");
    query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  const { data, count } = await query
    .order("full_name", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const customers = data ?? [];
  const total = count ?? 0;
  const t = member.terminology;

  // One query for everyone on this page rather than one per row: a directory
  // that issues twenty-five round trips is a directory that feels broken on a
  // slow connection, which is where it will mostly be used.
  const ids = customers.map((c) => c.id);
  const { data: recent } = ids.length
    ? await supabase
        .from("bookings")
        .select("id, customer_id, booking_code, status, start_time, total_price, services (name)")
        .eq("business_id", member.businessId)
        .in("customer_id", ids)
        .order("start_time", { ascending: false })
        .limit(200)
    : { data: [] };

  const history = new Map<string, typeof recent>();
  for (const booking of recent ?? []) {
    const list = history.get(booking.customer_id) ?? [];
    if (list.length < 5) list.push(booking);
    history.set(booking.customer_id, list);
  }

  const money = new Intl.NumberFormat("en", {
    style: "currency",
    currency: member.currency || "BDT",
    maximumFractionDigits: 0,
  });
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t.customerPlural}</h1>
        <Link href="/app" className="text-sm underline underline-offset-4">
          Dashboard
        </Link>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="block grow">
          <span className="text-xs text-neutral-500">Name or mobile</span>
          <input
            name="q"
            defaultValue={search}
            className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Search
        </button>
      </form>

      <p className="mt-4 text-xs text-neutral-500">
        {total} {total === 1 ? t.customer.toLowerCase() : t.customerPlural.toLowerCase()}
      </p>

      {customers.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {search ? "Nobody by that name or number." : "Nobody yet."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {customers.map((customer) => {
            const visits = history.get(customer.id) ?? [];
            const spend = visits
              .filter((b) => b.status === "completed")
              .reduce((sum, b) => sum + Number(b.total_price ?? 0), 0);

            return (
              <li key={customer.id} className="px-4 py-3">
                <details>
                  <summary className="flex cursor-pointer items-baseline justify-between gap-4">
                    <span>
                      <span className="text-sm font-medium">{customer.full_name}</span>
                      {customer.no_show_count > 0 ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                          {customer.no_show_count} no-show
                          {customer.no_show_count === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {formatPhoneForDisplay(customer.phone)}
                        {customer.email ? ` · ${customer.email}` : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-neutral-500">
                      {customer.total_bookings} visit
                      {customer.total_bookings === 1 ? "" : "s"}
                    </span>
                  </summary>

                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-neutral-500">Recent</p>
                      {visits.length === 0 ? (
                        <p className="mt-1 text-sm text-neutral-500">Nothing yet.</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-sm">
                          {visits.map((booking) => (
                            <li key={booking.id}>
                              {when.format(new Date(booking.start_time))}
                              <span className="text-neutral-500">
                                {" "}
                                ·{" "}
                                {(booking.services as unknown as { name: string } | null)?.name ??
                                  "—"}{" "}
                                ·{" "}
                                <span className="capitalize">
                                  {booking.status.replace("_", " ")}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Completed visits only, and only the five shown. Said
                          plainly rather than presented as a lifetime total,
                          because a number that looks like one and is not is
                          worse than no number. */}
                      {spend > 0 ? (
                        <p className="mt-2 text-xs text-neutral-500">
                          {money.format(spend)} across the completed visits above.
                        </p>
                      ) : null}
                    </div>

                    <CustomerNotes customerId={customer.id} notes={customer.notes ?? ""} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {total > pageSize ? (
        <nav className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={`/app/customers?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page - 1) })}`}
              className="underline underline-offset-4"
            >
              Previous
            </Link>
          ) : (
            <span className="text-neutral-300 dark:text-neutral-700">Previous</span>
          )}
          <span className="text-xs text-neutral-500">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          {page * pageSize < total ? (
            <Link
              href={`/app/customers?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page + 1) })}`}
              className="underline underline-offset-4"
            >
              Next
            </Link>
          ) : (
            <span className="text-neutral-300 dark:text-neutral-700">Next</span>
          )}
        </nav>
      ) : null}
    </main>
  );
}
