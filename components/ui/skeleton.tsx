import { cn } from "cn";

/**
 * Placeholders for content that has not arrived yet.
 *
 * Until these existed, clicking anything in the console produced no visible
 * change at all: the old screen sat there, fully interactive, while a server
 * component fetched on the other side of the world. People clicked twice.
 * They clicked a third time. The honest reading of "nothing happened" is that
 * nothing happened, and the interface was giving them no reason to think
 * otherwise.
 *
 * A skeleton is not decoration, and it is not a spinner — a spinner says
 * "wait", a skeleton says "here is the shape of what you asked for". Matching
 * the real layout matters for the same reason: when the data lands, the page
 * settles instead of jumping, because the boxes were already the right size.
 */

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("bg-muted motion-safe:animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

/** A few lines of fake prose. `width` tapers the last line so it reads as text. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          style={{ width: i === lines - 1 ? "60%" : `${92 - i * 7}%` }}
        />
      ))}
    </div>
  );
}

/** The title block every console screen opens with. */
export function SkeletonHeader() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-8 w-full max-w-sm" />
      <Skeleton className="h-3.5 w-full max-w-md" />
    </div>
  );
}

/** The row of figures on the dashboard and the analytics screen. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-card border-border/70 rounded-xl border px-4 py-3.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2.5 h-7 w-14" />
        </div>
      ))}
    </div>
  );
}

/**
 * A list of records. Sized to the real rows in the bookings and customers
 * screens, so the arrival of data does not move anything.
 */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-card border-border/70 overflow-hidden rounded-xl border">
      <div className="divide-border/70 divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Skeleton className="h-4 w-12 shrink-0" />
            <div className="min-w-0 grow space-y-2">
              <Skeleton className="h-3.5" style={{ width: `${55 - (i % 3) * 9}%` }} />
              <Skeleton className="h-3" style={{ width: `${38 - (i % 2) * 8}%` }} />
            </div>
            <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A settings card: a heading and a handful of fields. */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="bg-card border-border/70 grid gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <div className="sm:col-span-2">
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
    </div>
  );
}
