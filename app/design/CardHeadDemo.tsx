"use client";

// The card STATES shown via the REAL Card + CardHead (not a rebuild), so they can't drift.
// Two families, matching the app:
//   • PANEL tool cards (left rail) — collapse via the +/− disclosure; no × (they're always there).
//   • INSPECTOR facts cards (right rail) — collapse AND × close ("Clear selection"), which returns
//     the slot to its GHOST hint.
// Client component: CardHead's `icon` is a lucide COMPONENT (functions can't cross the
// server→client boundary), and the close/collapse need local state.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import CardHead, { RIGHT_CARD } from "@/components/CardHead";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { GhostCard } from "@/components/Inspector";
import { detailsCards } from "@/components/railCards";
import { ABOUT_ICON, EXPLORE_ICON } from "@/components/icons";
import { cn } from "@/lib/utils";

// The geo NODE slot, ghosted — read from the rail manifest itself rather than hand-written here.
const GEO_NODE_GHOST = detailsCards({
  mode: "geo",
  filter: "all",
  inspect: null,
  snap: null,
  selNodesCount: 1,
  filterLabel: null,
  country: null,
  cohort: null,
  composition: null,
}).find((c) => c.id === "node")!;

export default function CardHeadDemo() {
  const [toolCollapsed, setToolCollapsed] = useState(false);
  const [factsCollapsed, setFactsCollapsed] = useState(false);
  const [factsClosed, setFactsClosed] = useState(false);
  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 max-w-2xl">
      {/* GHOST — a facts slot's empty state: the card the view CAN produce is always visible as
          a quiet dashed hint (kind mark · slot label · instruction) until its subject is picked.
          The descriptor comes from the REAL rail manifest (geo's node slot), so the demo can't
          drift from the copy the app ships. */}
      <GhostCard card={GEO_NODE_GHOST} />

      {/* PANEL tool card — active, and collapsible via the whole-head +/− disclosure. */}
      <Card asChild className="block p-0">
        <div>
          <CardHead
            panel
            icon={ABOUT_ICON}
            eyebrow="Explore"
            title="Tool card"
            collapsed={toolCollapsed}
            onToggle={() => setToolCollapsed((c) => !c)}
          />
          {!toolCollapsed && (
            <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] text-sm text-muted-foreground">
              Spineless at rest — the rail thread carries identity. Click the head to collapse to
              eyebrow + title. Tool cards don&apos;t close — they&apos;re always present.
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-2">
                <Badge>default</Badge>
                <Badge variant="secondary">secondary</Badge>
                <Badge variant="outline">outline</Badge>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* INSPECTOR facts card — collapse (+/−) AND × close. Closing returns the slot to its
          ghost hint (like a deselect on the right rail). */}
      {factsClosed ? (
        <Card asChild className={cn(RIGHT_CARD, "border-dashed")}>
          <div className="text-sm text-muted-foreground">
            Cleared — the slot returns to its ghost hint.{" "}
            <button type="button" className="text-primary underline underline-offset-2" onClick={() => setFactsClosed(false)}>
              restore
            </button>
          </div>
        </Card>
      ) : (
        <Card asChild className={RIGHT_CARD}>
          <div>
            <CardHead
              icon={EXPLORE_ICON}
              eyebrow="Selected node"
              title="Helsinki, Finland"
              collapsed={factsCollapsed}
              onToggle={() => setFactsCollapsed((c) => !c)}
              onClose={() => setFactsClosed(true)}
            />
            {!factsCollapsed && (
              <div className="text-sm text-muted-foreground">
                Facts cards carry BOTH controls: the +/− collapse and the × &ldquo;Clear
                selection&rdquo; (top-right). The × clears the subject; the slot falls back to its
                ghost hint.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
