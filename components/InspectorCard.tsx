"use client";

import { useState, type ReactNode } from "react";
import type { PickDescriptor } from "@/src/data/types";
import { useStore } from "@/src/store/store";
import CardHead from "@/components/CardHead";
import {
  GeoLiveAside, GeoLiveCard, GeoLiveSubtitle, GeoLiveTitle, LayerCard, LayerTitle,
  MetaCard, MetaSiteAction, MetaTitle, SnapshotAside, SnapshotCard, SnapshotTitle,
} from "@/components/inspector/cards";

// Only three kinds ever reach the inspector frame now: a metagraph/core dossier (ContextCard),
// a clicked snapshot (ledger), and the selected-node card (geo/hyper, via the `geoLive` proxy
// that reads the node from the store). The raw node/core picks never land here.
function CardBody({ p }: { p: PickDescriptor }) {
  switch (p.kind) {
    case "snapshot": return <SnapshotCard data={p.data} />;
    case "meta": return <MetaCard cfg={p.cfg} />;
    case "geoLive": return <GeoLiveCard />;
    case "layer": return <LayerCard p={p} />;
    default: return null;
  }
}

// The per-kind HEAD — the card's primary title (+ optional subtitle + right-aligned aside) now
// renders in CardHead's title slot (one head anatomy: eyebrow / title / inset hairline / body;
// Task 13 follow-up). The dossier name rolls via `titleKey`; the snapshot ordinal rolls via its
// own Odometer; the node title self-keys its roll-in on the node ID (all defined in
// inspector/cards.tsx). The node head is LOCATION-FIRST: place as the title, the demoted id hash
// as the subtitle (GeoLiveSubtitle renders null in the no-location fallback, where the id stays
// the title).
function headFor(p: PickDescriptor): {
  title?: ReactNode; titleKey?: string; subtitle?: ReactNode; aside?: ReactNode;
} {
  switch (p.kind) {
    // The dossier head is the full identity composition — avatar + name + ticker (MetaTitle;
    // user refinement restoring the pre-unification header). Still rolls via titleKey on the
    // name, synced with the edge pulse.
    case "meta": return { title: <MetaTitle cfg={p.cfg} />, titleKey: p.cfg.name };
    case "snapshot": return { title: <SnapshotTitle data={p.data} />, aside: <SnapshotAside data={p.data} /> };
    case "geoLive": return { title: <GeoLiveTitle />, subtitle: <GeoLiveSubtitle />, aside: <GeoLiveAside /> };
    // The layer head: the dedicated single-plane mark + name; rolls (titleKey) on the layer id.
    case "layer": return { title: <LayerTitle p={p} />, titleKey: p.layerId };
    default: return {};
  }
}

// The shared inspector/context card — the React port of ui.js _cardHTML. It renders the blue
// **eyebrow = the card's purpose**, the subject TITLE (via CardHead's title slot — bodies render
// no title rows of their own), the inset head hairline, then dispatches to the per-kind body.
export default function InspectorCard({
  p,
  eyebrow,
  onClose,
}: {
  p: PickDescriptor;
  eyebrow?: string;
  // When set, CardHead renders the card's absolute × — the ONE baseline close every dismissible
  // card shares (label: CardHead's "Clear selection" default; no per-card variants).
  onClose?: () => void;
}) {
  // Right cards are COLLAPSIBLE too (user, 2026-07-12 — the left rail's tool cards already
  // were): the +/− ghost rides beside the ×, collapsing to eyebrow + title (no hairline, no
  // body). Local state per slot — it survives subject changes within the slot on purpose (a
  // reader who parked the dossier collapsed wants it to STAY parked across filter switches).
  const [collapsed, setCollapsed] = useState(false);
  // NO SIGNAL — the explorer feed is unreachable: SnapshotCard swaps to its own "no signal" body,
  // and the frame's eyebrow dims along with it (carried forward from `.no-signal .insp-eyebrow`).
  const live = useStore((s) => s.live);
  const eyebrowMuted = p.kind === "snapshot" && !live;
  // The dossier's site link rides the TITLE row's aside slot (user-placed: anchored right on the
  // avatar + name + ticker line; the name truncates, the icon stays pinned). Resolved HERE (not
  // inside headFor, which is a plain function and can't hook); passed only when a link actually
  // exists, so link-less dossiers render no aside at all (no empty gap). Falls back to the
  // config-level `cfg.siteUrl` for cores the live metaList doesn't carry a site for (the DAG —
  // Engine publishes it with `siteUrl: undefined`; DAG_CFG supplies constellationnetwork.io).
  const metaList = useStore((s) => s.metaList);
  const site =
    p.kind === "meta"
      ? (metaList.find((x) => x.id === p.cfg.id)?.siteUrl ?? p.cfg.siteUrl)
      : undefined;
  const head = headFor(p);
  return (
    <>
      <CardHead
        eyebrow={eyebrow}
        title={head.title}
        titleKey={head.titleKey}
        subtitle={collapsed ? undefined : head.subtitle}
        aside={head.aside ?? (site ? <MetaSiteAction site={site} /> : undefined)}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        eyebrowMuted={eyebrowMuted}
      />
      {!collapsed && <CardBody p={p} />}
    </>
  );
}
