"use client";

import { hex } from "@/src/util/format";
import type { PickDescriptor } from "@/src/data/types";
import { tagColorFor } from "@/components/inspector/parts";
import LiveHeart from "@/components/inspector/LiveHeart";
import {
  ClusterCard,
  CoreCard,
  GeoLiveCard,
  MetaCard,
  MetaLiveCard,
  MetaNodeCard,
  NodeCard,
  SnapshotCard,
} from "@/components/inspector/cards";

function CardBody({ p }: { p: PickDescriptor }) {
  switch (p.kind) {
    case "cluster": return <ClusterCard p={p} />;
    case "core": return <CoreCard />;
    case "l0":
    case "l1": return <NodeCard p={p} />;
    case "snapshot": return <SnapshotCard data={p.data} />;
    case "metanode": return <MetaNodeCard p={p} />;
    case "meta": return <MetaCard cfg={p.cfg} />;
    case "metaLive": return <MetaLiveCard cfg={p.cfg} />;
    case "geoLive": return <GeoLiveCard />;
  }
}

// The shared inspector/context card — the React port of ui.js _cardHTML. Uniform header
// across every view: a blue **eyebrow = the card's purpose** (its role in this view) over
// a white **title = the specific subject** (the metagraph name, node, #ordinal). No kind/
// token pills — they duplicated the eyebrow; the token now lives in the dossier body. The
// only header control is the live ● for the snapshot. Then it dispatches to the per-kind body.
export default function InspectorCard({ p, eyebrow }: { p: PickDescriptor; eyebrow?: string }) {
  // A leading colour dot ties the subject back to what you picked — the same colour as
  // the selected filter chip's dot and the metagraph's 3D hub, so "colour = this
  // metagraph" stays one idiom across the chips, the scene and these cards.
  const accent = hex(tagColorFor(p));
  return (
    <>
      {eyebrow && <span className="insp-eyebrow">{eyebrow}</span>}
      {p.kind === "snapshot" ? (
        <div className="insp-titlerow">
          <h3 className="insp-snap-title">
            <span className="insp-dot" style={{ background: accent }} />
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
              <span className="insp-dot" style={{ background: accent }} />
              {p.title}
            </h3>
          )}
          {p.sub && <p className="insp-sub">{p.sub}</p>}
        </>
      )}
      <CardBody p={p} />
    </>
  );
}
