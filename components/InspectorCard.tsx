"use client";

import type { PickDescriptor } from "@/src/data/types";
import LiveHeart from "@/components/inspector/LiveHeart";
import { GeoLiveCard, MetaCard, SnapshotCard } from "@/components/inspector/cards";

// Only three kinds ever reach the inspector frame now: a metagraph/core dossier (ContextPanel),
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

// The shared inspector/context card — the React port of ui.js _cardHTML. Uniform header
// across every view: a blue **eyebrow = the card's purpose** (its role in this view) over
// a white **title = the specific subject** (the metagraph name, node, #ordinal). No kind/
// token pills — they duplicated the eyebrow; the token now lives in the dossier body. The
// only header control is the live ● for the snapshot. Then it dispatches to the per-kind body.
export default function InspectorCard({
  p,
  eyebrow,
  titleSuffix,
}: {
  p: PickDescriptor;
  eyebrow?: string;
  titleSuffix?: React.ReactNode;
}) {
  // The leading colour dot is themed by the rail's `--filter-accent` (the selected
  // metagraph / layer / network cyan), so the card's bullet matches the chips, the 3D hub
  // and the rest of the rail — one "colour = this selection" idiom.
  return (
    <>
      {eyebrow && <span className="insp-eyebrow">{eyebrow}</span>}
      {p.kind === "snapshot" ? (
        <div className="insp-titlerow">
          <h3 className="insp-snap-title">
            <span className="insp-dot" />
            #{p.data.ordinal.toLocaleString()}
            {p.data.timestamp && (
              <span className="insp-snap-time">{new Date(p.data.timestamp).toLocaleTimeString()}</span>
            )}
          </h3>
          <LiveHeart ordinal={p.data.ordinal} />
        </div>
      ) : (
        <>
          {p.title && (
            <h3>
              <span className="insp-dot" />
              {p.title}
              {titleSuffix}
            </h3>
          )}
          {p.sub && <p className="insp-sub">{p.sub}</p>}
        </>
      )}
      <CardBody p={p} />
    </>
  );
}
