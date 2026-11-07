"use client";
// THE BLOCK card (the Blocks register, 2026-11-05) — one block of the block DAG as a subject: a
// card slot under the Global snapshot card, no rung (the two snapshot slots' precedent). The six
// slots (components/CLAUDE.md "Every right-rail card is the same SIX SLOTS"), each from what is
// actually held (rule 10):
//
//   head      · "Block", the short hash, the block's HEIGHT as the qualifier chip, and the LIVE /
//               PINNED control (D3: in the Blocks register live follows the newest block)
//   lead      · what it moved, in the chain's own unit — ONE transfer names it, "Moved N DAG from
//               DAG1ab…cd to DAG9ef…01"; several are counted, "Moved N DAG in M transfers" — else,
//               with nothing moved or its read not landed, the relation the feed already names:
//               "Accepted into global N"
//   breakdown · several transfers: one row each, from → to · amount · fee (the read's own
//               `transfers`, the six-slot grammar's breakdown table); one transfer is the lead's
//   facts     · parents (two short hashes), children IN VIEW (how many of the window's held reads
//               are built on it — a count within the window, labelled so, never a total),
//               signatures, fees — "reading…" until the read lands, and a failed read says so. NO
//               HEIGHT ROW: the head's chip states it, and a card never says one fact twice. No
//               sub-height either: a block read carries none.
//   doors     · "Block records": the raw layer's blocks table, this block's row pinned in its
//               accepting global's group (`trendDoors.openBlockRecord`)
//   foot      · the hash and the parents' hashes, in full with copy
import { Fragment, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import CardHead, { RailPane } from "@/components/CardHead";
import FollowControl from "@/components/FollowControl";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { BLOCK_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { Door, Empty, Fact, FactGroup, Foot, FootRow, Lead, QualifierChip, SectionLabel } from "@/components/inspector/parts";
import { tickerOf } from "@/components/explorer/nodeRow";
import { openBlockRecord } from "@/components/trendDoors";
import { blockLead } from "@/components/inspector/blockLead";
import { useFeedRead } from "@/components/useFeedRead";
import { subjectPairing } from "@/components/useSubjectPairing";
import { blockChildren, blockReadKey, blockReadOf } from "@/src/data/blockReads";
import { compactDag, midHash } from "@/src/util/format";
import { identityHudCss } from "@/src/palette/identity";
import { useStore } from "@/src/store/store";

/** A wallet address in a breakdown row, where two share a line with an amount and a fee: the app's
 *  one mid-ellipsis (the lead's sentence form is `blockLead`'s). */
const rowAddr = (a: string) => midHash(a, 9);

export default function BlockPane({ onClose, collapsed, onToggle }: { onClose: () => void; collapsed?: boolean; onToggle?: () => void }) {
  useFeedRead(["api-blocks"], "BlockPane");
  const sel = useStore((s) => s.block);
  const reads = useStore((s) => s.blockReads);
  const missed = useStore((s) => (s.block ? s.blockReadMiss[blockReadKey(s.block.chain, s.block.ordinal)] != null : false));
  const hoverBlock = useStore((s) => s.hoverBlock);
  const setHoverBlock = useStore((s) => s.setHoverBlock);
  const pulseKey = useEdgePulse(sel ? `${sel.chain}:${sel.hash}` : null);
  if (!sel) return null;

  const hue = identityHudCss(sel.chain);
  // The scene's block, the explorer's row and this card light one another on the block's own channel.
  const pair = subjectPairing<string>(hoverBlock, sel.hash, setHoverBlock, hue);
  const read = blockReadOf(reads, sel);
  // The amount is in the CHAIN's unit: DAG for the DAG's own blocks, the token's ticker otherwise.
  const unit = tickerOf(sel.chain);
  // The read's own transfers (a read cached before they were carried has none to list).
  const transfers = read?.transfers ?? [];
  const lead = blockLead(sel, read);
  const children = read ? blockChildren(reads, sel.chain, sel.hash) : null;

  return (
    <RailPane
      entry={collapsed}
      className={pair.className}
      style={pair.style}
      onMouseEnter={pair.onMouseEnter}
      onMouseMove={pair.onMouseMove}
      onMouseLeave={pair.onMouseLeave}
      onFocus={pair.onFocus}
      onBlur={pair.onBlur}
    >
      <CardHead
        eyebrow="Block"
        title={
          // `max-w-full`: an inline-flex title is not held to the h3's width by `min-w-0` alone, so
          // a hash wider than the row's share ran under the height chip (measured at 1600: the
          // head's 8px gap read as −1px). Ten characters fit beside the chip and the live control;
          // a narrower rail truncates inside the title rather than closing the gap.
          <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
            {/* A subject-specific mark carries its OWN subject's hue (the node-mark idiom). */}
            <BLOCK_ICON aria-hidden className={KIND_MARK_CLASS} style={{ color: hue } as CSSProperties} />
            <span className="truncate font-mono">{midHash(sel.hash, 10)}</span>
          </span>
        }
        // The height chip, then the LIVE / PINNED control (D3): in the Blocks register live follows
        // the newest block, so the control rides this card — the global card's own pill stands down.
        aside={
          <span className="inline-flex items-center gap-1.5">
            {read && (
              <span data-yields="" className="contents">
                <QualifierChip className="tabular-nums">height {read.height.toLocaleString()}</QualifierChip>
              </span>
            )}
            <FollowControl subject="block" />
          </span>
        }
        titleKey={`${sel.chain}:${sel.hash}`}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
          <Lead>{lead}</Lead>
          {transfers.length > 1 && (
            // THE BREAKDOWN: one row per transfer, from → to, then its amount and its fee.
            <div className="mt-2 mb-2">
              <SectionLabel label="Transfers" total={transfers.length.toLocaleString()} />
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-2.5 gap-y-0.5 text-label">
                <span className="text-muted-foreground">From → to</span>
                <span className="text-right text-muted-foreground">Amount</span>
                <span className="text-right text-muted-foreground">Fee</span>
                {transfers.map((t, i) => (
                  <Fragment key={i}>
                    <span className="min-w-0 truncate font-mono text-foreground-dim">
                      {t.from ? rowAddr(t.from) : <Empty />} → {t.to ? rowAddr(t.to) : <Empty />}
                    </span>
                    <span className="text-right font-mono tabular-nums whitespace-nowrap text-foreground">{compactDag(t.amount)} {unit}</span>
                    <span className="text-right font-mono tabular-nums whitespace-nowrap text-foreground-dim">{compactDag(t.fee)}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          )}
          <FactGroup>
            {read ? (
              <>
                <Fact label="Parents">
                  {read.parents.length ? (
                    <span className="font-mono">{read.parents.map((p) => midHash(p.hash, 9)).join("  ")}</span>
                  ) : (
                    <Empty why="This block names no parents" />
                  )}
                </Fact>
                <Fact label="Children in view">{children != null ? children.toLocaleString() : <Empty />}</Fact>
                <Fact label="Signatures">{read.signers.toLocaleString()}</Fact>
                <Fact label="Fees paid">
                  <span className="whitespace-nowrap">{compactDag(read.fee)} {unit}</span>
                </Fact>
              </>
            ) : missed ? (
              <Fact label="Block read">
                <span className="text-muted-foreground">
                  <Empty why="The read of the snapshot that accepted this block failed" /> <span className="text-label">read failed</span>
                </span>
              </Fact>
            ) : (
              <Fact label="Block read">reading…</Fact>
            )}
          </FactGroup>
          <div className="mt-2.5">
            <Door onClick={openBlockRecord} glyph={<ArrowUpRight className="size-3.5" />} flushFoot>
              Block records
            </Door>
          </div>
          <Foot>
            <FootRow label="Hash" value={midHash(sel.hash, 23)} copy={sel.hash} copyName="hash" />
            {read?.parents.map((p, i) => (
              <FootRow key={p.hash} label={read.parents.length > 1 ? `Parent ${i + 1}` : "Parent"} value={midHash(p.hash, 18)} copy={p.hash} copyName={`parent hash ${i + 1}`} />
            ))}
          </Foot>
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" off={collapsed} />
    </RailPane>
  );
}
