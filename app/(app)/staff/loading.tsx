import { PageShell } from "@/components/ui/page";
import { SkeletonHeader, SkeletonList } from "@/components/ui/skeleton";

export default function StaffPortalLoading() {
  return (
    <PageShell>
      <SkeletonHeader />
      <div className="mt-8">
        <SkeletonList rows={6} />
      </div>
    </PageShell>
  );
}
