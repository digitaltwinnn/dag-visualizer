"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import InspectorCard from "@/components/InspectorCard";
import { metaToken } from "@/components/inspector/parts";
import { useFlashOnChange } from "@/components/useFlashOnChange";
import type { PickDescriptor } from "@/src/data/types";

// The **selected subject** dossier (metagraph / cluster), pinned at the top of the left
// explore rail — where the filter used to live. It mirrors the top-bar filter: pick a
// metagraph there and its identity card appears here, above the view's tool card. Read-only
// identity (its live/economic readout is the top-bar vitals). Null when nothing is selected.
export default function ContextPanel() {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const metaList = useStore((s) => s.metaList);
  const mgCfg = metagraphById(filter);
  // Flash the dossier whenever the selected network changes (e.g. clicking a hub/node in 3D).
  const flashRef = useFlashOnChange(filter);

  let context: PickDescriptor | null = null;
  let titleSuffix: React.ReactNode = null;
  if (mgCfg) {
    const mg = metaList.find((m) => m.id === mgCfg.id) ?? null;
    context = { kind: "meta", title: mgCfg.name, cfg: mgCfg };
    // The token in brackets after the name (a subtle suffix) — except the DAG core itself.
    if (mgCfg.id !== "dag") titleSuffix = <span className="insp-token"> ({metaToken(mgCfg, mg)})</span>;
  }

  if (!context) return null;
  const eyebrow = mgCfg?.id === "dag" ? "Selected core" : "Selected metagraph";

  return (
    <aside id="metapane" className="panel" ref={flashRef}>
      <button id="metapane-close" title="Clear selection" onClick={() => setFilter("all")}>
        ×
      </button>
      <div id="metapane-content">
        <InspectorCard p={context} eyebrow={eyebrow} titleSuffix={titleSuffix} />
      </div>
    </aside>
  );
}
