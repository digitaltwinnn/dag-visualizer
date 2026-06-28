"use client";

import { useStore } from "@/src/store/store";
import { CORE_HEX, filterAccent, metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import Sparkline from "@/components/Sparkline";
import { rolesOf } from "@/components/inspector/parts";
import type { NodeInfo } from "@/src/data/types";

const fmt = (v?: number | null) =>
  v == null ? "—" : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();

// One compact vital in the top bar: a small uppercase label over a tabular value,
// optionally with a trailing sparkline. Values stay neutral (`--text`) — metagraph colours
// are too dark/saturated to read as text; the accent lives in the pill + view switch only.
function Vital({
  label,
  value,
  spark,
  color,
}: {
  label: string;
  value: React.ReactNode;
  spark?: number[];
  color?: string;
}) {
  return (
    <div className="tb-vital">
      <span className="tb-vital-k">{label}</span>
      <span className="tb-vital-row">
        <span className="tb-vital-v">{value}</span>
        {spark && color && <Sparkline data={spark} color={color} />}
      </span>
    </div>
  );
}

function ccToFlag(cc?: string | null) {
  if (!cc || cc.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// Hypergraph vitals — the network's **structure** (who/what), filter-aware: how many nodes
// serve each layer (L0 / currency-L1 / data-L1) for the current selection. One node taxonomy
// for the whole network — a hybrid node counts in every layer it runs, the DAG's own L0/L1
// fold into L0/cL1 like any other network. All → the whole network; L0/L1 → that shell (0
// elsewhere); a metagraph → its own nodes. Structure, not activity (that's the Ledger view).
function HyperVitals() {
  const filter = useStore((s) => s.filter);
  const metaList = useStore((s) => s.metaList);
  const cfg = metagraphById(filter);

  // One node taxonomy: the DAG core lives in metaList alongside the metagraphs, so "all" sums
  // every core and a selection is just one core. A hybrid counts in each layer it runs.
  const c = { l0: 0, cl1: 0, dl1: 0 };
  const add = (nodes: NodeInfo[]) => {
    for (const n of nodes) {
      const roles = rolesOf(n);
      if (roles.includes("l0")) c.l0++;
      if (roles.includes("cl1")) c.cl1++;
      if (roles.includes("dl1")) c.dl1++;
    }
  };
  const cores = cfg ? metaList.filter((m) => m.id === cfg.id) : metaList;
  for (const mg of cores) add(mg.nodes);

  return (
    <>
      <Vital label="L0" value={c.l0} />
      <Vital label="cL1" value={c.cl1} />
      <Vital label="dL1" value={c.dl1} />
    </>
  );
}

// Geography vitals — the active selection's **footprint** (where): how globally distributed
// it is (the distribution score, moved up from the GeoExplore card), how many countries it
// spans, and its densest country.
function GeoVitals() {
  const lb = useStore((s) => s.leaderboard);
  const score = lb?.score ?? null;
  const countries = lb?.countries.length ?? 0;
  const top = lb?.countries[0] ?? null;

  return (
    <>
      <Vital label="Distribution" value={score ? `${score}%` : "—"} />
      <Vital label="Countries" value={countries || "—"} />
      <Vital label="Densest" value={top ? <>{ccToFlag(top.cc)} {top.count}</> : "—"} />
    </>
  );
}

// Snapshot DAG vitals — the network's **live activity** over time (when + cost): the snapshot
// cadence, anchors and settlement fees per hour, with trend charts. Moved here from the
// Hypergraph view, since this is the view that's actually about the ledger over time. The
// charts take the filter's accent colour so they read as one with the filter.
function LedgerVitals() {
  const filter = useStore((s) => s.filter);
  const activity = useStore((s) => s.activity);
  const cfg = metagraphById(filter);
  const chartColor = cfg ? hex(cfg.color) : CORE_HEX;
  return (
    <>
      <Vital
        label="Snapshots/hr"
        value={fmt(activity?.snapsPerHour)}
        spark={activity?.cadenceSeries}
        color={chartColor}
      />
      <Vital
        label="Anchors/hr"
        value={fmt(activity?.anchorsPerHour)}
        spark={activity?.anchoredSeries}
        color={chartColor}
      />
      {/* Fees/hr removed: the polled fee sums only the LISTED metagraphs, so it's a floor that
          silently omits unlisted anchors — not 100% factual for a headline rate (an exact per-hour
          fee would need the heavy raw-L0 read on every tick). Placeholder until we settle on a
          fully-factual third stat. */}
      <Vital label="—" value={<span className="tb-vital-ph">soon</span>} />
    </>
  );
}

export default function Vitals() {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  // Each view's top-bar is its own network-level read (hyper = structure, geo = footprint,
  // ledger = activity). Hyper + geo are plain numbers, so a leading accent bullet ties them
  // to the active filter (the same "colour = this selection" cue); ledger already carries it
  // via its accent sparklines.
  // The scaffolded placeholder views carry no vitals yet.
  const body =
    mode === "geo" ? (
      <GeoVitals />
    ) : mode === "ledger" ? (
      <LedgerVitals />
    ) : mode === "hyper" ? (
      <HyperVitals />
    ) : null;
  return (
    <div className="tb-vitals">
      {(mode === "hyper" || mode === "geo") && (
        <span
          className="tb-vitals-dot"
          style={{ background: filterAccent(filter) }}
          title="These metrics are scoped to the current filter"
        />
      )}
      {body}
    </div>
  );
}
