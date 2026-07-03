"use client";

import { forwardRef } from "react";
import { Gauge } from "lucide-react";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { fmtScore } from "@/src/util/format";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { rolesOf } from "@/components/inspector/parts";
import { useBreakpoint } from "@/components/useBreakpoint";
import type { NodeInfo } from "@/src/data/types";

// Structural cyan for the live-activity sparklines (lane-correct: cyan = the live accent).
const CYAN = "#2af5ff";

function Vital({ label, value, spark }: { label: string; value: React.ReactNode; spark?: number[] }) {
  return (
    <div className="tb-vital">
      <span className="tb-vital-k">{label}</span>
      <span className="tb-vital-row">
        <span className="tb-vital-v">{value}</span>
        {spark && <Sparkline data={spark} color={CYAN} />}
      </span>
    </div>
  );
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

  const c = { l0: 0, cl1: 0, dl1: 0 };
  const runs = { l0: false, cl1: false, dl1: false };
  const add = (nodes: NodeInfo[]) => {
    for (const n of nodes) {
      const roles = rolesOf(n);
      if (roles.includes("l0")) { c.l0++; runs.l0 = true; }
      if (roles.includes("cl1")) { c.cl1++; runs.cl1 = true; }
      if (roles.includes("dl1")) { c.dl1++; runs.dl1 = true; }
    }
  };
  const cores = cfg ? metaList.filter((m) => m.id === cfg.id) : metaList;
  for (const mg of cores) add(mg.nodes);

  // Filtered: an em-dash for a layer this metagraph doesn't run (stable 3 columns, no reflow).
  const cell = (n: number, runsLayer: boolean) =>
    cfg && !runsLayer ? <span className="tb-vital-ph">—</span> : <Odometer value={n} />;

  return (
    <>
      <Vital label="L0" value={cell(c.l0, runs.l0)} />
      <Vital label="cL1" value={cell(c.cl1, runs.cl1)} />
      <Vital label="dL1" value={cell(c.dl1, runs.dl1)} />
    </>
  );
}

// Geography vitals — the active selection's **footprint** (where): total mapped nodes, how many
// countries it spans, and its distribution (decentralisation) score. Densest was dropped — the
// densest country is already visible as the top row of the GeoExplore list.
function GeoVitals() {
  const lb = useStore((s) => s.leaderboard);
  const countries = lb?.countries ?? [];
  // "Nodes" = total machines on the map = the sum of the per-country counts (the leaderboard
  // is the authoritative per-country breakdown; each row has `.count`). Derive it rather than
  // depend on a separate total field.
  const nodes = countries.length ? countries.reduce((s, c) => s + c.count, 0) : null;
  return (
    <>
      <Vital label="Nodes" value={<Odometer value={nodes} />} />
      <Vital label="Countries" value={<Odometer value={countries.length || null} />} />
      <Vital label="Distribution" value={<span className="tb-vital-score">{fmtScore(lb?.score ?? null)}</span>} />
    </>
  );
}

// Snapshot DAG vitals — the network's **live activity** over time (when + cost): the snapshot
// cadence and anchors per hour, with trend charts in structural cyan (the live-activity accent,
// not the filter colour).
function LedgerVitals() {
  const activity = useStore((s) => s.activity);
  return (
    <>
      <Vital label="Snaps/hr" value={<Odometer value={activity?.snapsPerHour} />} spark={activity?.cadenceSeries} />
      <Vital label="Anchors/hr" value={<Odometer value={activity?.anchorsPerHour} />} spark={activity?.anchoredSeries} />
      <Vital label="—" value={<span className="tb-vital-ph">soon</span>} />
    </>
  );
}

function VitalsCluster() {
  const mode = useStore((s) => s.mode);
  const live = useStore((s) => s.live);
  const body =
    mode === "geo" ? <GeoVitals /> : mode === "ledger" ? <LedgerVitals /> : mode === "hyper" ? <HyperVitals /> : null;
  return (
    <div className={"tb-vitals" + (live ? "" : " no-signal")}>
      {!live && <span className="ns-dot" />}
      {body}
    </div>
  );
}

// Phone's compact ≥44px toggle button. Exposed with a forwarded ref so TopBar can measure it
// to position the popover — the popover itself must live OUTSIDE #topbar (same reason as the
// filter picker: the bar's `overflow: hidden` would clip it, and `position: fixed` doesn't
// escape it either since `backdrop-filter` on #topbar creates a containing block).
export const VitalsToggle = forwardRef<HTMLButtonElement, { open: boolean; onClick: () => void }>(
  function VitalsToggle({ open, onClick }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={"tb-vitals-toggle" + (open ? " active" : "")}
        aria-expanded={open}
        aria-label="Toggle vitals"
        onClick={onClick}
      >
        <Gauge size={14} />
      </button>
    );
  }
);

export { VitalsCluster };

// Tablet/desktop: vitals render inline, unchanged. Phone rendering (toggle + popover) is
// handled by TopBar so the popover can escape the bar's clipped/containing-block surface.
export default function Vitals() {
  const bp = useBreakpoint();
  if (bp === "phone") return null;
  return <VitalsCluster />;
}
