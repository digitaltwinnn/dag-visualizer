"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { ABOUT_ICON } from "@/components/icons";

// The left-rail "About this view" orientation card, shown at the top of the rail in every view.
// A BOXED glass card in both states (user, 2026-08-13): the entry tier it wore while collapsed
// (2026-08-08, the left rail joining the right rail's grammar) is the right rail's HIERARCHY
// device — entries dim toward the box — and the left rail has no such hierarchy, so the quieter
// tier read as About being less of a card than Explore rather than as a depth. Collapsed it is
// simply the same panel closed to its head (CardHead's panel layout carries the +/− and the
// whole-head toggle already).
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
  // OPEN BY DEFAULT (user, 2026-09-01). The card states the view's point of view — "How the network
  // is built", "Where the network runs" — which is orientation a reader wants BEFORE they start
  // browsing, and behind a collapsed head it was only ever found by someone who already knew what
  // it said. It stays collapsible, and the state is per-mount by design: a view switch is a change
  // of subject, so its own orientation leads again.
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Card asChild className="sig-right block p-0 [--spine:var(--filter-accent,var(--primary))] animate-card-in motion-reduce:animate-none">
      <aside>
        <CardHead
          panel
          icon={ABOUT_ICON}
          title={title}
          eyebrow={eyebrow}
          caption={caption || undefined}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        {!collapsed && (
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
        )}
      </aside>
    </Card>
  );
}
