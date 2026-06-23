"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/src/store/store";
import { getAnchor, getNetwork, metaActivity, shortHash } from "@/src/data/network";
import type { MetaActivity } from "@/src/data/network";
import { hex, toDag } from "@/src/util/format";
import type { GlobalSnapshot, MetaCfg, PickDescriptor } from "@/src/data/types";
import AnchoredTags from "./AnchoredTags";
import {
  Desc,
  GeoRows,
  MetaNetworkBlurb,
  NodeRows,
  ROLE,
  ROLE_FR,
  Row,
  joinList,
  nodeComposition,
} from "./parts";

type PickOf<K extends PickDescriptor["kind"]> = Extract<PickDescriptor, { kind: K }>;

// Global L0 / DAG L1 context pane — the validator-cluster analogue of the metagraph
// pane. Same Layers/Nodes/Countries; NO "Make-up" row (a single-layer cluster's
// composition is fixed, unlike a configurable metagraph).
export function ClusterCard({ p }: { p: PickOf<"cluster"> }) {
  const nodes = useStore((s) => s.nodes);
  const countries = useStore((s) => s.leaderboard?.countries.length ?? 0);
  const isL0 = p.cluster === "l0";
  return (
    <>
      <p>
        {isL0 ? (
          <>
            The <b>Global L0</b> is Constellation&apos;s security &amp; settlement layer. Its
            validators run <b>PRO consensus</b> to bundle network activity into <b>global
            snapshots</b> — every metagraph anchors its state here.
          </>
        ) : (
          <>
            <b>DAG L1</b> is where transactions and application data enter the network — nodes
            validate them locally, then submit the result up to L0 for final settlement.
          </>
        )}
      </p>
      <Row label="Layer">{isL0 ? "L0 (consensus)" : "L1"}</Row>
      <Row label="Nodes">{isL0 ? nodes.l0 : nodes.l1}</Row>
      {countries > 0 && <Row label="Countries">{countries}</Row>}
    </>
  );
}

// The glowing core: the Global L0 as a whole, with the live ledger tip.
export function CoreCard() {
  const latest = useStore((s) => s.latestSnapshot);
  return (
    <>
      <p>
        The <b>Global L0</b> is Constellation&apos;s base layer — the shared source of truth. L0
        validators continuously bundle network activity into <b>global snapshots</b>, each
        cryptographically referencing the last to form the DAG.
      </p>
      <Row label="Latest ordinal">{latest ? latest.ordinal.toLocaleString() : "—"}</Row>
      <Row label="Snapshot height">{latest?.height ?? "—"}</Row>
      <Row label="Metagraphs anchored">{latest?.metagraphSnapshotCount ?? "—"}</Row>
      <p style={{ marginTop: 14 }}>
        Because validation happens in parallel across the Hypergraph, the network scales
        horizontally and stays <b>feeless</b> for end users.
      </p>
    </>
  );
}

// A single L0 or L1 validator node.
export function NodeCard({ p }: { p: PickOf<"l0" | "l1"> }) {
  const nodes = useStore((s) => s.nodes);
  return (
    <>
      <NodeRows node={p.node} />
      <GeoRows geo={p.geo} />
      {p.kind === "l0" ? (
        <p>
          This is one of the <b>{nodes.l0}</b> validators in the Global L0 cluster, running{" "}
          <b>PRO consensus</b> (Proof of Reputable Observation): nodes observe each other and build
          reputation, so honest validators converge on the next snapshot without mining.
        </p>
      ) : (
        <p>
          One of the <b>{nodes.l1}</b> nodes in the DAG L1 cluster. <b>L1</b> is where transactions
          and application data enter the network — validated locally, then submitted up to L0 for
          final settlement.
        </p>
      )}
    </>
  );
}

