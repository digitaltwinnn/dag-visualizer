"use client";

import { GhostCard } from "@/components/Inspector";
import { iconForPick } from "@/components/icons";

// /design sample of a Detail slot's HINT (ghost) state — a client wrapper because the card
// descriptor carries a component (the lucide kind mark), which can't cross the server boundary.
export default function GhostCardDemo() {
  return (
    <div className="max-w-[320px]">
      <GhostCard
        card={{
          id: "node",
          kind: "node",
          icon: iconForPick("geoLive"),
          subjectKey: null,
          present: false,
          hint: "Click a node on the globe (or a row in the explorer) to inspect it.",
        }}
      />
    </div>
  );
}
