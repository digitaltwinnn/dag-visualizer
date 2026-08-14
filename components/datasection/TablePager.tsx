"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  suffix,
  note,
  onPage,
}: {
  page: number; // 1-based
  pages: number;
  from: number; // 1-based row range of the current slice
  to: number;
  total: number;
  /** Qualifies the total ("in window") — the honest scope of a windowed count. */
  suffix?: string;
  /** One muted sentence after the range (the "pick a network to page all time" hint). */
  note?: string;
  onPage: (p: number) => void;
}) {
  if (pages <= 1 && !note) return null;
  const btn =
    "inline-flex items-center justify-center size-5 rounded-xs cursor-pointer text-muted-foreground " +
    "hover:text-foreground hover:bg-wash-faint disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]";
  return (
    <div className="flex-none flex items-center justify-between gap-2 pt-1.5">
      <span className="min-w-0 truncate text-micro tracking-caps uppercase tabular-nums text-muted-foreground">
        {from}–{to} of {total.toLocaleString()}
        {suffix ? ` ${suffix}` : ""}
        {note ? <span className="normal-case tracking-normal"> — {note}</span> : null}
      </span>
      <span className="inline-flex items-center gap-1">
        {/* First/last jumps (user, 2026-08-14 — "I want to see the genesis block; now I have to
            go page by page"): the standard « ‹ › » cluster. The last page IS genesis in the
            history mode, one jump deep now that pages are ordinal-addressed. */}
        <button type="button" className={btn} aria-label="First page" disabled={page <= 1} onClick={() => onPage(1)}>
          <ChevronsLeft aria-hidden className="size-3.5" />
        </button>
        <button type="button" className={btn} aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden className="size-3.5" />
        </button>
        <span className={cn("text-micro tabular-nums text-muted-foreground")}>
          {page} / {pages.toLocaleString()}
        </span>
        <button type="button" className={btn} aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight aria-hidden className="size-3.5" />
        </button>
        <button type="button" className={btn} aria-label="Last page" disabled={page >= pages} onClick={() => onPage(pages)}>
          <ChevronsRight aria-hidden className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
