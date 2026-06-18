"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/src/store/store";
import { allMetagraphs } from "@/src/data/network";

function ccToFlag(cc: string) {
  if (!cc || cc.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function filterLabel(id: string | null, metaNames: Map<string, string>): string {
  if (id === "all") return "All validators";
  if (id === "l0") return "Global L0";
  if (id === "l1") return "DAG L1";
  return (id && metaNames.get(id)) || id || "";
}

const TOP = 9;

// "Nodes by country" leaderboard + distribution score (geography view). Data is
// engine-computed and read from the store; clicking a country drills the globe into
// it (store.country → engine). Ports ui.js setLeaderboard/_renderScore/selectCountry.
export default function Leaderboard() {
  const lb = useStore((s) => s.leaderboard);
  const filter = useStore((s) => s.filter);
  const country = useStore((s) => s.country);
  const setCountry = useStore((s) => s.setCountry);
  const metaList = useStore((s) => s.metaList);
  const [expanded, setExpanded] = useState(false);

  const metaNames = useMemo(() => new Map(metaList.map((m) => [m.id, m.name])), [metaList]);
  const list = lb?.countries ?? [];
  const max = list[0]?.count ?? 1;
  const top = list.slice(0, TOP);
  const others = list.slice(TOP);
  const restCount = others.reduce((s, c) => s + c.count, 0);

  const drill = (cc: string) => setCountry(country === cc ? null : cc);

  // Distribution score block.
  const score = lb?.score ?? null;
  const refId = lb?.refId ?? null;
  const note =
    filter === "all"
      ? "Full validator network footprint"
      : filter === refId
        ? "★ Most globally distributed network"
        : `Global reach vs ${filterLabel(refId, metaNames)} — currently the most distributed`;

  return (
    <aside id="leaderboard" className="panel">
      {score != null && (
        <div className="lb-score">
          <div className="lb-score-top">
            <span className="lb-score-title">
              Distribution score
              <span className="lb-info" tabIndex={0}>
                i
                <span className="lb-info-pop">
                  Measures how widely a network&apos;s nodes are spread across countries — both how
                  many countries and how evenly (Shannon entropy of the per-country share), relative
                  to whichever network is currently the most globally distributed (right now{" "}
                  <b>{filterLabel(refId, metaNames)}</b>, which sets the 100).
                </span>
              </span>
            </span>
            <span className="lb-score-val">
              {score}
              <span className="lb-score-max">/100</span>
            </span>
          </div>
          <div className="lb-score-bar">
            <span style={{ width: `${score}%` }} />
          </div>
          <div className="lb-score-note">{note}</div>
        </div>
      )}

      <div className="lb-head">
        <h2>Nodes by country</h2>
        <span id="lb-total">{list.length} countries</span>
      </div>

      <div className="lb-list">
        {top.map((c) => (
          <button
            type="button"
            key={c.cc}
            className={"lb-row lb-row--btn" + (c.cc === country ? " active" : "")}
            aria-pressed={c.cc === country}
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
          </button>
        ))}

        {others.length > 0 && (
          <button
            type="button"
            className="lb-row lb-row--btn lb-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            <span className="lb-flag">🌐</span>
            <span className="lb-name">
              {expanded ? "Show fewer" : `${others.length} more ${others.length === 1 ? "country" : "countries"}`}
            </span>
            <span className="lb-bar">
              {!expanded && <span style={{ width: `${Math.round((restCount / max) * 100)}%` }} />}
            </span>
            <span className="lb-count">{expanded ? "▾" : "▸"}</span>
          </button>
        )}
        {expanded && others.length > 0 && (
          <div className="lb-more">
            {others.map((c) => (
              <button
                key={c.cc}
                className={"lb-chip" + (c.cc === country ? " active" : "")}
                title={c.country}
                onClick={() => drill(c.cc)}
              >
                <span className="lb-chip-flag">{ccToFlag(c.cc)}</span>
                <span className="lb-chip-n">{c.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lb-legend">
        <span>Sparse</span>
        <span className="lb-legend-bar" />
        <span>Dense</span>
      </div>
      <div className="lb-foot">Glow on the globe marks validator density.</div>
    </aside>
  );
}
