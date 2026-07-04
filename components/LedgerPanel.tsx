"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";

// The Snapshots view's left-rail tool. Sits in #leftcol like Learn / GeoExplore so the view keeps
// the four-zone layout. Copy is intentionally minimal while the view is still being built.
export default function LedgerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside id="ledger-view" className="ig-panel flex-[0_1_auto] min-h-0 [--spine:var(--filter-accent,var(--primary))]">
      <CardHead
        panel
        title="Understand the layered design"
        eyebrow="Snapshots · explore"
        caption="WIP"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className={cn("flex flex-col gap-2.5 px-4 pt-3 pb-3.5 overflow-y-auto", collapsed && "hidden")}>
        <p className="m-0 text-[12.5px] leading-[1.55] text-muted-foreground">Work in progress.</p>
        <div className="pt-[10px] px-4 pb-3 text-[11px] text-muted-foreground">Click each layer to learn more.</div>
      </div>
    </aside>
  );
}
