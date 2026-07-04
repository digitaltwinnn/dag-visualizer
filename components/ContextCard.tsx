"use client";

import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { subjectPairing } from "@/components/useSubjectPairing";
import CardHead, { RIGHT_CARD } from "@/components/CardHead";
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
        className={cn(RIGHT_CARD, pair.className)}
        style={pair.style}
        ref={flashRef}
        onMouseEnter={pair.onMouseEnter}
        onMouseLeave={pair.onMouseLeave}
      >
        <div>
          <InspectorCard
            p={context}
            eyebrow={eyebrow}
            onClose={() => setFilter("all")}
            closeTitle="Clear selection"
          />
        </div>
      </aside>
    );
  }

  // "All · whole network" — the compact context at rest (no filter). Factual counts.
  const cores = metaList.filter((m) => (m.located ?? 0) > 0).length;
  const nodes = metaList.reduce((s, m) => s + (m.located ?? 0), 0);
  return (
    <aside className={RIGHT_CARD} ref={flashRef}>
      <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)]">
        <CardHead eyebrow="Context" />
        <h3 className="m-0">All · whole network</h3>
        <p className="m-0 text-[12.5px] leading-[1.5] text-muted-foreground">
          {cores} metagraph{cores === 1 ? "" : "s"} · {nodes.toLocaleString()} mapped nodes.
          Pick one from the filter to focus.
        </p>
      </div>
    </aside>
  );
}
