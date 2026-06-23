"use client";

import { useState } from "react";
import PanelHead from "@/components/PanelHead";

// The Snapshot DAG view's left-rail tool — an "about" panel while the time-scrolling
// timeline itself is built. Sits in #leftcol like Learn / Leaderboard so the ledger
// view shares the same four-zone layout (filter above, ribbon below, cards on the
// right). The live ribbon along the bottom is the seed of the real view.
export default function LedgerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside id="ledger-view" className={"panel" + (collapsed ? " collapsed" : "")}>
      <PanelHead
        title="Snapshot DAG"
        eyebrow="Ledger · about"
        caption="WIP"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="ledger-body panel-body">
        <p>
          How the Global L0 ledger advances over time — a visual of the snapshot DAG is coming
          here. The live ribbon along the bottom is the seed of this view.
        </p>
        <p className="ledger-dim">
          Each <b>snapshot</b> links to its parent (that link is the edge of the DAG). <b>Ordinal</b>{" "}
          counts snapshots and always rises; <b>height</b> is the depth of the block DAG and only
          rises when activity deepens it; <b>sub-height</b> orders snapshots that share a height.
        </p>
      </div>
    </aside>
  );
}
