"use client";

import { useStore } from "@/src/store/store";
import { shortHash, CORE_HEX } from "@/src/data/network";
import { toDag, hex, fmtKB } from "@/src/util/format";
import type { GlobalSnapshot, MetaCfg, NodeInfo, PickDescriptor } from "@/src/data/types";
import AnchoredTags from "./AnchoredTags";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Desc, Row, StatusMark, CompositionRows, StatusBreakdown, metaToken, nodeComposition } from "./parts";

type PickOf<K extends PickDescriptor["kind"]> = Extract<PickDescriptor, { kind: K }>;

// A clicked Global L0 snapshot: its place in the DAG, what it anchored, and what it cost.
export function SnapshotCard({ data: d }: { data: GlobalSnapshot }) {
  // EXACT totals from the raw L0 snapshot (via SnapshotExactBridge) are the ONLY source for the fee
  // + anchored breakdown — authoritative (the true total, incl. unlisted). If they aren't here yet
  // the tick is simply "reading…" (ACQUIRING); there is no polled-floor fallback. Every selectable
  // tick is inside the L0 node's retention window, so exact always resolves.
  const exact = useStore((s) => s.snapshotExact[d.ordinal]);
  const awaitingExact = exact == null;
  const anchored = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : null;
  const heightTxt =
    d.subHeight != null
      ? `${(d.height ?? 0).toLocaleString()} · ${d.subHeight}`
      : (d.height ?? 0).toLocaleString();
  const blocks = Array.isArray(d.blocks) ? d.blocks.length : 0;
  return (
    // Borderless rows here (only the part dividers separate sections) so a row's
    // bottom border doesn't double up with the divider.
    <div className="insp-snap">
      {/* ① the snapshot's position in the DAG (+ blocks when present) */}
      <Row label={d.subHeight != null ? "Height · sub-height" : "Height"}>{heightTxt}</Row>
      {/* Most global snapshots carry zero blocks (settlement, not blocks, is the work),
          so only surface it on the rare snapshot that actually has some. */}
      {blocks > 0 && <Row label="Blocks">{blocks}</Row>}

      {/* ② what it anchored (exact breakdown, or "reading…" until it lands) */}
      <div className="insp-div" />
      <AnchoredTags ordinal={d.ordinal} anchored={anchored} awaiting={awaitingExact} />

      {/* ③ what it cost — the exact figure + measured size, or nothing until exact lands. Two
          independent facts: the fee (as reported) and the serialized size (content byte length) —
          the size is NOT derived from the fee. */}
      {exact != null && exact.totalFee > 0 && (
        <>
          <div className="insp-div" />
          <Row label="Settlement fees">
            {toDag(exact.totalFee).toFixed(4)} DAG
            <span className="insp-dim"> · {fmtKB(exact.totalSizeKB)} of data</span>
          </Row>
        </>
      )}
    </div>
  );
}

