import { Skeleton } from "@/components/ui/skeleton";

/**
 * The portal while it is being generated.
 *
 * Normally nobody sees this: the page is cached, so it is served complete.
 * This is the first visit after a deploy or a revalidation — and a customer
 * arriving from a shared link deserves the shape of a booking page rather
 * than a blank tab.
 */
export default function BookingPortalLoading() {
  return (
    <div className="from-background via-background to-accent/40 min-h-dvh bg-gradient-to-b">
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col items-center">
          <Skeleton className="size-12 rounded-2xl" />
          <Skeleton className="mt-4 h-8 w-56" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
        <div className="mt-10 space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="mt-6 h-4 w-28" />
          <Skeleton className="h-12 rounded-xl" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
