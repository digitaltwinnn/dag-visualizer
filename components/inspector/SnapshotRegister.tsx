"use client";

import { useSyncExternalStore } from "react";
import { useStore } from "@/src/store/store";
import { ledgerNetwork } from "@/src/engine/domain/tickNet";
import { carriesData } from "@/src/engine/domain/dataMark";
import { metagraphById } from "@/src/data/network";
import { getBlockWindow, onBlockWindow } from "@/src/data/pastWindow";
import { UNLISTED_ID } from "@/src/data/unlisted";
import { identityHudCss } from "@/src/palette/identity";
import { useFeedRead } from "@/components/useFeedRead";
import { BreakdownRows } from "@/components/inspector/AnchoredTags";
import { Lead, SectionLabel } from "@/components/inspector/parts";
import { Separator } from "@/components/ui/separator";

// THE GLOBAL SNAPSHOT CARD'S REGISTER SECTION (user, 2026-11-07: "work on the global snapshot body
// also" — the card's body speaks the register's subject, as its scene label does). In Transaction
// blocks the tick's BLOCKS by chain, from the block window (the DAG's own, each token chain's); in
// Data blocks the DATA BLOCKS by network with their updates, from the exact read, a network that
// carried none left out (the register's own rule). The anchored breakdown (`AnchoredTags`) is the
// Metagraph snapshots register's. Each is the breakdown table's rows (`BreakdownRows`), the same
// columns the reader knows from the anchored breakdown. Honesty (rule 10): a tick the window does
// not hold, or whose exact read has not landed, says so in the lead and lists nothing.

type Row = { id: string; label: string; hue: string | null; n: number };

/** Transaction blocks: the tick's blocks by chain. */
export function BlocksAnchored({ ordinal }: { ordinal: number }) {
  useFeedRead(["api-blocks"], "BlocksAnchored");
  const w = useSyncExternalStore(onBlockWindow, getBlockWindow, () => null);
  const focus = useStore((s) => ledgerNetwork({ filter: s.filter, tickNet: s.tickNet, snapOrdinal: ordinal }));
  const t = w?.blockTick(ordinal) ?? null;
  const rows: Row[] = [];
  if (t?.blocks.length) rows.push({ id: "dag", label: "DAG", hue: identityHudCss("dag"), n: t.blocks.length });
  for (const [chain, snaps] of Object.entries(t?.metaSnaps ?? {})) {
    const n = snaps.reduce((k, r) => k + (r.blocks?.length ?? 0), 0);
    if (!n) continue;
    const c = metagraphById(chain);
    rows.push(c ? { id: c.id, label: c.name || c.ticker, hue: identityHudCss(c.id), n } : { id: chain, label: UNLISTED_ID, hue: null, n });
  }
  rows.sort((a, b) => b.n - a.n);
  const total = rows.reduce((k, r) => k + r.n, 0);
  return (
    <div className="mt-1">
      <Lead>{!t ? "Blocks not read for this snapshot" : total === 0 ? "No block in this snapshot" : `Accepted ${total} block${total === 1 ? "" : "s"}`}</Lead>
      {total > 0 && (
        <>
          <Separator className="mb-2" />
          <SectionLabel label="Blocks" total={total} className="mb-1.5" />
          <BreakdownRows rows={rows} denom={total} focusId={metagraphById(focus)?.id ?? (focus === "dag" ? "dag" : null)} />
        </>
      )}
    </div>
  );
}

/** Data blocks: the tick's data blocks by network, each with its data updates. */
export function DataAnchored({ ordinal }: { ordinal: number }) {
  useFeedRead(["exact"], "DataAnchored");
  const exact = useStore((s) => s.snapshotExact[ordinal]);
  const missed = useStore((s) => s.exactMiss[ordinal] != null);
  const focus = useStore((s) => ledgerNetwork({ filter: s.filter, tickNet: s.tickNet, snapOrdinal: ordinal }));
  const by = new Map<string, { n: number; updates: number }>();
  for (const r of exact?.rows ?? []) {
    if (!carriesData(r)) continue;
    const key = metagraphById(r.metaId)?.id ?? UNLISTED_ID;
    const e = by.get(key) ?? { n: 0, updates: 0 };
    e.n += r.dataBlocks!;
    e.updates += r.dataTxCount ?? 0;
    by.set(key, e);
  }
  const rows: Row[] = [...by.entries()].map(([id, e]) => {
    const c = id === UNLISTED_ID ? null : metagraphById(id);
    return c ? { id: c.id, label: c.name || c.ticker, hue: identityHudCss(c.id), n: e.n } : { id, label: UNLISTED_ID, hue: null, n: e.n };
  });
  rows.sort((a, b) => b.n - a.n);
  const total = rows.reduce((k, r) => k + r.n, 0);
  const updatesOf = (id: string) => by.get(id)?.updates ?? 0;
  return (
    <div className="mt-1">
      <Lead>
        {!exact ? (missed ? "Read failed" : "Reading which data blocks it carried") : total === 0 ? "No data block in this snapshot" : `Carried ${total} data block${total === 1 ? "" : "s"}`}
      </Lead>
      {total > 0 && (
        <>
          <Separator className="mb-2" />
          <SectionLabel label="Data blocks" total={total} unit="updates beside" className="mb-1.5" />
          <BreakdownRows
            rows={rows}
            denom={total}
            focusId={metagraphById(focus)?.id ?? null}
            figure={(id) => <span className="ml-2 text-muted-foreground">{updatesOf(id)}</span>}
          />
        </>
      )}
    </div>
  );
}
