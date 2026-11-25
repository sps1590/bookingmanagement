"use client";

import { useState } from "react";

import { INDUSTRIES, INDUSTRY_LABELS, terminologyFor, type Industry } from "@/lib/terminology";

/**
 * The terminology layer, shown rather than described.
 *
 * This is the one thing about the product that is hard to believe from a
 * sentence and obvious in two seconds of clicking: one codebase, and a
 * dentist's screens say Patient while a workshop's say Customer and
 * Technician. It reads from the same registry the real screens use, so this
 * demonstration cannot drift away from the product — add an industry and it
 * appears here.
 */
export function IndustrySwitcher() {
  const [industry, setIndustry] = useState<Industry>("dentist");
  const t = terminologyFor(industry);

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2">
        {INDUSTRIES.map((option) => {
          const active = option === industry;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setIndustry(option)}
              aria-pressed={active}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {INDUSTRY_LABELS[option]}
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-8 max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 truncate font-mono text-xs text-slate-400">
            /app · {INDUSTRY_LABELS[industry]}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          <Cell label="Your customers" value={t.customerPlural} />
          <Cell label="Your team" value={t.staffPlural} />
          <Cell label="A booking" value={t.booking} />
          <Cell label="Resources" value={t.resource} />
        </dl>

        <p className="bg-white px-5 py-4 text-sm text-slate-600">
          Every screen, email and reminder uses these words. Nothing is hardcoded, and you pick them
          once when you sign up.
        </p>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <dt className="text-[11px] tracking-wide text-slate-400 uppercase">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