// A clicked Global L0 snapshot: its place in the DAG, what it anchored, and what it cost.
export function SnapshotCard({ data: d }: { data: GlobalSnapshot }) {
  const anchored = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : null;
  const a = getAnchor(d.timestamp);
  const identified = a ? a.count : 0;
  const feeDag = a ? toDag(a.fee) : 0;
  const full = anchored != null && a != null && identified >= anchored;
  const pct = anchored ? Math.round((identified / anchored) * 100) : 0;
  const heightTxt =
    d.subHeight != null
      ? `${(d.height ?? 0).toLocaleString()} · ${d.subHeight}`
      : (d.height ?? 0).toLocaleString();
  const blocks = Array.isArray(d.blocks) ? d.blocks.length : 0;
  const hasFee = !!a && a.fee > 0;
  return (
    // Borderless rows here (only the part dividers separate sections) so a row's
    // bottom border doesn't double up with the divider.
    <div className="insp-snap">
      {/* ① the snapshot's position in the DAG (+ blocks when present) */}
      <Row label={d.subHeight != null ? "Height · sub-height" : "Height"}>{heightTxt}</Row>
      {/* Most global snapshots carry zero blocks (settlement, not blocks, is the work),
          so only surface it on the rare snapshot that actually has some. */}
      {blocks > 0 && <Row label="Blocks">{blocks}</Row>}

      {/* ② what it anchored */}
      {a && a.metaIds.size > 0 && <div className="insp-div" />}
      <AnchoredTags ts={d.timestamp} anchored={anchored} />

      {/* ③ what it cost */}
      {hasFee && <div className="insp-div" />}
      {hasFee && (
        <Row label="Settlement fees">
          {feeDag.toFixed(4)} DAG{" "}
          <span className={"insp-mini " + (full ? "ok" : "approx")}>
            {full ? "complete" : "at least"}
          </span>
        </Row>
      )}
      {hasFee && !full && (
        <p style={{ marginTop: 10 }}>
          Each anchored snapshot pays a <b>$DAG fee</b> set by its size. We can attribute{" "}
          <b>
            {identified} of {anchored}
          </b>{" "}
          ({pct}%) to publicly listed metagraphs, so the total is{" "}
          <b>at least {feeDag.toFixed(4)} $DAG</b>.
        </p>
      )}
      {hasFee && full && (
        <p style={{ marginTop: 10 }}>
          Every anchored snapshot here is publicly listed, so the <b>{feeDag.toFixed(4)} DAG</b>{" "}
          fee total is complete.
        </p>
      )}
    </div>
  );
}

// A single metagraph node (clicked on the globe / in a hub).
export function MetaNodeCard({ p }: { p: PickOf<"metanode"> }) {
  if (!p.meta) return null;
  const roles = (p.node?.roles && p.node.roles.length ? p.node.roles : [p.node?.layer!])
    .map((r) => ROLE[r] || r)
    .join(" · ");
  return (
    <>
      <Row label="Runs">{roles}</Row>
      <NodeRows node={p.node} showIp={false} />
      <GeoRows geo={p.geo} showCoords={false} />
      <MetaNetworkBlurb meta={p.meta} />
    </>
  );
}

// Live activity for a metagraph, recomputed as the anchor index fills in (so the
// dossier stays current while the pane is open). Null until snapshots are polled.
function useMetaActivity(id: string): MetaActivity | null {
  const [act, setAct] = useState<MetaActivity | null>(() => metaActivity(id));
  useEffect(() => {
    setAct(metaActivity(id));
    const net = getNetwork();
    if (!net) return;
    const on = () => setAct(metaActivity(id));
    net.on("anchor", on);
    return () => {
      net.off("anchor", on);
    };
  }, [id]);
  return act;
}

