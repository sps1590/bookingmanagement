import { Suspense } from "react";
import { ConsolePageSkeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChevronDown, Search, UserRound } from "lucide-react";

import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, PageHeader, PageShell } from "@/components/ui/page";
import { requireMember } from "@/lib/auth/session";
import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { CustomerNotes } from "./notes";

export const metadata: Metadata = { title: "Customers" };
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
export default function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  return (
    <Suspense fallback={<ConsolePageSkeleton rows={8} />}>
      <CustomersPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomersPageContent({
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
    <PageShell width="narrow">
      <PageHeader
        title={t.customerPlural}
        description={`${total} ${
          total === 1 ? t.customer.toLowerCase() : t.customerPlural.toLowerCase()
        } on file. Open one for their recent visits and your private notes.`}
      />

      <Card className="mt-6">
        <form method="get" className="flex flex-wrap items-end gap-3 p-4">
          {/* Name or phone in one box, because a receptionist with somebody at
          the counter has one of the two and no patience for choosing. */}
          <Field label="Name or mobile" htmlFor="q" className="grow">
            <Input id="q" name="q" defaultValue={search} placeholder="Rahman, or 01711…" />
          </Field>
          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors"
          >
            <Search className="size-4" aria-hidden />
            Search
          </button>
        </form>
      </Card>

      {customers.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<UserRound aria-hidden />}
          title={
            search ? "Nobody by that name or number" : `No ${t.customerPlural.toLowerCase()} yet`
          }
          description={
            search
              ? "Check the spelling, or search by the last few digits of the mobile number."
              : `Everyone who books — online or at the desk — is filed here automatically, with their history and your notes.`
          }
          action={
            search ? (
              <Link
                href="/app/customers"
                className="text-primary text-sm font-medium underline underline-offset-4"
              >
                Show everyone
              </Link>
            ) : null
          }
        />
      ) : (
        <Card className="mt-6 overflow-hidden">
          <ul className="divide-border/70 divide-y">
            {customers.map((customer) => {
              const visits = history.get(customer.id) ?? [];
              const spend = visits
                .filter((b) => b.status === "completed")
                .reduce((sum, b) => sum + Number(b.total_price ?? 0), 0);

              return (
                <li key={customer.id}>
                  <details className="group">
                    <summary className="hover:bg-muted/40 flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors sm:px-5">
                      <span
                        className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
                        aria-hidden
                      >
                        {customer.full_name.trim().charAt(0).toUpperCase()}
                      </span>

                      <span className="min-w-0 grow">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{customer.full_name}</span>
                          {customer.no_show_count > 0 ? (
                            <Badge tone="warning">
                              {customer.no_show_count} no-show
                              {customer.no_show_count === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                          {formatPhoneForDisplay(customer.phone)}
                          {customer.email ? ` · ${customer.email}` : null}
                        </span>
                      </span>

                      <span className="text-muted-foreground shrink-0 text-right text-xs">
                        <span className="tabular block font-medium">{customer.total_bookings}</span>
                        visit{customer.total_bookings === 1 ? "" : "s"}
                      </span>

                      <ChevronDown
                        className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>

                    <div className="bg-muted/25 grid gap-5 px-4 py-4 sm:grid-cols-2 sm:px-5">
                      <div>
                        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                          Recent
                        </p>
                        {visits.length === 0 ? (
                          <p className="text-muted-foreground mt-2 text-sm">Nothing yet.</p>
                        ) : (
                          <ul className="mt-2 space-y-1.5 text-sm">
                            {visits.map((booking) => (
                              <li key={booking.id} className="flex items-center gap-2">
                                <span className="tabular shrink-0">
                                  {when.format(new Date(booking.start_time))}
                                </span>
                                <span className="text-muted-foreground min-w-0 grow truncate">
                                  {(booking.services as unknown as { name: string } | null)?.name ??
                                    "—"}
                                </span>
                                <StatusBadge status={booking.status} className="shrink-0" />
                              </li>
                            ))}
                          </ul>
                        )}
                        {/* Completed visits only, and only the five shown. Said
                   plainly rather than presented as a lifetime total,
                   because a number that looks like one and is not is
                   worse than no number. */}
                        {spend > 0 ? (
                          <p className="text-muted-foreground mt-3 text-xs">
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
        </Card>
      )}

      {total > pageSize ? (
        <nav className="mt-6 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link
              href={`/app/customers?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page - 1) })}`}
              className="border-border bg-card hover:border-primary/40 hover:text-primary rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            >
              Previous
            </Link>
          ) : (
            <span className="text-muted-foreground/50 px-3 py-2 text-sm">Previous</span>
          )}
          <span className="text-muted-foreground text-xs">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          {page * pageSize < total ? (
            <Link
              href={`/app/customers?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page + 1) })}`}
              className="border-border bg-card hover:border-primary/40 hover:text-primary rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            >
              Next
            </Link>
          ) : (
            <span className="text-muted-foreground/50 px-3 py-2 text-sm">Next</span>
          )}
        </nav>
      ) : null}
    </PageShell>
  );
}
