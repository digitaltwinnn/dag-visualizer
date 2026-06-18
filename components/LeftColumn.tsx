"use client";

import { useStore } from "@/src/store/store";
import FilterPanel from "@/components/FilterPanel";
import LearnPanel from "@/components/LearnPanel";
import Leaderboard from "@/components/Leaderboard";

// Left column: the shared network filter, plus the view-specific panel beneath it
// (Learn in Hypergraph; the country leaderboard in Geography — ported in 5d). Hidden
// entirely in the ledger view, which shows its own placeholder.
export default function LeftColumn() {
  const mode = useStore((s) => s.mode);
  if (mode === "ledger") return null;
  return (
    <div id="leftcol">
      <FilterPanel />
      {mode === "hyper" && <LearnPanel />}
      {mode === "geo" && <Leaderboard />}
    </div>
  );
}
