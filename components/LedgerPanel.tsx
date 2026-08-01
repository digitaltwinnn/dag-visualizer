"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import ExplorerShell from "@/components/ExplorerShell";
import { SELECTED_ROW, SelectedRowMark } from "@/components/selection";
import { subjectPairing } from "@/components/useSubjectPairing";
import { CORE_HEX, filterAccent, metagraphById } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { IdentityDot } from "@/components/inspector/parts";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { useStore } from "@/src/store/store";
import { filterToggleActions, layerToggleActions, nodeSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { DisclosureChevron, DisclosureRow, NodePickerRow, ROW_NEST, ROW_OUTSET } from "@/components/ExploreRows";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers";
import type { MetaInfo, NodeRow } from "@/src/data/types";

// The Snapshots view's left-rail tool: the layered-design explainer. Lists the settlement stack
// top→bottom; HOVERING a layer previews its plane highlight in the 3D view (store.ledgerHilite, the
// transient channel), CLICKING commits the selection (store.layer — opens the layer card on the
// right facts rail AND keeps the plane highlighted; click again to clear). The engine resolves
// `ledgerHilite ?? layer?.layerId` — the same preview-vs-commit split as hoverFilter vs filter.
// Hovering/clicking the 3D planes themselves does the SAME (the engine raycasts them as fallback
// picks), so panel rows and planes are one interaction. Display copy comes from the shared
// src/data/ledgerLayers.ts table; the geometry twin (heights/lanes) is domain/ledgerLayout.ts.
const LAYERS = LEDGER_LAYERS;

// The four NODE-kind floors — the ones with a live cluster of validators/metanodes standing on
// them (msnap/gl0 are snapshot-output floors, rowProducers has no panel row at all: see
// CLAUDE.md's ledger layer model). Each disclosure reads `store.selNodes` — published per the
// CURRENT FILTER (geoStats.listNodes: "all"/"dag" → validators, a metagraph id → that
// metagraph's nodes), so ml0/ml1 only have CLUSTER rows under a metagraph filter and hypl0/hypl1
// only have VALIDATOR rows under "all"/"dag". That's still true, but it's no longer the whole
// story: "a browser's network level IS the filter" (the HyperExplore idiom) — every floor also
// lists a LANE ROW per other network that serves it, so a floor is never actually empty once
// live data has arrived (see the lane-row block below the committed rows/clusters).
const NODE_FLOORS = new Set(["ml1", "ml0", "hypl0", "hypl1"]);
const CLUSTER_FLOORS = new Set(["ml1", "ml0"]); // group by metagraph before the node rows

function rowsForFloor(id: string, selNodes: NodeRow[]): NodeRow[] {
  switch (id) {
    case "hypl0":
      return selNodes.filter((r) => r.pick.kind === "l0");
    case "hypl1":
      return selNodes.filter((r) => r.pick.kind === "l1");
    case "ml0":
      return selNodes.filter((r) => r.pick.kind === "metanode" && r.roles.includes("l0"));
    case "ml1":
      return selNodes.filter((r) => r.pick.kind === "metanode" && (r.roles.includes("cl1") || r.roles.includes("dl1")));
    default:
      return [];
  }
}

interface ClusterGroup {
  id: string;
  name: string;
  hue: string;
  rows: NodeRow[];
}

// ml0/ml1 rows grouped by metagraph — one cluster row per lane (currently at most one, since
// selNodes only ever carries the ACTIVE filter's metagraph; grouping stays generic so a future
// broader selNodes publication needs no rework here).
function clustersOf(rows: NodeRow[]): ClusterGroup[] {
  const by = new Map<string, ClusterGroup>();
  for (const r of rows) {
    if (r.pick.kind !== "metanode" || !r.pick.meta) continue;
    const id = r.pick.meta.id;
    const cfg = metagraphById(id);
    (by.get(id) ?? by.set(id, { id, name: cfg?.name ?? id, hue: identityHudHex(id), rows: [] }).get(id)!).rows.push(r);
  }
  return [...by.values()].sort((a, b) => b.rows.length - a.rows.length);
}

// Per-metagraph, per-FLOOR node tally, straight from MetaInfo's own node/role data — the same
// `n.roles ?? []` reading LayerCard's ml0/ml1 facts use (components/inspector/cards.tsx), no
// `n.layer` fallback. This is the COUNT-HONESTY boundary: it's a real floor-accurate number (how
// many of THIS metagraph's reported nodes serve THIS floor), not the filter strip's whole-fleet
// `located` (geo-resolved) figure — a lane row must never borrow a number that answers a
// different question.
function metaFloorCount(m: MetaInfo, floorId: "ml0" | "ml1"): number {
  return m.nodes.filter((n) => {
    const roles = n.roles ?? [];
    return floorId === "ml0" ? roles.includes("l0") : roles.includes("cl1") || roles.includes("dl1");
  }).length;
}

interface LaneMeta {
  id: string;
  name: string;
  hue: string;
  count: number;
}

// A lane row is the browser's NETWORK-LEVEL affordance (mirrors HyperExplore's network rows,
// which mirror the top-bar filter chips): identity dot + name + an honest count, clicking it
// COMMITS the filter through the same tested table + executor every other pick uses. It only
// ever COMMITS (never steps a committed network back to "all") — a lane row is never rendered
// for the already-committed network, so filterToggleActions' re-click-clears branch can't fire
// from here; it's still the shared builder because that's the one true toggle semantics.
function LaneRow({
  lane,
  filter,
  hoverFilter,
  setHoverFilter,
}: {
  lane: LaneMeta;
  filter: string;
  hoverFilter: string | null;
  setHoverFilter: (id: string | null) => void;
}) {
  const pair = subjectPairing(hoverFilter, lane.id, setHoverFilter, lane.hue);
  return (
    <button
      type="button"
      title={`${lane.name} · ${lane.count} node${lane.count === 1 ? "" : "s"}`}
      onClick={() => {
        // Commit the filter, then clear the hover PREVIEW alongside it (the FilterPicker
        // precedent, components/topbar/FilterPicker.tsx:58 — but that one is container-level;
        // this is the CLICK-side belt): committing a lane row can remove it from this floor's
        // lane list (its network is no longer an "other" network once committed), so the row
        // self-unmounts under the pointer and its own `mouseleave` never fires, leaving
        // `hoverFilter` stuck on the just-committed id. The body-level `onLeave` on
        // ExplorerShell is the other belt (catches the case where the whole disclosure closes
        // instead of just this row).
        applyClickActions(filterToggleActions(lane.id, filter));
        setHoverFilter(null);
      }}
      onMouseEnter={pair.onMouseEnter}
      onMouseLeave={pair.onMouseLeave}
      className={cn(
        // Quieter than a node/cluster row on purpose — muted text, no chevron, no border weight
        // change — a lane row is a navigation affordance, not this floor's own content.
        "nb-row flex items-center gap-2 w-full py-1 pl-2 pr-2 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left text-muted-foreground transition-colors duration-[140ms]",
        "hover:bg-wash-hover hover:text-foreground-dim",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        lane.count === 0 && "opacity-45", // the picker's exact 0-count idiom — real, just quiet
        pair.paired && pair.className,
      )}
      style={pair.style}
    >
      <IdentityDot hue={lane.hue} />
      <span className="flex-1 min-w-0 text-body whitespace-nowrap overflow-hidden text-ellipsis">{lane.name}</span>
      <span className="flex-none tabular-nums text-label font-semibold">{lane.count}</span>
    </button>
  );
}

export default function LedgerPanel() {
  // The COMMITTED selection lives in the store (store.layer — it's the layer card's pick, cleared
  // by the card's × too); hover writes the transient preview channel, leave clears it (the engine
  // falls back to the committed layer).
  const sel = useStore((s) => s.layer?.layerId ?? null);
  const hilite = useStore((s) => s.ledgerHilite);
  const setHilite = useStore((s) => s.setLedgerHilite);
  const filter = useStore((s) => s.filter);
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const setHoverCohort = useStore((s) => s.setHoverCohort);
  // Lane-row data: every OTHER network that serves a node-kind floor (metaList for the
  // metagraph floors, the DAG validator machine counts for the DAG floors — same source the
  // vitals/LayerCard read: store.nodes = {l0, l1} deduped machine tallies).
  const metaList = useStore((s) => s.metaList);
  const dagNodeCounts = useStore((s) => s.nodes);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  // "A browser's network level IS the filter" (HyperExplore idiom): a REAL metagraph is
  // committed exactly when the filter isn't "all" (nothing narrower) or "dag" (the DAG's own
  // floors, not a metagraph's) — the same two values every metagraph floor's rowsForFloor
  // already special-cases.
  const committedMeta = filter !== "all" && filter !== "dag" ? filter : null;
  // ml0/ml1 lane list: every OTHER (non-root) metagraph that serves this floor, sorted by its
  // OWN floor-accurate count desc (not the filter strip's `located` — see metaFloorCount's
  // comment) so the displayed order matches the displayed number; a name tiebreak keeps it
  // stable when counts match.
  const laneMetagraphsFor = (floorId: "ml0" | "ml1"): LaneMeta[] =>
    metaList
      .filter((m) => !m.isRoot && m.id !== committedMeta)
      .map((m) => {
        const cfg = metagraphById(m.id);
        return { id: m.id, name: cfg?.name ?? m.id, hue: identityHudHex(m.id), count: metaFloorCount(m, floorId) };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  // hypl0/hypl1's own lane: the DAG core, shown only once a metagraph is committed (under
  // "all"/"dag" the real validator rows already occupy these floors).
  const dagLane = (floorId: "hypl0" | "hypl1"): LaneMeta => ({
    id: "dag",
    name: "DAG",
    hue: CORE_HEX,
    count: floorId === "hypl0" ? dagNodeCounts.l0 : dagNodeCounts.l1,
  });
  // Which ml0/ml1 cluster (metagraph) group is disclosed — single-open, same idiom as the
  // other explorers' cohort/composition groups. Keyed `floorId|metaId` so a stale key after a
  // filter/floor switch simply matches nothing.
  const [openCluster, setOpenCluster] = useState<string | null>(null);
  // Which NODE floor is disclosed — mirrors `sel` (store.layer) but kept as its own fast local
  // state so the first click opens the dropdown in the SAME frame it commits, instead of
  // waiting a render for the store round-trip (that lag read as "closed" on the first click —
  // the reported bug). `open` below is `on || openFloor === l.id`: whichever arrives first
  // (the synchronous local set or the store's `on`) already renders open, and a floor committed
  // from elsewhere (a 3D plane click, autoLayerForNode) is open purely via `on`, no extra wiring.
  const [openFloor, setOpenFloor] = useState<string | null>(null);

  // The selected node, matched by IP **and** layer — copies GeoExplore's selIp/selLayer: one
  // machine can sit in both an L0 and L1 cluster (same IP, two rows).
  const selNode =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const selIp = selNode?.node?.ip ?? null;
  const selLayer = selNode ? (selNode.kind === "metanode" ? selNode.node?.layer ?? null : selNode.kind) : null;

  // Rows run the SAME tested toggle as the scene's floor-plane click, through the shared
  // executor — the panel and the 3D planes can't drift (see domain/pickActions). `openFloor`
  // is set in the SAME call, synchronously, so the disclosure never lags the commit by a
  // render: clicking an uncommitted node floor opens it, re-clicking the committed/open one
  // clears + closes it (symmetric with the existing commit/clear toggle), and clicking any
  // OTHER floor (node or snapshot) closes whatever was open — a single rule covers all three.
  const commit = (l: (typeof LAYERS)[number]) => {
    const wasOn = sel === l.id;
    applyClickActions(layerToggleActions({ kind: "layer", layerId: l.id }, sel));
    setOpenFloor(NODE_FLOORS.has(l.id) && !wasOn ? l.id : null);
  };
  // A node row's click runs the full-ancestry table with THIS floor as the ledger layer rung
  // (nodeSelectActions' ledgerLayerId) — so a browsed node commits the floor it was found on,
  // not whatever autoLayerForNode would guess.
  const selectNode = (pick: NodeRow["pick"], floorId: string, selected: boolean) =>
    applyClickActions(
      nodeSelectActions(pick, { mode: "ledger", currentFilter: filter, deselect: selected, ledgerLayerId: floorId }),
    );
  return (
    // The shell owns the Card frame, CardHead, collapse state, and the padded body — chrome-
    // normalized onto GeoExplore's exact treatment (flex-none + no inner overflow, the same
    // "consistent rail behaviour" the old hand-rolled chrome aimed for but drifted from — this
    // also retires the stray bottom separator the old combined-padding wrapper carried).
    <ExplorerShell
      id="ledger-view"
      title="Settlement layers"
      hint="Every layer that participates in creating a snapshot — hover or click one to see what it does in the settlement stack."
      onLeave={() => {
        // Structural fix for the review's stuck-hoverFilter bug: a LANE row's click commits
        // the filter, which can remove that lane (or close the whole floor disclosure it lives
        // in) out from under the pointer before its own `mouseleave` ever fires — the browser
        // doesn't synthesize one for a node removed mid-hover. This container-level boundary
        // is the backstop: leaving the WHOLE card body clears every hover channel this card's
        // rows write to (hilite for the layer rows, hoverFilter for the lane rows, hoverCohort/
        // hoverNodeId for the cluster/node rows), regardless of which row set it or whether
        // that row is still mounted to clear it itself. LaneRow's own click handler clears
        // hoverFilter too, as the second belt (the precise row-vanishes-without-leave path).
        setHilite(null);
        setHoverFilter(null);
        setHoverCohort(null);
        setHoverNodeId(null);
      }}
    >
      <div className="flex flex-col gap-0.5">
        {LAYERS.map((l) => {
              const on = sel === l.id;
              // The SAME scene↔HUD hover pairing as GeoExplore's node rows: hovering the row
              // previews the plane highlight, hovering the 3D plane pairs this row back — wearing
              // the active filter's identity hue (`filterAccent`, cyan on "all"), via the shared
              // `.nb-row.subject-paired` row-wash recipe.
              const pair = subjectPairing<string>(hilite, l.id, setHilite, filterAccent(filter));
              const discloses = NODE_FLOORS.has(l.id);
              const rows = discloses ? rowsForFloor(l.id, selNodes) : [];
              // Hoisted OUT of the disclosure body (was computed only when `on`) so the floor
              // row's own header can show an honest trailing count AT REST, before anything is
              // clicked — the same data the opened dropdown lists, never a second, disagreeing
              // number.
              const isMetaFloor = discloses && CLUSTER_FLOORS.has(l.id); // ml0/ml1
              const clusters = isMetaFloor ? clustersOf(rows) : [];
              const showValidatorRows = discloses && !isMetaFloor && !committedMeta; // hypl0/hypl1 under "all"/"dag"
              const lanes: LaneMeta[] = !discloses
                ? []
                : isMetaFloor
                  ? laneMetagraphsFor(l.id as "ml0" | "ml1")
                  : committedMeta
                    ? [dagLane(l.id as "hypl0" | "hypl1")]
                    : [];
              // The dropdown's total: its own rows plus every lane row's own count — literally
              // everything the opened list will render, so the resting number can never disagree
              // with what appears once it's open.
              const floorCount = rows.length + lanes.reduce((sum, x) => sum + x.count, 0);
              const hasContentAbove = clusters.length > 0 || (showValidatorRows && rows.length > 0);
              // Open iff committed (as before) OR this panel just opened it locally — see
              // `commit`'s comment. A floor committed from elsewhere (a 3D plane click,
              // autoLayerForNode) is open purely via `on`, no extra plumbing needed.
              const open = discloses && (on || openFloor === l.id);
              return (
                <div key={l.id}>
                <button
                  type="button"
                  onClick={() => commit(l)}
                  onMouseEnter={pair.onMouseEnter}
                  onMouseLeave={pair.onMouseLeave}
                  onFocus={pair.onMouseEnter}
                  onBlur={pair.onMouseLeave}
                  aria-pressed={on}
                  className={cn(
                    // `nb-row border border-transparent` hosts the pairing wash (box-shadow-based
                    // SELECTED_ROW composes under it, same as the geo node rows). The trailing
                    // mark now lives IN-FLOW at the end of the title row (below) — same idiom as
                    // the inner cluster/lane rows' `ml-auto` count — instead of an absolutely
                    // positioned overlay, so it can never overlap the badge/name text and every
                    // row's trailing column is built the same way. ROW_OUTSET makes this the same
                    // top-level row box geo/hyper use: without it the floor rows' wash stopped 6px
                    // inside every other explorer's (user, 2026-08-01).
                    "nb-row group relative text-left border border-transparent cursor-pointer rounded-sm py-1.5 bg-transparent transition-[background] duration-150",
                    ROW_OUTSET,
                    "hover:bg-wash-hover",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                    on && SELECTED_ROW,
                    pair.paired && pair.className,
                  )}
                  style={pair.style}
                >
                  {/* The layer's STACK-LEVEL badge (LEDGER_LAYERS.level — up from the base:
                      Global snapshots = 1, the split hypergraph plane = sub-levels 2.1/2.2),
                      mirrored by the 3D floor labels so panel row and plane pair at a glance.
                      The trailing slot mirrors DisclosureRow's: node-kind floors get their honest
                      count (the same total the opened dropdown lists — see `floorCount` above)
                      plus the shared hover-revealed DisclosureChevron (components/ExploreRows.tsx
                      — the button above carries the `group` class its reveal needs) that flips to
                      the committed ✓ once `on`; snapshot floors (msnap/gl0) render neither — the
                      slot just collapses, no reserved gap, since there's nothing to disclose. */}
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden
                      className={cn(
                        "flex-none min-w-[18px] h-[18px] px-1 rounded-xs border flex items-center justify-center text-micro tabular-nums leading-none",
                        on
                          ? "border-[var(--filter-accent,var(--primary))] text-[var(--filter-accent,var(--primary))]"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {l.level}
                    </span>
                    <span className={cn("flex-1 min-w-0 truncate text-body text-foreground", on && "font-semibold")}>
                      {l.name}
                    </span>
                    {discloses ? (
                      <span className="flex-none flex items-center gap-1.5">
                        <span className="tabular-nums text-label font-semibold text-muted-foreground">{floorCount}</span>
                        {on ? (
                          <SelectedRowMark />
                        ) : (
                          <DisclosureChevron open={open} />
                        )}
                      </span>
                    ) : (
                      // Snapshot floors (msnap/gl0) never disclose — no count, no chevron — but
                      // still wear the committed ✓ like any other selectable row.
                      on && <SelectedRowMark className="flex-none" />
                    )}
                  </span>
                  {/* No per-row description here: `LEDGER_LAYERS.desc` is the LAYER CARD's opening
                      line (inspector/cards.tsx `LayerCard`), and committing a floor opens that card
                      in the same click — so a copy under the row said the same sentence twice, one
                      rail apart, and made the browser list scan like prose instead of rows
                      (user, 2026-08-01). The explorer rows are the browse surface; the facts rail
                      explains the subject. Same split GeoExplore/HyperExplore already keep. */}
                </button>

                {/* Node browser disclosure — one per NODE floor. `open` decouples the dropdown's
                    visibility from the commit's store round-trip (see `commit`'s + `open`'s
                    comments above) so the first click reveals it in the same frame it commits.
                    Leaving the list clears the scene hover-glows. */}
                {discloses && open && (
                  <div
                    className={cn("mb-1.5 ml-[9px] py-0.5 pl-3", ROW_NEST)}
                    onMouseLeave={() => {
                      setHoverNodeId(null);
                      setHoverCohort(null);
                    }}
                  >
                    {!hasContentAbove && lanes.length === 0 ? (
                      // True-boot fallback only (CLAUDE.md "Honesty over decoration") — reachable
                      // just before metaList/validator data has arrived; once it has, every floor
                      // always has SOMETHING to show (its own rows and/or lane rows to the other
                      // networks), so this line no longer means "wrong filter for this floor".
                      <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">No nodes reported yet.</p>
                    ) : (
                      <>
                        {isMetaFloor &&
                          clusters.map((g) => {
                            const key = `${l.id}|${g.id}`;
                            const isOpen = openCluster === key;
                            const holdsSel =
                              selIp != null &&
                              g.rows.some((r) => r.layer === selLayer && "node" in r.pick && r.pick.node?.ip === selIp);
                            return (
                              <div key={key}>
                                {/* The cluster group row — one per metagraph lane. IdentityDot is
                                    correct here (one lane, one metagraph, unlike geo's mixed-network
                                    cohorts). A disclosure on the way to a node. */}
                                <DisclosureRow
                                  open={isOpen}
                                  holdsSel={holdsSel}
                                  title={`${g.name} · ${g.rows.length} node${g.rows.length > 1 ? "s" : ""}`}
                                  onToggle={() => setOpenCluster(isOpen ? null : key)}
                                  onHoverEnter={() =>
                                    setHoverCohort(g.rows.map((r) => hoverKeyOf(r.pick)).filter((k): k is string => !!k))
                                  }
                                  onHoverLeave={() => setHoverCohort(null)}
                                >
                                  <IdentityDot hue={g.hue} />
                                  <span className="flex-1 min-w-0 text-body text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                                    {g.name}
                                  </span>
                                  <span className="ml-auto flex-none tabular-nums text-body font-semibold">{g.rows.length}</span>
                                </DisclosureRow>

                                {isOpen && (
                                  <div className="mb-1 ml-[7px] pl-2 border-l border-border">
                                    {g.rows.map((r, i) => {
                                      const nodeOn =
                                        selIp != null && r.layer === selLayer && "node" in r.pick && r.pick.node?.ip === selIp;
                                      return (
                                        <NodePickerRow
                                          key={(r.id ?? r.label) + i}
                                          row={r}
                                          selected={nodeOn}
                                          hoverNodeId={hoverNodeId}
                                          setHoverNodeId={setHoverNodeId}
                                          onSelect={() => selectNode(r.pick, l.id, nodeOn)}
                                        />
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                        {showValidatorRows &&
                          // hypl0/hypl1 under "all"/"dag": one lane (the DAG core) — no cluster
                          // grouping, node rows render directly.
                          rows.map((r, i) => {
                            const nodeOn = selIp != null && r.layer === selLayer && "node" in r.pick && r.pick.node?.ip === selIp;
                            return (
                              <NodePickerRow
                                key={(r.id ?? r.label) + i}
                                row={r}
                                selected={nodeOn}
                                hoverNodeId={hoverNodeId}
                                setHoverNodeId={setHoverNodeId}
                                onSelect={() => selectNode(r.pick, l.id, nodeOn)}
                              />
                            );
                          })}

                        {lanes.length > 0 && (
                          <div className={cn("flex flex-col gap-0.5", hasContentAbove && "mt-1 pt-1 border-t border-border/60")}>
                            {lanes.map((lane) => (
                              <LaneRow key={lane.id} lane={lane} filter={filter} hoverFilter={hoverFilter} setHoverFilter={setHoverFilter} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                </div>
              );
            })}
      </div>
    </ExplorerShell>
  );
}
