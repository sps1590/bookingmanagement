import { PageShell } from "@/components/ui/page";
import { Skeleton, SkeletonHeader, SkeletonStats } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <PageShell>
      <SkeletonHeader />
      <div className="mt-8">
        <SkeletonStats />
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </PageShell>
  );
}
