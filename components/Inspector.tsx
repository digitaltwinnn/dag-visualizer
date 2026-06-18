"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import InspectorCard from "@/components/InspectorCard";
import type { PickDescriptor } from "@/src/data/types";

// Right-column stack: the persistent metagraph context pane (shown when a metagraph
// filter is active) above the click inspector (3D pick or clicked snapshot).
export default function Inspector() {
  const inspect = useStore((s) => s.inspect);
  const filter = useStore((s) => s.filter);
  const setInspect = useStore((s) => s.setInspect);
  const setFilter = useStore((s) => s.setFilter);

  // Context pane for the active filter: a metagraph → "meta" card; Global L0 / DAG L1
  // → a "cluster" card (same shape, no Make-up); All → nothing.
  const mgCfg = metagraphById(filter);
  let panePick: PickDescriptor | null = null;
  if (mgCfg) panePick = { kind: "meta", title: mgCfg.name, cfg: mgCfg };
  else if (filter === "l0") panePick = { kind: "cluster", cluster: "l0", title: "Global L0" };
  else if (filter === "l1") panePick = { kind: "cluster", cluster: "l1", title: "DAG L1" };

  return (
    <div id="rightcol">
      {panePick && (
        <aside id="metapane" className="panel">
          <button id="metapane-close" title="Clear selection" onClick={() => setFilter("all")}>
            ×
          </button>
          <div id="metapane-content">
            <InspectorCard p={panePick} />
          </div>
        </aside>
      )}
      {inspect && (
        <aside id="inspector" className="panel">
          <button id="inspector-close" title="Close" onClick={() => setInspect(null)}>
            ×
          </button>
          <div id="inspector-content">
            <InspectorCard p={inspect} />
          </div>
        </aside>
      )}
    </div>
  );
}
