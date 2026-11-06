"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "@/src/store/store";
import { getNetwork } from "@/src/data/network";
import { windowBlocks } from "@/src/data/blockWindow";
import { blockReadOf } from "@/src/data/blockReads";
import { getBlockWindow, onBlockWindow } from "@/src/data/pastWindow";
import type { GlobalSnapshot } from "@/src/data/types";
import { blockSelectActions, snapshotSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { ledgerLens } from "@/src/data/ledgerStory";
import { compactDag, midHash } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { identityHudCss } from "@/src/palette/identity";
import { Empty, IdentityDot } from "@/components/inspector/parts";
import { tickerOf } from "@/components/explorer/nodeRow";
import { selectionHue } from "@/components/selection";
import GroupPlate from "@/components/datasection/GroupToggle";
import LiveDot from "@/components/LiveDot";
import { PinnedMark } from "@/components/state/StateAtoms";
import { useFeedRead } from "@/components/useFeedRead";
import { useNowTick } from "@/components/useNowTick";
import { useBreakpoint } from "@/components/useBreakpoint";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// THE BLOCKS REGISTER'S RAW TABLE (2026-11-06): the block window's blocks, newest first, GROUPED BY
// THE GLOBAL SNAPSHOT THAT ACCEPTED THEM — the anchor log's own grouping, so the plate states the
// global once and the "accepted into" column the brief names is the plate itself, not a repeat on
// every row. The plate selects/releases its global (`snapshotSelectActions`, like the log's) and
// its chevron folds; a row is a block and its click is the chamber's own block pick
// (`blockSelectActions`). The committed block is the one PINNED row, said in mark AND word, and its
// group starts open (the Block card's door lands here). Amount and fee are the block's full read
// (stored fields only): a read not landed is the dash, never a number (rule 10).
const PHONE_HIDDEN = "max-[700px]:hidden";
const COLUMNS: { label: string; right?: boolean; phone?: false }[] = [
  { label: "Chain" },
  { label: "Block" },
  { label: "Amount", right: true },
  { label: "Fee", right: true, phone: false },
  { label: "Height", right: true, phone: false },
];

export default function BlocksTable() {
  useFeedRead(["api-blocks", "global"], "BlocksTable");
  const win = useSyncExternalStore(onBlockWindow, getBlockWindow, () => null);
  const reads = useStore((s) => s.blockReads);
  const miss = useStore((s) => s.blockReadMiss);
  const block = useStore((s) => s.block);
  const snap = useStore((s) => s.snap);
  const following = useStore((s) => s.following);
  const filter = useStore((s) => s.filter);
  const status = useStore((s) => s.blockWindowStatus);
  const setHoverBlock = useStore((s) => s.setHoverBlock);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const now = useNowTick(1000);
  const phone = useBreakpoint() === "phone";
  // Folded groups, as the log keeps them: open on the wider tiers, folded on the phone — except the
  // group holding the committed block, which always starts open (a fold nobody can see into hid
  // the pinned row the door promised).
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => new Set());
  const pinnedOrd = block?.anchorOrd ?? null;
  const isFolded = (ord: number) => folded.has(ord) !== (phone && ord !== pinnedOrd);
  const toggleFold = (ord: number) =>
    setFolded((f) => {
      const n = new Set(f);
      if (n.has(ord)) n.delete(ord);
      else n.add(ord);
      return n;
    });

  const rows = windowBlocks(win);
  const lens = ledgerLens(filter);
  const globals = new Map<number, GlobalSnapshot>((win?.globalSnapshots ?? []).map((g) => [g.ordinal, g]));
  // The door lands on a row: bring it into the pane once, when the table first holds it.
  const pinnedRow = useRef<HTMLTableRowElement | null>(null);
  const scrolled = useRef<string | null>(null);
  const pinKey = block ? `${block.chain}:${block.hash}` : null;
  useEffect(() => {
    if (pinKey && pinnedRow.current && scrolled.current !== pinKey) {
      scrolled.current = pinKey;
      pinnedRow.current.scrollIntoView({ block: "nearest" });
    }
  });

  if (!rows.length) {
    const why =
      status?.status === "beyond" ? "Blocks this far back are not reached"
      : status?.status === "failed" ? "The block window could not be read"
      : !win || status?.status === "loading" ? "reading…"
      : "No blocks in this stretch";
    return <p className="m-auto text-label text-muted-foreground uppercase tracking-caps">{why}</p>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden slim-scroll pr-2">
      <Table className="max-[700px]:block max-[700px]:[&_tbody]:block">
        <TableHeader className="sticky top-0 z-10 bg-[var(--panel-solid)] backdrop-blur-md max-[700px]:hidden">
          <TableRow className="border-border">
            {COLUMNS.map((c) => (
              <TableHead key={c.label} className={cn("text-label uppercase tracking-caps text-muted-foreground", c.right && "text-right", c.phone === false && PHONE_HIDDEN)}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b, i) => {
            const head = i === 0 || rows[i - 1]!.anchorOrd !== b.anchorOrd;
            const g = globals.get(b.anchorOrd);
            const inSelGroup = snap?.data.ordinal === b.anchorOrd;
            const hue = identityHudCss(b.chain);
            const on = block != null && block.chain === b.chain && block.hash === b.hash;
            const read = blockReadOf(reads, b);
            const unit = tickerOf(b.chain);
            const missed = miss[`${b.chain}:${b.ordinal}`] != null;
            const none = <Empty why={missed ? "The read of the accepting snapshot failed" : "Not read yet"} />;
            const pick = () => {
              if (!g) return;
              const st = useStore.getState();
              applyClickActions(
                blockSelectActions({ chain: b.chain, hash: b.hash, ordinal: b.ordinal, anchorOrd: b.anchorOrd }, { kind: "snapshot", title: `Global snapshot #${g.ordinal}`, data: g }, {
                  block: st.block,
                  snapOrd: !st.following && st.snap ? st.snap.data.ordinal : null,
                  metaSnap: st.metaSnap,
                  tickNet: st.tickNet,
                }),
              );
            };
            return (
              <Fragment key={`${b.chain}:${b.hash}`}>
                {head && (
                  <TableRow className="max-[700px]:block border-0 hover:bg-transparent">
                    <TableCell colSpan={COLUMNS.length} className="p-0 pt-2.5 max-[700px]:px-0 max-[700px]:block">
                      <GroupPlate
                        open={!isFolded(b.anchorOrd)}
                        onToggle={() => toggleFold(b.anchorOrd)}
                        selected={inSelGroup && !following}
                        onSelect={
                          g
                            ? () => {
                                const st = useStore.getState();
                                applyClickActions(
                                  snapshotSelectActions({ kind: "snapshot", title: `Global snapshot #${g.ordinal}`, data: g }, getNetwork()?.latest?.ordinal === g.ordinal, {
                                    pinnedOrdinal: !st.following && st.snap ? st.snap.data.ordinal : null,
                                    metaSnap: st.metaSnap,
                                    tickNet: st.tickNet,
                                    block: st.block,
                                  }),
                                );
                              }
                            : undefined
                        }
                        onHover={(h) => setHoverSnapOrd(h ? b.anchorOrd : null)}
                        className={cn(
                          "h-[34px] px-2 max-[700px]:px-1.5 rounded-t-md border-b text-label transition-colors",
                          inSelGroup
                            ? "bg-[color-mix(in_oklch,var(--primary)_20%,transparent)] border-[var(--primary)] text-primary-ink"
                            : "bg-[color-mix(in_oklch,var(--primary)_9%,var(--panel-plate))] border-[color-mix(in_oklch,var(--primary)_35%,transparent)] hover:bg-[color-mix(in_oklch,var(--primary)_14%,var(--panel-plate))] text-muted-foreground",
                        )}
                      >
                        <span className={cn("uppercase tracking-caps", inSelGroup ? "text-primary-ink" : "text-[color-mix(in_oklch,var(--primary-ink)_80%,var(--muted-foreground))]")}>Global</span>
                        <span className={cn("font-mono tabular-nums", inSelGroup ? "text-primary-ink" : "text-foreground")}>{b.anchorOrd.toLocaleString()}</span>
                        {inSelGroup && (
                          <span className="inline-flex items-center gap-1.5 text-label normal-case tracking-normal text-muted-foreground">
                            {following ? (
                              <>
                                <LiveDot />
                                live
                              </>
                            ) : (
                              <PinnedMark className="text-muted-foreground" />
                            )}
                          </span>
                        )}
                        <span className={cn("ml-auto tabular-nums", inSelGroup ? "text-primary-ink" : "text-foreground-dim")}>{relativeAge(now - Date.parse(b.ts))}</span>
                      </GroupPlate>
                    </TableCell>
                  </TableRow>
                )}
                {!isFolded(b.anchorOrd) && (
                  <TableRow
                    ref={on ? pinnedRow : undefined}
                    tabIndex={0}
                    className={cn(
                      "text-body cursor-pointer touch:h-11",
                      "hover:bg-[color-mix(in_oklch,var(--row-hue)_12%,transparent)]",
                      "max-[700px]:grid max-[700px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[700px]:items-center max-[700px]:[&>td]:py-2",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                      on && "bg-[var(--sel-bg)] text-foreground",
                      // A COMMITTED FILTER IS A LENS: another chain's blocks still list, stepped back.
                      !on && lens !== "all" && lens !== b.chain && "opacity-60",
                    )}
                    style={{ "--row-hue": hue, ...(on ? selectionHue(hue) : {}) } as React.CSSProperties}
                    onMouseEnter={() => setHoverBlock(b.hash)}
                    onMouseLeave={() => setHoverBlock(null)}
                    onFocus={() => setHoverBlock(b.hash)}
                    onBlur={() => setHoverBlock(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pick();
                      }
                    }}
                    onClick={pick}
                  >
                    <TableCell className={cn(on && "shadow-[inset_2px_0_0_var(--row-hue)]")}>
                      <span className="flex items-center gap-2">
                        <IdentityDot hue={hue} />
                        <span>{unit}</span>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-foreground-dim">
                      <span className="inline-flex items-center gap-1.5">
                        {midHash(b.hash, 12)}
                        {/* The selected row says whether it is live or pinned, as the log's row does. */}
                        {on && (
                          <span className="inline-flex items-center gap-1.5 font-sans text-label text-muted-foreground">
                            {following ? (
                              <>
                                <LiveDot />
                                live
                              </>
                            ) : (
                              <PinnedMark className="text-muted-foreground" />
                            )}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {read ? <span className="whitespace-nowrap">{compactDag(read.amount)} {unit}</span> : none}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums text-foreground-dim", PHONE_HIDDEN)}>
                      {read ? <span className="whitespace-nowrap">{compactDag(read.fee)} {unit}</span> : none}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums text-foreground-dim", PHONE_HIDDEN)}>
                      {read ? read.height.toLocaleString() : none}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
