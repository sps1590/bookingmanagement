import { cn } from "cn";

/**
 * The surface everything in the application sits on.
 *
 * One component rather than a `rounded-md border border-neutral-200` repeated
 * on forty screens, which is how a product ends up with four slightly
 * different cards and a dark mode that works on three of them.
 */
export function Card({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
   <div
    data-slot="card"
    className={cn(
      "bg-card text-card-foreground border-border/70 elevated rounded-xl border",
      interactive &&
       "hover:border-primary/40 focus-within:border-primary/50 transition-colors duration-150",
      className,
    )}
    {...props}
   />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-sm leading-relaxed", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
   <div
    className={cn("border-border/70 flex items-center gap-2 border-t px-5 py-3", className)}
    {...props}
   />
  );
}
