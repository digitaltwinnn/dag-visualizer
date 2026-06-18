"use client";

import { useStore } from "@/src/store/store";
import { allMetagraphs } from "@/src/data/network";

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

// "Filter network" panel — the React port of ui.js setMetagraphList. Writes the
// selection to store.filter; the engine subscribes and reacts (Lane B command bridge).
// Per-metagraph node counts and the disabled "(0)" chips return when the globe's
// metaList is ported.
export default function FilterPanel() {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);

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
        {allMetagraphs().map((m) => (
          <button
            key={m.id}
            className={"mf-chip" + (filter === m.id ? " active" : "")}
            onClick={() => setFilter(m.id)}
          >
            <span className="mf-dot" style={{ background: hex(m.color) }} />
            <span className="mf-label">{m.ticker || m.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
