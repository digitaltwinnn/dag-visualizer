"use client";

import { cn } from "@/lib/utils";

// THE LEVEL LINE (design session 2026-09-26, `option-b-refined.html` 3a, then `quieter.html`):
// what an opened level CONTAINS, in one line — the axis as a caps eyebrow ("By composition",
// "By city · provider", "By network") and ONE muted clause of meaning beside it. No total: the
// parent row's figure is that number, and the heading row names its unit. One grammar at every
// depth of every card, so a reader who learned one level has learned them all.
//
// The meanings are stated where the level is rendered; the six in use are listed in the design
// README so the same axis never gets two sentences.

export default function ExplorerLevel({ axis, meaning, className }: { axis: string; meaning: string; className?: string }) {
  return (
    // One line where it fits (the design's drawing); in the 264px rail the meaning WRAPS under the
    // eyebrow rather than truncating — a clipped sentence explains nothing.
    <div className={cn("flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pb-1.5", className)}>
      <span className="flex-none text-micro tracking-caps uppercase font-bold text-muted-foreground">{axis}</span>
      <span className="min-w-0 text-label text-muted-foreground/80">{meaning}</span>
    </div>
  );
}
