"use client";

// The CardHead demo cards live in a Client Component because CardHead's `icon` prop is a lucide
// COMPONENT (a function), and a function can't be passed from a Server Component (the /design page)
// across the client boundary. Matches the OdometerDemo / CardSignalsDemo pattern on this page.
// Every card here renders the REAL Card + CardHead (not a rebuild), so it can't drift from the app.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import CardHead from "@/components/CardHead";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ABOUT_ICON, EXPLORE_ICON } from "@/components/icons";

export default function CardHeadDemo() {
  // The ACTIVE⇄COLLAPSED state shown live via the real CardHead disclosure (whole head is the
  // toggle; +/− indicator on the eyebrow line). Click the head to fold it to eyebrow + title.
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
      <Card asChild className="block p-0">
        <div>
          <CardHead panel icon={ABOUT_ICON} eyebrow="About" title="Glass card" />
          <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] text-sm text-muted-foreground">
            Spineless at rest — the rail thread carries identity.
            <Separator className="my-3" />
            <div className="flex flex-wrap gap-2">
              <Badge>default</Badge>
              <Badge variant="secondary">secondary</Badge>
              <Badge variant="destructive">down</Badge>
              <Badge variant="outline">outline</Badge>
            </div>
          </div>
        </div>
      </Card>
      <Card asChild className="block p-0 [--spine:var(--success)] sig-right subject-paired">
        <div>
          <CardHead panel icon={EXPLORE_ICON} eyebrow="Explore" title="Signal colour" />
          <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] text-sm text-muted-foreground">
            Signal states read <code className="font-mono">--spine</code>; identity panels point
            it at <code className="font-mono">--mg</code>. Here it is success-green, shown in the
            hover-paired state on the scene-facing edge.
          </div>
        </div>
      </Card>
      {/* The COLLAPSE state — real CardHead disclosure. Click the head (not just the +/−) to
          fold the body away to eyebrow + title; the inset hairline goes with the body. */}
      <Card asChild className="block p-0">
        <div>
          <CardHead
            panel
            icon={EXPLORE_ICON}
            eyebrow="Explore"
            title="Collapsible card"
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
          />
          {!collapsed && (
            <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] text-sm text-muted-foreground">
              Click anywhere on this head to collapse it — the whole head is the disclosure toggle
              (touch-friendly); collapsed leaves just the eyebrow + title.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
