"use client";

import type { ReactNode } from "react";
import type { PickDescriptor } from "@/src/data/types";
import { useStore } from "@/src/store/store";
import CardHead from "@/components/CardHead";
import {
  GeoLiveAside, GeoLiveCard, GeoLiveSubtitle, GeoLiveTitle,
  MetaCard, SnapshotAside, SnapshotCard, SnapshotTitle,
} from "@/components/inspector/cards";

// Only three kinds ever reach the inspector frame now: a metagraph/core dossier (ContextCard),
// a clicked snapshot (ledger), and the selected-node card (geo/hyper, via the `geoLive` proxy
// that reads the node from the store). The raw node/core picks never land here.
function CardBody({ p }: { p: PickDescriptor }) {
  switch (p.kind) {
    case "snapshot": return <SnapshotCard data={p.data} />;
    case "meta": return <MetaCard cfg={p.cfg} />;
    case "geoLive": return <GeoLiveCard />;
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
    case "meta": return { title: p.cfg.name, titleKey: p.cfg.name };
    case "snapshot": return { title: <SnapshotTitle data={p.data} />, aside: <SnapshotAside data={p.data} /> };
    case "geoLive": return { title: <GeoLiveTitle />, subtitle: <GeoLiveSubtitle />, aside: <GeoLiveAside /> };
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
  // NO SIGNAL — the explorer feed is unreachable: SnapshotCard swaps to its own "no signal" body,
  // and the frame's eyebrow dims along with it (carried forward from `.no-signal .insp-eyebrow`).
  const live = useStore((s) => s.live);
  const eyebrowMuted = p.kind === "snapshot" && !live;
  const head = headFor(p);
  return (
    <>
      <CardHead
        eyebrow={eyebrow}
        title={head.title}
        titleKey={head.titleKey}
        subtitle={head.subtitle}
        aside={head.aside}
        onClose={onClose}
        eyebrowMuted={eyebrowMuted}
      />
      <CardBody p={p} />
    </>
  );
}
