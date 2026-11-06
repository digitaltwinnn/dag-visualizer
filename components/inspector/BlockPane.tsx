"use client";
// THE BLOCK card (the Blocks register, 2026-11-05) — one block of the block DAG as a subject: a
// card slot under the Global snapshot card, no rung (the two snapshot slots' precedent). The six
// slots (components/CLAUDE.md "Every right-rail card is the same SIX SLOTS"), each from what is
// actually held (rule 10):
//
//   head      · "Block", the short hash, and the block's HEIGHT as the qualifier chip
//   lead      · what it moved — "Moved N DAG in M transfers", in the chain's own unit — else, with
//               nothing moved or its read not landed, the relation the feed already names:
//               "Accepted into global N"
//   breakdown · OMITTED: a block's full read (`BlockRead`) carries its totals, not its transfers,
//               so there is no per-transfer row to draw
//   facts     · parents (two short hashes), children (how many window blocks are built on it, as
//               far as the held reads show), signatures, fees — "reading…" until the read lands, and
//               a failed read says so. NO HEIGHT ROW: the head's chip states it, and a card never
//               says one fact twice. No sub-height either: a block read carries none.
//   doors     · "Block records": the raw layer's blocks table, this block's row pinned in its
//               accepting global's group (`trendDoors.openBlockRecord`)
//   foot      · the hash and the parents' hashes, in full with copy
import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { BLOCK_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { Door, Empty, Fact, FactGroup, Foot, FootRow, Lead, QualifierChip } from "@/components/inspector/parts";
import { tickerOf } from "@/components/explorer/nodeRow";
import { openBlockRecord } from "@/components/trendDoors";
import { useFeedRead } from "@/components/useFeedRead";
import { subjectPairing } from "@/components/useSubjectPairing";
import { blockChildren, blockReadKey, blockReadOf } from "@/src/data/blockReads";
import { compactDag, midHash } from "@/src/util/format";
import { identityHudCss } from "@/src/palette/identity";
import { useStore } from "@/src/store/store";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

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
  const anchor = sel.anchorOrd.toLocaleString();
  const lead =
    read && read.txCount > 0 && read.amount > 0
      ? `Moved ${compactDag(read.amount)} ${unit} in ${plural(read.txCount, "transfer", "transfers")}`
      : `Accepted into global ${anchor}`;
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
          <span className="inline-flex items-center gap-2 min-w-0">
            {/* A subject-specific mark carries its OWN subject's hue (the node-mark idiom). */}
            <BLOCK_ICON aria-hidden className={KIND_MARK_CLASS} style={{ color: hue } as CSSProperties} />
            <span className="truncate font-mono">{midHash(sel.hash, 12)}</span>
          </span>
        }
        aside={read ? <QualifierChip className="tabular-nums">height {read.height.toLocaleString()}</QualifierChip> : undefined}
        titleKey={`${sel.chain}:${sel.hash}`}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
          <Lead>{lead}</Lead>
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
                <Fact label="Children">{children != null ? children.toLocaleString() : <Empty />}</Fact>
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
