import { PageShell } from "@/components/ui/page";
import { SkeletonHeader, SkeletonList, SkeletonStats } from "@/components/ui/skeleton";

/**
 * What the console shows between the click and the data.
 *
 * This file is why navigation feels immediate. Without it Next.js has nothing
 * to render while a server component fetches, so it keeps the previous screen
 * on display — and clicking a nav item appeared to do nothing for as long as
 * the round trip took. The rail and the topbar live in the layout above, so
 * they stay put; only the column of content is replaced.
 *
 * It earns its keep a second time: a dynamic route is only prefetched as far
 * as its nearest loading boundary, so adding one lets the router fetch each
 * screen's shell while the pointer is still on its way to the link.
 */
export default function ConsoleLoading() {
  return (
    <PageShell>
      <SkeletonHeader />
      <div className="mt-8">
        <SkeletonStats />
      </div>
      <div className="mt-10">
        <SkeletonList rows={5} />
      </div>
    </PageShell>
  );
}
