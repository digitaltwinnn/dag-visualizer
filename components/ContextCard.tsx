"use client";

import { CircleHelp } from "lucide-react";
import { useStore } from "@/src/store/store";
import { applyClickActions } from "@/src/store/applyClickActions";
import { metagraphById } from "@/src/data/network";
import { UNLISTED_ID, displayNetwork } from "@/src/data/unlisted";
import { hex } from "@/src/util/format";
import { subjectPairing } from "@/components/useSubjectPairing";
import CardHead, { RailPane } from "@/components/CardHead";
import InspectorCard from "@/components/InspectorCard";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { KIND_MARK_CLASS } from "@/components/icons";
import { Fact } from "@/components/inspector/parts";
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

  // The UNLISTED pseudo-network's dossier (2026-08-08 — committing "unlisted" used to leave the
  // slot an empty HOLE: the manifest marks it present, suppressing the ghost, while this card
  // self-nulled on the missing catalog record). Everything shown comes from the one-home
  // identity (`displayNetwork`, neutral gray) + honest instrument states — a mixed uncataloged
  // set has no dossier facts to fabricate. The kind mark is a QUESTION MARK (user): the slot
  // noun stays Metagraph like every dossier, the "?" says which kind this one is.
  if (filter === UNLISTED_ID) {
    const dn = displayNetwork(UNLISTED_ID)!;
    const pair = subjectPairing<string>(hoverFilter, dn.id, setHoverFilter, dn.hue);
    return (
      <RailPane
        entry={collapsed}
        id="metapane"
        className={pair.className}
        style={pair.style}
        onMouseEnter={pair.onMouseEnter}
        onMouseLeave={pair.onMouseLeave}
        onFocus={pair.onFocus}
        onBlur={pair.onBlur}
      >
        <CardHead
          eyebrow="Metagraph"
          title={
            <span className="inline-flex items-center gap-2 min-w-0">
              <CircleHelp aria-hidden className={KIND_MARK_CLASS} style={{ color: dn.hue }} />
              <span className="italic truncate">{dn.name}</span>
            </span>
          }
          titleKey={dn.id}
          onClose={() => applyClickActions([{ kind: "filter", id: "all" }])}
          collapsed={collapsed}
          onToggle={onToggle}
        />
        {!collapsed && (
          <>
            <p className="m-0 text-body text-muted-foreground">
              State channels anchoring into Global L0 without an entry in the public catalog — a
              mixed set with no single operator or token.
            </p>
            {/* Absent data is an INSTRUMENT STATE, never a fabricated number: the operators'
                machines are outside every feed this app reads. */}
            <Fact className="mt-2" label="Machines">
              <span className="text-muted-foreground italic">not knowable</span>
            </Fact>
          </>
        )}
        <PulseEdge pulseKey={pulseKey} rail="right" />
      </RailPane>
    );
  }

  if (!mgCfg) return null; // "all" — no resting context card; the rail rests quiet.

  const context: PickDescriptor = { kind: "meta", title: mgCfg.name, cfg: mgCfg };
  // Pair the dossier (the outer rounded pane) with its 3D hub: hovering either glows both in the
  // metagraph's hue, via the shared hoverFilter channel.
  const pair = subjectPairing<string>(hoverFilter, mgCfg.id, setHoverFilter, hex(mgCfg.color));
  return (
    <RailPane
      entry={collapsed}
      id="metapane"
      className={pair.className}
      style={pair.style}
      onMouseEnter={pair.onMouseEnter}
      onMouseLeave={pair.onMouseLeave}
      onFocus={pair.onFocus}
      onBlur={pair.onBlur}
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
    </RailPane>
  );
}
