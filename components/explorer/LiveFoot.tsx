"use client";

import LiveDot from "@/components/LiveDot";

// THE LIVE FOOT (user, 2026-10-23: "in geo and hyper, instead of removing the bottom just say live
// view or something?"). Every explorer card ends in a plate foot that states what the list is a
// reading OF: Snapshots' pager says its retained window ("last 9 min cache"), History's the span
// its averages are over. Hypergraph's and Geography's lists are the live poll — nothing to page,
// nothing to average — so their foot says so with the app's one live atom (`LiveDot` + "live",
// the explorer tick row's and the Global snapshot card's), in the pager foot's own recipe, so the
// four cards end the same way. A view whose data is not live never passes it (History's empty case
// has no foot at all).
export default function LiveFoot() {
  return (
    <div className="flex-none pt-1.5">
      <span className="inline-flex items-center gap-1.5 min-h-6 text-label tracking-caps uppercase text-muted-foreground">
        <LiveDot />
        live
      </span>
    </div>
  );
}
