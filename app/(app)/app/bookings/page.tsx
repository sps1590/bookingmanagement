import { Suspense } from "react";
import { ConsolePageSkeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CalendarX2, Download, Printer, Search } from "lucide-react";

import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, PageHeader, PageShell } from "@/components/ui/page";
import { requireMember } from "@/lib/auth/session";
import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn, zonedDayRange } from "@/lib/time/zone";

import { StatusActions } from "./status-actions";
import { WalkIn } from "./walk-in";

export const metadata: Metadata = { title: "Bookings" };
/**
 * The booking list — the screen a receptionist lives in.
 *
 * Server-rendered, with every filter in the query string. That is not
 * nostalgia: it means a filtered view is a URL somebody can bookmark, send to
 * a colleague, or reload after the browser is closed at lunch, and it means
 * the first paint already has the day's rows rather than a spinner over an
 * empty table.
 *
 * The query runs under the caller's own session, so Row-Level Security decides
 * what is listed: the front desk sees the whole diary, a provider sees their
 * own column of it (defect B-23), and a member pinned to a branch sees that
 * branch (migration 0022). There is no `business_id` filter standing between
 * a bug and another tenant's patient list — the policies are, and they do not
 * depend on anyone remembering.
 */

const PRESETS = ["today", "tomorrow", "week", "all"] as const;
type Preset = (typeof PRESETS)[number];

function rangeFor(preset: Preset, timezone: string): { from: string; to: string } | null {
  const today = todayIn(timezone);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "tomorrow":
      return { from: addDays(today, 1), to: addDays(today, 1) };
    case "week":
      return { from: today, to: addDays(today, 6) };
    case "all":
      return null;
  }
}

