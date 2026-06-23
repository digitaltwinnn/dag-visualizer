"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/src/store/store";
import PanelHead from "@/components/PanelHead";
import type { NodeRow } from "@/src/data/types";

function ccToFlag(cc: string | null) {
  if (!cc || cc.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

const LAYER_LABEL: Record<string, string> = { l0: "L0", l1: "L1", cl1: "cL1", dl1: "dL1" };
const TOP = 9;

function filterLabel(id: string | null, metaNames: Map<string, string>): string {
  if (id === "all") return "All validators";
  if (id === "l0") return "Global L0";
  if (id === "l1") return "DAG L1";
  return (id && metaNames.get(id)) || id || "";
}

// Geography's single **explore** card (mirrors the Hypergraph's one LearnPanel — one frame,
// one "Geography · explore" eyebrow, an accordion you click into). The country list IS the
// node browser: each country is a row showing its share of the footprint (bar + count), and
// clicking it drills the globe into that country AND expands its nodes inline — master on
// top, detail nested beneath, then a node row opens its card on the right facts rail.
// A compact distribution-score meter sits at the top as the footprint's headline figure.
export default function GeoExplore() {
  const lb = useStore((s) => s.leaderboard);
  const filter = useStore((s) => s.filter);
  const metaList = useStore((s) => s.metaList);
  const country = useStore((s) => s.country);
  const setCountry = useStore((s) => s.setCountry);
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const setInspect = useStore((s) => s.setInspect);
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const list = lb?.countries ?? [];
  const max = list[0]?.count ?? 1;

  // Compact distribution-score meter at the top of the card — how globally spread this
  // selection is (0–100 vs the most-distributed network). A small visual, not a full card:
  // it sits with the country count as the footprint's headline numbers.
  const score = lb?.score ?? null;
  const refId = lb?.refId ?? null;
  const refLabel = filterLabel(refId, new Map(metaList.map((m) => [m.id, m.name])));
  const scoreNote =
    filter === "all"
      ? "Full validator network footprint."
      : filter === refId
        ? "★ Most globally distributed network."
        : `Global reach vs ${refLabel} — currently the most distributed.`;
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
        {/* A small summary strip: the country count + a compact distribution meter (with an
            info tooltip) — the footprint's headline figures, kept light so the accordion leads. */}
        <div className="geo-meta">
          <span className="geo-meta-count">
            <b>{list.length}</b> countries
          </span>
          {score != null && (
            <span className="geo-meta-score">
              <span className="geo-meta-label">
                Distribution
                <span className="geo-info" tabIndex={0} role="img" aria-label="What is the distribution score?">
                  i
                  <span className="geo-info-pop">
                    How widely this selection&apos;s nodes spread across countries — both how many
                    and how evenly (Shannon entropy of the per-country share) — scored 0–100 against{" "}
                    <b>{refLabel}</b>, currently the most globally distributed network (the 100).
                    <span className="geo-info-note">{scoreNote}</span>
                  </span>
                </span>
              </span>
              <span className="geo-meta-bar">
                <span style={{ width: `${score}%` }} />
              </span>
              <span className="geo-meta-val">
                {score}
                <span className="geo-meta-max">/100</span>
              </span>
            </span>
          )}
        </div>

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
                  <div className="geo-c-nodes">
                    {nodes.length === 0 ? (
                      <p className="geo-c-empty">No locatable nodes here yet.</p>
                    ) : (
                      nodes.map((r, i) => {
                        const ready = r.state === "Ready";
                        const on =
                          selIp != null && r.layer === selLayer &&
                          r.pick.kind !== "snapshot" && "node" in r.pick && r.pick.node?.ip === selIp;
                        return (
                          <button
                            key={r.label + i}
                            className={"nb-row" + (on ? " active" : "")}
                            title={`${r.label} · ${r.state ?? "—"}`}
                            onClick={() => setInspect(r.pick)}
                          >
                            <span className="nb-dot" style={{ background: ready ? "#36e29a" : "#ffd166" }} />
                            <span className="nb-label">{r.label}</span>
                            <span className="nb-layer">{LAYER_LABEL[r.layer] || r.layer}</span>
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
