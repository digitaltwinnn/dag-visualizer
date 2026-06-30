"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/src/store/store";
import PanelHead from "@/components/PanelHead";
import { shortHash } from "@/src/data/network";
import { RoleTags } from "@/components/inspector/parts";
import { ccToFlag } from "@/src/util/format";
import type { NodeRow } from "@/src/data/types";

const TOP = 9;

// Geography's single **explore** card (mirrors the Hypergraph's one LearnPanel — one frame,
// one "Geography · explore" eyebrow, an accordion you click into). The country list IS the
// node browser: each country is a row showing its share of the footprint (bar + count), and
// clicking it drills the globe into that country AND expands its nodes inline — master on
// top, detail nested beneath, then a node row opens its card on the right facts rail.
// A compact distribution-score meter sits at the top as the footprint's headline figure.
export default function GeoExplore() {
  const lb = useStore((s) => s.leaderboard);
  const country = useStore((s) => s.country);
  const setCountry = useStore((s) => s.setCountry);
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const setInspect = useStore((s) => s.setInspect);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const setFilter = useStore((s) => s.setFilter);
  const [showAll, setShowAll] = useState(false);
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
  const rows = showAll ? list : list.slice(0, TOP);
  const hiddenCount = list.length - rows.length;
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
    <aside id="geoexplore" className={"panel" + (collapsed ? " collapsed" : "")}>
      <PanelHead
        title="Geographic footprint"
        eyebrow="Geography · explore"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="geo-body panel-body">
        {/* The footprint's headline figures (country count + distribution score) live in the
            top-bar vitals now; this card is purely the country→nodes accordion. */}
        <div className="geo-list">
          {rows.map((c) => {
            const open = c.cc === country;
            const nodes = nodesByCountry.get(c.country) ?? [];
            return (
              <div key={c.cc} className={"geo-c" + (open ? " open" : "")}>
                <button
                  type="button"
                  className={"lb-row lb-row--btn geo-c-row" + (open ? " active" : "")}
                  aria-expanded={open}
                  onClick={() => drill(c.cc)}
                >
                  <span className="lb-flag">{ccToFlag(c.cc)}</span>
                  <span className="lb-name" title={c.country}>
                    {c.country}
                  </span>
                  <span className="lb-bar">
                    <span style={{ width: `${Math.round((c.count / max) * 100)}%` }} />
                  </span>
                  <span className="lb-count">{c.count}</span>
                  <span className="geo-c-caret">{open ? "▾" : "▸"}</span>
                </button>

                {open && (
                  // Leaving the node list clears the globe hover-glow.
                  <div className="geo-c-nodes" onMouseLeave={() => setHoverNodeId(null)}>
                    {nodes.length === 0 ? (
                      <p className="geo-c-empty">No locatable nodes here yet.</p>
                    ) : (
                      nodes.map((r, i) => {
                        const on =
                          selIp != null && r.layer === selLayer &&
                          r.pick.kind !== "snapshot" && "node" in r.pick && r.pick.node?.ip === selIp;
                        // Match the globe's hover pairing: validators by machine id, metagraph nodes by ip.
                        const hoverKey =
                          r.pick.kind === "metanode" ? r.pick.node?.ip ?? null
                            : r.pick.kind === "l0" || r.pick.kind === "l1" ? r.pick.node?.id ?? null
                              : null;
                        return (
                          <button
                            key={r.label + i}
                            className={"nb-row" + (on ? " active" : "")}
                            title={`${r.label} · ${r.state ?? "—"}`}
                            onClick={() => selectNode(r.pick)}
                            onMouseEnter={() => setHoverNodeId(hoverKey)}
                          >
                            {/* No status dot here — it read as the network bullet on the node
                                card (different meaning); state lives in the card's pill. */}
                            <span className={"nb-label" + (r.id ? " insp-hash" : "")}>
                              {r.id ? shortHash(r.id) : r.label}
                            </span>
                            <RoleTags roles={r.roles} />
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {hiddenCount > 0 && (
            <button type="button" className="lb-row lb-row--btn lb-toggle" onClick={() => setShowAll(true)}>
              <span className="lb-flag">🌐</span>
              <span className="lb-name">{`${hiddenCount} more ${hiddenCount === 1 ? "country" : "countries"}`}</span>
              <span className="lb-bar" />
              <span className="geo-c-caret">▸</span>
            </button>
          )}
          {showAll && list.length > TOP && (
            <button type="button" className="lb-row lb-row--btn lb-toggle" onClick={() => setShowAll(false)}>
              <span className="lb-flag">🌐</span>
              <span className="lb-name">Show fewer</span>
              <span className="lb-bar" />
              <span className="geo-c-caret">▾</span>
            </button>
          )}
        </div>

        <div className="lb-foot">Click a country to drill in.</div>
      </div>
    </aside>
  );
}
