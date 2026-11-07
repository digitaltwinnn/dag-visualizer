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
import { blockRowLocked, ledgerLens } from "@/src/data/ledgerStory";
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
import { subjectPairing, useHoverRelease } from "@/components/useSubjectPairing";
import { useNowTick } from "@/components/useNowTick";
import { useBreakpoint } from "@/components/useBreakpoint";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// THE BLOCKS REGISTER'S RAW TABLE (2026-11-06; ONE ROW PER TRANSFER since D3, user 2026-11-07: "per
// transfer is useful"): every transfer the window's blocks carry, newest block first, GROUPED BY THE
// GLOBAL SNAPSHOT THAT ACCEPTED THEM — the anchor log's own grouping. The plate selects/releases its
// global (`snapshotSelectActions`, like the log's) and its chevron folds. A row is one transfer of a
// block (`BlockRead.transfers`, the read's stored fields: from, to, amount, fee) beside its block and
// the snapshot that accepted it (a DAG block's global, a token block's own metagraph snapshot); its
// click commits the BLOCK (`blockSelectActions`, the chamber's own pick — while following, a click on
// the live block pins it). The committed block's rows say LIVE or PINNED (the state species) and its
// group starts open (the Block card's door lands here). Honest states (rule 10): a block whose read
// has not landed lists ONE row saying "reading…", a failed read says so, and a read that lists no
// transfer says that — never a number derived from elsewhere.
//
// ON A PHONE the columns that IDENTIFY a row stay — from, to and the block (the plate already names
// the global) — and the MEASURES stand down: amount, fee and the accepting snapshot are the Block
// card's readings, one tap away (the anchor log's phone rule, components/CLAUDE.md).
const PHONE_HIDDEN = "max-[700px]:hidden";
const COLUMNS: { label: string; right?: boolean; phone?: false }[] = [
  { label: "From" },
  { label: "To" },
  { label: "Amount", right: true, phone: false },
  { label: "Fee", right: true, phone: false },
  { label: "Block" },
  { label: "Accepted into", right: true, phone: false },
];
/** A wallet address in a row: the app's one mid-ellipsis (`midHash`), head and tail kept — tighter on
 *  a phone, where from, to and the block share one line. */
const rowAddr = (a: string, phone: boolean) => midHash(a, phone ? 9 : 14);

