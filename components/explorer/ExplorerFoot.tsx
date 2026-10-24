"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// THE PLATE FOOT'S ONE RECIPE (review, 2026-10-24): every explorer card and every raw-layer table
// ends in a foot that states what the list is a reading OF — a caps-word statement at the left
// (the live atom, a span, a cache window, a row range with its scope word) and, at the right,
// either a reading (a caps word and its figure), a page cluster, or a qualifier chip. `LiveFoot`
// composes it for the two live lists; `TablePager` composes it for every paged one, so a card with
// one page and a card with fifty end the same way. `below` is the pager's explanation line.
export default function ExplorerFoot({
  left,
  reading,
  right,
  below,
  className,
}: {
  /** The left statement — a caps-word phrase, with its mark when it has one. */
  left: ReactNode;
  /** The right reading: the caps word and its formatted figure. */
  reading?: { word: string; figure: ReactNode } | null;
  /** Anything else at the right — a page cluster, a qualifier chip. Drawn after `reading`. */
  right?: ReactNode;
  /** A line under the row (the pager's scope explanation). */
  below?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-none pt-1.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 min-w-0 min-h-6 text-label tracking-caps uppercase text-muted-foreground">{left}</span>
        {(reading || right) && (
          <span className="inline-flex flex-none items-center gap-3">
            {reading && (
              <span className="inline-flex items-baseline gap-1.5 text-label tracking-caps uppercase text-muted-foreground tabular-nums">
                {reading.word}
                <span className="font-mono text-body font-bold normal-case tracking-normal text-foreground">{reading.figure}</span>
              </span>
            )}
            {right}
          </span>
        )}
      </div>
      {below}
    </div>
  );
}
