"use client";

import { hex } from "@/src/util/format";
import type { PickDescriptor } from "@/src/data/types";
import { nodeComposition, tagColorFor } from "@/components/inspector/parts";
import LiveHeart from "@/components/inspector/LiveHeart";
import {
  ClusterCard,
  CoreCard,
  MetaCard,
  MetaNodeCard,
  NodeCard,
  SnapshotCard,
} from "@/components/inspector/cards";

const LABEL: Partial<Record<PickDescriptor["kind"], string>> = {
  meta: "Metagraph",
  metanode: "Metagraph node",
  snapshot: "DAG snapshot",
  cluster: "Validator cluster",
}; // core / l0 / l1 fall back to the upper-cased kind

// The token badge for the meta + meta-node cards (a ticker pill, or "no token").
function TagToken({ p, h }: { p: PickDescriptor; h: string }) {
  if (p.kind === "meta") {
    return (
      <span className="mg-tag mg-tag--sel" style={{ ["--mg" as string]: h, margin: "0 0 10px 6px" }}>
        {p.cfg.ticker || p.cfg.name}
      </span>
    );
  }
  if (p.kind === "metanode" && p.meta) {
    return nodeComposition(p.meta.nodes || []).hasCurrency ? (
      <span className="mg-tag mg-tag--sel" style={{ ["--mg" as string]: h, margin: "0 0 10px 6px" }}>
        {p.meta.symbol || "—"}
      </span>
    ) : (
      <span className="mg-tag mg-tag--other" style={{ margin: "0 0 10px 6px" }}>
        no token
      </span>
    );
  }
  return null;
}

function CardBody({ p }: { p: PickDescriptor }) {
  switch (p.kind) {
    case "cluster": return <ClusterCard p={p} />;
    case "core": return <CoreCard />;
    case "l0":
    case "l1": return <NodeCard p={p} />;
    case "snapshot": return <SnapshotCard data={p.data} />;
    case "metanode": return <MetaNodeCard p={p} />;
    case "meta": return <MetaCard cfg={p.cfg} />;
  }
}

// The shared inspector/context card — the React port of ui.js _cardHTML. Owns the head
// (tag, token, real-time control) + title, then dispatches the body to the per-kind
// card. Used by both the click Inspector and the metagraph pane.
export default function InspectorCard({ p }: { p: PickDescriptor }) {
  const h = hex(tagColorFor(p));
  const label = LABEL[p.kind] ?? p.kind.toUpperCase();

  return (
    <>
      <div className="insp-head">
        <span
          className="insp-tag"
          style={{ background: `${h}22`, color: h, border: `1px solid ${h}55` }}
        >
          {label}
        </span>
        <TagToken p={p} h={h} />
        {/* Real-time control sits on the right; the factual tags stay left. */}
        {p.kind === "snapshot" && <LiveHeart ordinal={p.data.ordinal} />}
      </div>
      {p.kind === "snapshot" ? (
        // Compact header: the tag already says "snapshot", so just #ordinal + a subtle
        // time (no large "Snapshot time" block).
        <h3 className="insp-snap-title">
          #{p.data.ordinal.toLocaleString()}
          {p.data.timestamp && (
            <span className="insp-snap-time">{new Date(p.data.timestamp).toLocaleTimeString()}</span>
          )}
        </h3>
      ) : (
        <>
          {p.title && <h3>{p.title}</h3>}
          {p.sub && <p className="insp-sub">{p.sub}</p>}
        </>
      )}
      <CardBody p={p} />
    </>
  );
}
