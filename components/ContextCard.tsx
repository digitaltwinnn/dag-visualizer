"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { subjectPairing } from "@/components/useSubjectPairing";
import InspectorCard from "@/components/InspectorCard";
import { useFlashOnChange } from "@/components/useFlashOnChange";
import type { PickDescriptor } from "@/src/data/types";

// The Context (parent) card at the top of the right-rail subject stack. It mirrors the
// top-bar filter: a metagraph selected there shows its dossier here; "all" shows the compact
// whole-network summary. Non-dismissible (it IS the filter) — the × clears the filter (only
// meaningful for a metagraph; "all" has no ×). Read-only identity; its live readout is the
// top-bar vitals. Card CONTENT is unchanged this phase (Phase 4 refines the dossier body).
export default function ContextCard() {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const metaList = useStore((s) => s.metaList);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const flashRef = useFlashOnChange(filter);
  const mgCfg = metagraphById(filter);

  if (mgCfg) {
    const context: PickDescriptor = { kind: "meta", title: mgCfg.name, cfg: mgCfg };
    const eyebrow = mgCfg.id === "dag" ? "Selected core" : "Selected metagraph";
    // Pair the dossier (the outer rounded pane) with its 3D hub: hovering either glows both in the
    // metagraph's hue, via the shared hoverFilter channel.
    const pair = subjectPairing<string>(hoverFilter, mgCfg.id, setHoverFilter, hex(mgCfg.color));
    return (
      <aside
        id="metapane"
        className={"panel rc-context " + pair.className}
        style={pair.style}
        ref={flashRef}
        onMouseEnter={pair.onMouseEnter}
        onMouseLeave={pair.onMouseLeave}
      >
        <button id="metapane-close" title="Clear selection" onClick={() => setFilter("all")}>
          ×
        </button>
        <div id="metapane-content">
          <InspectorCard p={context} eyebrow={eyebrow} />
        </div>
      </aside>
    );
  }

  // "All · whole network" — the compact context at rest (no filter). Factual counts.
  const cores = metaList.filter((m) => (m.located ?? 0) > 0).length;
  const nodes = metaList.reduce((s, m) => s + (m.located ?? 0), 0);
  return (
    <aside className="panel rc-context rc-context--all" ref={flashRef}>
      <div id="metapane-content">
        <span className="insp-eyebrow">Context</span>
        <h3 className="insp-title">All · whole network</h3>
        <p className="rc-empty-text">
          {cores} metagraph{cores === 1 ? "" : "s"} · {nodes.toLocaleString()} mapped nodes.
          Pick one from the filter to focus.
        </p>
      </div>
    </aside>
  );
}
