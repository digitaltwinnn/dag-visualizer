"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/src/store/store";
import { allMetagraphs } from "@/src/data/network";
import { hex } from "@/src/util/format";
import PanelHead from "@/components/PanelHead";

// "Filter network" panel — the React port of ui.js setMetagraphList. Writes the
// selection to store.filter; the engine subscribes and reacts (Lane B command bridge).
// Per-metagraph node counts and the disabled "(0)" chips return when the globe's
// metaList is ported.
export default function FilterPanel() {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const metaList = useStore((s) => s.metaList);
  const [collapsed, setCollapsed] = useState(false);
  // Locatable-node count per metagraph (what the globe can plot); built by the engine.
  // Empty until data loads — chips then render plain (no count) and all clickable.
  const countById = useMemo(() => new Map(metaList.map((m) => [m.id, m.located])), [metaList]);
  const haveCounts = metaList.length > 0;

  const fixed = [
    { id: "all", label: "All", dot: "linear-gradient(135deg,var(--core),var(--l1))" },
    { id: "l0", label: "Global L0", dot: "var(--l0)" },
    { id: "l1", label: "DAG L1", dot: "var(--l1)" },
  ];

  // Split the metagraphs: those with locatable nodes are real, clickable filter chips;
  // those with none are registered on-chain but can't be plotted/filtered, so they go in a
  // compact "registered" footnote instead of wasting a full chip each. Until counts load
  // (haveCounts === false) treat all as active so every chip renders plainly.
  const metas = allMetagraphs();
  const active = haveCounts ? metas.filter((m) => (countById.get(m.id) ?? 0) > 0) : metas;
  const inactive = haveCounts ? metas.filter((m) => (countById.get(m.id) ?? 0) === 0) : [];

  return (
    <aside id="netfilter" className={"panel" + (collapsed ? " collapsed" : "")}>
      <PanelHead
        title="Filter network"
        eyebrow="Global · all views"
        caption="click to focus"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="mf-chips panel-body">
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
        {active.map((m) => (
          <button
            key={m.id}
            className={"mf-chip" + (filter === m.id ? " active" : "")}
            onClick={() => setFilter(m.id)}
          >
            <span className="mf-dot" style={{ background: hex(m.color) }} />
            <span className="mf-label">{m.ticker || m.name}</span>
            {haveCounts && <span className="mf-count">{countById.get(m.id) ?? 0}</span>}
          </button>
        ))}

        {inactive.length > 0 && (
          <div className="mf-ghosts">
            <span className="mf-ghosts-label">Registered · no live nodes</span>
            <div className="mf-ghosts-row">
              {inactive.map((m) => (
                <span
                  key={m.id}
                  className="mf-ghost"
                  title={`${m.name} — registered on-chain but has no locatable nodes right now, so it can't be plotted or filtered on the globe.`}
                >
                  <span className="mf-ghost-dot" style={{ background: hex(m.color) }} />
                  {m.ticker || m.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
