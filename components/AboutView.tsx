"use client";

import { useState } from "react";
import PanelHead from "@/components/PanelHead";

// The left-rail "About this view" orientation card, shown at the top of the rail in every view.
// Same shell as the tool panels so the four-zone HUD stays consistent. Collapsed by default (a
// single PanelHead strip) — the view's scene/tool is the star; expand to read the orientation.
export default function AboutView({
  title,
  eyebrow,
  lines,
  caption = "",
}: {
  title: string;
  eyebrow: string;
  lines: string[];
  caption?: string;
}) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <aside className={"panel" + (collapsed ? " collapsed" : "")}>
      <PanelHead
        title={title}
        eyebrow={eyebrow}
        caption={caption || undefined}
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
