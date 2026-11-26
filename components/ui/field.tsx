import { cn } from "cn";

/**
 * Form furniture.
 *
 * Exported as class strings as well as components, because several screens
 * build their inputs inside `map` over a day of the week or a list of
 * services and a wrapper there would cost more than it saves.
 *
 * `h-10` rather than the button's `h-8`: these are typed into on a phone at a
 * reception desk, and a 32px target is below every published guideline for a
 * finger.
 */
export const inputClass =
  "block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-10";

export const labelClass = "block text-sm font-medium text-foreground";

export const hintClass = "text-xs text-muted-foreground";

export function Field({
  label,
  hint,
  htmlFor,
  required,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
   <div className={cn("space-y-1.5", className)}>
    <label className={labelClass} htmlFor={htmlFor}>
      {label}
      {required ? (
       <span className="text-destructive ml-0.5" aria-hidden>
        *
       </span>
      ) : null}
    </label>
    {children}
    {hint ? <p className={hintClass}>{hint}</p> : null}
   </div>
  );
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "min-h-20 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(inputClass, "pr-8", className)} {...props} />;
}

/**
 * The two message boxes a form can show. Both carry a live region, because a
 * screen reader user who submits a form and hears nothing assumes it hung.
 */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
   <p
    role="alert"
    className="bg-destructive/10 text-destructive ring-destructive/20 rounded-lg px-3 py-2 text-sm ring-1 ring-inset"
   >
    {children}
   </p>
  );
}

export function FormSuccess({ children }: { children: React.ReactNode }) {
  return (
   <p
    role="status"
    className="bg-success/12 text-success ring-success/20 rounded-lg px-3 py-2 text-sm ring-1 ring-inset"
   >
    {children}
   </p>
  );
}
