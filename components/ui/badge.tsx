import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
  {
   variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground ring-border",
      brand: "bg-accent text-accent-foreground ring-primary/20",
      success: "bg-success/12 text-success ring-success/25",
      warning: "bg-warning/15 text-warning-foreground ring-warning/35 dark:text-warning",
      danger: "bg-destructive/10 text-destructive ring-destructive/25",
    },
   },
   defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
   <span className={cn(badgeVariants({ tone, className }))} {...props}>
    {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
    {children}
   </span>
  );
}

/**
 * A booking's status, in the one vocabulary the whole product uses.
 *
 * The statuses were previously printed raw — `no_show` with its underscore,
 * `checked_in` in lower case — and coloured nowhere, so a cancelled
 * appointment and a completed one looked identical in a list of forty. Colour
 * is never the only signal: the word is always there, because about one man
 * in twelve cannot rely on the hue alone.
 */
const STATUS: Record<string, { label: string; tone: VariantProps<typeof badgeVariants>["tone"] }> =
  {
   pending: { label: "Awaiting approval", tone: "warning" },
   confirmed: { label: "Confirmed", tone: "brand" },
   checked_in: { label: "Checked in", tone: "success" },
   in_progress: { label: "In progress", tone: "success" },
   completed: { label: "Completed", tone: "success" },
   cancelled: { label: "Cancelled", tone: "danger" },
   no_show: { label: "No show", tone: "danger" },
   rescheduled: { label: "Rescheduled", tone: "neutral" },
   expired: { label: "Expired", tone: "neutral" },
  };

export function statusLabel(status: string): string {
  return STATUS[status]?.label ?? status.replace(/_/g, " ");
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const known = STATUS[status];
  return (
   <Badge tone={known?.tone ?? "neutral"} dot className={className}>
    {known?.label ?? status.replace(/_/g, " ")}
   </Badge>
  );
}
