import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn, zonedDayRange } from "@/lib/time/zone";

import { StatusActions } from "./status-actions";
import { WalkIn } from "./walk-in";

export const metadata: Metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

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

export default async function BookingsPage({
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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t.bookingPlural}</h1>
        <div className="flex items-center gap-4">
          <Link href="/app" className="text-sm underline underline-offset-4">
            Dashboard
          </Link>
          {desk ? (
            <WalkIn
              services={services ?? []}
              staff={staff ?? []}
              staffServices={(mappings ?? []).map((m) => `${m.staff_id}:${m.service_id}`)}
              today={todayIn(member.timezone)}
              timezone={member.timezone}
            />
          ) : null}
        </div>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs text-neutral-500">When</span>
          <select
            name="range"
            defaultValue={preset}
            className="mt-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          >
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="week">Next 7 days</option>
            <option value="all">All</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-neutral-500">Status</span>
          <select
            name="status"
            defaultValue={status ?? "any"}
            className="mt-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          >
            <option value="any">Any</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked_in">Checked in</option>
            <option value="completed">Completed</option>
            <option value="no_show">No-show</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <label className="block grow">
          <span className="text-xs text-neutral-500">Booking code</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="DHK-20261201-0007"
            className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Apply
        </button>
      </form>

      <p className="mt-4 text-xs text-neutral-500">
        {total} {total === 1 ? t.booking.toLowerCase() : t.bookingPlural.toLowerCase()} · times in{" "}
        {member.timezone}
      </p>

      {bookings.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Nothing here. Try a wider date range.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {bookings.map((booking) => {
            const customer = booking.customers as unknown as {
              full_name: string;
              phone: string;
              no_show_count: number;
            } | null;
            const service = booking.services as unknown as { name: string } | null;
            const provider = booking.staff_resources as unknown as { name: string } | null;

            return (
              <li key={booking.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-sm font-medium">
                    {time.format(new Date(booking.start_time))}
                    <span className="ml-2 font-mono text-xs text-neutral-500">
                      {booking.booking_code}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm">
                    {customer?.full_name ?? "—"}
                    {customer?.phone ? (
                      <span className="text-neutral-500">
                        {" "}
                        · {formatPhoneForDisplay(customer.phone)}
                      </span>
                    ) : null}
                    {/* Defect M-07: this number was always zero, so a serial
                        no-show read as reliable. A trigger maintains it now. */}
                    {customer && customer.no_show_count > 0 ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                        {customer.no_show_count} no-show
                        {customer.no_show_count === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {service?.name ?? "—"} · {provider?.name ?? "—"} ·{" "}
                    <StatusBadge status={booking.status} />
                    {booking.booking_source !== "online" ? ` · ${booking.booking_source}` : null}
                    {booking.total_price > 0 ? ` · ${money.format(booking.total_price)}` : null}
                  </p>
                </div>
                <div className="sm:self-center">
                  <StatusActions bookingId={booking.id} status={booking.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > pageSize ? (
        <nav className="mt-6 flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page === 1} params={params} label="Previous" />
          <span className="text-xs text-neutral-500">
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
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace("_", " ");
  return <span className="font-medium capitalize">{label}</span>;
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
  if (disabled) return <span className="text-neutral-300 dark:text-neutral-700">{label}</span>;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  query.set("page", String(page));

  return (
    <Link href={`/app/bookings?${query.toString()}`} className="underline underline-offset-4">
      {label}
    </Link>
  );
}
