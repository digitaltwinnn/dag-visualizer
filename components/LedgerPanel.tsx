"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { EXPLORE_ICON } from "@/components/icons";
import { SELECTED_ROW, SelectedRowMark } from "@/components/selection";
import { subjectPairing } from "@/components/useSubjectPairing";
import { filterAccent, metagraphById } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { IdentityDot } from "@/components/inspector/parts";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { useStore } from "@/src/store/store";
import { layerToggleActions, nodeSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { DisclosureRow, NodePickerRow } from "@/components/ExploreRows";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers";
import type { NodeRow } from "@/src/data/types";

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
// metagraph's nodes), so ml0/ml1 only have rows under a metagraph filter and hypl0/hypl1 only
// under "all"/"dag" — an instrument-state fact, not a bug (the empty line below says so).
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

export default function LedgerPanel() {
  const [collapsed, setCollapsed] = useState(false);
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
  // Which ml0/ml1 cluster (metagraph) group is disclosed — single-open, same idiom as the
  // other explorers' cohort/composition groups. Keyed `floorId|metaId` so a stale key after a
  // filter/floor switch simply matches nothing.
  const [openCluster, setOpenCluster] = useState<string | null>(null);

  // The selected node, matched by IP **and** layer — copies GeoExplore's selIp/selLayer: one
  // machine can sit in both an L0 and L1 cluster (same IP, two rows).
  const selNode =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const selIp = selNode?.node?.ip ?? null;
  const selLayer = selNode ? (selNode.kind === "metanode" ? selNode.node?.layer ?? null : selNode.kind) : null;

  // Rows run the SAME tested toggle as the scene's floor-plane click, through the shared
  // executor — the panel and the 3D planes can't drift (see domain/pickActions).
  const commit = (l: (typeof LAYERS)[number]) =>
    applyClickActions(layerToggleActions({ kind: "layer", layerId: l.id }, sel));
  // A node row's click runs the full-ancestry table with THIS floor as the ledger layer rung
  // (nodeSelectActions' ledgerLayerId) — so a browsed node commits the floor it was found on,
  // not whatever autoLayerForNode would guess.
  const selectNode = (pick: NodeRow["pick"], floorId: string, selected: boolean) =>
    applyClickActions(
      nodeSelectActions(pick, { mode: "ledger", currentFilter: filter, deselect: selected, ledgerLayerId: floorId }),
    );
  return (
    // flex-none + no inner overflow (same treatment as GeoExplore, user: consistent rail
    // behaviour): the card grows with its content and the RAIL scrolls/fades into the chart
    // band — the old shrink-to-fit + inner scrollbox kept the rail from ever overflowing, so
    // the bottom fade never engaged in this view.
    <Card asChild className="sig-right block p-0 flex-none [--spine:var(--filter-accent,var(--primary))]">
      <aside id="ledger-view">
        <CardHead
          panel
          icon={EXPLORE_ICON}
          title="Settlement layers"
          eyebrow="Explore"
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <div className={cn("flex flex-col px-3 pt-1.5 pb-2.5", collapsed && "hidden")}>
          {/* The usage hint LEADS the card (matches the other explorers) — what it holds + what
              you learn. px-1 nets the same ~16px inset as the sibling cards' px-4 hints. */}
          <div className="px-1 pt-0.5 pb-1.5 text-label text-muted-foreground">
            Every layer that participates in creating a snapshot — hover or click one to see what it does in the settlement stack.
          </div>
          <div className="flex flex-col gap-0.5" onMouseLeave={() => setHilite(null)}>
            {LAYERS.map((l) => {
              const on = sel === l.id;
              // The SAME scene↔HUD hover pairing as GeoExplore's node rows: hovering the row
              // previews the plane highlight, hovering the 3D plane pairs this row back — wearing
              // the active filter's identity hue (`filterAccent`, cyan on "all"), via the shared
              // `.nb-row.subject-paired` row-wash recipe.
              const pair = subjectPairing<string>(hilite, l.id, setHilite, filterAccent(filter));
              const discloses = NODE_FLOORS.has(l.id);
              const rows = discloses ? rowsForFloor(l.id, selNodes) : [];
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
                    // `relative pr-7` reserves the shared trailing ✓ slot so the text never shifts
                    // when a layer is selected — the SAME committed-selection language as the filter
                    // picker's row (SELECTED_ROW: wash + inset ring as one box-shadow + Check mark).
                    // `nb-row border border-transparent` hosts the pairing wash (box-shadow-based
                    // SELECTED_ROW composes under it, same as the geo node rows).
                    "nb-row relative text-left border border-transparent cursor-pointer rounded-sm pl-1.5 pr-7 py-1.5 bg-transparent transition-[background] duration-150",
                    "hover:bg-wash-hover",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                    on && SELECTED_ROW,
                    pair.paired && pair.className,
                  )}
                  style={pair.style}
                >
                  {/* The layer's STACK-LEVEL badge (LEDGER_LAYERS.level — up from the base:
                      Global snapshots = 1, the split hypergraph plane = sub-levels 2.1/2.2),
                      mirrored by the 3D floor labels so panel row and plane pair at a glance. */}
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
                    <span className={cn("block text-body text-foreground", on && "font-semibold")}>{l.name}</span>
                  </span>
                  <span className="block pl-[26px] text-label text-muted-foreground leading-snug mt-0.5">{l.desc}</span>
                  {/* top-[8px] centres the 14px check on the SAME line as the 18px level badge
                      (row pad 6 + 18/2 = 15px centre; 8 + 14/2 = 15). */}
                  {on && <SelectedRowMark className="absolute right-2 top-[8px]" />}
                </button>

                {/* Node browser disclosure — one per NODE floor, committed row auto-opens (the
                    country-row idiom: the layer button's click already commits AND opens/closes
                    this, no separate expand state). Leaving the list clears the scene hover-glows. */}
                {discloses && on && (
                  <div
                    className="mb-1.5 ml-[9px] py-0.5 pl-3 border-l border-border"
                    onMouseLeave={() => {
                      setHoverNodeId(null);
                      setHoverCohort(null);
                    }}
                  >
                    {rows.length === 0 ? (
                      // Honest instrument state (CLAUDE.md "Honesty over decoration"): selNodes
                      // publishes per the CURRENT FILTER (validators under "all"/"dag", one
                      // metagraph's nodes otherwise), so a metagraph floor under "all" (or a DAG
                      // floor under a metagraph filter) has nothing to list — not a bug.
                      <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">No nodes in the current filter.</p>
                    ) : CLUSTER_FLOORS.has(l.id) ? (
                      clustersOf(rows).map((g) => {
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
                      })
                    ) : (
                      // hypl0/hypl1: one lane (the DAG core) — no cluster grouping, node rows
                      // render directly.
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
                      })
                    )}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </Card>
  );
}
