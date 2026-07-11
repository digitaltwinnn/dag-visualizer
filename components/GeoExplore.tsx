"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { EXPLORE_ICON } from "@/components/icons";
import { shortHash, CORE_HEX, metagraphById } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { IdentityDot, StatusMark } from "@/components/inspector/parts";
import { SELECTED_ROW, SelectedRowMark } from "@/components/selection";
import { ccToFlag } from "@/src/util/format";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { countryToggleActions, nodeSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { subjectPairing } from "@/components/useSubjectPairing";
import type { NodeRow } from "@/src/data/types";

// Geography's single **explore** card (one frame, one "Geography · explore" eyebrow, an
// accordion you click into). The country list IS the
// node browser: each country is a row showing its share of the footprint (bar + count), and
// clicking it drills the globe into that country AND expands its nodes inline — master on
// top, detail nested beneath, then a node row opens its card on the right facts rail.
// The footprint's headline figures live in the top-bar vitals; this card is purely the accordion.
export default function GeoExplore() {
  const lb = useStore((s) => s.leaderboard);
  const country = useStore((s) => s.country);
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const setHoverCountry = useStore((s) => s.setHoverCountry);
  const hoverCountry = useStore((s) => s.hoverCountry);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const filter = useStore((s) => s.filter);
  const [collapsed, setCollapsed] = useState(false);

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
    applyClickActions(countryToggleActions(cc, { country, hasInspect: !!sel }));

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

  // PROVIDER SECTIONS (user design, option A): inside an expanded country the node rows stay
  // immediately visible but group under quiet micro-caps provider labels — aggregation at a
  // glance without a third accordion level. Known providers by count (desc, then name),
  // "UNKNOWN HOST" last; a country with NO known provider renders flat (an all-unknown header
  // would be noise, not information). Row order within a group inherits the alphabetical sort.
  const providerSections = (rows: NodeRow[]): { name: string | null; rows: NodeRow[] }[] => {
    const by = new Map<string | null, NodeRow[]>();
    for (const r of rows) {
      const isp = ("geo" in r.pick ? r.pick.geo?.isp : undefined) || null;
      (by.get(isp) ?? by.set(isp, []).get(isp)!).push(r);
    }
    if (by.size === 1 && by.has(null)) return [{ name: null, rows }]; // nothing known → flat
    return [...by.entries()]
      .map(([name, rows]) => ({ name, rows }))
      .sort((a, b) =>
        a.name === null ? 1 : b.name === null ? -1 :
        b.rows.length - a.rows.length || a.name.localeCompare(b.name),
      );
  };

  // The selected node, matched by IP **and** layer: one machine can sit in both the l0 and
  // l1 clusters (same IP, two rows), so IP alone highlighted both. `selLayer` is the picked
  // node's layer (its kind for a validator; its node.layer for a metagraph node).
  const sel =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const selIp = sel?.node?.ip ?? null;
  const selLayer = sel ? (sel.kind === "metanode" ? sel.node?.layer ?? null : sel.kind) : null;

  return (
    // flex-none + no inner list overflow: the card grows with its content and the RAIL
    // scrolls (runway + fade) — the old inner-scroll flex card capped the node list in a cramped
    // scrollbox whose tail was easy to miss (user); rail scrolling matches the tablet sheet.
    <Card
      asChild
      className="sig-right flex flex-col flex-none gap-0 p-0 [--spine:var(--filter-accent,var(--primary))]"
    >
      <aside id="geoexplore">
      <CardHead
        panel
        icon={EXPLORE_ICON}
        title="Nodes by country"
        eyebrow="Geography · explore"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className={cn("flex flex-col", collapsed && "hidden")}>
        {/* The footprint's headline figures (Nodes / Countries / Ready) live in the top-bar
            vitals now; this card is purely the country→nodes accordion. */}
        {quietEmpty ? (
          // Quiet-empty, in the standard LEFT-ALIGNED card/hint typography (the old centered
          // block — plus a stray absolutely-positioned standby dot that escaped its unsized
          // wrapper — read as a bolt-on). Same padding as the country list it stands in for.
          // One message, no jump link (user refinement: the "See it in the Hypergraph →" link
          // was removed — the explanation already says where the metagraph still appears).
          <div className="pt-2 px-[14px] pb-3">
            <p className="text-body text-foreground m-0 mb-1">No locatable nodes</p>
            <p className="text-label text-muted-foreground m-0">{tickerOrName} has no validators we can place on the map right now. It still appears in the Hypergraph.</p>
          </div>
        ) : (
        <div className="pt-1.5 px-[14px] pb-2">
          {rows.map((c) => {
            const open = c.cc === country;
            const nodes = nodesByCountry.get(c.country) ?? [];
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
                    // w-[calc(100%+12px)] (not w-full): with w-full the right -mx-1.5 was ignored
                    // (overconstrained box) and the row ended 6px SHORT of the column; the calc width
                    // bakes both 6px outsets in, so the row box spans the open group's wash box
                    // edge-to-edge (buttons shrink-to-fit, so an auto width is not an option).
                    "nb-row group flex items-center gap-2.5 w-[calc(100%+12px)] text-left text-body border border-transparent bg-transparent cursor-pointer py-[5px] px-1.5 -mx-1.5 rounded-sm transition-[background] duration-150",
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
                  <ChevronRight
                    aria-hidden
                    className="size-3.5 flex-none transition-opacity duration-150 motion-reduce:transition-none text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  />
                )}
                </button>

                {open && (
                  // Leaving the node list clears the globe hover-glow.
                  <div
                    className="mb-1.5 ml-[9px] py-0.5 pl-3 border-l border-border"
                    onMouseLeave={() => {
                      setHoverNodeId(null);
                      setHoverCountry(null);
                    }}
                  >
                    {nodes.length === 0 ? (
                      <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">No locatable nodes here yet.</p>
                    ) : (
                      (() => {
                        const sections = providerSections(nodes);
                        // A single null section = the flat nothing-known case: no headers at all.
                        const flat = sections.length === 1 && sections[0].name === null;
                        return sections.map((sec) => (
                          <div key={sec.name ?? "unknown"}>
                            {/* Quiet section label (the cards' COMPOSITION idiom): provider · count;
                                the null group trails as "Unknown host". */}
                            {!flat && (
                              <div className="mt-1.5 mb-0.5 pl-2 text-micro tracking-[0.1em] uppercase text-muted-foreground truncate">
                                {sec.name ?? "Unknown host"} · {sec.rows.length}
                              </div>
                            )}
                            {sec.rows.map((r, i) => {
                        const on =
                          selIp != null && r.layer === selLayer &&
                          r.pick.kind !== "snapshot" && "node" in r.pick && r.pick.node?.ip === selIp;
                        const hoverKey = hoverKeyOf(r.pick);
                        const pick = r.pick;
                        const rowHue = pick.kind === "metanode" && pick.meta ? identityHudHex(pick.meta.id) : CORE_HEX;
                        const pair = subjectPairing(hoverNodeId, hoverKey, setHoverNodeId, rowHue);
                        return (
                          <button
                            key={r.label + i}
                            className={cn(
                              // `relative pr-7` reserves the picker's trailing ✓ slot on every
                              // row, so the status column doesn't shift when a node is selected.
                              // w-[calc(100%+6px)]: the node boxes end on the SAME right edge as the country
                          // row's box above (which spans the wash box), so the group reads as one block.
                          "nb-row relative flex items-center gap-2 w-[calc(100%+6px)] py-[5px] pl-2 pr-7 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left text-foreground-dim transition-colors duration-[140ms]",
                              "hover:bg-wash-hover hover:text-foreground",
                              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                              // The selected node row = the SAME shared selection language as the
                              // filter picker's committed row (user-unified). Box-shadow based, so
                              // the identity-hued `.nb-row.subject-paired` hover wash (background/
                              // border) tints UNDER it while paired and the mark returns untouched.
                              on && SELECTED_ROW,
                              pair.paired && pair.className,
                            )}
                            style={pair.style}
                            title={`${r.label} · ${r.state ?? "—"}`}
                            onClick={() => selectNode(r.pick, on)}
                            // Hovering a node also hovers its COUNTRY (user) — the globe shows
                            // the whisper border and the country row washes, same as the scene.
                            onMouseEnter={() => {
                              pair.onMouseEnter();
                              setHoverCountry("geo" in r.pick ? r.pick.geo?.cc ?? null : null);
                            }}
                          >
                            <IdentityDot hue={rowHue} />
                            {/* Location-first (matches the node CARD's title/subtitle pattern):
                                the CITY is the row's primary (the country is the accordion group),
                                with the truncated id as a subtle mono secondary — it stays visible
                                so co-located nodes (same city) remain distinguishable. Fallback:
                                no resolved city → the id (mono) is the primary, as before. */}
                            {r.city ? (
                              <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                                <span className="flex-none text-body whitespace-nowrap">{r.city}</span>
                                {r.id && (
                                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-label text-muted-foreground">
                                    {shortHash(r.id)}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className={cn("flex-1 overflow-hidden text-ellipsis whitespace-nowrap tabular-nums text-body", r.id && "font-mono")}>
                                {r.id ? shortHash(r.id) : r.label}
                              </span>
                            )}
                            <span className="ml-auto flex-none"><StatusMark state={r.state} /></span>
                            {on && <SelectedRowMark className="absolute right-2" />}
                          </button>
                        );
                            })}
                          </div>
                        ));
                      })()
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        {!quietEmpty && <div className="pt-[10px] px-4 pb-3 text-label text-muted-foreground">Click a country to drill in.</div>}
      </div>
      </aside>
    </Card>
  );
}
