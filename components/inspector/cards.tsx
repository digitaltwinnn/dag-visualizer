"use client";

import { useStore } from "@/src/store/store";
import { getAnchor, shortHash, CORE_HEX } from "@/src/data/network";
import { toDag, hex, fmtKB } from "@/src/util/format";
import type { GlobalSnapshot, MetaCfg, PickDescriptor } from "@/src/data/types";
import AnchoredTags from "./AnchoredTags";
import {
  Desc,
  ROLE_ORDER,
  RoleTags,
  Row,
  nodeComposition,
  nodeStateColor,
  rolesOf,
} from "./parts";

type PickOf<K extends PickDescriptor["kind"]> = Extract<PickDescriptor, { kind: K }>;

// A clicked Global L0 snapshot: its place in the DAG, what it anchored, and what it cost.
export function SnapshotCard({ data: d }: { data: GlobalSnapshot }) {
  // Re-render on anchor/global polls so the polled-floor fallback (old ticks) stays fresh.
  useStore((s) => s.activity);
  // EXACT totals from the raw L0 snapshot (via SnapshotExactBridge), if available for this tick.
  // When present they're authoritative — the fee is the true total (incl. unlisted) and complete.
  const exact = useStore((s) => s.snapshotExact[d.ordinal]);
  const latestOrdinal = useStore((s) => s.latestOrdinal);
  // The LIVE tick uses exact ONLY (it's recent, so the L0 read is quick) — never the polled floor.
  // While exact is in-flight we show a brief "reading…" rather than a transient/settling number.
  const isLive = latestOrdinal != null && d.ordinal === latestOrdinal;
  const awaitingExact = isLive && exact == null;
  const anchored = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : null;
  const a = getAnchor(d.timestamp);
  const identified = a ? a.count : 0;
  const feeDag = exact ? toDag(exact.totalFee) : a ? toDag(a.fee) : 0;
  const full = exact != null || (anchored != null && a != null && identified >= anchored);
  const heightTxt =
    d.subHeight != null
      ? `${(d.height ?? 0).toLocaleString()} · ${d.subHeight}`
      : (d.height ?? 0).toLocaleString();
  const blocks = Array.isArray(d.blocks) ? d.blocks.length : 0;
  // Fee shown from exact, or the polled floor for OLD ticks — but never the floor for the live tick.
  const hasFee = exact ? exact.totalFee > 0 : !awaitingExact && !!a && a.fee > 0;
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
      {(exact || awaitingExact || (a && a.metaIds.size > 0)) && <div className="insp-div" />}
      <AnchoredTags ts={d.timestamp} ordinal={d.ordinal} anchored={anchored} awaiting={awaitingExact} />

      {/* ③ what it cost — just the figure + how complete it is; no prose, the data is the point. */}
      {hasFee && <div className="insp-div" />}
      {hasFee && (
        <Row label="Settlement fees">
          {feeDag.toFixed(4)} DAG
          {/* Two independent facts: the fee (as reported) and the measured serialized size (the
              content byte length) — the size is NOT derived from the fee. */}
          {exact ? <span className="insp-dim"> · {fmtKB(exact.totalSizeKB)} of data</span> : null}{" "}
          {!exact && (
            <span className={"insp-mini " + (full ? "ok" : "approx")}>
              {full ? "complete" : "at least"}
            </span>
          )}
        </Row>
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
  const nodeList = mg?.nodes || [];
  let facts: React.ReactNode = null;
  if (nodeList.length) {
    const c = nodeComposition(nodeList);
    const ready = nodeList.reduce((n, x) => n + (x.state === "Ready" ? 1 : 0), 0);
    const allReady = ready === nodeList.length;
    // Columns that SUM to the node total: the hybrid machines (one box running several layers)
    // + one column per layer for the *dedicated* (single-layer) machines. The dedicated columns
    // are always rendered (0 when absent) so the table keeps a fixed skeleton instead of
    // collapsing to a lone column. Counts sit centred over the layer tag(s).
    const hybridRoles = ROLE_ORDER.filter((r) =>
      nodeList.some((n) => rolesOf(n).length > 1 && rolesOf(n).includes(r)),
    );
    const groups = [
      { count: c.hybrid, roles: hybridRoles.length ? hybridRoles : c.present },
      ...ROLE_ORDER.map((r) => ({ count: c.dedBy[r] || 0, roles: [r] })),
    ];
    facts = (
      <div className="nf">
        <div className="nf-total">
          <span>
            <b>{nodeList.length}</b> node{nodeList.length === 1 ? "" : "s"}
          </span>
          <span className={"insp-mini " + (allReady ? "ok" : "approx")}>
            {allReady ? "all online" : `${ready} online`}
          </span>
        </div>
        <div className="nf-grid">
          {groups.map((g, i) => (
            <div className={"nf-col" + (g.count === 0 ? " nf-col--empty" : "")} key={i}>
              <span className="nf-head">
                <b>{g.count}</b>
              </span>
              <RoleTags roles={g.roles} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const blurb = mg?.description || cfg.blurb;
  const site = mg?.siteUrl;
  return (
    <>
      <Desc text={blurb} />
      {/* Identity flow: name → what it is → where to find it → then the node make-up. The link
          sits right under the description (the header's top-right is taken by the close ×). */}
      {site && (
        <a className="insp-site" href={site} target="_blank" rel="noopener noreferrer">
          {site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
      )}
      {facts}
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
// facts you can't see on the globe — which network it serves, the layer(s) it runs, its
// state, and where it sits. The slot eyebrow already reads "Selected node", so this only
// adds a deselect ×.
function GeoLiveNode({ p, onClear }: { p: PickOf<"l0" | "l1" | "metanode">; onClear: () => void }) {
  // Title = Node ID (the stable identity); fall back to IP/place only if there's no ID.
  const id = p.node?.id;
  const title = id ? shortHash(id) : p.node?.ip || p.geo?.city || p.geo?.country || "Node";

  // The node's network colour, for the leading bullet. The network itself isn't a row — the
  // bullet colour-codes it, clicking a node sets the filter (so the top-bar pill + the left
  // dossier name it), so a Network row here would just triplicate it. The layer(s) it runs use
  // the full role set the pick carries (a hybrid keeps every layer, not just the clicked shell).
  const color = p.kind === "metanode" ? (p.meta ? hex(p.meta.color) : undefined) : CORE_HEX;
  const roleKeys = (
    p.roles?.length
      ? p.roles
      : p.node?.roles?.length
        ? p.node.roles
        : [p.kind === "metanode" ? p.layer ?? p.node?.layer : undefined].filter(Boolean)
  ) as string[];

  const state = p.node?.state ?? "—";
  const stateColor = nodeStateColor(p.node?.state);
  const g = p.geo;
  const place = g ? `${g.city ? g.city + ", " : ""}${g.country ?? ""}`.trim() : "";

  return (
    <>
      {/* Close pinned to the panel's top-right corner (like the snapshot card), so the state
          pill can float to the right end of the ID line. */}
      <button className="gel-clear" title="Deselect" onClick={onClear}>
        ×
      </button>
      <div className="gel-node-head">
        {color && <span className="gel-dot" style={{ background: color }} />}
        <span className="gel-node-title insp-hash">{title}</span>
        {/* State pill floats right on the ID line — colour-coded per lifecycle state. */}
        <span
          className="gel-state"
          style={{ color: stateColor, borderColor: stateColor + "55", background: stateColor + "1a" }}
        >
          {state}
        </span>
      </div>
      <Row label="Runs">
        <RoleTags roles={roleKeys} />
      </Row>
      {place && <Row label="Location">{place}</Row>}
    </>
  );
}

