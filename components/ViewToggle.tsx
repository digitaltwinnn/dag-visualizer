"use client";

import { useStore } from "@/src/store/store";

const VIEWS = [
  { id: "hyper", label: "◆ Hypergraph" },
  { id: "geo", label: "◍ Node geography" },
  { id: "ledger", label: "⛓ Snapshot DAG" },
] as const;

// Top view switcher. Writes store.mode; the engine subscribes and morphs the scene.
export default function ViewToggle() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  return (
    <div id="viewtoggle">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          className={mode === v.id ? "active" : ""}
          onClick={() => setMode(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
