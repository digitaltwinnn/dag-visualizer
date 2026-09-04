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
  defaultCollapsed = false,
}: {
  title: string;
  eyebrow: string;
  lines: string[];
  caption?: string;
  /** Phone starts collapsed — see the note on the state below. Passed by ExploreRail's phone
   *  branch rather than read off `window` here: this component also SSRs in the desktop rail
   *  (CSS-hidden on phone, but hydrated), and a window read at first render made server and
   *  client disagree about which chevron to draw — a real hydration error, caught live. */
  defaultCollapsed?: boolean;
}) {
  // OPEN BY DEFAULT (user, 2026-09-01). The card states the view's point of view — "How the network
  // is built", "Where the network runs" — which is orientation a reader wants BEFORE they start
  // browsing, and behind a collapsed head it was only ever found by someone who already knew what
  // it said. It stays collapsible, and the state is per-mount by design: a view switch is a change
  // of subject, so its own orientation leads again.
  //
  // ⚠️ EXCEPT ON PHONE, WHERE IT OPENS COLLAPSED (user, 2026-09-02). The phone sheet is ~60% of the
  // viewport, and measured at 390×844 the open About filled ALL of it — the browse list the sheet
  // was opened for started below the fold. On a rail the prose leads and the list is still right
  // there; in a short sheet leading is displacing. The head stays, one tap opens it — the same
  // per-mount rule, phone just starts from the other side. The tier arrives as a PROP: the phone
  // sheet's AboutView mounts client-only and after `useBreakpoint` has resolved (Radix portals
  // the sheet content on open), so the initializer is stable for the one instance that takes it.
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
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
