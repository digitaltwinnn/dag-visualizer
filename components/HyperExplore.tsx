"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { EXPLORE_ICON } from "@/components/icons";
import { shortHash, CORE_HEX, metagraphById } from "@/src/data/network";
import { nodeCompositionLabel } from "@/src/data/composition";
import { identityHudHex } from "@/src/palette/identity";
import { IdentityDot, RoleChips, ROLE_FR } from "@/components/inspector/parts";
import { SELECTED_ROW, SelectedRowMark } from "@/components/selection";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { filterToggleActions, nodeSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { subjectPairing } from "@/components/useSubjectPairing";
import type { NodeRow } from "@/src/data/types";

// Hypergraph's single **explore** card — the architectural sibling of GeoExplore: each view's
// explorer breaks the node set down along the view's OWN dimension (geo = where → country →
// cohort → node; hyper = who/what → network → layer shell → node). The NETWORK rows mirror the
// filter picker on purpose (clicking one commits the filter through the same tested table a 3D
// hub click runs — the top-bar filter stays the global scope control, this is the view's
// browsing surface); the LAYER rows under the drilled network map one-to-one onto the
// concentric shells around its hub, and are DISCLOSURES ONLY (grouping on the way to a node —
// NEVER layer-card selectors: the layer card is a ledger-scoped subject, and wiring these rows
// to layerToggleActions would blur the two views' semantics). The terminal subject here is a
// node.
export default function HyperExplore() {
  const metaList = useStore((s) => s.metaList);
  const filter = useStore((s) => s.filter);
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const setHoverCohort = useStore((s) => s.setHoverCohort);
  const [collapsed, setCollapsed] = useState(false);

  // Row selections run the SAME tested decision table as the scene clicks (domain/pickActions)
  // through the SAME executor (store/applyClickActions) — a network row IS a hub click, a node
  // row IS a 3D node click; re-clicking the committed network steps back to "all" (the filter
  // picker's toggle rule), re-clicking the selected node deselects.
  const toggleNetwork = (id: string) => applyClickActions(filterToggleActions(id, filter));
  const selectNode = (pick: NodeRow["pick"], selected: boolean) =>
    applyClickActions(nodeSelectActions(pick, { mode: "hyper", currentFilter: filter, deselect: selected }));

  // The drilled network's nodes grouped by the LAYER SHELL each instance sits in — one row per
  // cluster entry, exactly what the 3D lays out (a hybrid machine appears in every cluster it
  // runs, as separate entries). The DAG's own L0/L1 fold into L0/cL1 like any metagraph (the
  // vitals' one-taxonomy rule). Sorted by id for a stable order across refreshes.
  const SHELL_ORDER = ["l0", "cl1", "dl1"] as const;
  type ShellId = (typeof SHELL_ORDER)[number];
  const shellOf = (r: NodeRow): ShellId => (r.layer === "l1" ? "cl1" : (r.layer as ShellId) ?? "l0");
  const shellsOf = (rows: NodeRow[]): { shell: ShellId; rows: NodeRow[] }[] => {
    const by = new Map<ShellId, NodeRow[]>();
    for (const r of rows) {
      const s = shellOf(r);
      (by.get(s) ?? by.set(s, []).get(s)!).push(r);
    }
    for (const rows of by.values()) rows.sort((a, b) => (a.id || a.label).localeCompare(b.id || b.label));
    return SHELL_ORDER.filter((s) => by.has(s)).map((s) => ({ shell: s, rows: by.get(s)! }));
  };
  // Which shell is disclosed (single-open, like geo's cohorts); keys are network-scoped so a
  // stale key after a filter switch simply matches nothing.
  const [openShell, setOpenShell] = useState<string | null>(null);

  // The selected node, matched by IP **and** layer (one machine can sit in two clusters).
  const sel =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const selIp = sel?.node?.ip ?? null;
  const selLayer = sel ? (sel.kind === "metanode" ? sel.node?.layer ?? null : sel.kind) : null;

  return (
    <Card
      asChild
      className="sig-right flex flex-col flex-none gap-0 p-0 [--spine:var(--filter-accent,var(--primary))]"
    >
      <aside id="hyperexplore">
        <CardHead
          panel
          icon={EXPLORE_ICON}
          title="Nodes by network"
          eyebrow="Hypergraph · explore"
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <div className={cn("flex flex-col", collapsed && "hidden")}>
          <div className="pt-1.5 px-[14px] pb-2">
            {metaList.map((m) => {
              const cfg = metagraphById(m.id);
              const name = cfg?.name ?? m.id;
              const hue = m.id === "dag" ? CORE_HEX : identityHudHex(m.id);
              const open = m.id === filter;
              // Bidirectional pairing on the SAME channel the 3D hubs and the dossier use:
              // hovering the row previews the selection dim in the scene, hovering the hub
              // washes this row.
              const pair = subjectPairing(hoverFilter, m.id, setHoverFilter, hue);
              return (
                <div key={m.id} className={cn(open && "bg-wash-faint rounded-btn my-0.5 -mx-1.5 px-1.5")}>
                  <button
                    type="button"
                    className={cn(
                      "nb-row group flex items-center gap-2.5 w-[calc(100%+12px)] text-left text-body border border-transparent bg-transparent cursor-pointer py-[5px] px-1.5 -mx-1.5 rounded-sm transition-[background] duration-150",
                      "hover:bg-wash-hover",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                      // The committed network wears the shared selection language; its state
                      // cue is the open accordion, not a ✓ (geo's drilled-country rule).
                      open && SELECTED_ROW,
                      pair.paired && pair.className,
                    )}
                    style={pair.style}
                    aria-expanded={open}
                    title={`${name} · ${m.nodes.length} node${m.nodes.length === 1 ? "" : "s"}`}
                    onClick={() => toggleNetwork(m.id)}
                    onMouseEnter={pair.onMouseEnter}
                    onMouseLeave={pair.onMouseLeave}
                  >
                    <IdentityDot hue={hue} />
                    <span className="flex-1 min-w-0 text-body text-foreground-dim whitespace-nowrap overflow-hidden text-ellipsis" title={name}>
                      {name}
                    </span>
                    <span className="flex-none text-right text-body tabular-nums font-semibold">{m.nodes.length}</span>
                    {open ? (
                      <SelectedRowMark className="flex-none" />
                    ) : (
                      <ChevronRight
                        aria-hidden
                        className="size-3.5 flex-none transition-opacity duration-150 motion-reduce:transition-none text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      />
                    )}
                  </button>

                  {open && (
                    // Leaving the shell list clears the scene hover-glows.
                    <div
                      className="mb-1.5 ml-[9px] py-0.5 pl-3 border-l border-border"
                      onMouseLeave={() => {
                        setHoverNodeId(null);
                        setHoverCohort(null);
                      }}
                    >
                      {selNodes.length === 0 ? (
                        // Honest instrument state — mirrors the 3D: a metagraph with no
                        // reported nodes renders a hub and nothing else.
                        <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">No nodes reported — hub only.</p>
                      ) : (
                        shellsOf(selNodes).map((g) => {
                          const key = `${m.id}|${g.shell}`;
                          const isOpen = openShell === key;
                          const holdsSel =
                            selIp != null &&
                            g.rows.some(
                              (r) => r.layer === selLayer && "node" in r.pick && r.pick.node?.ip === selIp,
                            );
                          return (
                            <div key={key}>
                              {/* The shell row: one line per concentric layer shell — the
                                  hub's architecture as a list. A DISCLOSURE (chevron) on the
                                  way to a node, never a layer-card selector. */}
                              <button
                                type="button"
                                className={cn(
                                  "group/shell relative flex items-center gap-2 w-[calc(100%+6px)] py-[5px] pl-2 pr-2 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left text-foreground-dim transition-colors duration-[140ms]",
                                  "hover:bg-wash-hover hover:text-foreground",
                                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                                )}
                                aria-expanded={isOpen}
                                title={`${ROLE_FR[g.shell]} · ${g.rows.length} node${g.rows.length > 1 ? "s" : ""}`}
                                onClick={() => setOpenShell(isOpen ? null : key)}
                                // Hovering a shell glows its WHOLE 3D shell (every member id).
                                onMouseEnter={() =>
                                  setHoverCohort(g.rows.map((r) => hoverKeyOf(r.pick)).filter((k): k is string => !!k))
                                }
                                onMouseLeave={() => setHoverCohort(null)}
                              >
                                <RoleChips codes={[g.shell === "l0" ? "L0" : g.shell === "cl1" ? "cL1" : "dL1"]} />
                                {/* The friendly word — omitted for L0, where it would just
                                    repeat the chip ("[L0] L0"). */}
                                {g.shell !== "l0" && (
                                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-label text-muted-foreground">
                                    {ROLE_FR[g.shell]}
                                  </span>
                                )}
                                <span className="ml-auto flex-none tabular-nums text-body font-semibold">{g.rows.length}</span>
                                {holdsSel && !isOpen ? (
                                  <SelectedRowMark className="flex-none" />
                                ) : (
                                  <ChevronRight
                                    aria-hidden
                                    className={cn(
                                      "size-3.5 flex-none transition-transform duration-150 motion-reduce:transition-none text-muted-foreground opacity-0 group-hover/shell:opacity-100 group-focus-visible/shell:opacity-100 [@media(hover:none)]:opacity-100",
                                      isOpen && "rotate-90 opacity-100",
                                    )}
                                  />
                                )}
                              </button>

                              {isOpen && (
                                <div className="mb-1 ml-[7px] pl-2 border-l border-border">
                                  {g.rows.map((r, i) => {
                                    const on =
                                      selIp != null && r.layer === selLayer &&
                                      "node" in r.pick && r.pick.node?.ip === selIp;
                                    const hoverKey = hoverKeyOf(r.pick);
                                    const rowHue = r.pick.kind === "metanode" && r.pick.meta ? identityHudHex(r.pick.meta.id) : CORE_HEX;
                                    const rowPair = subjectPairing(hoverNodeId, hoverKey, setHoverNodeId, rowHue);
                                    return (
                                      <button
                                        key={(r.id ?? r.label) + i}
                                        className={cn(
                                          "nb-row relative flex items-center gap-2 w-full py-1 pl-2 pr-7 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left text-foreground-dim transition-colors duration-[140ms]",
                                          "hover:bg-wash-hover hover:text-foreground",
                                          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                                          on && SELECTED_ROW,
                                          rowPair.paired && rowPair.className,
                                        )}
                                        style={rowPair.style}
                                        title={`${r.label} · ${r.state ?? "—"}`}
                                        onClick={() => selectNode(r.pick, on)}
                                        onMouseEnter={rowPair.onMouseEnter}
                                      >
                                        {/* Type word leads, mono id trails — the geo id rows'
                                            exact grammar (one picker idiom everywhere). */}
                                        {(() => {
                                          const comp = "node" in r.pick && r.pick.node ? nodeCompositionLabel(r.pick.node) : null;
                                          return (
                                            <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                                              {comp && <span className="flex-none text-label">{comp}</span>}
                                              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-label text-muted-foreground">
                                                {r.id ? shortHash(r.id) : r.label}
                                              </span>
                                            </span>
                                          );
                                        })()}
                                        {on && <SelectedRowMark className="absolute right-2" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="pt-[10px] px-4 pb-3 text-label text-muted-foreground">Click a network to drill into its shells.</div>
        </div>
      </aside>
    </Card>
  );
}
