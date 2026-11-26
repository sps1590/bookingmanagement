import { PageShell } from "@/components/ui/page";
import { SkeletonHeader, SkeletonList } from "@/components/ui/skeleton";

/** The list screen: a title block, the filter row, and rows. */
export default function BookingsLoading() {
  return (
    <PageShell>
      <SkeletonHeader />
      <div className="mt-8">
        <SkeletonList rows={8} />
      </div>
    </PageShell>
  );
}
