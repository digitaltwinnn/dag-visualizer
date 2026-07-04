"use client";

import type { PickDescriptor } from "@/src/data/types";
import CardHead from "@/components/CardHead";
import { GeoLiveCard, MetaCard, SnapshotCard } from "@/components/inspector/cards";

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

// The shared inspector/context card — the React port of ui.js _cardHTML. It renders just the
// blue **eyebrow = the card's purpose** (its role in this view), then dispatches to the per-kind
// body. Every body owns its OWN subject header (the snapshot's ◆ ordinal, the dossier's logo +
// name, the node's id row), so the frame renders no title of its own — a frame title on top of a
// body header read as a duplicate header (2× "DAG" on the dossier).
export default function InspectorCard({
  p,
  eyebrow,
  onClose,
  closeTitle,
}: {
  p: PickDescriptor;
  eyebrow?: string;
  // When set, CardHead renders the card's absolute × (the node card opts out — it draws its own
  // gel-clear ×). ContextCard passes "Clear selection"; a detail pane passes the default "Close".
  onClose?: () => void;
  closeTitle?: string;
}) {
  return (
    <>
      <CardHead eyebrow={eyebrow} onClose={onClose} closeTitle={closeTitle} />
      <CardBody p={p} />
    </>
  );
}
