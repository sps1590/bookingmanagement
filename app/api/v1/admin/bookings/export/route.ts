import * as XLSX from "xlsx";
import { z } from "zod";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { parseQuery, route } from "@/lib/api/handler";
import { DESK, requireRole } from "@/lib/auth/require-role";
import { formatPhoneForDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { addDays, zonedDayStart } from "@/lib/time/zone";

/**
 * `GET /api/v1/admin/bookings/export?format=csv|xlsx`
 *
 * Takes the same filters as the list screen, so what you see is what you
 * export — an export that silently applies different filters is how a clinic
 * ends up reconciling two different numbers for the same day.
 *
 * ## The BOM is not optional
 *
 * Excel on a Bangladeshi desktop opens a UTF-8 CSV in the system codepage
 * unless the file starts with a byte-order mark, and Bangla customer names
 * come out as mojibake. The receptionist's conclusion is that the software
 * mangled their data. One three-byte prefix prevents it.
 *
 * ## No PDF library
 *
 * The plan suggests `@react-pdf/renderer` for the daily sheet. The print view
 * at `/app/bookings/print` does the same job through the browser's own print
 * dialogue — correct A4, real fonts including Bangla, and no dependency
 * rendering text it does not have the glyphs for.
 */

/** Streaming is pointless under this; past it the answer is a scheduled job. */
const MAX_ROWS = 10_000;

const querySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z
    .enum(["pending", "confirmed", "checked_in", "completed", "cancelled", "no_show"])
    .optional(),
  staffId: z.uuid().optional(),
});

export const GET = route("admin.bookings.export", async (request: Request) => {
  const member = await requireRole(request, DESK);
  const query = parseQuery(request, querySchema);

  const supabase = await createClient();

  let q = supabase
    .from("bookings")
    .select(
      `booking_code, status, payment_status, booking_source, start_time, end_time,
       total_price, paid_amount,
       customers (full_name, phone),
       services (name),
       staff_resources (name)`,
    )
    .eq("business_id", member.businessId);

  if (query.from) q = q.gte("start_time", zonedDayStart(query.from, member.timezone).toISOString());
  if (query.to)
    q = q.lt("start_time", zonedDayStart(addDays(query.to, 1), member.timezone).toISOString());
  if (query.status) q = q.eq("status", query.status);
  if (query.staffId) q = q.eq("staff_id", query.staffId);

  const { data, error } = await q.order("start_time").limit(MAX_ROWS + 1);
  if (error) throw error;

  if ((data?.length ?? 0) > MAX_ROWS) {
    throw new ApiError(
      ErrorCode.VALIDATION_FAILED,
      `That is more than ${MAX_ROWS.toLocaleString()} rows. Narrow the date range and try again.`,
    );
  }

  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: member.timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const rows = (data ?? []).map((booking) => ({
    Code: booking.booking_code,
    When: when.format(new Date(booking.start_time)),
    Customer: (booking.customers as unknown as { full_name: string } | null)?.full_name ?? "",
    Phone: (() => {
      const phone = (booking.customers as unknown as { phone: string } | null)?.phone;
      return phone ? formatPhoneForDisplay(phone) : "";
    })(),
    Service: (booking.services as unknown as { name: string } | null)?.name ?? "",
    With: (booking.staff_resources as unknown as { name: string } | null)?.name ?? "",
    Status: booking.status.replace("_", " "),
    Source: booking.booking_source,
    Price: Number(booking.total_price ?? 0),
    Paid: Number(booking.paid_amount ?? 0),
    Payment: booking.payment_status,
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${member.slug}-bookings-${stamp}`;

  if (query.format === "csv") {
    const sheet = XLSX.utils.json_to_sheet(rows);
    // ﻿ — without it Excel reads the file in the system codepage and
    // every Bangla name becomes mojibake.
    const body = "﻿" + XLSX.utils.sheet_to_csv(sheet);

    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);

  sheet["!cols"] = [
    { wch: 20 },
    { wch: 17 },
    { wch: 24 },
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];
  // Freeze the header, so scrolling a thousand rows does not lose which
  // column is which.
  sheet["!freeze"] = { xSplit: "0", ySplit: "1" };

  XLSX.utils.book_append_sheet(workbook, sheet, "Bookings");

  // A second sheet recording what was asked for. A spreadsheet that circulates
  // by email without its filters is a spreadsheet somebody will misread.
  const filters = XLSX.utils.json_to_sheet([
    { Field: "Business", Value: member.businessName },
    { Field: "Exported", Value: new Date().toISOString() },
    { Field: "Timezone", Value: member.timezone },
    { Field: "From", Value: query.from ?? "(no limit)" },
    { Field: "To", Value: query.to ?? "(no limit)" },
    { Field: "Status", Value: query.status ?? "any" },
    { Field: "Rows", Value: rows.length },
  ]);
  filters["!cols"] = [{ wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, filters, "Filters");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
