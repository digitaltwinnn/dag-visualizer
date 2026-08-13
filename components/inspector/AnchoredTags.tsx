"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { UNLISTED_ID } from "@/src/data/unlisted";
import { metagraphById } from "@/src/data/network";
import { hex, fmtDag, fmtKB } from "@/src/util/format";
import { NodeStars } from "@/components/state/StateAtoms";
import { useMinHold } from "@/components/useMinHold";

// The anchored block on the snapshot card: a ranked share-of-total breakdown of the metagraph
// snapshots this global tick anchored — `dot · ticker · share-bar · count`, sorted desc, ALL of
// them (no cap; facts), unlisted as a neutral row. Bars = share of the total, so length is
// comparable across the whole list. Source = the EXACT raw-L0 read only (no polled floor); while
// it loads we show the header + "reading…".
//
// Every listed row is an EXPANDABLE accordion: click to reveal its stat line
// (`N snapshots · P% · KB · DAG`) — you can inspect any metagraph's detail, filter or not. The
// network-filtered metagraph is highlighted in place (identity-hue ticker + a thin left accent)
// and AUTO-OPENED, so its detail shows without a click. The `unlisted` aggregate row is NOT
// expandable — it's a roll-up of several metagraphs with no single fee/size to break out.
export default function AnchoredTags({
  ordinal,
  anchored,
  awaiting,
}: {
  ordinal: number;
  anchored: number | null;
  awaiting?: boolean;
}) {
  const filter = useStore((s) => s.filter);
  const exact = useStore((s) => s.snapshotExact[ordinal]);
  const cfg = metagraphById(filter);
  const focusId = cfg?.id ?? null;

  // Which rows are expanded. Persists across live ticks (the component re-renders with a new
  // `ordinal` rather than remounting), so an opened row stays open as the tick advances. The
  // network-selected metagraph is highlighted (below) but NOT auto-expanded — the user opens it.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const total = anchored ?? exact?.anchored ?? 0;
  const channels = exact?.channels ?? null;
  // A FAILED exact read (RawSnapshotBridge records it) is this block's give-up signal: the
  // twinkling stars promise a breakdown that is no longer coming, so they terminate on an honest
  // word. The header's total stays — it is the polled count, a different (and still live) source.
  const missed = useStore((s) => s.exactMiss[ordinal] != null) && !exact;

  // Hold the ACQUIRING "resolving" row for one calm cycle even if the exact read lands sooner,
  // then fade it out (concern #8) — a fast resolve shouldn't blink the node-stars away. While
  // held (or genuinely pre-exact) we stay on the acquiring branch and suppress the "from M
  // metagraphs" count (it only reads once the breakdown is actually shown).
  const resolveHold = useMinHold(!exact && !missed);
  const acquiring = !exact || resolveHold.show;

  // Header (always, even while acquiring): "N snapshots anchored from M metagraphs".
  const header = (
    <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
      <span className="text-body text-foreground"><b className="font-bold">{total}</b> snapshot{total === 1 ? "" : "s"} anchored</span>
      {channels != null && !acquiring && <span className="text-label text-muted-foreground">from {channels} metagraph{channels === 1 ? "" : "s"}</span>}
    </div>
  );

  if (acquiring) {
    return (
      <div className="mt-1">
        {header}
        {missed && !resolveHold.show ? (
          // The honest terminal: the read failed, nothing is in flight. Word, not stars.
          <div className="mt-1 text-micro tracking-[0.08em] uppercase text-muted-foreground">
            exact read failed
          </div>
        ) : (awaiting || resolveHold.show) && (
          <div className={cn("flex items-center gap-2 mt-1", resolveHold.fading && "animate-hold-fade-out motion-reduce:animate-none")}>
            <NodeStars count={4} />
            <span className="text-micro tracking-[0.08em] uppercase text-muted-foreground">resolving</span>
          </div>
        )}
      </div>
    );
  }

  // Rows from the exact per-metagraph breakdown: listed (named/hued, expandable) + one aggregate
  // unlisted row (neutral, not expandable).
  type Row = { id: string; label: string; hue: string | null; n: number; fee: number; bytes: number };
  const listed: Row[] = [];
  for (const [addr, { count, fee, bytes }] of Object.entries(exact.perMeta)) {
    const c = metagraphById(addr);
    if (c) listed.push({ id: addr, label: c.ticker || c.name, hue: hex(c.color), n: count, fee, bytes });
  }
  listed.sort((a, b) => b.n - a.n);

  // The genuinely-unlisted metagraphs are in `perMeta` too (addresses not in config) — roll them
  // into ONE neutral row at the bottom, aggregating count/fee/bytes so it expands to its own stat
  // line just like the listed rows. It's never the network selection, so it never gets the hue wash.
  const rows: Row[] = [...listed];
  if (exact.unlistedCount > 0) {
    const unlistedBytes = Object.entries(exact.perMeta)
      .filter(([addr]) => !metagraphById(addr))
      .reduce((sum, [, v]) => sum + v.bytes, 0);
    rows.push({ id: UNLISTED_ID, label: UNLISTED_ID, hue: null, n: exact.unlistedCount, fee: exact.unlistedFee, bytes: unlistedBytes });
  }

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const pctStr = (n: number) => `${pct(n).toFixed(pct(n) < 10 ? 1 : 0)}%`;
  const bar = (n: number, hue: string | null) => (
    <span className="block flex-1 h-1.5 rounded-xs bg-white/[0.06] overflow-hidden">
      <span
        className="block h-full rounded-xs min-w-[2px]"
        style={{ width: `${Math.max(pct(n), n > 0 ? 4 : 0)}%`, background: hue ?? "var(--core)" }}
      />
    </span>
  );

  return (
    <div className="mt-1">
      {header}

      <div className="flex flex-col gap-y-1">
        {rows.map((r) => {
          const isOpen = open.has(r.id);
          const isSel = r.id === focusId;
          return (
            <div key={r.id}>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                aria-expanded={isOpen}
                className={cn(
                  "group flex items-center gap-2 w-full text-left border-none cursor-pointer py-[3px] px-1.5 -mx-1.5 rounded-sm transition-[background] duration-150",
                  isSel ? "bg-transparent" : "bg-transparent hover:bg-wash-hover",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                )}
                // Selected (network-filtered) row: highlighted in place by a faint identity-hue row
                // wash (+ the hue ticker below) — reads as "the selection" even while collapsed.
                style={isSel ? ({ background: `color-mix(in oklch, ${r.hue ?? "var(--primary)"} 16%, transparent)` } as const) : undefined}
              >
                {/* Unlisted wears the CORE tone (2026-08-07) — the same neutral-blue it carries
                    on the filter chip, the explorer group and the live dot; grey read as a
                    different, third language. */}
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: r.hue ?? "var(--core)" }} />
                <span
                  className={cn(
                    "w-[68px] flex-none text-body truncate",
                    !r.hue ? "italic text-muted-foreground" : isSel ? "font-semibold" : "text-foreground",
                  )}
                  style={isSel && r.hue ? { color: r.hue } : undefined}
                >
                  {r.label}
                </span>
                {bar(r.n, r.hue)}
                <span className="w-7 flex-none text-right text-body text-foreground tabular-nums">{r.n}</span>
                {/* Expand affordance / open-state cue. Open rows show a down chevron. Closed rows:
                    hidden on a mouse (revealed on row hover/focus — keeps the resting list clean),
                    but ALWAYS shown on touch (`@media (hover:none)`), where there's no hover to
                    surface it. Kept via opacity so the count column never shifts. Every row is
                    tappable, including the unlisted roll-up. */}
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3.5 flex-none transition-[transform,opacity] duration-150 motion-reduce:transition-none",
                    isOpen
                      ? "rotate-90 text-foreground opacity-100"
                      : "text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                  )}
                />
              </button>

              {isOpen && (
                // Revealed stat line: this metagraph's exact detail for the tick.
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pl-[16px] pr-1.5 pb-1 pt-0.5 text-label text-muted-foreground tabular-nums">
                  <span>{r.n} snapshot{r.n === 1 ? "" : "s"}</span>
                  <span aria-hidden>·</span>
                  <span>{pctStr(r.n)}</span>
                  <span aria-hidden>·</span>
                  <span>{fmtKB(r.bytes / 1024)}</span>
                  <span aria-hidden>·</span>
                  <span>{fmtDag(r.fee)} DAG</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
