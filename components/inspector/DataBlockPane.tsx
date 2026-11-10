"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { KIND_MARK_CLASS, REGISTER_ICONS } from "@/components/icons";
import { CUT_ROW, Door, Fact, FactGroup, Foot, FootRow, LayerWho, Lead, QualifierChip, SectionLabel, TABLE_ROW, TableHead, UnitMarks, countable, figWidth } from "@/components/inspector/parts";
import { tickerOf } from "@/components/explorer/nodeRow";
import { openSnapshotRecord } from "@/components/trendDoors";
import { useFeedRead } from "@/components/useFeedRead";
import { subjectPairing } from "@/components/useSubjectPairing";
import { dataBlockHoverKey } from "@/src/data/types";
import { SIGNER_GROUPS, metagraphById } from "@/src/data/network";
import { fmtKB, midHash, shortBlockHash } from "@/src/util/format";
import { identityHudCss } from "@/src/palette/identity";
import { useStore } from "@/src/store/store";

// THE DATA BLOCK CARD (the Data blocks register, 2026-11-07 — user: "a data block is just like a tx
// block"; design round pick D2, "the batch"): one data block of a metagraph snapshot, named by its
// place in that snapshot ("3 of 10"), its UPDATES BY KIND as the body (`payloadKinds`' mechanical
// names — a wrapper name, or "records" for a flat record), its dL1 signers and its size as facts, a
// door to the snapshot's RAW record, and a foot with the snapshot's ordinal and the DIGEST the server
// takes over the block's bytes — never called a hash: the chain publishes none for a data block.
// Everything is the exact row's (`ChannelSnapRow.dataBlockRows`), so the card never reads deep.
// Its live follow is the register's (`follow.ts`'s `followNewestData` seats the newest data-carrying
// snapshot, and the scene callout says "live" for it); the card itself carries no state mark — the
// Global snapshot card above it holds the LIVE / PINNED control.

const DATA_ICON = REGISTER_ICONS.data;

export default function DataBlockPane({ onClose, collapsed, onToggle }: { onClose: () => void; collapsed?: boolean; onToggle?: () => void }) {
  useFeedRead(["exact"], "DataBlockPane");
  const sel = useStore((s) => s.dataBlock);
  const exact = useStore((s) => (s.dataBlock ? s.snapshotExact[s.dataBlock.snap.globalOrdinal] : undefined));
  // The read's give-up signal (rule 10, review 2026-11-09): a failed read ends on an honest word,
  // never a "reading" that waits forever — the snapshot cards' own `exactMiss` rule.
  const missed = useStore((s) => (s.dataBlock ? s.exactMiss[s.dataBlock.snap.globalOrdinal] != null : false));
  const hoverDataBlock = useStore((s) => s.hoverDataBlock);
  const setHoverDataBlock = useStore((s) => s.setHoverDataBlock);
  const pulseKey = useEdgePulse(sel ? `${sel.snap.metaId}:${sel.snap.ordinal}:${sel.index}` : null);
  if (!sel) return null;

  const { snap, index } = sel;
  const hue = identityHudCss(snap.metaId);
  const unit = metagraphById(snap.metaId)?.ticker ?? tickerOf(snap.metaId);
  // THE CARD HOVERS ITS OWN SUBJECT (user, 2026-11-09: "hover on 'data block' card but metagraph
  // snapshot gets the hover; fix structurally"): the data block's channel, which lights the data
  // mark on its snapshot's tile — the snapshot's own tile and card answer `hoverMetaSnap` alone.
  // `components/cardHoverBoundary.test.ts` holds every subject card to its own channel.
  const pair = subjectPairing<string>(hoverDataBlock, dataBlockHoverKey(snap.metaId, snap.ordinal, index), setHoverDataBlock, hue);
  const row = exact?.rows.find((r) => r.metaId === snap.metaId && r.ordinal === snap.ordinal) ?? null;
  const rows = row?.dataBlockRows ?? [];
  const b = rows[index] ?? null;

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
        eyebrow="Data block"
        title={
          <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
            <DATA_ICON aria-hidden className={KIND_MARK_CLASS} style={{ color: hue } as CSSProperties} />
            {/* ITS ID, as every snapshot and block card heads with its own (user, 2026-11-09: "says '1 of
                1', unlike a metagraph snapshot or global snapshot that says the id; use id"): the
                digest over its bytes, short — the chain publishes no hash for a data block, so the
                foot names it a digest. Its place in the snapshot is the pager's. Before the row
                lands, the place stands in. */}
            <span className="truncate font-mono tabular-nums">{b ? shortBlockHash(b.digest) : `${index + 1}`}</span>
          </span>
        }
        aside={b && !b.unread ? <QualifierChip className="tabular-nums">{b.updates.toLocaleString()} {b.updates === 1 ? "update" : "updates"}</QualifierChip> : undefined}
        titleKey={`${snap.metaId}:${snap.ordinal}:${index}`}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
          <Lead>
            {b?.unread
              ? // UNREAD, NEVER 0 (rule 10; the data review's M3): the decoder could not read this block,
                // so its updates, kinds and signers are unknown — said once, with no count.
                "The decoder could not read this block's updates"
              : b
              ? `Carried ${b.updates.toLocaleString()} ${b.updates === 1 ? "update" : "updates"} for ${unit}, signed by ${b.signers.toLocaleString()} ${b.signers === 1 ? "validator" : "validators"}`
              : exact
                ? "This snapshot's read names no such block"
                : missed
                  ? "Read failed"
                  : "Reading the snapshot that carried it"}
          </Lead>
          {b && !b.unread && b.kinds.length > 0 && (
            <div className="mt-2 mb-2">
              <SectionLabel label="Updates" total={b.updates.toLocaleString()} className="mb-0.5" />
              {/* COUNTS BY KIND (option A, 2026-11-09): the card table, each kind's share marked in the
                  network's hue — squares while countable, a bar beyond. */}
              <div className="flex flex-col text-label" style={figWidth(b.kinds.map((k) => k.count.toLocaleString()))}>
                <TableHead name="Kind" figure="#" />
                {b.kinds.map((k) => (
                  <div key={k.kind} className={cn(CUT_ROW, TABLE_ROW)}>
                    <span className="min-w-0 truncate text-foreground-dim">{k.kind}</span>
                    <UnitMarks count={k.count} color={hue} units={countable(b.updates)} frac={k.count / Math.max(1, b.updates)} />
                    <span className="font-mono tabular-nums text-right text-foreground">{k.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {b && (
            <FactGroup>
              {!b.unread && (
                <Fact label="Signed by">
                  <span className="inline-flex items-center gap-1">{b.signers.toLocaleString()} <LayerWho who={SIGNER_GROUPS.dataBlocks.who} /></span>
                </Fact>
              )}
              <Fact label="Size">{fmtKB(b.bytes / 1024)}</Fact>
            </FactGroup>
          )}
          <div className="mt-2.5">
            <Door onClick={() => openSnapshotRecord(snap.metaId, snap.ordinal, snap.ts)} glyph={<ArrowUpRight className="size-3.5" />} flushFoot>
              Block records
            </Door>
          </div>
          <Foot>
            <FootRow label="Snapshot" value={snap.ordinal.toLocaleString()} />
            {b && <FootRow label="Digest" value={midHash(b.digest, 18)} copy={b.digest} copyName="digest" />}
          </Foot>
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" off={collapsed} />
    </RailPane>
  );
}
