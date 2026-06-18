"use client";

import { useState } from "react";
import { useStore } from "@/src/store/store";
import { COLORS, getAnchor, metagraphById, shortHash } from "@/src/data/network";
import type { MetaInfo, NodeInfo, PickDescriptor } from "@/src/data/types";

const hex = (c: number) => "#" + (c >>> 0).toString(16).padStart(6, "0").slice(-6);
const ROLE: Record<string, string> = { l0: "L0 (consensus)", cl1: "Currency L1", dl1: "Data L1" };
const ROLE_FR: Record<string, string> = { l0: "L0", cl1: "currency-L1", dl1: "data-L1" };
const ROLE_ORDER = ["l0", "cl1", "dl1"];
const rolesOf = (n: NodeInfo) => (n.roles && n.roles.length ? n.roles : [n.layer!]);
const joinList = (xs: string[]) =>
  xs.length <= 1 ? xs[0] || "" : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];

// Heartbeat "live"/"go-live" control on the snapshot card. Keyed on ordinal so the
// one-shot beat animation replays each time a new snapshot arrives while following.
function LiveHeart({ ordinal }: { ordinal: number }) {
  const following = useStore((s) => s.following);
  const setFollowing = useStore((s) => s.setFollowing);
  return (
    <button
      key={following ? ordinal : "pinned"}
      className={"snap-pulse" + (following ? " on beat" : "")}
      title={following ? "Live — following the latest snapshot. Click to pin this one." : "Pinned. Click to go live."}
      onClick={() => setFollowing(!following)}
    >
      <svg className="hb" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
      <span>{following ? "Live" : "Go live"}</span>
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="insp-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function NodeRows({ node, showIp = true }: { node?: NodeInfo; showIp?: boolean }) {
  if (!node) return null;
  const ready = node.state === "Ready";
  return (
    <>
      <Row label="State">
        <span style={{ color: ready ? "#36e29a" : "#ffd166" }}>● {node.state}</span>
      </Row>
      {node.ip && showIp && <Row label="IP">{node.ip}</Row>}
      {node.id && (
        <Row label="Node ID">
          <span className="insp-hash">{shortHash(node.id)}</span>
        </Row>
      )}
    </>
  );
}

function GeoRows({ geo, showCoords = true }: { geo?: PickDescriptor["geo"]; showCoords?: boolean }) {
  if (!geo) return null;
  return (
    <>
      <Row label="Location">{`${geo.city ? geo.city + ", " : ""}${geo.country ?? ""}`}</Row>
      {showCoords && geo.lat != null && geo.lon != null && (
        <Row label="Coordinates">{`${geo.lat.toFixed(2)}, ${geo.lon.toFixed(2)}`}</Row>
      )}
    </>
  );
}

// Long description with a 3-line clamp + "Show more" (replaces ui.js _descHTML +
// the delegated toggle; here it's just local state).
function Desc({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  if (text.length <= 180) return <p>{text}</p>;
  return (
    <>
      <p className={"desc" + (open ? " expanded" : "")}>{text}</p>
      <button type="button" className="desc-more" onClick={() => setOpen((o) => !o)}>
        {open ? "Show less" : "Show more"}
      </button>
    </>
  );
}

function metaNetworkText(m: MetaInfo): string {
  const nodes = m.nodes || [];
  const hasCurrency = nodes.some((n) => rolesOf(n).includes("cl1"));
  const hybrid = nodes.filter((n) => rolesOf(n).length > 1).length;
  const dedBy: Record<string, number> = {};
  for (const n of nodes) {
    const r = rolesOf(n);
    if (r.length === 1) dedBy[r[0]!] = (dedBy[r[0]!] || 0) + 1;
  }
  const lead = hasCurrency
    ? `<b>${m.name}</b> is a sovereign metagraph with its own <b>${m.symbol}</b> currency`
    : `<b>${m.name}</b> is a sovereign <b>data metagraph</b> (no token)`;
  const parts: string[] = [];
  if (hybrid) parts.push(`${hybrid} hybrid`);
  for (const r of ROLE_ORDER) if (dedBy[r]) parts.push(`${dedBy[r]} dedicated ${ROLE_FR[r]}`);
  const total = hybrid + Object.values(dedBy).reduce((a, b) => a + b, 0);
  const comp = parts.length ? ` Built from ${joinList(parts)} node${total === 1 ? "" : "s"}.` : "";
  return `${lead}, anchored into the Global L0.${comp}`;
}

function AnchoredTags({ ts, anchored }: { ts: string; anchored: number | null }) {
  const filter = useStore((s) => s.filter);
  const a = getAnchor(ts);
  if (!a || !a.metaIds.size) return null;
  const tags: React.ReactNode[] = [];
  for (const id of a.metaIds) {
    const cfg = metagraphById(id);
    if (!cfg) continue;
    const n = a.metaCounts.get(id) || 1;
    tags.push(
      <span
        key={id}
        className={"mg-tag" + (id === filter ? " mg-tag--sel" : "")}
        style={{ ["--mg" as string]: hex(cfg.color) }}
      >
        {(cfg.ticker || cfg.name) + ` (${n})`}
      </span>,
    );
  }
  if (anchored != null && anchored > a.count)
    tags.push(
      <span key="unlisted" className="mg-tag mg-tag--other">
        unlisted ({anchored - a.count})
      </span>,
    );
  return (
    <div className="insp-mgs">
      <span className="insp-mgs-label">Metagraph snapshots anchored here</span>
      <div className="insp-mgs-tags">{tags}</div>
    </div>
  );
}

// The shared inspector/context card — the React port of ui.js _cardHTML/_cardBody,
// covering every pick kind. Used by both the click Inspector and the metagraph pane.
export default function InspectorCard({ p }: { p: PickDescriptor }) {
  const nodes = useStore((s) => s.nodes);
  const latest = useStore((s) => s.latestSnapshot);
  const metaList = useStore((s) => s.metaList);

  const tagColor =
    { core: COLORS.core, l0: COLORS.l0, l1: COLORS.l1, snapshot: COLORS.core, meta: p.cfg?.color, metanode: p.meta?.color }[
      p.kind
    ] ?? COLORS.core;
  const h = hex(tagColor);
  const label =
    p.kind === "meta"
      ? "Metagraph"
      : p.kind === "metanode"
        ? "Metagraph node"
        : p.kind === "snapshot"
          ? "DAG snapshot"
          : p.kind.toUpperCase();

  // Token badge (meta + metanode cards).
  let token: React.ReactNode = null;
  if (p.kind === "meta" && p.cfg) {
    token = (
      <span className="mg-tag mg-tag--sel" style={{ ["--mg" as string]: h, margin: "0 0 10px 6px" }}>
        {p.cfg.ticker || p.cfg.name}
      </span>
    );
  } else if (p.kind === "metanode" && p.meta) {
    const hasCurrency = (p.meta.nodes || []).some((n) => (n.roles || [n.layer!]).includes("cl1"));
    token = hasCurrency ? (
      <span className="mg-tag mg-tag--sel" style={{ ["--mg" as string]: h, margin: "0 0 10px 6px" }}>
        {p.meta.symbol || "—"}
      </span>
    ) : (
      <span className="mg-tag mg-tag--other" style={{ margin: "0 0 10px 6px" }}>
        no token
      </span>
    );
  }

  return (
    <>
      <span
        className="insp-tag"
        style={{ background: `${h}22`, color: h, border: `1px solid ${h}55` }}
      >
        {label}
      </span>
      {token}
      {p.kind === "snapshot" && p.data && <LiveHeart ordinal={p.data.ordinal} />}
      {p.title && <h3>{p.title}</h3>}
      {p.sub && <p className="insp-sub">{p.sub}</p>}
      <Body p={p} nodes={nodes} latest={latest} metaList={metaList} />
    </>
  );
}

function Body({
  p,
  nodes,
  latest,
  metaList,
}: {
  p: PickDescriptor;
  nodes: { l0: number; l1: number };
  latest: { ordinal: number; height?: number; metagraphSnapshotCount?: number } | null;
  metaList: MetaInfo[];
}) {
  if (p.kind === "core") {
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
  if (p.kind === "l0") {
    return (
      <>
        <NodeRows node={p.node} />
        <GeoRows geo={p.geo} />
        <p>
          This is one of the <b>{nodes.l0}</b> validators in the Global L0 cluster, running{" "}
          <b>PRO consensus</b> (Proof of Reputable Observation): nodes observe each other and build
          reputation, so honest validators converge on the next snapshot without mining.
        </p>
      </>
    );
  }
  if (p.kind === "l1") {
    return (
      <>
        <NodeRows node={p.node} />
        <GeoRows geo={p.geo} />
        <p>
          One of the <b>{nodes.l1}</b> nodes in the DAG L1 cluster. <b>L1</b> is where transactions
          and application data enter the network — validated locally, then submitted up to L0 for
          final settlement.
        </p>
      </>
    );
  }
  if (p.kind === "snapshot" && p.data) {
    const d = p.data;
    const anchored = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : null;
    const when = d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : "—";
    const a = getAnchor(d.timestamp);
    const identified = a ? a.count : 0;
    const feeDag = a ? a.fee / 1e8 : 0;
    const full = anchored != null && a != null && identified >= anchored;
    const pct = anchored ? Math.round((identified / anchored) * 100) : 0;
    const heightTxt =
      d.subHeight != null
        ? `${(d.height ?? 0).toLocaleString()} · ${d.subHeight}`
        : (d.height ?? 0).toLocaleString();
    return (
      <>
        <div className="insp-time">
          <span className="insp-time-label">Snapshot time</span>
          <span className="insp-time-val">{when}</span>
        </div>
        <AnchoredTags ts={d.timestamp} anchored={anchored} />
        {a && a.fee > 0 && (
          <Row label="Settlement fees">
            {feeDag.toFixed(4)} DAG{" "}
            <span className={"insp-mini " + (full ? "ok" : "approx")}>
              {full ? "complete" : "at least"}
            </span>
          </Row>
        )}
        <Row label={d.subHeight != null ? "Height · sub-height" : "Height"}>{heightTxt}</Row>
        {a && a.fee > 0 && !full && (
          <p style={{ marginTop: 14 }}>
            Each anchored snapshot pays a <b>$DAG fee</b> set by its size. We can attribute{" "}
            <b>
              {identified} of {anchored}
            </b>{" "}
            ({pct}%) to publicly listed metagraphs, so the total is{" "}
            <b>at least {feeDag.toFixed(4)} $DAG</b>.
          </p>
        )}
        {full && (
          <p style={{ marginTop: 14 }}>
            Every anchored snapshot here is publicly listed, so the <b>{feeDag.toFixed(4)} DAG</b>{" "}
            fee total is complete.
          </p>
        )}
      </>
    );
  }
  if (p.kind === "metanode" && p.meta) {
    const roles = (p.node?.roles && p.node.roles.length ? p.node.roles : [p.node?.layer!])
      .map((r) => ROLE[r] || r)
      .join(" · ");
    return (
      <>
        <Row label="Runs">{roles}</Row>
        <NodeRows node={p.node} showIp={false} />
        <GeoRows geo={p.geo} showCoords={false} />
        <p style={{ marginTop: 14 }} dangerouslySetInnerHTML={{ __html: metaNetworkText(p.meta) }} />
      </>
    );
  }
  if (p.kind === "meta" && p.cfg) {
    const mg = metaList.find((x) => x.id === p.cfg!.id) || null;
    const nodeList = mg?.nodes || [];
    let facts: React.ReactNode = null;
    if (nodeList.length) {
      const present = ROLE_ORDER.filter((r) => nodeList.some((n) => rolesOf(n).includes(r)));
      const hybrid = nodeList.filter((n) => rolesOf(n).length > 1).length;
      const dedBy: Record<string, number> = {};
      nodeList.forEach((n) => {
        const r = rolesOf(n);
        if (r.length === 1) dedBy[r[0]!] = (dedBy[r[0]!] || 0) + 1;
      });
      const parts = (hybrid ? [`${hybrid} hybrid`] : []).concat(
        present.filter((r) => dedBy[r]).map((r) => `${dedBy[r]} dedicated ${ROLE_FR[r]}`),
      );
      facts = (
        <>
          <Row label="Layers">{present.map((r) => ROLE_FR[r]).join(", ")}</Row>
          <Row label="Nodes">{nodeList.length}</Row>
          <Row label="Make-up">{joinList(parts)}</Row>
          {mg && mg.countriesCount > 0 && <Row label="Countries">{mg.countriesCount}</Row>}
        </>
      );
    }
    const blurb = mg?.description || p.cfg.blurb;
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
  return null;
}
