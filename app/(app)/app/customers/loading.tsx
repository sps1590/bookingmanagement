import { PageShell } from "@/components/ui/page";
import { SkeletonHeader, SkeletonList } from "@/components/ui/skeleton";

export default function CustomersLoading() {
  return (
    <PageShell>
      <SkeletonHeader />
      <div className="mt-8">
        <SkeletonList rows={8} />
      </div>
    </PageShell>
  );
}
