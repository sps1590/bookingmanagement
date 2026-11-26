import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";

import { ConsoleBottomNav, ConsoleSidebarNav, type NavItem } from "@/components/app/console-nav";
import { CopyLink } from "@/components/app/copy-link";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { signOut } from "@/lib/auth/actions";
import { requireMember } from "@/lib/auth/session";
import { clientEnv } from "@/lib/env";

/**
 * The console shell.
 *
 * Until this existed the application had no navigation at all. The dashboard
 * ended in a column of underlined links; every other screen was a cul-de-sac
 * you left with the browser's back button, and there was no way to sign out
 * of a shared reception computer short of clearing cookies.
 *
 * ## Why the frame is static and its contents are not
 *
 * Under Cache Components this file is prerendered: the rail, the topbar and
 * the main column are built once at deploy time and served immediately,
 * before anything has been read from the database. Everything that identifies
 * *which* tenant — the business name, its code, the navigation labels, the
 * role, the timezone — comes from `requireMember()`, which reads the session
 * cookie, so it lives inside a `<Suspense>` boundary and streams in behind
 * the frame.
 *
 * Each boundary calls `requireMember()` itself rather than taking it as a
 * prop. That looks wasteful and is not: the lookup is wrapped in `cache()`,
 * so the whole request shares one call. Passing props would mean awaiting it
 * out here, which is precisely what would stop the frame being static.
 *
 * The nav is in the tenant's own vocabulary — a dentist's rail says Patients,
 * a salon's says Clients — which is why `items` cannot be built out here.
 *
 * Settings is shown only to an owner or manager. That is a courtesy and never
 * a control: the settings layout checks the role again, and every action
 * behind it checks a third time, because a hidden link is not a permission.
 *
 * The onboarding wizard is deliberately not under this layout. A business
 * with no services and no hours has nothing to navigate to, and offering six
 * dead sections to someone three fields into setting up is worse than
 * offering none. That used to be done by returning a different tree from here
 * when onboarding was unfinished — which cannot be prerendered, because the
 * shape of the shell depended on the data. It has its own route group now:
 * `app/(app)/(wizard)/app/onboarding`.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-dvh md:flex">
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r md:flex">
        <div className="px-4 pt-5 pb-4">
          <Suspense fallback={<BrandSkeleton />}>
            <Brand />
          </Suspense>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          <Suspense fallback={<NavSkeleton />}>
            <SidebarNav />
          </Suspense>
        </div>

        <div className="border-sidebar-border space-y-1 border-t p-3">
          <Suspense fallback={<Skeleton className="h-9 rounded-lg" />}>
            <BookingPageLink />
          </Suspense>
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
            <Suspense fallback={<TopbarSkeleton />}>
              <TopbarIdentity />
            </Suspense>
            <Suspense fallback={null}>
              <TopbarBookingLink />
            </Suspense>
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

      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}

/**
 * The sections this member may see, in this tenant's own words.
 *
 * Shared by the rail and the bottom bar. Both call it; the session lookup is
 * request-scoped, so the second call costs nothing.
 */
async function navItems(): Promise<NavItem[]> {
  const member = await requireMember();
  const t = member.terminology;
  const admin = member.role === "owner" || member.role === "manager";

  return [
    { href: "/app", label: "Dashboard", short: "Today", icon: "dashboard" },
    { href: "/app/calendar", label: "Diary", short: "Diary", icon: "calendar" },
    { href: "/app/bookings", label: t.bookingPlural, short: "List", icon: "bookings" },
    { href: "/app/customers", label: t.customerPlural, short: t.customer, icon: "customers" },
    { href: "/app/analytics", label: "Analytics", short: "Stats", icon: "analytics" },
    ...(admin
      ? [{ href: "/app/settings", label: "Settings", short: "Setup", icon: "settings" } as NavItem]
      : []),
  ];
}

async function Brand() {
  const member = await requireMember();

  return (
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
  );
}

function BrandSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-7 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    </div>
  );
}

async function SidebarNav() {
  return <ConsoleSidebarNav items={await navItems()} />;
}

function NavSkeleton() {
  return (
    <div className="space-y-0.5" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-9 rounded-lg" />
      ))}
    </div>
  );
}

async function BottomNav() {
  return <ConsoleBottomNav items={await navItems()} />;
}

async function BookingPageLink() {
  const member = await requireMember();

  return (
    <a
      href={`${clientEnv.NEXT_PUBLIC_APP_URL}/book/${member.slug}`}
      target="_blank"
      rel="noreferrer"
      className="text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
    >
      <ExternalLink className="size-4 shrink-0" aria-hidden />
      Booking page
    </a>
  );
}

async function TopbarIdentity() {
  const member = await requireMember();

  return (
    <>
      <div className="min-w-0 flex-1 md:hidden">
        <p className="truncate text-sm font-semibold">{member.businessName}</p>
        <p className="text-muted-foreground font-mono text-[0.65rem] tracking-wider">
          {member.businessCode} · {member.role}
        </p>
      </div>
      <p className="text-muted-foreground hidden flex-1 text-xs md:block">
        Signed in as <span className="text-foreground font-medium">{member.role}</span> · times
        shown in {member.timezone}
      </p>
    </>
  );
}

function TopbarSkeleton() {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="h-2.5 w-24 md:hidden" />
    </div>
  );
}

async function TopbarBookingLink() {
  const member = await requireMember();

  return (
    <CopyLink
      value={`${clientEnv.NEXT_PUBLIC_APP_URL}/book/${member.slug}`}
      label="Booking link"
      className="hidden sm:inline-flex"
    />
  );
}
