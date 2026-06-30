"use client";

import { useState } from "react";
import PanelHead from "@/components/PanelHead";

// The Snapshots view's left-rail tool. Sits in #leftcol like Learn / GeoExplore so the view keeps
// the four-zone layout. Copy is intentionally minimal while the view is still being built.
export default function LedgerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside id="ledger-view" className={"panel" + (collapsed ? " collapsed" : "")}>
      <PanelHead
        title="Understand the layered design"
        eyebrow="Snapshots · explore"
        caption="WIP"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="prose-body panel-body">
        <p className="prose-dim">Work in progress.</p>
        <div className="lb-foot">Click each layer to learn more.</div>
      </div>
    </aside>
  );
}
