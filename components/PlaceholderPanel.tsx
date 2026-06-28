"use client";

import { useState } from "react";
import PanelHead from "@/components/PanelHead";

// A "coming soon" tool card for the scaffolded views (Network status / Transactions /
// Delegated staking). Same shell as the real view panels so the four-zone HUD stays
// consistent; the canvas is hidden behind it (the engine treats these as flat views).
export default function PlaceholderPanel({
  title,
  eyebrow,
  lines,
}: {
  title: string;
  eyebrow: string;
  lines: string[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={"panel" + (collapsed ? " collapsed" : "")}>
      <PanelHead
        title={title}
        eyebrow={eyebrow}
        caption="SOON"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="prose-body panel-body">
        {lines.map((l, i) => (
          <p key={i} className={i > 0 ? "prose-dim" : undefined}>
            {l}
          </p>
        ))}
      </div>
    </aside>
  );
}
