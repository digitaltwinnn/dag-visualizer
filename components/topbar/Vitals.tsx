"use client";

import { forwardRef } from "react";
import { Gauge } from "lucide-react";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { nodeStatus } from "@/src/data/nodeStatus";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { rolesOf } from "@/components/inspector/parts";
import { useBreakpoint } from "@/components/useBreakpoint";
import { cn } from "@/lib/utils";
import type { NodeInfo } from "@/src/data/types";

// Structural cyan for the live-activity sparklines (lane-correct: cyan = the live accent).
const CYAN = "#2af5ff";

function Vital({ label, value, spark }: { label: string; value: React.ReactNode; spark?: number[] }) {
  return (
    <div className="flex flex-col gap-0.5 flex-none">
      <span className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground whitespace-nowrap">{label}</span>
      <span
        className={cn(
          "flex items-center gap-[7px]",
          // Sparklines condense away at ≤1240px (was 1020): the constant-width vitals
          // reservation (VitalsCluster's overlay grid) is sized by the WIDEST cluster — the
          // sparkline-bearing ledger one (~273px) — which stops fitting the bar below ~1240px
          // and overflowed the row to the right. Condensing ALL clusters at the same width
          // caps the reservation without breaking the no-jump guarantee (still view-independent).
          "max-[1240px]:gap-0 max-[1240px]:[&_.recharts-wrapper]:hidden",
        )}
      >
        <span className="font-mono font-bold text-foreground tabular-nums whitespace-nowrap max-[1120px]:text-[13px]">{value}</span>
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
    cfg && !runsLayer ? <span className="text-muted-foreground italic opacity-60">—</span> : <Odometer value={n} />;

  return (
    <>
      <Vital label="L0" value={cell(c.l0, runs.l0)} />
      <Vital label="cL1" value={cell(c.cl1, runs.cl1)} />
      <Vital label="dL1" value={cell(c.dl1, runs.dl1)} />
    </>
  );
}

// Geography vitals — the active selection's **footprint** (where): total nodes, how many countries
// they span, and what share of them are healthy (Ready). Nodes + Ready share one source (the geo
// node list) so "Ready" is exactly a percentage of the "Nodes" count.
function GeoVitals() {
  const lb = useStore((s) => s.leaderboard);
  const selNodes = useStore((s) => s.selNodes);
  const countries = lb?.countries ?? [];
  const total = selNodes.length;
  const ready = selNodes.reduce((n, r) => n + (nodeStatus(r.state).bucket === "ready" ? 1 : 0), 0);
  const readyPct = total ? Math.round((ready / total) * 100) : null;
  return (
    <>
      <Vital label="Nodes" value={<Odometer int value={total || null} />} />
      <Vital label="Countries" value={<Odometer int value={countries.length || null} />} />
      <Vital label="Ready" value={readyPct == null ? "—" : `${readyPct}%`} />
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
      <Vital label="—" value={<span className="text-muted-foreground italic opacity-60">soon</span>} />
    </>
  );
}

// `vertical` renders the stacked layout used inside the phone vitals popover (active view only,
// unchanged). The default INLINE bar renders ALL THREE view clusters stacked in ONE grid cell,
// with only the active view's visible — the region's width is therefore the WIDEST state's
// width at every breakpoint, CONSTANT across view switches (and the flat placeholder views,
// where none is visible), so the centered view switch never jumps horizontally on view change.
// Hidden clusters are `invisible` + `aria-hidden` (layout kept, no paint, no live-region noise),
// content right-aligned inside the reserved region so it keeps hugging the bar's right edge.
function VitalsCluster({ vertical = false }: { vertical?: boolean } = {}) {
  const mode = useStore((s) => s.mode);
  const live = useStore((s) => s.live);
  if (vertical) {
    const body =
      mode === "geo" ? <GeoVitals /> : mode === "ledger" ? <LedgerVitals /> : mode === "hyper" ? <HyperVitals /> : null;
    return (
      <div className={cn("flex flex-col items-start gap-2", !live && "saturate-[.45]")}>
        {!live && <NoSignalDot />}
        {body}
      </div>
    );
  }
  const gaps = "gap-3.5 max-[1260px]:gap-3 max-[1120px]:gap-2.5 max-[940px]:gap-2.5 max-[820px]:gap-2";
  const clusters: [string, React.ReactNode][] = [
    ["hyper", <HyperVitals key="hyper" />],
    ["geo", <GeoVitals key="geo" />],
    ["ledger", <LedgerVitals key="ledger" />],
  ];
  return (
    <div className={cn("flex items-center", gaps, !live && "saturate-[.45]")}>
      {!live && <NoSignalDot />}
      <div className="grid">
        {clusters.map(([m, body]) => (
          <div
            key={m}
            aria-hidden={mode !== m || undefined}
            className={cn("col-start-1 row-start-1 flex items-center justify-end", gaps, mode !== m && "invisible")}
          >
            {body}
          </div>
        ))}
      </div>
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
        className={cn(
          "flex items-center justify-center min-w-11 min-h-11 px-2.5 rounded-[8px]",
          "bg-transparent border-0 text-muted-foreground cursor-pointer flex-none",
          "hover:text-foreground hover:bg-[rgba(90,140,255,0.10)]",
          open && "text-foreground bg-[rgba(90,140,255,0.10)]",
        )}
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
