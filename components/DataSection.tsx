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
  return (
    // The ×-gutter is now NARROW-ONLY (user, 2026-08-14 — the pane left a dead strip on the
    // right): its recorded reason is the <1100px sideways scroll, where the sticky header slid
    // under the close mark (2026-08-02) — at desktop the tables fit and nothing runs beneath
    // the ×, so both pads match and the pane takes the width.
    <div className="h-full flex flex-col pl-6 pr-6 max-[1099px]:pr-10 py-3">
      {mode === "ledger" ? (
        // MASTER–DETAIL (item 9, 2026-08-06): the anchor log is the index on the left; the right
        // pane renders the SELECTED metagraph snapshot's contents (the deep read + the JSON tree),
        // or its own quiet hint while nothing is selected. The pane is always present so the log
        // never reflows on selection.
        // PHONE (<700px, the shell's own tier): the split STACKS (user report 2026-08-13 — the
        // desktop shape gave the log ~1.5 columns and the pane ~170px, wrapping every fact row).
        // Log above, pane below at a fixed share with its own scroll; the divider rotates with
        // the axis (border-l → border-t).
        <div className="h-full flex gap-5 min-h-0 max-[700px]:flex-col max-[700px]:gap-3">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <AnchorLogTable />
          </div>
          <div
            className={
              "w-[36%] max-w-[520px] flex-none min-w-0 flex flex-col border-l border-border/50 pl-5 " +
              "max-[700px]:w-auto max-[700px]:max-w-none max-[700px]:h-[44%] max-[700px]:border-l-0 " +
              "max-[700px]:border-t max-[700px]:pl-0 max-[700px]:pt-3 max-[700px]:overflow-y-auto slim-scroll"
            }
          >
            <ChannelStatePanel />
          </div>
        </div>
      ) : mode === "hyper" || mode === "geo" ? (
        <NodeRosterTable mode={mode} />
      ) : (
        <p className="m-auto text-label text-muted-foreground uppercase tracking-caps">preview · in development</p>
      )}
    </div>
  );
}
