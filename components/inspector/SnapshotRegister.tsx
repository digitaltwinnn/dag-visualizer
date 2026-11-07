"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { ledgerNetwork } from "@/src/engine/domain/tickNet";
import { carriesData } from "@/src/engine/domain/dataMark";
import { metagraphById } from "@/src/data/network";
import { dataUpdatesOf } from "@/src/data/ledgerMeasure";
import { blockReadOf } from "@/src/data/blockReads";
import { getBlockWindow, onBlockWindow } from "@/src/data/pastWindow";
import { UNLISTED_ID } from "@/src/data/unlisted";
import { identityHudCss } from "@/src/palette/identity";
import { shortBlockHash } from "@/src/util/format";
import { blockMeasureText } from "@/src/data/blockMeasure";
import { useFeedRead } from "@/components/useFeedRead";
import { tickerOf } from "@/components/explorer/nodeRow";
import { IDENT_INK } from "@/components/identInk";
import { BreakdownRows } from "@/components/inspector/AnchoredTags";
import { CUT_ROW, Lead, SectionLabel, figWidth } from "@/components/inspector/parts";
import { CONTENT_EASE } from "@/components/RollSwap";
import { Separator } from "@/components/ui/separator";

// THE GLOBAL SNAPSHOT CARD'S REGISTER SECTION (user, 2026-11-07: "work on the global snapshot body
// also", then the design round's picks — data 1, transaction 1). The card's body speaks the
// register's subject, as its scene label does:
//  · Transaction blocks — THE BLOCKS THEMSELVES, one row each (the explorer's block row: the chain's
//    ticker in its hue, the short hash, how much it moved — a dash until its read lands), newest
//    first. THE ROWS ARE READINGS, NOT DOORS (user, 2026-11-07: "blocks is designed as a clickable /
//    colored row while in the other variations it's not" — the anchored breakdown's 2026-10-03 rule:
//    the row says what was accepted, the Block card one rung down says the rest); the committed
//    block is highlighted in place in its chain's hue, as the resolved network is in the breakdown.
//  · Data blocks — the DATA UPDATES by network, the breakdown table's rows (one square per update
//    while countable); the data-block count is a fact of the whole tick and lives in the lead
//    ("Carried 10 data blocks with 23 updates"). A network that carried none is left out (the
//    register's rule).
// The anchored breakdown (`AnchoredTags`) is the Metagraph snapshots register's. Honesty (rule 10): a
// tick the window does not hold, or whose exact read has not landed, says so in the lead and lists
// nothing.

/** Transaction blocks: the tick's blocks, one reading per row. */
export function BlocksAnchored({ ordinal }: { ordinal: number }) {
  useFeedRead(["api-blocks"], "BlocksAnchored");
  const w = useSyncExternalStore(onBlockWindow, getBlockWindow, () => null);
  const reads = useStore((s) => s.blockReads);
  const block = useStore((s) => s.block);
  const t = w?.blockTick(ordinal) ?? null;
  const rows: { chain: string; hash: string; ordinal: number }[] = [];
  for (const hash of t?.blocks ?? []) rows.push({ chain: "dag", hash, ordinal });
  for (const [chain, snaps] of Object.entries(t?.metaSnaps ?? {})) {
    for (const r of [...snaps].sort((a, b) => b.ordinal - a.ordinal)) for (const hash of r.blocks ?? []) rows.push({ chain, hash, ordinal: r.ordinal });
  }
  const total = rows.length;
  const figures = rows.map((b) => {
    const read = blockReadOf(reads, b);
    return read ? blockMeasureText("amount", read) : "—";
  });
  return (
    <div className="mt-1">
      <Lead>{!t ? "Blocks not read for this snapshot" : total === 0 ? "No block in this snapshot" : `Accepted ${total} block${total === 1 ? "" : "s"}`}</Lead>
      {total > 0 && (
        <>
          <Separator className="mb-2" />
          <SectionLabel label="Blocks" total={total} className="mb-1.5" />
          <div className={cn("flex flex-col gap-y-1", CONTENT_EASE)} style={figWidth(figures)}>
            {rows.map((b, i) => {
              const hue = identityHudCss(b.chain);
              const on = !!block && block.chain === b.chain && block.hash === b.hash;
              return (
                // The breakdown row's wash and overhang (`BreakdownRows`), for the committed block.
                <div
                  key={`${b.chain}:${b.hash}`}
                  className={cn(CUT_ROW, "w-[calc(100%+12px)] -mx-1.5 px-1.5 py-[3px] rounded-sm")}
                  style={on ? ({ background: `color-mix(in oklch, ${hue} 16%, transparent)` } as const) : undefined}
                >
                  <span className={cn("min-w-0 truncate", IDENT_INK, on ? "font-semibold" : "text-foreground-dim")} style={on ? { color: hue } : undefined}>{tickerOf(b.chain)}</span>
                  <span className={cn("min-w-0 truncate font-mono tabular-nums text-right", on ? "text-foreground" : "text-foreground-dim")}>{shortBlockHash(b.hash)}</span>
                  <span className={cn("font-mono tabular-nums text-right", figures[i] === "—" ? "text-muted-foreground" : "text-foreground")}>{figures[i]}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Data blocks: the tick's data updates by network; its data blocks in the lead. */
export function DataAnchored({ ordinal }: { ordinal: number }) {
  useFeedRead(["exact"], "DataAnchored");
  const exact = useStore((s) => s.snapshotExact[ordinal]);
  const missed = useStore((s) => s.exactMiss[ordinal] != null);
  const focus = useStore((s) => ledgerNetwork({ filter: s.filter, tickNet: s.tickNet, snapOrdinal: ordinal }));
  const by = new Map<string, number>();
  let blocks = 0;
  for (const r of exact?.rows ?? []) {
    if (!carriesData(r)) continue;
    blocks += r.dataBlocks!;
    const key = metagraphById(r.metaId)?.id ?? UNLISTED_ID;
    by.set(key, (by.get(key) ?? 0) + (r.dataTxCount ?? 0));
  }
  // The tick's updates as the register measures them (`dataUpdatesOf`: unknown, never 0, where a
  // carrying row could not be decoded).
  const updates = exact ? dataUpdatesOf(exact.rows.filter(carriesData)) : undefined;
  const rows = [...by.entries()]
    .map(([id, n]) => {
      const c = id === UNLISTED_ID ? null : metagraphById(id);
      return c ? { id: c.id, label: c.name || c.ticker, hue: identityHudCss(c.id), n } : { id, label: UNLISTED_ID, hue: null, n };
    })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  const lead = !exact
    ? missed ? "Read failed" : "Reading which data blocks it carried"
    : blocks === 0
      ? "No data block in this snapshot"
      : `Carried ${blocks} data block${blocks === 1 ? "" : "s"}${updates != null ? ` with ${updates} update${updates === 1 ? "" : "s"}` : ""}`;
  return (
    <div className="mt-1">
      <Lead>{lead}</Lead>
      {updates != null && updates > 0 && (
        <>
          <Separator className="mb-2" />
          <SectionLabel label="Data updates" total={updates} className="mb-1.5" />
          <BreakdownRows rows={rows} denom={updates} focusId={metagraphById(focus)?.id ?? null} />
        </>
      )}
    </div>
  );
}