// The metagraph context pane (top-right "context" slot): identity only — description,
// make-up rows, website. Its live/economic counterpart is MetaLiveCard (the bottom
// "signature" slot), so the dossier stays a stable identity card.
export function MetaCard({ cfg }: { cfg: MetaCfg }) {
  const metaList = useStore((s) => s.metaList);
  const mg = metaList.find((x) => x.id === cfg.id) || null;
  const nodeList = mg?.nodes || [];
  let facts: React.ReactNode = null;
  if (nodeList.length) {
    const c = nodeComposition(nodeList);
    facts = (
      <>
        <Row label="Token">{c.hasCurrency ? mg?.symbol || cfg.ticker || "—" : "none · data metagraph"}</Row>
        <Row label="Layers">{c.present.map((r) => ROLE_FR[r]).join(", ")}</Row>
        <Row label="Nodes">{nodeList.length}</Row>
        <Row label="Make-up">{joinList(c.parts)}</Row>
      </>
    );
  }
  const blurb = mg?.description || cfg.blurb;
  const site = mg?.siteUrl;
  return (
    <>
      <Desc text={blurb} />
      {facts}
      {site && (
        <Row label="Website">
          <a className="insp-link" href={site} target="_blank" rel="noopener noreferrer">
            {site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        </Row>
      )}
    </>
  );
}

function ccToFlag(cc?: string | null) {
  if (!cc || cc.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// Geography's always-present signature detail card. Two reads at once: a **live footprint
// strip** for the active selection (online health, countries spanned, densest country —
// all from `selNodes`/`leaderboard`, refreshed as the engine pushes them) ABOVE the
// **selected node's** details when one is picked from the left explorer or the globe.
// So the card always carries live info, and gains the node detail without replacing it.
export function GeoLiveCard() {
  const live = useStore((s) => s.live);
  const selNodes = useStore((s) => s.selNodes);
  const lb = useStore((s) => s.leaderboard);
  const inspect = useStore((s) => s.inspect);
  const setInspect = useStore((s) => s.setInspect);

  const total = selNodes.length;
  const ready = selNodes.reduce((n, r) => n + (r.state === "Ready" ? 1 : 0), 0);
  const pct = total ? Math.round((ready / total) * 100) : 0;
  const allReady = total > 0 && ready === total;
  const countries = lb?.countries.length ?? 0;
  const top = lb?.countries[0] ?? null;

  const node =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode")
      ? inspect
      : null;

  return (
    <>
      <div className="gel-strip">
        <div className="gel-stat">
          <span className="gel-k">{live ? "● Online" : "Online"}</span>
          <span className="gel-v">
            <b style={{ color: allReady ? "#36e29a" : "#ffd166" }}>{ready}</b>
            <span className="gel-tot">/{total || "—"}</span>
          </span>
          <span className="gel-bar">
            <span style={{ width: `${pct}%` }} />
          </span>
        </div>
        <div className="gel-stat">
          <span className="gel-k">Countries</span>
          <span className="gel-v">{countries || "—"}</span>
        </div>
        <div className="gel-stat">
          <span className="gel-k">Densest</span>
          <span className="gel-v gel-top">{top ? <>{ccToFlag(top.cc)} <b>{top.count}</b></> : "—"}</span>
        </div>
      </div>

      {node ? (
        <GeoLiveNode p={node} onClear={() => setInspect(null)} />
      ) : (
        <p className="insp-sub gel-hint">
          Pick a node from the explorer on the left — or click one on the globe — to inspect it here.
        </p>
      )}
    </>
  );
}

// The compact selected-node block embedded in the geo live card. Identity-first: the node's
// ID is the title; the body carries the facts you can't see on the globe — which network it
// serves, the layer(s) it runs, its state, and exactly where it sits (place + coordinates).
function GeoLiveNode({ p, onClear }: { p: PickOf<"l0" | "l1" | "metanode">; onClear: () => void }) {
  // Title = Node ID (the stable identity); fall back to IP/place only if there's no ID.
  const id = p.node?.id;
  const title = id ? shortHash(id) : p.node?.ip || p.geo?.city || p.geo?.country || "Node";

  // Which network this node serves, and the layer(s) it runs. For a metagraph node prefer the
  // real role list; fall back to the shell layer it's plotted as (always one of the metagraph's
  // layers) so it never collapses to a bare "L0" when the live roles are incomplete.
  const network = p.kind === "metanode" ? p.meta?.name : p.kind === "l0" ? "Global L0" : "DAG L1";
  const roles =
    p.kind === "metanode"
      ? (p.node?.roles?.length ? p.node.roles : [p.layer ?? p.node?.layer])
          .filter(Boolean)
          .map((r) => ROLE[r as string] || r)
          .join(" · ") || "—"
      : p.kind === "l0"
        ? "L0 (consensus)"
        : "DAG L1";

  const ready = p.node?.state === "Ready";
  const g = p.geo;
  const place = g ? `${g.city ? g.city + ", " : ""}${g.country ?? ""}`.trim() : "";

  return (
    <div className="gel-node">
      <div className="gel-node-head">
        <span className="gel-node-eyebrow">Selected node</span>
        <button className="gel-clear" title="Deselect" onClick={onClear}>
          ×
        </button>
      </div>
      <div className="gel-node-title insp-hash">{title}</div>
      {network && <Row label="Network">{network}</Row>}
      <Row label="Runs">{roles}</Row>
      <Row label="State">
        <span style={{ color: ready ? "#36e29a" : "#ffd166" }}>● {p.node?.state ?? "—"}</span>
      </Row>
      {place && <Row label="Location">{place}</Row>}
    </div>
  );
}

// The metagraph live-activity card (Hypergraph's signature bottom slot): cadence, the
// average DAG fee it pays, and its share of the anchors we track — derived live from
// metaSnaps via metaActivity, refreshed on the `anchor` event. Factual: shows a "no
// data yet" line until we've polled snapshots for this metagraph.
export function MetaLiveCard({ cfg }: { cfg: MetaCfg }) {
  const act = useMetaActivity(cfg.id);
  if (!act) {
    return <p className="insp-sub">No live activity for {cfg.name} yet.</p>;
  }
  return (
    <>
      {act.snapsPerMin != null && (
        <Row label="Snapshot cadence">{act.snapsPerMin.toFixed(1)} / min</Row>
      )}
      <Row label="Avg snapshot fee">{act.avgFeeDag.toFixed(5)} DAG</Row>
      {act.sharePct != null && (
        <>
          <Row label="Share of anchors">{act.sharePct.toFixed(1)}%</Row>
          <div className="insp-bar">
            <span style={{ width: `${Math.min(100, act.sharePct)}%`, background: hex(cfg.color) }} />
          </div>
        </>
      )}
      <p className="insp-foot">Over the last {act.samples} buffered snapshots.</p>
    </>
  );
}
