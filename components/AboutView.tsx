"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";

// The left-rail "About this view" orientation card, shown at the top of the rail in every view.
// Same shell as the tool panels so the four-zone HUD stays consistent. Collapsed by default (a
// single CardHead strip) — the view's scene/tool is the star; expand to read the orientation.
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
    <aside className="ig-panel [--spine:var(--filter-accent,var(--primary))]">
      <CardHead
        panel
        title={title}
        eyebrow={eyebrow}
        caption={caption || undefined}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className={cn("flex flex-col gap-2.5 px-4 pt-3 pb-3.5 overflow-y-auto", collapsed && "hidden")}>
        {lines.map((l, i) => (
          <p
            key={i}
            className={cn(
              "m-0 text-[12.5px] leading-[1.55]",
              i > 0 ? "text-muted-foreground" : "text-[#c7d0ea]",
            )}
          >
            {l}
          </p>
        ))}
      </div>
    </aside>
  );
}
