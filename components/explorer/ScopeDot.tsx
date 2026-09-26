"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// THE HEAD'S SCOPE MARK (design session 2026-09-26, `option-b-refined.html` 1b): when a network is
// committed, the explorer's title line carries its hue as an 8px dot with a soft 3px ring —
// nothing more. The top bar already names the network, the scene is tinted in it and the
// Metagraph card is boxed in it, so the head needs a mark, not a sentence. The × that releases the
// filter appears on hover of the dot (always on touch, where there is no hover), and goes through
// whatever release the caller wires — the one executor, never a setter.

export default function ScopeDot({
  hue,
  label,
  onRelease,
  className,
}: {
  hue: string;
  /** The committed network's name — the accessible name of the release, never shown. */
  label: string;
  onRelease: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onRelease}
      title={`Scoped to ${label} — click to show every network`}
      aria-label={`Scoped to ${label}. Clear the filter`}
      className={cn(
        "group/scope relative inline-flex size-5 items-center justify-center rounded-full cursor-pointer",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="block size-2 rounded-full transition-opacity duration-150 group-hover/scope:opacity-0 group-focus-visible/scope:opacity-0 [@media(hover:none)]:opacity-0"
        style={{ background: hue, boxShadow: `0 0 0 3px color-mix(in oklch, ${hue} 22%, transparent)` }}
      />
      <X
        aria-hidden
        className="absolute size-3 opacity-0 transition-opacity duration-150 group-hover/scope:opacity-100 group-focus-visible/scope:opacity-100 [@media(hover:none)]:opacity-100"
        style={{ color: hue }}
      />
    </button>
  );
}
