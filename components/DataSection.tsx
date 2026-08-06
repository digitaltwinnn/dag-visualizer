"use client";

import { useStore } from "@/src/store/store";
import AnchorLogTable from "@/components/datasection/AnchorLogTable";
import { ChannelStatePanel } from "@/components/datasection/ChannelStatePanel";
import NodeRosterTable from "@/components/datasection/NodeRosterTable";

// The raw data layer (spec 2026-08-01): the per-view raw-data table — ledger = the anchor log,
// hyper/geo = the node roster (location-first in geo). The flat placeholder views have no
// dataset yet: the same honest preview language as Blueprint, never a fabricated table.
export default function DataSection() {
  const mode = useStore((s) => s.mode);
  const metaSnap = useStore((s) => s.metaSnap);
  return (
    // The right pad is wider than the left ON PURPOSE: it reserves the corner the layer's own ×
    // occupies (SectionShell). Below 1100px the tables outgrow the panel and scroll sideways, so
    // without the gutter the sticky header slid under the close mark (2026-08-02).
    <div className="h-full flex flex-col pl-6 pr-10 py-3">
      {mode === "ledger" ? (
        <div className="h-full flex flex-col gap-4 min-h-0">
          <div className="flex-1 min-h-0 flex flex-col">
            <AnchorLogTable />
          </div>
          {metaSnap && (
            <div className="flex-none max-h-[55%] overflow-auto border-t border-border/50 pt-3">
              <ChannelStatePanel />
            </div>
          )}
        </div>
      ) : mode === "hyper" || mode === "geo" ? (
        <NodeRosterTable mode={mode} />
      ) : (
        <p className="m-auto text-label text-muted-foreground uppercase tracking-caps">preview · in development</p>
      )}
    </div>
  );
}
