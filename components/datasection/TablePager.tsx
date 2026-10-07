"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, TOUCH_HIT } from "@/lib/utils";
import { fmtCount } from "@/src/util/format";
import { NodeStars } from "@/components/state/StateAtoms";

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
  exact = false,
  totalPending = false,
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
   *  learned once; only the `title` differs, because the way to see more differs per surface.
   *
   *  A scope WITHOUT a `title` is a plain label (user, 2026-10-03, on the Snapshots explorer's
   *  "last 12 min": "remove the explanatory text section") — no button, no dotted underline, no
   *  line under the strip. The span is a fact a reader can use; how the explorer holds it is not. */
  scope?: { word: string; title?: string };
  /** RAIL WIDTH (2026-09-13, the Snapshots explorer's pager). The strip was drawn for a raw-layer
   *  table with hundreds of pixels to spend; in a ~264px rail card the range words and the
   *  four-button cluster fought for the same line and "1 / 4" wrapped onto two. Compact keeps
   *  the exact same strip and drops what a peephole doesn't need: the first/last jumps (there
   *  is no genesis to leap to inside a live buffer) and the row range (the rows are right
   *  there). The total and its scope word stay — they are the honest statement of how much
   *  there is and how far it reaches. */
  compact?: boolean;
  /** Write the total out in full ("of 4,812,331") — the anchor log's count is an answer, not an
   *  estimate (user, 2026-10-07: "I care about actual real totals"). */
  exact?: boolean;
  /** The total is still being counted: its slot twinkles (`NodeStars` — a value arriving). */
  totalPending?: boolean;
  onPage: (p: number) => void;
}) {
  // The scope term's explanation must be REACHABLE ON TOUCH (2026-09-03, the phone review's
  // tooltip item): a `title` needs a hover, which a phone does not have — so the term is a
  // BUTTON that toggles the same sentence as a micro line under the strip. Desktop keeps the
  // hover tooltip and gains the click as a second route; the line dismisses on re-tap.
  const [explain, setExplain] = useState(false);
  if (pages <= 1 && !scope) return null;
  // The chevrons are shadcn `Button`s on the ghost recipe — the one hover every icon control shares
  // (button.tsx) — so this names only what is local: the box and the muted rest ink.
  const btn = cn("size-6 rounded-xs text-muted-foreground disabled:opacity-30", TOUCH_HIT);
  return (
    <div className="flex-none pt-1.5">
      <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-label tracking-caps uppercase tabular-nums text-muted-foreground">
        {/* A compact pager WITH a scope states the scope alone (2026-09-28, user on the snapshot
            explorer's "52 · last 11 min": "remove the 52 — the time is what matters, 52 has no real
            meaning here"). The count stays wherever it is the statement (the full pager's range). */}
        {compact && scope ? null : totalPending ? (
          <span className="inline-flex items-center gap-1.5">{compact ? null : `${from}–${to} of `}<NodeStars count={3} /></span>
        ) : compact ? fmtCount(total) : exact ? `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}` : `${from}–${to} of ${fmtCount(total)}`}
        {scope ? (
          <>
            {compact ? null : " "}
            {!scope.title ? (
              <span className="inline-flex items-center min-h-6">{scope.word}</span>
            ) : (
            <button
              type="button"
              aria-expanded={explain}
              onClick={() => setExplain((e) => !e)}
              className="inline-flex items-center min-h-6 underline decoration-dotted decoration-border underline-offset-2 cursor-help uppercase tracking-caps text-label text-muted-foreground hover:text-foreground p-0 bg-transparent border-0"
              title={scope.title}
            >
              {scope.word}
            </button>
            )}
          </>
        ) : null}
      </span>
      {/* A single page has nothing to navigate, so the cluster is ABSENT rather than a dead
          ‹ 1 / 1 › (the plank's rule: permanently dead chrome is not a control); the span stays. */}
      {pages > 1 && (
      <span className="inline-flex flex-none items-center gap-1">
        {/* First/last jumps (user, 2026-08-14 — "I want to see the genesis block; now I have to
            go page by page"): the standard « ‹ › » cluster. The last page IS genesis in the
            history mode, one jump deep now that pages are ordinal-addressed. */}
        {!compact && (
          <Button variant="ghost" size="icon-xs" className={btn} aria-label="First page" disabled={page <= 1} onClick={() => onPage(1)}>
            <ChevronsLeft aria-hidden className="size-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon-xs" className={btn} aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <span className={cn("text-label tabular-nums text-muted-foreground whitespace-nowrap")}>
          {exact ? `${page.toLocaleString()} / ${pages.toLocaleString()}` : `${page} / ${fmtCount(pages)}`}
        </span>
        <Button variant="ghost" size="icon-xs" className={btn} aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
        {!compact && (
          <Button variant="ghost" size="icon-xs" className={btn} aria-label="Last page" disabled={page >= pages} onClick={() => onPage(pages)}>
            <ChevronsRight aria-hidden className="size-4" />
          </Button>
        )}
      </span>
      )}
      </div>
      {explain && scope?.title && (
        <p className="m-0 pt-1 text-label text-muted-foreground max-w-[52ch]">{scope.title}</p>
      )}
    </div>
  );
}
