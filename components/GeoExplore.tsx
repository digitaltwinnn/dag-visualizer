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
  const setCountry = useStore((s) => s.setCountry);
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const setInspect = useStore((s) => s.setInspect);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const setFilter = useStore((s) => s.setFilter);
  const filter = useStore((s) => s.filter);
  const [collapsed, setCollapsed] = useState(false);

  // Selecting a node here mirrors clicking it on the globe (Engine._handleClick): set the
  // network filter to the node's OWN network first, then open its card. Without the filter step
  // the selection didn't carry into the Hypergraph (the view had nothing to isolate). A validator
  // belongs to the DAG core ("dag"); a metagraph node to its metagraph.
  const selectNode = (pick: NodeRow["pick"]) => {
    const netId =
      pick.kind === "metanode"
        ? pick.meta?.id ?? null
        : pick.kind === "l0" || pick.kind === "l1"
          ? "dag"
          : null;
    if (netId) setFilter(netId);
    setInspect(pick);
  };

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
  // accordion's "which row is open", so the globe and the list stay one source of truth.
  const drill = (cc: string) => setCountry(country === cc ? null : cc);

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

  // The selected node, matched by IP **and** layer: one machine can sit in both the l0 and
  // l1 clusters (same IP, two rows), so IP alone highlighted both. `selLayer` is the picked
  // node's layer (its kind for a validator; its node.layer for a metagraph node).
  const sel =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const selIp = sel?.node?.ip ?? null;
  const selLayer = sel ? (sel.kind === "metanode" ? sel.node?.layer ?? null : sel.kind) : null;

  return (
    <Card
      asChild
      className="sig-right flex flex-col min-h-0 flex-[1_1_auto] gap-0 p-0 [--spine:var(--filter-accent,var(--primary))]"
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
      <div className={cn("flex flex-col min-h-0 flex-[1_1_auto]", collapsed && "hidden")}>
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
        <div className="flex-[1_1_auto] min-h-0 overflow-y-auto pt-1.5 px-[14px] pb-2 cmd-list-scroll">
          {rows.map((c) => {
            const open = c.cc === country;
            const nodes = nodesByCountry.get(c.country) ?? [];
            return (
              <div key={c.cc} className={cn(open && "bg-wash-faint rounded-btn my-0.5")}>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-2.5 w-full text-left text-body border-none bg-transparent cursor-pointer py-[5px] px-1.5 -mx-1.5 rounded-sm transition-[background] duration-150",
                    "hover:bg-wash-hover",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                    // The drilled country row wears the same shared selection language as the
                    // picker's committed row (SELECTED_ROW) — no ✓ though: an open accordion's
                    // state cue is its ▾ chevron, not a selection check.
                    open && SELECTED_ROW,
                  )}
                  aria-expanded={open}
                  onClick={() => drill(c.cc)}
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
                        background: barHue ?? "linear-gradient(90deg, var(--core-l0), var(--primary))",
                        boxShadow: `0 0 6px color-mix(in oklch, ${barHue ?? "var(--primary)"} 40%, transparent)`,
                      }}
                    />
                  </span>
                  <span className="flex-none w-[26px] text-right text-body tabular-nums font-semibold">{c.count}</span>
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-3.5 flex-none transition-transform motion-reduce:transition-none",
                      open ? "rotate-90 text-foreground" : "text-muted-foreground",
                    )}
                  />
                </button>

                {open && (
                  // Leaving the node list clears the globe hover-glow.
                  <div className="mb-1.5 ml-[9px] py-0.5 pl-3 border-l border-border" onMouseLeave={() => setHoverNodeId(null)}>
                    {nodes.length === 0 ? (
                      <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">No locatable nodes here yet.</p>
                    ) : (
                      nodes.map((r, i) => {
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
                              "nb-row relative flex items-center gap-2 w-full py-[5px] pl-2 pr-7 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left text-foreground-dim transition-colors duration-[140ms]",
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
                            onClick={() => selectNode(r.pick)}
                            onMouseEnter={pair.onMouseEnter}
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
                      })
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
