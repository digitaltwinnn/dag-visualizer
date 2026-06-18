"use client";

import { useStore } from "@/src/store/store";
import { getAnchor } from "@/src/data/network";
import { toDag } from "@/src/util/format";
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

// The metagraph context pane: description, make-up rows, and a website link.
export function MetaCard({ cfg }: { cfg: MetaCfg }) {
  const metaList = useStore((s) => s.metaList);
  const mg = metaList.find((x) => x.id === cfg.id) || null;
  const nodeList = mg?.nodes || [];
  let facts: React.ReactNode = null;
  if (nodeList.length) {
    const c = nodeComposition(nodeList);
    facts = (
      <>
        <Row label="Layers">{c.present.map((r) => ROLE_FR[r]).join(", ")}</Row>
        <Row label="Nodes">{nodeList.length}</Row>
        <Row label="Make-up">{joinList(c.parts)}</Row>
        {mg && mg.countriesCount > 0 && <Row label="Countries">{mg.countriesCount}</Row>}
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
