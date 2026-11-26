import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";

import { ConsoleBottomNav, ConsoleSidebarNav, type NavItem } from "@/components/app/console-nav";
import { CopyLink } from "@/components/app/copy-link";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { signOut } from "@/lib/auth/actions";
import { requireMember } from "@/lib/auth/session";
import { clientEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * The console shell.
 *
 * Until this existed the application had no navigation at all. The dashboard
 * ended in a column of underlined links; every other screen was a cul-de-sac
 * you left with the browser's back button, and there was no way to sign out
 * of a shared reception computer short of clearing cookies.
 *
 * The nav is in the tenant's own vocabulary — a dentist's rail says Patients,
 * a salon's says Clients — which costs one lookup here and makes the whole
 * product read as if it were built for whoever is using it.
 *
 * Settings is shown only to an owner or manager. That is a courtesy and never
 * a control: the settings layout checks the role again, and every action
 * behind it checks a third time, because a hidden link is not a permission.
 *
 * During onboarding the shell steps aside. A business with no services and no
 * hours has nothing to navigate to, and offering six dead sections while
 * someone is three fields into setting up is worse than offering none.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();

  if (!member.onboardingComplete) {
    return <div className="bg-background min-h-dvh">{children}</div>;
  }

  const t = member.terminology;
  const admin = member.role === "owner" || member.role === "manager";
  const bookingUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/book/${member.slug}`;

  const items: NavItem[] = [
    { href: "/app", label: "Dashboard", short: "Today", icon: "dashboard" },
    { href: "/app/calendar", label: "Diary", short: "Diary", icon: "calendar" },
    { href: "/app/bookings", label: t.bookingPlural, short: "List", icon: "bookings" },
    { href: "/app/customers", label: t.customerPlural, short: t.customer, icon: "customers" },
    { href: "/app/analytics", label: "Analytics", short: "Stats", icon: "analytics" },
    ...(admin
      ? [{ href: "/app/settings", label: "Settings", short: "Setup", icon: "settings" } as NavItem]
      : []),
  ];

  return (
    <div className="bg-background min-h-dvh md:flex">
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r md:flex">
        <div className="px-4 pt-5 pb-4">
          <Link href="/app" className="flex items-center gap-2">
            <span
              className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg text-sm font-bold"
              aria-hidden
            >
              {member.businessName.trim().charAt(0).toUpperCase() || "B"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{member.businessName}</span>
              <span className="text-muted-foreground block font-mono text-[0.65rem] tracking-wider">
                {member.businessCode}
              </span>
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          <ConsoleSidebarNav items={items} />
        </div>

        <div className="border-sidebar-border space-y-1 border-t p-3">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            <ExternalLink className="size-4 shrink-0" aria-hidden />
            Booking page
          </a>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="bg-background/85 border-border sticky top-0 z-30 border-b backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
            <div className="min-w-0 flex-1 md:hidden">
              <p className="truncate text-sm font-semibold">{member.businessName}</p>
              <p className="text-muted-foreground font-mono text-[0.65rem] tracking-wider">
                {member.businessCode} · {member.role}
              </p>
            </div>
            <p className="text-muted-foreground hidden flex-1 text-xs md:block">
              Signed in as <span className="text-foreground font-medium">{member.role}</span> ·
              times shown in {member.timezone}
            </p>
            <CopyLink value={bookingUrl} label="Booking link" className="hidden sm:inline-flex" />
            <ThemeToggle />
            <form action={signOut} className="md:hidden">
              <button
                type="submit"
                aria-label="Sign out"
                className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 place-items-center rounded-lg transition-colors"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </header>

        <main className="pb-20 md:pb-0">{children}</main>
      </div>

      <ConsoleBottomNav items={items} />
    </div>
  );
}
