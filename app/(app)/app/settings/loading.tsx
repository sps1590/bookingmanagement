import { SkeletonForm } from "@/components/ui/skeleton";

/**
 * Below the settings tabs, which are in the layout and so stay on screen.
 * Switching tabs now moves the underline at once and fills in underneath,
 * rather than leaving the old tab's content sitting under the new tab's
 * highlight.
 */
export default function SettingsLoading() {
  return (
    <div className="mt-8 space-y-6">
      <SkeletonForm fields={4} />
      <SkeletonForm fields={2} />
    </div>
  );
}