// The metagraph context pane (top-right "context" slot): identity only — description,
// make-up rows, website. Its live/economic counterpart is the top-bar vitals (filter-aware
// "live activity"), so the dossier stays a stable identity card.
export function MetaCard({ cfg }: { cfg: MetaCfg }) {
  const metaList = useStore((s) => s.metaList);
  const mg = metaList.find((x) => x.id === cfg.id) || null;
  const nodes = mg?.nodes || [];
  const hue = hex(cfg.color);
  const monogram = (cfg.ticker || cfg.name).slice(0, 3).toUpperCase();
  const blurb = mg?.description || cfg.blurb;
  const site = mg?.siteUrl;
  const token = metaToken(cfg, mg); // ticker, or "no token"
  return (
    <>
      {/* Header — logo avatar ringed in the identity hue + name + ticker. */}
      <div className="dossier-head">
        <Avatar className="dossier-logo" style={{ ["--ring" as string]: hue }}>
          {mg?.iconUrl && <AvatarImage src={mg.iconUrl} alt="" />}
          <AvatarFallback style={{ color: hue }}>{monogram}</AvatarFallback>
        </Avatar>
        <span className="dossier-id">
          <span className="dossier-name">{cfg.name}</span>
          {cfg.id !== "dag" && <span className="dossier-ticker" style={{ color: hue }}>{cfg.ticker}</span>}
        </span>
      </div>
      <Desc text={blurb} />
      {nodes.length > 0 && (
        <div className="comp-block">
          <div className="comp-head">
            <span className="comp-title">Node composition</span>
            <span className="comp-total"><b>{nodes.length}</b> node{nodes.length === 1 ? "" : "s"}</span>
          </div>
          <CompositionRows nodes={nodes} />
          <div className="comp-status"><StatusBreakdown states={nodes.map((n) => n.state)} /></div>
        </div>
      )}
      <div className="dossier-foot">
        <span className="dossier-token">{cfg.id !== "dag" && !nodeComposition(nodes).hasCurrency ? "data metagraph · no token" : token}</span>
        {site && (
          <a className="insp-site" href={site} target="_blank" rel="noopener noreferrer" style={{ color: hue }}>
            {site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
      </div>
    </>
  );
}

// Geography's signature detail card: the **selected node**, picked from the left explorer
// or the globe. The selection's live footprint summary (online / countries / densest) now
// lives in the top-bar vitals, so this card is purely the picked node's facts — or a hint
// to pick one. Reads the node straight from the store, so it tracks any pick.
export function GeoLiveCard() {
  const inspect = useStore((s) => s.inspect);
  const setInspect = useStore((s) => s.setInspect);

  const node =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode")
      ? inspect
      : null;

  if (!node) {
    return (
      <p className="insp-sub gel-hint">
        Pick a node from the explorer on the left — or click one on the globe — to inspect it here.
      </p>
    );
  }
  return <GeoLiveNode p={node} onClear={() => setInspect(null)} />;
}

// The selected-node block. Identity-first: the node's ID is the title; the body carries the
// facts you can't see on the globe — status, IP, composition, and where it sits. The slot
// eyebrow already reads "Selected node", so this only adds a deselect ×.
function GeoLiveNode({ p, onClear }: { p: PickOf<"l0" | "l1" | "metanode">; onClear: () => void }) {
  const id = p.node?.id;
  const title = id ? shortHash(id) : p.node?.ip || p.geo?.city || p.geo?.country || "Node";
  const color = p.kind === "metanode" ? (p.meta ? hex(p.meta.color) : undefined) : CORE_HEX;
  // The single node's roles → a one-node composition row (shared vocabulary).
  const oneNode: NodeInfo[] = p.node ? [p.node] : [];
  const g = p.geo;
  const place = g ? `${g.city ? g.city + ", " : ""}${g.country ?? ""}`.trim() : "";
  return (
    <>
      <button className="gel-clear" title="Deselect" onClick={onClear}>×</button>
      {/* Title line: node id + the status inline (right). */}
      <div className="gel-node-head">
        {color && <span className="gel-dot" style={{ background: color }} />}
        <span className="gel-node-title insp-hash">{title}</span>
        <span className="gel-status"><StatusMark state={p.node?.state} /></span>
      </div>
      {/* IP grouped with the identity (muted subtitle under the id), not a labelled row. */}
      {p.node?.ip && <div className="gel-ip">{p.node.ip}</div>}
      <div className="insp-div" />
      {/* Composition as a stacked label + block (NOT inside <Row>, whose value is a <span> —
          CompositionRows renders a <div>, so a Row would nest a block in an inline element). */}
      {oneNode.length > 0 && (
        <div className="gel-comp">
          <span className="gel-comp-label">Composition</span>
          <CompositionRows nodes={oneNode} />
        </div>
      )}
      {place && <Row label="Location">{place}</Row>}
    </>
  );
}

