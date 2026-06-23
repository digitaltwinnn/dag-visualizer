"use client";

import { useStore } from "@/src/store/store";
import FilterPanel from "@/components/FilterPanel";
import LearnPanel from "@/components/LearnPanel";
import GeoExplore from "@/components/GeoExplore";
import LedgerPanel from "@/components/LedgerPanel";

// Left control rail: the **explore/interact** zone — the global network filter, plus the
// view's tools beneath it. Each view gets exactly ONE tool card under the filter:
// Hypergraph → Learn; Geography → GeoExplore (footprint + node browser in one card);
// Snapshot DAG → the ledger "about" panel. Every view uses the same rail (uniform zone).
export default function LeftColumn() {
  const mode = useStore((s) => s.mode);
  return (
    <div id="leftcol">
      <FilterPanel />
      {mode === "hyper" && <LearnPanel />}
      {mode === "geo" && <GeoExplore />}
      {mode === "ledger" && <LedgerPanel />}
    </div>
  );
}
