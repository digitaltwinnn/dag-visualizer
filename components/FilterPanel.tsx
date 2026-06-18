"use client";

import { useMemo } from "react";
import { useStore } from "@/src/store/store";
import { allMetagraphs } from "@/src/data/network";
import { hex } from "@/src/util/format";

// "Filter network" panel — the React port of ui.js setMetagraphList. Writes the
// selection to store.filter; the engine subscribes and reacts (Lane B command bridge).
// Per-metagraph node counts and the disabled "(0)" chips return when the globe's
// metaList is ported.
export default function FilterPanel() {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const metaList = useStore((s) => s.metaList);
  // Locatable-node count per metagraph (what the globe can plot); built by the engine.
  // Empty until data loads — chips then render plain (no count) and all clickable.
  const countById = useMemo(() => new Map(metaList.map((m) => [m.id, m.located])), [metaList]);
  const haveCounts = metaList.length > 0;

  const fixed = [
    { id: "all", label: "All", dot: "linear-gradient(135deg,var(--core),var(--l1))" },
    { id: "l0", label: "Global L0", dot: "var(--l0)" },
    { id: "l1", label: "DAG L1", dot: "var(--l1)" },
  ];

  return (
    <aside id="netfilter" className="panel">
      <div className="mf-head">
        <h2>Filter network</h2>
        <span className="mf-sub">Click to focus a metagraph</span>
      </div>
      <div className="mf-chips">
        {fixed.map((c) => (
          <button
            key={c.id}
            className={"mf-chip" + (filter === c.id ? " active" : "")}
            onClick={() => setFilter(c.id)}
          >
            <span className="mf-dot" style={{ background: c.dot }} />
            <span className="mf-label">{c.label}</span>
          </button>
        ))}
        {allMetagraphs().map((m) => {
          // A metagraph with no locatable nodes is shown in the Hypergraph but can't
          // be plotted/filtered on the globe — render it as a disabled "(0)" chip.
          const count = countById.get(m.id) ?? 0;
          const off = haveCounts && count === 0;
          return (
            <button
              key={m.id}
              className={"mf-chip" + (off ? " mf-chip--off" : "") + (filter === m.id ? " active" : "")}
              disabled={off}
              title={off ? "No live nodes found — shown in the Hypergraph but not locatable on the globe" : undefined}
              onClick={() => !off && setFilter(m.id)}
            >
              <span className="mf-dot" style={{ background: hex(m.color) }} />
              <span className="mf-label">{m.ticker || m.name}</span>
              {haveCounts && <span className="mf-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
