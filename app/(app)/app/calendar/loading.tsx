import { PageShell } from "@/components/ui/page";
import { Skeleton, SkeletonHeader } from "@/components/ui/skeleton";

/** The diary. One tall column per provider, which is what lands. */
export default function CalendarLoading() {
  return (
    <PageShell>
      <SkeletonHeader />
      <div className="mt-8 flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="min-w-40 grow space-y-2">
            <Skeleton className="h-9 rounded-lg" />
            <Skeleton className="h-[26rem] rounded-xl" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