export default function BlocksTable() {
  useFeedRead(["api-blocks", "global", "exact"], "BlocksTable");
  const win = useSyncExternalStore(onBlockWindow, getBlockWindow, () => null);
  const reads = useStore((s) => s.blockReads);
  const miss = useStore((s) => s.blockReadMiss);
  const block = useStore((s) => s.block);
  const snap = useStore((s) => s.snap);
  const following = useStore((s) => s.following);
  const filter = useStore((s) => s.filter);
  const exact = useStore((s) => s.snapshotExact);
  const status = useStore((s) => s.blockWindowStatus);
  const hoverBlock = useStore((s) => s.hoverBlock);
  const setHoverBlockRaw = useStore((s) => s.setHoverBlock);
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
  // A door pinning a block inside a group the reader folded opens that group.
  useEffect(() => {
    if (pinnedOrd == null) return;
    setFolded((f) => {
      if (!f.has(pinnedOrd)) return f;
      const n = new Set(f);
      n.delete(pinnedOrd);
      return n;
    });
  }, [pinKey, pinnedOrd]);
  useEffect(() => {
    if (pinKey && pinnedRow.current && scrolled.current !== pinKey) {
      scrolled.current = pinKey;
      pinnedRow.current.scrollIntoView({ block: "nearest" });
    }
  });

  // A row is the block's own subject on `hoverBlock`, paired with the explorer row, the chamber's
  // block and the Block card. A row that leaves under a resting pointer (a fold, a live refresh)
  // releases the hover it set (`useHoverRelease`).
  const setHoverBlock = useHoverRelease(hoverBlock, rows.filter((b) => !isFolded(b.anchorOrd)).map((b) => b.hash), setHoverBlockRaw);

  if (!rows.length) {
    const why =
      status?.status === "unread" ? "Unlisted networks' blocks are not read"
      : status?.status === "beyond" ? "Blocks this far back are not reached"
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
            // A filter holds the chamber: a block on a tick its network is not in answers nothing —
            // no commit, no hover — as the tick's own row and the chamber's pick do (`blockRowLocked`).
            const locked = blockRowLocked(filter, exact[b.anchorOrd], b, { on, shownOrd: snap?.data.ordinal ?? null });
            const pair = locked ? subjectPairing<string>(null, null, () => {}, hue) : subjectPairing(hoverBlock, b.hash, setHoverBlock, hue);
            const read = blockReadOf(reads, b);
            const unit = tickerOf(b.chain);
            const missed = miss[`${b.chain}:${b.ordinal}`] != null;
            const pick = () => {
              if (!g || locked) return;
              const st = useStore.getState();
              applyClickActions(
                blockSelectActions({ chain: b.chain, hash: b.hash, ordinal: b.ordinal, anchorOrd: b.anchorOrd }, { kind: "snapshot", title: `Global snapshot #${g.ordinal}`, data: g }, {
                  block: st.block,
                  snapOrd: !st.following && st.snap ? st.snap.data.ordinal : null,
                  metaSnap: st.metaSnap,
                  tickNet: st.tickNet,
                  following: st.following,
                }),
              );
            };
            // ONE ROW PER TRANSFER — or the one honest row: reading, failed, or none listed.
            const transfers = read?.transfers ?? [];
            const state = !read ? (missed ? "read failed" : "reading…") : transfers.length ? null : "no transfers listed";
            const lines: ({ from: string; to: string; amount: number; fee: number } | null)[] = state ? [null] : transfers;
            // The snapshot that accepted the block: a DAG block's global, a token block's own snapshot.
            const acceptedInto = `${b.chain === "dag" ? "Global" : unit} ${b.ordinal.toLocaleString()}`;
            const stateMark = on && (
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
            );
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
                {!isFolded(b.anchorOrd) &&
                  lines.map((t, k) => (
                    <TableRow
                      key={k}
                      ref={on && k === 0 ? pinnedRow : undefined}
                      tabIndex={locked ? -1 : 0}
                      aria-disabled={locked || undefined}
                      className={cn(
                        "text-body touch:h-11",
                        locked ? "cursor-default" : "cursor-pointer hover:bg-[color-mix(in_oklch,var(--row-hue)_12%,transparent)]",
                        "max-[700px]:grid max-[700px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] max-[700px]:items-center max-[700px]:[&>td]:py-2",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                        on && "bg-[var(--sel-bg)] text-foreground",
                        pair.className,
                        // A COMMITTED FILTER IS A LENS: another chain's blocks still list, stepped back.
                        ((!on && lens !== "all" && lens !== b.chain) || locked) && "opacity-60",
                      )}
                      style={{ "--row-hue": hue, ...(on ? selectionHue(hue) : {}) } as React.CSSProperties}
                      onMouseEnter={pair.onMouseEnter}
                      onMouseMove={pair.onMouseMove}
                      onMouseLeave={pair.onMouseLeave}
                      onFocus={pair.onFocus}
                      onBlur={pair.onBlur}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          pick();
                        }
                      }}
                      onClick={pick}
                    >
                      <TableCell className={cn("min-w-0 truncate font-mono tabular-nums text-foreground-dim", on && "shadow-[inset_2px_0_0_var(--row-hue)]")}>
                        {t ? rowAddr(t.from, phone) || <Empty /> : <span className="font-sans text-label text-muted-foreground">{state}</span>}
                      </TableCell>
                      <TableCell className="min-w-0 truncate font-mono tabular-nums text-foreground-dim">{t ? rowAddr(t.to, phone) || <Empty /> : <Empty />}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", PHONE_HIDDEN)}>
                        {t ? <span className="whitespace-nowrap">{compactDag(t.amount)} {unit}</span> : <Empty />}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums text-foreground-dim", PHONE_HIDDEN)}>
                        {t ? <span className="whitespace-nowrap">{compactDag(t.fee)} {unit}</span> : <Empty />}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-foreground-dim">
                        <span className="inline-flex items-center gap-1.5">
                          <IdentityDot hue={hue} />
                          {midHash(b.hash, phone ? 9 : 12)}
                          {stateMark}
                        </span>
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums text-foreground-dim whitespace-nowrap", PHONE_HIDDEN)}>{acceptedInto}</TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
