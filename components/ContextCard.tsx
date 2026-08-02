"use client";

import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { applyClickActions } from "@/src/store/applyClickActions";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { subjectPairing } from "@/components/useSubjectPairing";
import { RIGHT_CARD } from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import InspectorCard from "@/components/InspectorCard";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import type { PickDescriptor } from "@/src/data/types";

// The Context (parent) card at the top of the right-rail subject stack. It mirrors the
// top-bar filter: a metagraph selected there shows its dossier here; on "all" (no selection)
// the card simply doesn't render — the resting "All · whole network" summary card was removed
// (Task 13 follow-up, user: it added little value and took space; the counts live in the filter
// picker's All row). Non-dismissible while shown (it IS the filter) — the × clears the filter.
// Read-only identity; its live readout is the top-bar vitals.
export default function ContextCard({
  collapsed,
  onToggle,
}: {
  // CONTROLLED collapse from Inspector's ladder lane (the network rung); omitted on tablet/phone
  // where the card falls back to its own local +/−.
  collapsed?: boolean;
  onToggle?: () => void;
} = {}) {
  const filter = useStore((s) => s.filter);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const mgCfg = metagraphById(filter);
  // Subject = the filter value itself. The hook lives at the component top — NOT inside the
  // branch — so it stays mounted across the dossier ⇄ nothing swap and a metagraph→metagraph
  // change still pulses.
  const pulseKey = useEdgePulse(filter);

  if (!mgCfg) return null; // "all" — no resting context card; the rail rests quiet.

  const context: PickDescriptor = { kind: "meta", title: mgCfg.name, cfg: mgCfg };
  // Pair the dossier (the outer rounded pane) with its 3D hub: hovering either glows both in the
  // metagraph's hue, via the shared hoverFilter channel.
  const pair = subjectPairing<string>(hoverFilter, mgCfg.id, setHoverFilter, hex(mgCfg.color));
  return (
    <Card asChild className={cn(RIGHT_CARD, "sig-left", pair.className)}>
      <aside
        id="metapane"
        style={pair.style}
        onMouseEnter={pair.onMouseEnter}
        onMouseLeave={pair.onMouseLeave}
      >
        <InspectorCard
          p={context}
          eyebrow="Metagraph"
          onClose={() => applyClickActions([{ kind: "filter", id: "all" }])}
          collapsed={collapsed}
          onToggle={onToggle}
        />
        {/* Scene-facing (left) edge pulse on a new subject (metagraph picked) — synced with the
            dossier title's own roll-in (MetaCard keys it on cfg.name; both fire on the filter
            change). */}
        <PulseEdge pulseKey={pulseKey} rail="right" />
      </aside>
    </Card>
  );
}
