"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCount } from "@/src/util/format";

// The raw layer's ONE table pager (user, 2026-08-14 — "add a bottom row with pagination", the
// anchor log and the signer groups alike): a quiet flex-none strip under a table, range left,
// ‹ page / pages › right — the RailPager's chevron idiom at table scale. Renders nothing for a
// single page, so a short table stays a table. Page arithmetic lives with the caller (each
// table owns its slice); this is only the strip.
export default function TablePager({
  page,
  pages,
  from,
  to,
  total,
  scope,
  compact = false,
  onPage,
}: {
  page: number; // 1-based
  pages: number;
  from: number; // 1-based row range of the current slice
  to: number;
  total: number;
  /** The honest scope of a windowed count, as ONE dotted-underlined word after the total whose
   *  `title` carries the explanation (user, 2026-09-02: the spelled-out "in window — pick a
   *  network…" line was "too long text" standing under the table on every render — the scope is
   *  a qualifier read once, not a sentence read 25 times). The dotted underline is the standard
   *  there-is-more affordance at the strip's own weight.
   *
   *  ⚠️ THE WORD IS PLAIN LANGUAGE, NEVER THE MECHANISM'S NAME (user, 2026-09-13: "held"/"window"
   *  — "no human understands this"). It reads directly after a number, so it must complete the
   *  sentence a reader is already forming — "501 recent", not "501 window". Both consumers say
   *  "recent", deliberately: the qualifier is one idea (this is not the whole chain) and is
   *  learned once; only the `title` differs, because the way to see more differs per surface. */
  scope?: { word: string; title: string };
  /** RAIL WIDTH (2026-09-13, the Snapshots explorer's pager). The strip was drawn for a raw-layer
   *  table with hundreds of pixels to spend; in a ~264px rail card the range words and the
   *  four-button cluster fought for the same line and "1 / 4" wrapped onto two. Compact keeps
   *  the exact same strip and drops what a peephole doesn't need: the first/last jumps (there
   *  is no genesis to leap to inside a live buffer) and the row range (the rows are right
   *  there). The total and its scope word stay — they are the honest statement of how much
   *  there is and how far it reaches. */
  compact?: boolean;
  onPage: (p: number) => void;
}) {
  // The scope term's explanation must be REACHABLE ON TOUCH (2026-09-03, the phone review's
  // tooltip item): a `title` needs a hover, which a phone does not have — so the term is a
  // BUTTON that toggles the same sentence as a micro line under the strip. Desktop keeps the
  // hover tooltip and gains the click as a second route; the line dismisses on re-tap.
  const [explain, setExplain] = useState(false);
  if (pages <= 1 && !scope) return null;
  const btn =
    "inline-flex items-center justify-center size-5 rounded-xs cursor-pointer text-muted-foreground " +
    "hover:text-foreground hover:bg-wash-faint disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]";
  return (
    <div className="flex-none pt-1.5">
      <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-micro tracking-caps uppercase tabular-nums text-muted-foreground">
        {compact ? fmtCount(total) : `${from}–${to} of ${fmtCount(total)}`}
        {scope ? (
          <>
            {" · "}
            <button
              type="button"
              aria-expanded={explain}
              onClick={() => setExplain((e) => !e)}
              className="underline decoration-dotted decoration-border underline-offset-2 cursor-help uppercase tracking-caps text-micro text-muted-foreground hover:text-foreground p-0 bg-transparent border-0"
              title={scope.title}
            >
              {scope.word}
            </button>
          </>
        ) : null}
      </span>
      <span className="inline-flex flex-none items-center gap-1">
        {/* First/last jumps (user, 2026-08-14 — "I want to see the genesis block; now I have to
            go page by page"): the standard « ‹ › » cluster. The last page IS genesis in the
            history mode, one jump deep now that pages are ordinal-addressed. */}
        {!compact && (
          <button type="button" className={btn} aria-label="First page" disabled={page <= 1} onClick={() => onPage(1)}>
            <ChevronsLeft aria-hidden className="size-3.5" />
          </button>
        )}
        <button type="button" className={btn} aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden className="size-3.5" />
        </button>
        <span className={cn("text-micro tabular-nums text-muted-foreground whitespace-nowrap")}>
          {page} / {fmtCount(pages)}
        </span>
        <button type="button" className={btn} aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight aria-hidden className="size-3.5" />
        </button>
        {!compact && (
          <button type="button" className={btn} aria-label="Last page" disabled={page >= pages} onClick={() => onPage(pages)}>
            <ChevronsRight aria-hidden className="size-3.5" />
          </button>
        )}
      </span>
      </div>
      {explain && scope && (
        <p className="m-0 pt-1 text-micro text-muted-foreground max-w-[52ch]">{scope.title}</p>
      )}
    </div>
  );
}
