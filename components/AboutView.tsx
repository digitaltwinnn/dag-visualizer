"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead, { RAIL_ENTRY } from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { ABOUT_ICON, KIND_MARK_CLASS } from "@/components/icons";

// The left-rail "About this view" orientation card, shown at the top of the rail in every view.
// It speaks the card-redesign's two-tier grammar (2026-08-08 — the left rail joins the right
// rail's language): COLLAPSED (the default) it is an unboxed `.rail-entry` — the box below it
// (the view's tool card) is the rail's working instrument, and About rests as a quiet entry the
// same way a right-rail ancestor does (whole-entry click to materialize, hover lift, thread
// dot + reach stub). EXPANDED it materializes as the full glass panel with the orientation copy.
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
  const Icon = ABOUT_ICON;
  if (collapsed) {
    return (
      <aside className={RAIL_ENTRY}>
        {/* CardHead's inspector layout in entry mode: chrome-less, data-eyebrow for the thread,
            the whole entry one stretched aria-expanded toggle. */}
        <CardHead
          eyebrow={eyebrow}
          entryPlus
          title={
            <span className="inline-flex items-center gap-2 min-w-0">
              <Icon aria-hidden className={KIND_MARK_CLASS} style={{ color: "var(--filter-accent, var(--accent))" }} />
              {/* min-w-0 so this flex item can shrink below its text: without it the inline-flex
                  above sizes to max-content and `truncate` never engages, which is how a long
                  title overflowed its own box instead of clipping. */}
              <span className="truncate min-w-0">{title}</span>
            </span>
          }
          caption={caption || undefined}
          collapsed
          onToggle={() => setCollapsed(false)}
        />
      </aside>
    );
  }
  return (
    <Card asChild className="sig-right block p-0 [--spine:var(--filter-accent,var(--primary))] animate-card-in motion-reduce:animate-none">
      <aside>
        <CardHead
          panel
          icon={ABOUT_ICON}
          title={title}
          eyebrow={eyebrow}
          caption={caption || undefined}
          collapsed={false}
          onToggle={() => setCollapsed(true)}
        />
        <div className="flex flex-col gap-2.5 px-4 pt-3 pb-3.5 overflow-y-auto">
          {lines.map((l, i) => (
            <p
              key={i}
              className={cn(
                "m-0 text-body",
                i > 0 ? "text-muted-foreground" : "text-foreground-dim",
              )}
            >
              {l}
            </p>
          ))}
        </div>
      </aside>
    </Card>
  );
}
