"use client";

import { useStore } from "@/src/store/store";

// Placeholder for the Snapshot DAG / ledger-over-time view. The real visualization
// (metagraph chains folding onto the Global L0 spine with fees) is future work; for
// now the live ribbon along the bottom is the seed of it.
export default function LedgerPanel() {
  const mode = useStore((s) => s.mode);
  if (mode !== "ledger") return null;
  return (
    <aside id="ledger-view" className="panel">
      <div className="ledger-head">
        <h2>Snapshot DAG · the ledger over time</h2>
        <span className="ledger-wip">work in progress</span>
      </div>
      <p>
        How the Global L0 ledger advances — a visual of the snapshot DAG is coming here. The live
        ribbon along the bottom is the seed of this view.
      </p>
      <p className="ledger-dim">
        Each <b>snapshot</b> links to its parent (that link is the edge of the DAG). <b>Ordinal</b>{" "}
        counts snapshots and always rises; <b>height</b> is the depth of the block DAG and only
        rises when activity deepens it; <b>sub-height</b> orders snapshots that share a height.
      </p>
    </aside>
  );
}
