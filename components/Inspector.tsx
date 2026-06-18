"use client";

import { useStore } from "@/src/store/store";
import { allMetagraphs } from "@/src/data/network";
import InspectorCard from "@/components/InspectorCard";
import type { PickDescriptor } from "@/src/data/types";

// Right-column stack: the persistent metagraph context pane (shown when a metagraph
// filter is active) above the click inspector (3D pick or clicked snapshot).
export default function Inspector() {
  const inspect = useStore((s) => s.inspect);
  const filter = useStore((s) => s.filter);
  const setInspect = useStore((s) => s.setInspect);
  const setFilter = useStore((s) => s.setFilter);

  const mgCfg = allMetagraphs().find((m) => m.id === filter) || null;
  const metaPick: PickDescriptor | null = mgCfg
    ? { kind: "meta", title: mgCfg.name, cfg: mgCfg }
    : null;

  return (
    <div id="rightcol">
      {metaPick && (
        <aside id="metapane" className="panel">
          <button id="metapane-close" title="Clear selection" onClick={() => setFilter("all")}>
            ×
          </button>
          <div id="metapane-content">
            <InspectorCard p={metaPick} />
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
