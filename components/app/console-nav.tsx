"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";

/**
 * The application's navigation.
 *
 * Before this there was none: the dashboard ended in a column of underlined
 * links, and every other screen was a dead end you left with the browser's
 * back button. A person running a clinic moves between the diary, the day's
 * list and a patient's record dozens of times an hour.
 *
 * Two renderings of one list. A rail on a desktop, where there is room for it
 * to be permanently visible, and a bottom bar on a phone, where the thumb is
 * and where a hamburger would hide the whole product behind a tap. Neither
 * needs JavaScript to open, which is also why neither can be left open.
 *
 * `usePathname` rather than passing the active href down: the layout that
 * renders this is a Server Component and does not re-render on navigation, so
 * an active state computed there would be stale from the first click.
 */

const ICONS = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  bookings: ClipboardList,
  customers: Users,
  analytics: BarChart3,
  settings: Settings,
} as const;

export interface NavItem {
  href: string;
  label: string;
  /** Short enough for a 5-up bottom bar on a 360px screen. */
  short: string;
  icon: keyof typeof ICONS;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ConsoleSidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ConsoleBottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="bg-card/95 border-border fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 py-2.5 text-[0.65rem] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
