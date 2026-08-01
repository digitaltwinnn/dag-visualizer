"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import ExplorerShell from "@/components/ExplorerShell";
import { metagraphById } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { SELECTED_ROW, SelectedRowMark } from "@/components/selection";
import { ccToFlag } from "@/src/util/format";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { countryToggleActions, nodeSelectActions, cohortToggleActions, sameCohort } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { subjectPairing } from "@/components/useSubjectPairing";
import { DisclosureChevron, DisclosureRow, NodePickerRow, ROW_NEST, ROW_OUTSET } from "@/components/ExploreRows";
import type { NodeRow } from "@/src/data/types";
import type { CohortSel } from "@/src/engine/domain/focusLadder";

// Geography's single **explore** card (one frame, the bare "Explore" eyebrow — the view name
// was dropped from card eyebrows, user 2026-07-12: the view switch already says where you
// are — an accordion you click into). The country list IS the
// node browser: each country is a row showing its share of the footprint (bar + count), and
// clicking it drills the globe into that country AND expands its nodes inline — master on
// top, detail nested beneath, then a node row opens its card on the right facts rail.
// The footprint's headline figures live in the top-bar vitals; this card is purely the accordion.
export default function GeoExplore() {
  const lb = useStore((s) => s.leaderboard);
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort); // read-only — the selection WRITE still goes through applyClickActions
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const setHoverCountry = useStore((s) => s.setHoverCountry);
  const setHoverCohort = useStore((s) => s.setHoverCohort);
  const hoverCountry = useStore((s) => s.hoverCountry);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const filter = useStore((s) => s.filter);

  // Row selections run the SAME tested decision table as the scene clicks (domain/pickActions)
  // through the SAME executor (store/applyClickActions), so the explorer and the globe can
  // never drift in semantics (filter-first / node's-country / inspect-last ordering, the
  // row's re-click deselect, the zoom-level rule).
  // `selected` = this row is the currently-inspected node — re-clicking it DESELECTS (the same
  // step-back as the node card's ×, user: one toggle language everywhere).
  const selectNode = (pick: NodeRow["pick"], selected: boolean) =>
    applyClickActions(nodeSelectActions(pick, { mode: "geo", currentFilter: filter, deselect: selected }));

  const list = lb?.countries ?? [];
  const max = list[0]?.count ?? 1;
  const rows = list;

  // Quiet-empty: a real metagraph is selected but has 0 locatable nodes, so the country list
  // (the leaderboard's `countries`, what this accordion renders) is empty — nothing to browse,
  // but the metagraph is real and still visible in the Hypergraph. "all"/"dag" never hit this
  // (the whole network / DAG core always has locatable validators).
  const isMetaFilter = filter !== "all" && filter !== "dag";
  const quietEmpty = isMetaFilter && list.length === 0;
  // The magnitude bar is a distribution leaderboard cue: structural cyan for the whole network /
  // DAG, but when a single metagraph is filtered the list is ITS nodes, so the bar tints to that
  // metagraph's identity hue (HUD lane).
  const barHue = isMetaFilter ? identityHudHex(filter) : undefined;
  const activeCfg = metagraphById(filter);
  const tickerOrName = activeCfg ? activeCfg.ticker || activeCfg.name : "This metagraph";
  // Click a country: drill the globe into it (store.country) — the drill state doubles as the
  // accordion's "which row is open", so the globe and the list stay one source of truth. Same
  // tested table as the scene's empty-click country toggle (zoom-level rule included).
  const drill = (cc: string) =>
    applyClickActions(countryToggleActions(cc, { country, hasInspect: !!sel, cohort }));

  // Click a cohort row: commit/clear the city×provider zoom-level rung — same
  // disclosure-AND-commit-in-one-click idiom as the country row (`drill`), through the same
  // tested table/executor. `target` carries the enclosing country row's `cc`.
  const commitCohort = (target: CohortSel) =>
    applyClickActions(cohortToggleActions(target, { cohort, hasInspect: !!sel }));

  // Selection's nodes grouped by country **name** — the join key both the leaderboard and the
  // node list derive from `geo.country` (`cc` can be absent, the name can't). Each country's
  // rows sort ALPHABETICALLY by their displayed primary (the city; the label fallback for
  // city-less rows), locale-aware, with the node id as a stable tiebreaker so co-located
  // nodes (same city) keep one deterministic order across refreshes.
  const nodesByCountry = useMemo(() => {
    const m = new Map<string, NodeRow[]>();
    for (const r of selNodes) {
      const key = r.country || "Unknown";
      (m.get(key) ?? m.set(key, []).get(key)!).push(r);
    }
    for (const rows of m.values())
      rows.sort(
        (a, b) =>
          (a.city || a.label).localeCompare(b.city || b.label, undefined, { sensitivity: "base" }) ||
          (a.id || "").localeCompare(b.id || ""),
      );
    return m;
  }, [selNodes]);

  // COHORT ROWS (user redesign, option C): a country's nodes collapse into one row per
  // city × provider — so the list repeats nothing (the old rows re-stated the same city
  // and "ready" dozens of times). A cohort row is a DISCLOSURE: clicking expands its id
  // rows inline (the pure pickers); everything aggregate already reads on the cohort row
  // itself. NO status anywhere in the list (user: health belongs to the node CARD + the
  // future network-health view). NO identity dot either (user, 2026-07-12): network is NOT
  // in the key — a provider cohort can host many metagraphs, so no single hue can speak for
  // the row, and splitting per network multiplied groups (the dot went with the split).
  type Cohort = { key: string; city: string | null; isp: string | null; rows: NodeRow[] };
  const cohortsOf = (rows: NodeRow[]): Cohort[] => {
    const by = new Map<string, Cohort>();
    for (const r of rows) {
      const geo = "geo" in r.pick ? r.pick.geo : undefined;
      const city = r.city || null;
      const isp = geo?.isp || null;
      const key = `${city ?? ""}|${isp ?? ""}`;
      (by.get(key) ?? by.set(key, { key, city, isp, rows: [] }).get(key)!).rows.push(r);
    }
    return [...by.values()].sort(
      (a, b) =>
        b.rows.length - a.rows.length ||
        (a.city ?? "\uffff").localeCompare(b.city ?? "\uffff"),
    );
  };
  // Which cohort is disclosed (single-open keeps the list calm); keys are country-scoped so a
  // stale key after switching countries simply matches nothing.
  const [openCohort, setOpenCohort] = useState<string | null>(null);

  // The selected node, matched by IP **and** layer: one machine can sit in both the l0 and
  // l1 clusters (same IP, two rows), so IP alone highlighted both. `selLayer` is the picked
  // node's layer (its kind for a validator; its node.layer for a metagraph node).
  const sel =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const selIp = sel?.node?.ip ?? null;
  const selLayer = sel ? (sel.kind === "metanode" ? sel.node?.layer ?? null : sel.kind) : null;

  return (
    // The shell owns the Card frame, CardHead, collapse state, and the padded body (flex-none +
    // no inner list overflow: the card grows with its content and the RAIL scrolls — runway +
    // fade — the old inner-scroll flex card capped the node list in a cramped scrollbox whose
    // tail was easy to miss, user; rail scrolling matches the tablet sheet). GeoExplore is the
    // shell's REFERENCE look, so this render is byte-identical to the pre-extraction JSX modulo
    // the chrome that moved into ExplorerShell.
    <ExplorerShell
      id="geoexplore"
      title="Nodes by country"
      hint={
        // The footprint's headline figures (Nodes / Countries / Ready) live in the top-bar
        // vitals now; this card is purely the country→nodes accordion. The usage hint LEADS
        // the card (user, 2026-07-12 — a bottom hint read as an afterthought) and says what
        // the card holds, not just the click. Quiet-empty has nothing to browse — no hint.
        quietEmpty
          ? null
          : "Every country hosting nodes — hover or click one to see how the network is geographically distributed."
      }
    >
      {quietEmpty ? (
        // Quiet-empty, in the standard LEFT-ALIGNED card/hint typography (the old centered
        // block — plus a stray absolutely-positioned standby dot that escaped its unsized
        // wrapper — read as a bolt-on). One message, no jump link (user refinement: the "See
        // it in the Hypergraph →" link was removed — the explanation already says where the
        // metagraph still appears).
        <>
          <p className="text-body text-foreground m-0 mb-1">No locatable nodes</p>
          <p className="text-label text-muted-foreground m-0">{tickerOrName} has no validators we can place on the map right now. It still appears in the Hypergraph.</p>
        </>
      ) : (
        <>
          {rows.map((c) => {
            const open = c.cc === country;
            const nodes = nodesByCountry.get(c.country) ?? [];
            // Captured for the cohort rows nested below — their own map's `c` shadows this one.
            const cc = c.cc;
            // The open group's wash box gets the SAME ±6px outset as the country button
            // (px-1.5 -mx-1.5), so the drilled row's hover/selection box and the dropdown group
            // behind it share edges — the button used to overhang the wash by 6px on both sides
            // (user: "nodes dropdown not aligned with the parent").
            // Bidirectional pairing: hovering the row previews the country's border on the
            // globe, and hovering the COUNTRY IN THE SCENE washes this row (same channel,
            // same .subject-paired language as the node rows; structural cyan — a place, not
            // an identity).
            const pair = subjectPairing(hoverCountry, c.cc, setHoverCountry, "var(--primary)");
            return (
              <div key={c.cc} className={cn(open && "bg-wash-faint rounded-btn my-0.5 -mx-1.5 px-1.5")}>
                <button
                  type="button"
                  className={cn(
                    // ROW_OUTSET (not w-full): with w-full the right -mx-1.5 was ignored
                    // (overconstrained box) and the row ended 6px SHORT of the column; the calc width
                    // bakes both 6px outsets in, so the row box spans the open group's wash box
                    // edge-to-edge (buttons shrink-to-fit, so an auto width is not an option).
                    "nb-row group flex items-center gap-2.5 text-left text-body border border-transparent bg-transparent cursor-pointer py-[5px] rounded-sm transition-[background] duration-150",
                    ROW_OUTSET,
                    "hover:bg-wash-hover",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                    // The drilled country row wears the same shared selection language as the
                    // picker's committed row (SELECTED_ROW) — no ✓ though: an open accordion's
                    // state cue is its ▾ chevron, not a selection check.
                    open && SELECTED_ROW,
                    pair.paired && pair.className,
                  )}
                  style={pair.style}
                  aria-expanded={open}
                  onClick={() => drill(c.cc)}
                  onMouseEnter={pair.onMouseEnter}
                  onMouseLeave={pair.onMouseLeave}
                >
                  <span className="text-label w-[17px] text-center flex-none">{ccToFlag(c.cc)}</span>
                  <span className="flex-none w-24 text-body text-foreground-dim whitespace-nowrap overflow-hidden text-ellipsis" title={c.country}>
                    {c.country}
                  </span>
                  <span className="flex-1 h-[7px] rounded-xs bg-white/[0.06] overflow-hidden">
                    <span
                      className="block h-full rounded-xs"
                      style={{
                        width: `${Math.round((c.count / max) * 100)}%`,
                        background: barHue ?? "linear-gradient(90deg, var(--core), var(--primary))",
                        boxShadow: `0 0 6px color-mix(in oklch, ${barHue ?? "var(--primary)"} 40%, transparent)`,
                      }}
                    />
                  </span>
                  <span className="flex-none w-[26px] text-right text-body tabular-nums font-semibold">{c.count}</span>
                  {/* Trailing slot: the drilled country shows the shared selection ✓ (same mark
                    as the node rows / filter picker — one selection language, user); closed rows
                    keep the expand-affordance chevron — hidden on a mouse (revealed on row hover/
                    focus, keeps the list clean) but ALWAYS shown on touch (`@media (hover:none)`)
                    where there's no hover. Both occupy the same flex-none slot, so the count
                    column never shifts. */}
                {open ? (
                  <SelectedRowMark className="flex-none" />
                ) : (
                  <DisclosureChevron open={open} />
                )}
                </button>

                {open && (
                  // Leaving the node list clears the globe hover-glow.
                  <div
                    className={cn("mb-1.5 ml-[9px] py-0.5 pl-3", ROW_NEST)}
                    onMouseLeave={() => {
                      setHoverNodeId(null);
                      setHoverCountry(null);
                    }}
                  >
                    {nodes.length === 0 ? (
                      <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">No locatable nodes here yet.</p>
                    ) : (
                      cohortsOf(nodes).map((ch) => {
                        const isOpen = openCohort === ch.key;
                        const holdsSel =
                          selIp != null &&
                          ch.rows.some(
                            (r) => r.layer === selLayer && "node" in r.pick && r.pick.node?.ip === selIp,
                          );
                        // Committed cohort: this row IS the cc/city/isp rung applyClickActions
                        // wrote via the shared table — wins the ✓/SELECTED_ROW over `holdsSel`.
                        const on = sameCohort(cohort, { cc, city: ch.city, isp: ch.isp });
                        return (
                          <div key={ch.key}>
                            {/* The cohort row: one line per city × provider — the honeycomb
                                as a list row. A DISCLOSURE AND a COMMIT in one click (the
                                country-row idiom): it opens/closes its id rows AND commits/
                                clears the cohort zoom-level rung through the same tested
                                table (`cohortToggleActions`) the scene click and the node's
                                full-ancestry commit use. */}
                            <DisclosureRow
                              open={isOpen}
                              on={on}
                              holdsSel={holdsSel}
                              title={`${ch.city ?? "Unlocated"}${ch.isp ? ` · ${ch.isp}` : ""} · ${ch.rows.length} node${ch.rows.length > 1 ? "s" : ""}`}
                              onToggle={() => {
                                setOpenCohort(isOpen ? null : ch.key);
                                if (ch.rows.length === 1) {
                                  // A single-node cohort has no further choice — expand AND
                                  // select its one node in one click; the node's full-ancestry
                                  // commit (nodeSelectActions) already commits this cohort, so
                                  // don't ALSO commitCohort here (a double toggle would clear it).
                                  const r = ch.rows[0];
                                  const nodeOn =
                                    selIp != null && r.layer === selLayer && "node" in r.pick && r.pick.node?.ip === selIp;
                                  selectNode(r.pick, nodeOn && isOpen);
                                } else {
                                  commitCohort({ cc, city: ch.city, isp: ch.isp });
                                }
                              }}
                              onHoverEnter={() => {
                                setHoverCohort(ch.rows.map((r) => hoverKeyOf(r.pick)).filter((k): k is string => !!k));
                                setHoverCountry(ch.rows[0] && "geo" in ch.rows[0].pick ? ch.rows[0].pick.geo?.cc ?? null : null);
                              }}
                              onHoverLeave={() => setHoverCohort(null)}
                            >
                              <span className="flex-none text-body whitespace-nowrap">{ch.city ?? "Unlocated"}</span>
                              {ch.isp && (
                                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-label text-muted-foreground">
                                  {ch.isp}
                                </span>
                              )}
                              <span className="ml-auto flex-none tabular-nums text-body font-semibold">{ch.rows.length}</span>
                            </DisclosureRow>

                            {isOpen && (
                              <div className="mb-1 ml-[7px] pl-2 border-l border-border">
                                {ch.rows.map((r, i) => {
                                  const nodeOn =
                                    selIp != null && r.layer === selLayer &&
                                    "node" in r.pick && r.pick.node?.ip === selIp;
                                  return (
                                    <NodePickerRow
                                      key={(r.id ?? r.label) + i}
                                      row={r}
                                      selected={nodeOn}
                                      hoverNodeId={hoverNodeId}
                                      setHoverNodeId={setHoverNodeId}
                                      onSelect={() => selectNode(r.pick, nodeOn)}
                                      onHoverEnter={() => setHoverCountry("geo" in r.pick ? r.pick.geo?.cc ?? null : null)}
                                    />
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
        </>
      )}
    </ExplorerShell>
  );
}
