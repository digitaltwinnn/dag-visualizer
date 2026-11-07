"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { KIND_MARK_CLASS, REGISTER_ICONS } from "@/components/icons";
import { Door, Fact, FactGroup, Foot, FootRow, LayerWho, Lead, QualifierChip, SectionLabel } from "@/components/inspector/parts";
import { tickerOf } from "@/components/explorer/nodeRow";
import { openSnapshotRecord } from "@/components/trendDoors";
import { useFeedRead } from "@/components/useFeedRead";
import { subjectPairing } from "@/components/useSubjectPairing";
import { metaSnapHoverKey } from "@/src/data/types";
import { SIGNER_GROUPS, metagraphById } from "@/src/data/network";
import { fmtKB, midHash } from "@/src/util/format";
import { identityHudCss } from "@/src/palette/identity";
import { useStore } from "@/src/store/store";

// THE DATA BLOCK CARD (the Data blocks register, 2026-11-07 — user: "a data block is just like a tx
// block"; design round pick D2, "the batch"): one data block of a metagraph snapshot, named by its
// place in that snapshot ("3 of 10"), its UPDATES BY KIND as the body (`payloadKinds`' mechanical
// names — a wrapper name, or "records" for a flat record), its dL1 signers and its size as facts, a
// door to the snapshot's RAW record, and a foot with the snapshot's ordinal and the DIGEST the server
// takes over the block's bytes — never called a hash: the chain publishes none for a data block.
// Everything is the exact row's (`ChannelSnapRow.dataBlockRows`), so the card never reads deep.
// A data block has no live follow: it is a picked subject, released when its snapshot goes.

const DATA_ICON = REGISTER_ICONS.data;

export default function DataBlockPane({ onClose, collapsed, onToggle }: { onClose: () => void; collapsed?: boolean; onToggle?: () => void }) {
  useFeedRead(["exact"], "DataBlockPane");
  const sel = useStore((s) => s.dataBlock);
  const exact = useStore((s) => (s.dataBlock ? s.snapshotExact[s.dataBlock.snap.globalOrdinal] : undefined));
  const hoverMetaSnap = useStore((s) => s.hoverMetaSnap);
  const setHoverMetaSnap = useStore((s) => s.setHoverMetaSnap);
  const pulseKey = useEdgePulse(sel ? `${sel.snap.metaId}:${sel.snap.ordinal}:${sel.index}` : null);
  if (!sel) return null;

  const { snap, index } = sel;
  const hue = identityHudCss(snap.metaId);
  const unit = metagraphById(snap.metaId)?.ticker ?? tickerOf(snap.metaId);
  // The card lights its snapshot's tile and rows: a data block is read on its snapshot's channel.
  const pair = subjectPairing<string>(hoverMetaSnap, metaSnapHoverKey(snap.metaId, snap.ordinal), setHoverMetaSnap, hue);
  const row = exact?.rows.find((r) => r.metaId === snap.metaId && r.ordinal === snap.ordinal) ?? null;
  const rows = row?.dataBlockRows ?? [];
  const b = rows[index] ?? null;
  const n = rows.length;

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
            <span className="truncate font-mono tabular-nums">{n > 0 ? `${index + 1} of ${n}` : `${index + 1}`}</span>
          </span>
        }
        aside={b ? <QualifierChip className="tabular-nums">{b.updates.toLocaleString()} {b.updates === 1 ? "update" : "updates"}</QualifierChip> : undefined}
        titleKey={`${snap.metaId}:${snap.ordinal}:${index}`}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
          <Lead>
            {b
              ? `Carried ${b.updates.toLocaleString()} ${b.updates === 1 ? "update" : "updates"} for ${unit}, signed by ${b.signers.toLocaleString()} ${b.signers === 1 ? "validator" : "validators"}`
              : exact
                ? "This snapshot's read names no such block"
                : "Reading the snapshot that carried it"}
          </Lead>
          {b && b.kinds.length > 0 && (
            <div className="mt-2 mb-2">
              <SectionLabel label="Updates" total={b.updates.toLocaleString()} />
              <div className="mt-1 flex flex-col gap-y-0.5 text-label">
                {b.kinds.map((k) => (
                  <div key={k.kind} className="flex items-start justify-between gap-2.5">
                    <span className="min-w-0 truncate text-foreground-dim">{k.kind}</span>
                    <span className="shrink-0 font-mono tabular-nums text-foreground">{k.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {b && (
            <FactGroup>
              <Fact label="Signed by">
                <span className="inline-flex items-center gap-1">{b.signers.toLocaleString()} <LayerWho who={SIGNER_GROUPS.dataBlocks.who} /></span>
              </Fact>
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
