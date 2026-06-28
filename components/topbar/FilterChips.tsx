"use client";

import { useMemo } from "react";
import { useStore } from "@/src/store/store";
import { allMetagraphs } from "@/src/data/network";
import { hex } from "@/src/util/format";

// The network filter chip grid — the body of the top-bar filter, shown when the
// command bar is expanded. Ported from the old left-rail FilterPanel: fixed scopes
// (All / Global L0 / DAG L1) + one chip per metagraph with locatable nodes, and a
// compact "registered · no live nodes" footnote for the rest.
export default function FilterChips({ onPick }: { onPick?: () => void }) {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const metaList = useStore((s) => s.metaList);

  const countById = useMemo(() => new Map(metaList.map((m) => [m.id, m.located])), [metaList]);
  const haveCounts = metaList.length > 0;

  const fixed = [
    { id: "all", label: "All", dot: "linear-gradient(135deg,var(--core),var(--l1))" },
    { id: "dag", label: "DAG", dot: "var(--core)" },
  ];

  const metas = allMetagraphs();
  const active = haveCounts ? metas.filter((m) => (countById.get(m.id) ?? 0) > 0) : metas;
  const inactive = haveCounts ? metas.filter((m) => (countById.get(m.id) ?? 0) === 0) : [];

  const pick = (id: string) => {
    setFilter(id);
    onPick?.();
  };

  return (
    <div className="mf-chips">
      {fixed.map((c) => (
        <button
          key={c.id}
          className={"mf-chip" + (filter === c.id ? " active" : "")}
          onClick={() => pick(c.id)}
        >
          <span className="mf-dot" style={{ background: c.dot }} />
          <span className="mf-label">{c.label}</span>
        </button>
      ))}
      {active.map((m) => (
        <button
          key={m.id}
          className={"mf-chip" + (filter === m.id ? " active" : "")}
          onClick={() => pick(m.id)}
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
  );
}
