import Link from "next/link";
import { CalendarCheck } from "lucide-react";

/**
 * The frame around signing in and signing up.
 *
 * Centred on a tinted field rather than flat white, with the form on a raised
 * card: on a phone in a bright room the old version was a few inputs floating
 * on the page with nothing to say where the form began or ended.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="from-background via-background to-accent/40 flex min-h-dvh flex-col bg-gradient-to-b">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <span
            className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg"
            aria-hidden
          >
            <CalendarCheck className="size-4" />
          </span>
          Booking Management
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <div className="bg-card border-border/70 elevated rounded-2xl border p-6 sm:p-8">
          {children}
        </div>
      </main>
      <footer className="text-muted-foreground px-6 py-6 text-center text-xs">
        Your data stays inside your business. We never show a customer anyone else&rsquo;s details.
      </footer>
    </div>
  );
}
