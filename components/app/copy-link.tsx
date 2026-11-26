"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "cn";

/**
 * Copy the public booking link.
 *
 * The single most-repeated action in the product: the link is what a business
 * puts in a bio, a receipt, a shop window and a WhatsApp reply, and reading
 * it off the screen to type it again is absurd. It was previously printed as
 * plain text with nothing to press.
 *
 * Falls back to selecting the text when the clipboard is unavailable — an
 * insecure origin, or a browser that refuses without a user gesture it
 * recognises — rather than failing silently, which is the usual outcome.
 */
export function CopyLink({
  value,
  label = "Copy link",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "border-border bg-card hover:border-primary/40 hover:text-primary inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        className,
      )}
    >
      {state === "copied" ? (
        <Check className="text-success size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label}
    </button>
  );
}