export default function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; status?: string; q?: string; page?: string }>;
}) {
  return (
    <Suspense fallback={<ConsolePageSkeleton rows={8} />}>
      <BookingsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BookingsPageContent({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; status?: string; q?: string; page?: string }>;
}) {
  const member = await requireMember();
  if (!member.onboardingComplete) redirect("/app/onboarding");

  const params = await searchParams;
  const preset: Preset = PRESETS.includes(params.range as Preset)
    ? (params.range as Preset)
    : "today";
  const status = params.status && params.status !== "any" ? params.status : null;
  const search = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 25;

  const supabase = await createClient();

  let query = supabase
    .from("bookings")
    .select(
      `id, booking_code, status, payment_status, start_time, end_time, total_price, booking_source,
     customers (full_name, phone, no_show_count),
     services (name),
     staff_resources (name)`,
      { count: "exact" },
    )
    .eq("business_id", member.businessId);

  const range = rangeFor(preset, member.timezone);
  if (range) {
    const { start, end } = zonedDayRange(range.from, range.to, member.timezone);
    query = query.gte("start_time", start).lt("start_time", end);
  }
  if (status) query = query.eq("status", status);
  if (search) {
    // A receptionist types a booking code or the digits of a phone number and
    // should not have to say which.
    query = query.ilike("booking_code", `%${search.replace(/[%,()]/g, "")}%`);
  }

  const { data, count } = await query
    .order("start_time", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const bookings = data ?? [];
  const total = count ?? 0;
  const t = member.terminology;

  const desk =
    member.role === "owner" || member.role === "manager" || member.role === "receptionist";

  const [{ data: services }, { data: staff }, { data: mappings }] = desk
    ? await Promise.all([
        supabase
          .from("services")
          .select("id, name")
          .eq("business_id", member.businessId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("staff_resources")
          .select("id, name")
          .eq("business_id", member.businessId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("staff_services")
          .select("staff_id, service_id")
          .eq("business_id", member.businessId),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const money = new Intl.NumberFormat("en", {
    style: "currency",
    currency: member.currency || "BDT",
    maximumFractionDigits: 0,
  });

  return (
    <PageShell>
      <PageHeader
        title={t.bookingPlural}
        description={`${total} ${
          total === 1 ? t.booking.toLowerCase() : t.bookingPlural.toLowerCase()
        } in this view · times in ${member.timezone}`}
        actions={
          <>
            <Link
              href={`/app/bookings/print${range ? `?date=${range.from}` : ""}`}
              className="border-border bg-card hover:border-primary/40 hover:text-primary inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            >
              <Printer className="size-4" aria-hidden />
              Day sheet
            </Link>
            {desk ? (
              <a
                href={`/api/v1/admin/bookings/export?format=xlsx${
                  range ? `&from=${range.from}&to=${range.to}` : ""
                }${status ? `&status=${status}` : ""}`}
                className="border-border bg-card hover:border-primary/40 hover:text-primary inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
              >
                <Download className="size-4" aria-hidden />
                Export
              </a>
            ) : null}
            {desk ? (
              <WalkIn
                services={services ?? []}
                staff={staff ?? []}
                staffServices={(mappings ?? []).map((m) => `${m.staff_id}:${m.service_id}`)}
                today={todayIn(member.timezone)}
                timezone={member.timezone}
              />
            ) : null}
          </>
        }
      />

      {/* GET, so every filtered view is a URL that can be bookmarked, sent to
       a colleague, or reloaded after the browser is closed at lunch. */}
      <Card className="mt-6">
        <form
          method="get"
          className="grid gap-3 p-4 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end"
        >
          <Field label="When" htmlFor="range">
            <Select id="range" name="range" defaultValue={preset} className="sm:w-40">
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="week">Next 7 days</option>
              <option value="all">All</option>
            </Select>
          </Field>

          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={status ?? "any"} className="sm:w-44">
              <option value="any">Any</option>
              <option value="pending">Awaiting approval</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked in</option>
              <option value="completed">Completed</option>
              <option value="no_show">No-show</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>

          <Field label="Booking code" htmlFor="q">
            <Input id="q" name="q" defaultValue={search} placeholder="DHK-20261201-0007" />
          </Field>

          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors"
          >
            <Search className="size-4" aria-hidden />
            Apply
          </button>
        </form>
      </Card>

      {bookings.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<CalendarX2 aria-hidden />}
          title={`No ${t.bookingPlural.toLowerCase()} in this view`}
          description="Nothing matches these filters. Try a wider date range, or clear the booking code."
          action={
            <Link
              href="/app/bookings?range=all"
              className="text-primary text-sm font-medium underline underline-offset-4"
            >
              Show everything
            </Link>
          }
        />
      ) : (
        <Card className="mt-6 overflow-hidden">
          <ul className="divide-border/70 divide-y">
            {bookings.map((booking) => {
              const customer = booking.customers as unknown as {
                full_name: string;
                phone: string;
                no_show_count: number;
              } | null;
              const service = booking.services as unknown as { name: string } | null;
              const provider = booking.staff_resources as unknown as { name: string } | null;

              return (
                <li
                  key={booking.id}
                  className="hover:bg-muted/40 grid gap-3 px-4 py-4 transition-colors sm:grid-cols-[1fr_auto] sm:items-center sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="tabular text-sm font-semibold">
                        {time.format(new Date(booking.start_time))}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {booking.booking_code}
                      </span>
                      <StatusBadge status={booking.status} />
                      {booking.booking_source !== "online" ? (
                        <Badge tone="neutral">{booking.booking_source.replace("_", " ")}</Badge>
                      ) : null}
                      {/* Defect M-07: this number was always zero, so a serial
                  no-show read as reliable. A trigger maintains it now. */}
                      {customer && customer.no_show_count > 0 ? (
                        <Badge tone="warning">
                          {customer.no_show_count} no-show{customer.no_show_count === 1 ? "" : "s"}
                        </Badge>
                      ) : null}
                    </div>

                    <p className="mt-1.5 truncate font-medium">
                      {customer?.full_name ?? "—"}
                      {customer?.phone ? (
                        <span className="text-muted-foreground font-normal">
                          {" · "}
                          {formatPhoneForDisplay(customer.phone)}
                        </span>
                      ) : null}
                    </p>

                    <p className="text-muted-foreground mt-0.5 truncate text-sm">
                      {service?.name ?? "—"} · {provider?.name ?? "—"}
                      {booking.total_price > 0 ? ` · ${money.format(booking.total_price)}` : null}
                    </p>
                  </div>

                  <div className="sm:justify-self-end">
                    <StatusActions bookingId={booking.id} status={booking.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {total > pageSize ? (
        <nav className="mt-6 flex items-center justify-between gap-3">
          <PageLink page={page - 1} disabled={page === 1} params={params} label="Previous" />
          <span className="text-muted-foreground text-xs">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <PageLink
            page={page + 1}
            disabled={page * pageSize >= total}
            params={params}
            label="Next"
          />
        </nav>
      ) : null}
    </PageShell>
  );
}

function PageLink({
  page,
  disabled,
  params,
  label,
}: {
  page: number;
  disabled: boolean;
  params: Record<string, string | undefined>;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="text-muted-foreground/50 rounded-lg border border-transparent px-3 py-2 text-sm">
        {label}
      </span>
    );
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  query.set("page", String(page));

  return (
    <Link
      href={`/app/bookings?${query.toString()}`}
      className="border-border bg-card hover:border-primary/40 hover:text-primary rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
    >
      {label}
    </Link>
  );
}
