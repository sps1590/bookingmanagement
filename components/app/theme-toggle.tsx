"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "cn";

/**
 * Light, dark, or whatever the device says.
 *
 * The stylesheet has carried a full dark palette since the first commit and
 * nothing ever set the class, so every `dark:` rule in the product was dead
 * code and the application was permanently light — including on a phone at
 * night, which is when a receptionist actually looks at tomorrow's list.
 *
 * Three states rather than a switch, because "follow the device" is a real
 * preference and a two-way toggle silently overrides it the first time it is
 * touched. The choice is stored under `theme`; the inline script in the root
 * layout reads the same key before first paint, so there is no flash of the
 * wrong theme on reload.
 *
 * `useSyncExternalStore` rather than state filled in by an effect: the stored
 * preference lives in `localStorage`, which is external to React, cannot be
 * read while rendering on the server, and can be changed by this app in
 * another tab. That is the exact shape this hook exists for, and it keeps the
 * server's "system" and the browser's real answer from fighting over the
 * first render.
 */

type Theme = "light" | "dark" | "system";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab of this app, changed by the same person.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(): Theme {
  try {
    const raw = localStorage.getItem("theme");
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    // Private mode, or storage blocked. Following the device is the right
    // answer when we are not allowed to remember a different one.
    return "system";
  }
}

/** On the server there is no device to ask and no preference to read. */
function readOnServer(): Theme {
  return "system";
}

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, readOnServer);

  useEffect(() => {
    apply(theme);

    // Keep "system" honest while the page is open: a phone that switches to
    // dark at sunset should carry the application with it. The stored value
    // has not changed, so this is a repaint rather than a state change.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(theme);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function choose(next: Theme) {
    try {
      localStorage.setItem("theme", next);
    } catch {
      // The page still changes for this visit; it just will not be remembered.
    }
    apply(next);
    for (const listener of listeners) listener();
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const name = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  return (
    <button
      type="button"
      onClick={() => choose(NEXT[theme])}
      title={`Theme: ${name}. Click for ${NEXT[theme]}.`}
      aria-label={`Appearance: ${name}. Switch to ${NEXT[theme]}.`}
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 place-items-center rounded-lg transition-colors",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
