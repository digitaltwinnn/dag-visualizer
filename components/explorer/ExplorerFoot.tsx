"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// THE PLATE FOOT'S ONE RECIPE (review, 2026-10-24): every explorer card ends in a foot that states
// what the list is a reading OF — a caps word at the left (the live atom, a span, a cache window)
// and, where the list has one, a reading at the right as a caps word and a figure. `LiveFoot`
// composes it for the two live lists; the pagers draw the same row for a paged one.
export default function ExplorerFoot({
  left,
  reading,
  className,
}: {
  /** The left statement — a caps-word phrase, with its mark when it has one. */
  left: ReactNode;
  /** The right reading: the caps word and its formatted figure. */
  reading?: { word: string; figure: ReactNode } | null;
  className?: string;
}) {
  return (
    <div className={cn("flex-none pt-1.5 flex items-center justify-between gap-3", className)}>
      <span className="inline-flex items-center gap-1.5 min-h-6 text-label tracking-caps uppercase text-muted-foreground">{left}</span>
      {reading && (
        <span className="inline-flex items-baseline gap-1.5 text-label tracking-caps uppercase text-muted-foreground tabular-nums">
          {reading.word}
          <span className="font-mono text-body font-bold normal-case tracking-normal text-foreground">{reading.figure}</span>
        </span>
      )}
    </div>
  );
}
