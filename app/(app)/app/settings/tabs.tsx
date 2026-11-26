"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

/**
 * The settings sections, as tabs that show which one you are on.
 *
 * They were four identical underlined links before, so the only way to know
 * where you were was to read the page below them. Scrollable rather than
 * wrapped, because on a narrow phone a wrapped row pushes the actual settings
 * off the bottom of the screen.
 */
export function SettingsTabs({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="border-border mt-6 border-b">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
