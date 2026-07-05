"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { EXPLORE_ICON } from "@/components/icons";

// The Snapshots view's left-rail tool. Sits in #leftcol like Learn / GeoExplore so the view keeps
// the four-zone layout. Copy is intentionally minimal while the view is still being built.
export default function LedgerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Card asChild className="sig-right block p-0 flex-[0_1_auto] min-h-0 [--spine:var(--filter-accent,var(--primary))]">
      <aside id="ledger-view">
        <CardHead
          panel
          icon={EXPLORE_ICON}
          title="Understand the layered design"
          eyebrow="Snapshots · explore"
          caption="WIP"
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <div className={cn("flex flex-col gap-2.5 px-4 pt-3 pb-3.5 overflow-y-auto", collapsed && "hidden")}>
          <p className="m-0 text-body text-muted-foreground">Work in progress.</p>
          <div className="pt-[10px] px-4 pb-3 text-label text-muted-foreground">Click each layer to learn more.</div>
        </div>
      </aside>
    </Card>
  );
}
