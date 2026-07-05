"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { shortHash, CORE_HEX, metagraphById } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { StatusMark } from "@/components/inspector/parts";
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
  const setMode = useStore((s) => s.setMode);
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
  // node list derive from `geo.country` (`cc` can be absent, the name can't).
  const nodesByCountry = useMemo(() => {
    const m = new Map<string, NodeRow[]>();
    for (const r of selNodes) {
      const key = r.country || "Unknown";
      (m.get(key) ?? m.set(key, []).get(key)!).push(r);
    }
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
          <div className="pt-2 px-[14px] pb-3">
            <p className="text-[12.5px] text-foreground m-0 mb-1">No locatable nodes</p>
            <p className="text-[11.5px] text-muted-foreground leading-[1.5] m-0">{tickerOrName} has no validators we can place on the map right now. It still appears in the Hypergraph.</p>
            <Button
              variant="link"
              size="xs"
              className="mt-2 h-auto p-0 text-xs font-normal"
              onClick={() => setMode("hyper")}
            >
              See it in the Hypergraph →
            </Button>
          </div>
        ) : (
        <div className="flex-[1_1_auto] min-h-0 overflow-y-auto pt-1.5 px-[14px] pb-2 cmd-list-scroll">
          {rows.map((c) => {
            const open = c.cc === country;
            const nodes = nodesByCountry.get(c.country) ?? [];
            return (
              <div key={c.cc} className={cn(open && "bg-[rgba(90,140,255,0.05)] rounded-[8px] my-0.5")}>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-2.5 w-full text-left text-[12px] border-none bg-transparent cursor-pointer py-[5px] px-1.5 -mx-1.5 rounded-[6px] transition-[background] duration-150",
                    "hover:bg-[rgba(90,140,255,0.12)]",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--core)] focus-visible:outline-offset-[-2px]",
                    open && "bg-[var(--sel-bg)]",
                  )}
                  aria-expanded={open}
                  onClick={() => drill(c.cc)}
                >
                  <span className="text-[11.5px] w-[17px] text-center flex-none">{ccToFlag(c.cc)}</span>
                  <span className="flex-none w-24 text-[12px] text-[#c7d0ea] whitespace-nowrap overflow-hidden text-ellipsis" title={c.country}>
                    {c.country}
                  </span>
                  <span className="flex-1 h-[7px] rounded-[4px] bg-white/[0.06] overflow-hidden">
                    <span
                      className="block h-full rounded-[4px]"
                      style={{
                        width: `${Math.round((c.count / max) * 100)}%`,
                        background: barHue ?? "linear-gradient(90deg, var(--l0), var(--core))",
                        boxShadow: `0 0 6px color-mix(in oklch, ${barHue ?? "var(--core)"} 40%, transparent)`,
                      }}
                    />
                  </span>
                  <span className="flex-none w-[26px] text-right text-[12px] tabular-nums font-semibold">{c.count}</span>
                  <span className={cn("flex-none w-3 text-center text-[9px]", open ? "text-foreground" : "text-muted-foreground")}>
                    {open ? "▾" : "▸"}
                  </span>
                </button>

                {open && (
                  // Leaving the node list clears the globe hover-glow.
                  <div className="mb-1.5 ml-[9px] py-0.5 pl-3 border-l border-border" onMouseLeave={() => setHoverNodeId(null)}>
                    {nodes.length === 0 ? (
                      <p className="mt-1 mx-1 mb-1.5 text-[11px] text-muted-foreground">No locatable nodes here yet.</p>
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
                              "nb-row flex items-center gap-2 w-full py-[5px] px-2 my-px rounded-[7px] border border-transparent bg-transparent cursor-pointer text-left text-[#c7d0ea] transition-colors duration-[140ms]",
                              "hover:bg-[rgba(90,140,255,0.12)] hover:text-foreground",
                              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--core)] focus-visible:outline-offset-[-2px]",
                              on && "bg-[var(--sel-bg)] border-[var(--sel-border)] text-white",
                              pair.paired && pair.className,
                            )}
                            style={pair.style}
                            title={`${r.label} · ${r.state ?? "—"}`}
                            onClick={() => selectNode(r.pick)}
                            onMouseEnter={pair.onMouseEnter}
                          >
                            <span
                              className="w-[7px] h-[7px] rounded-full flex-none shadow-[0_0_5px_currentColor]"
                              style={{ background: rowHue, color: rowHue }}
                              aria-hidden
                            />
                            {/* Location-first (matches the node CARD's title/subtitle pattern):
                                the CITY is the row's primary (the country is the accordion group),
                                with the truncated id as a subtle mono secondary — it stays visible
                                so co-located nodes (same city) remain distinguishable. Fallback:
                                no resolved city → the id (mono) is the primary, as before. */}
                            {r.city ? (
                              <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                                <span className="flex-none text-[12px] whitespace-nowrap">{r.city}</span>
                                {r.id && (
                                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[10px] text-muted-foreground">
                                    {shortHash(r.id)}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className={cn("flex-1 overflow-hidden text-ellipsis whitespace-nowrap tabular-nums text-[12px]", r.id && "font-mono")}>
                                {r.id ? shortHash(r.id) : r.label}
                              </span>
                            )}
                            <span className="ml-auto flex-none"><StatusMark state={r.state} /></span>
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

        {!quietEmpty && <div className="pt-[10px] px-4 pb-3 text-[11px] text-muted-foreground">Click a country to drill in.</div>}
      </div>
      </aside>
    </Card>
  );
}
