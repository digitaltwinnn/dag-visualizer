"use client";

import { filterAccent } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";
import { useStore } from "@/src/store/store";

// THE BEATING LIVE DOT — one home (2026-09-29; user: "when we have a filter, give the live
// indicator on the details card the color of the filter, just like we do in explorer"). It was the
// same class string in four places — the explorer's LIVE control, both snapshot cards' asides and
// the scene callout — and only the explorer tinted it, so a committed network beat in its hue on
// the left and in structural cyan on the right. The hue rule is the explorer's own: the committed
// network's identity hue, else the filter accent (cyan under "all").

/** The live hue under the committed filter — shared so a caller can tint a ring or wash alike. */
export function liveHue(filter: string): string {
  return displayNetwork(filter)?.hue ?? filterAccent(filter);
}

export default function LiveDot({ className }: { className?: string }) {
  const filter = useStore((s) => s.filter);
  const hue = liveHue(filter);
  return (
    <span
      aria-hidden
      className={"flex-none w-2 h-2 rounded-full animate-dot-beat motion-reduce:animate-none " + (className ?? "")}
      style={{ background: hue, boxShadow: `0 0 0 3px color-mix(in oklch, ${hue} 30%, transparent)` }}
    />
  );
}
