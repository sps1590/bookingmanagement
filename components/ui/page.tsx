import { cn } from "cn";

/**
 * The furniture every screen in the tenant application shares: a title block,
 * a section heading, a statistic, and something to say when there is nothing
 * to show.
 *
 * The empty state is the one worth arguing about. "No results" is a dead end;
 * a person looking at an empty diary on their first morning needs to know
 * what to do next, not that the array had length zero. So it takes an action.
 */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
   <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
    <div className="min-w-0">
      {eyebrow ? (
       <p className="text-muted-foreground mb-1.5 font-mono text-xs tracking-widest uppercase">
        {eyebrow}
       </p>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
      {description ? (
       <p className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed">
        {description}
       </p>
      ) : null}
    </div>
    {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
   </header>
  );
}

export function SectionHeading({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
   <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
    <div>
      <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
      {description ? (
       <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      ) : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
   </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "brand" | "success" | "warning";
}) {
  const accent = {
   default: "text-foreground",
   brand: "text-primary",
   success: "text-success",
   warning: "text-warning-foreground dark:text-warning",
  }[tone];

  return (
   <div className="bg-card border-border/70 elevated rounded-xl border px-4 py-3.5">
    <p className="text-muted-foreground text-xs font-medium tracking-wide">{label}</p>
    <p className={cn("tabular mt-1.5 text-2xl font-semibold tracking-tight", accent)}>{value}</p>
    {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
   </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
   <div
    className={cn(
      "border-border/80 bg-muted/30 flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center",
      className,
    )}
   >
    {icon ? (
      <div className="bg-accent text-accent-foreground mb-4 grid size-11 place-items-center rounded-full [&_svg]:size-5">
       {icon}
      </div>
    ) : null}
    <p className="font-medium">{title}</p>
    {description ? (
      <p className="text-muted-foreground mt-1.5 max-w-sm text-sm leading-relaxed">
       {description}
      </p>
    ) : null}
    {action ? <div className="mt-5">{action}</div> : null}
   </div>
  );
}

/** The page's own column. Every screen in the console uses the same one. */
export function PageShell({
  className,
  width = "wide",
  ...props
}: React.ComponentProps<"div"> & { width?: "wide" | "narrow" }) {
  return (
   <div
    className={cn(
      "mx-auto w-full px-4 py-8 sm:px-6 sm:py-10",
      width === "wide" ? "max-w-6xl" : "max-w-3xl",
      className,
    )}
    {...props}
   />
  );
}
