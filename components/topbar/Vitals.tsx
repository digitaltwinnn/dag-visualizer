"use client";

import { Gauge } from "lucide-react";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
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
      <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground whitespace-nowrap">{label}</span>
      <span
        className={cn(
          "flex items-center gap-[7px]",
          // Sparklines condense away at ≤1360px (was 1240, before that 1020): the
          // constant-width vitals reservation (VitalsCluster's overlay grid) is sized by the
          // WIDEST cluster — the sparkline-bearing ledger one — whose width GROWS WITH THE
          // NETWORK's live figures (anchors/hr crossing 1,000 added a digit and pushed the
          // overflow point from ~1240 to ~1300, clipping the bar off-screen at 1280 — user
          // bug). 1360 keeps headroom for another digit; condensing ALL clusters at the same
          // width caps the reservation without breaking the no-jump guarantee.
          "max-[1360px]:gap-0 max-[1360px]:[&_.recharts-wrapper]:hidden",
        )}
      >
        <span className="font-mono font-bold text-foreground tabular-nums whitespace-nowrap max-[1120px]:text-body">{value}</span>
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
    cfg && !runsLayer ? <span className="text-muted-foreground italic opacity-60">—</span> : <Odometer int value={n} />;

  return (
    <>
      <Vital label="L0" value={cell(c.l0, runs.l0)} />
      <Vital label="cL1" value={cell(c.cl1, runs.cl1)} />
      <Vital label="dL1" value={cell(c.dl1, runs.dl1)} />
    </>
  );
}

// Geography vitals — the active selection's **footprint** (where): total nodes, how many
// countries they span, and how many distinct hosting PROVIDERS they sit on (replaced the Ready %
// — user: health belongs to the cards + the future network-health view, not the footprint).
function GeoVitals() {
  const lb = useStore((s) => s.leaderboard);
  const selNodes = useStore((s) => s.selNodes);
  const countries = lb?.countries ?? [];
  const total = selNodes.length;
  // Distinct hosting providers across the selection (KNOWN isps only — an unknown host is
  // absent data, not a provider). Replaced the Ready % (user, 2026-07-11): the footprint
  // story is where the network RUNS — nodes, countries, hosts; health lives in the cards.
  const providers = new Set(
    selNodes.map((r) => ("geo" in r.pick ? r.pick.geo?.isp : undefined)).filter(Boolean),
  ).size;
  return (
    <>
      <Vital label="Nodes" value={<Odometer int value={total || null} />} />
      <Vital label="Countries" value={<Odometer int value={countries.length || null} />} />
      <Vital label="Providers" value={<Odometer int value={providers || null} />} />
    </>
  );
}

// Snapshot DAG vitals — the network's **live activity** over time (when + cost): the snapshot
// cadence and anchors per hour, with trend charts in structural cyan (the live-activity accent,
// not the filter colour).
function LedgerVitals() {
  const activity = useStore((s) => s.activity);
  const latestOrdinal = useStore((s) => s.latestOrdinal);
  return (
    <>
      <Vital label="Snaps/hr" value={<Odometer value={activity?.snapsPerHour} />} spark={activity?.cadenceSeries} />
      <Vital label="Anchors/hr" value={<Odometer value={activity?.anchorsPerHour} />} spark={activity?.anchoredSeries} />
      {/* The live chain head — rolls on every tick (was the reserved "soon" slot). */}
      <Vital label="Ordinal" value={<Odometer int value={latestOrdinal} />} />
    </>
  );
}

// The INLINE vitals bar (also the phone bar-row's content — the old stacked `vertical` popover
// variant is gone): ALL THREE view clusters render stacked in ONE grid cell, with only the
// active view's visible — the region's width is therefore the WIDEST state's
// width at every breakpoint, CONSTANT across view switches (and the flat placeholder views,
// where none is visible), so the centered view switch never jumps horizontally on view change.
// Hidden clusters are `invisible` + `aria-hidden` (layout kept, no paint, no live-region noise),
// content right-aligned inside the reserved region so it keeps hugging the bar's right edge —
// EXCEPT in the phone bar row (`align="center"`), where the reserved cell centres its content:
// with `justify-end` a narrow cluster (hyper's) visibly right-shifts inside the widest cluster's
// reservation, reading off-centre in the full-width row while the wide clusters look centred.
function VitalsCluster({ align = "end" }: { align?: "end" | "center" } = {}) {
  const mode = useStore((s) => s.mode);
  const live = useStore((s) => s.live);
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
            className={cn(
              "col-start-1 row-start-1 flex items-center",
              align === "center" ? "justify-center" : "justify-end",
              gaps,
              mode !== m && "invisible",
            )}
          >
            {body}
          </div>
        ))}
      </div>
    </div>
  );
}

// Phone's compact ≥44px toggle button — expands/collapses the bar's own vitals ROW (TopBar);
// no more floating popover, so no measuring ref.
export function VitalsToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center justify-center min-w-11 min-h-11 px-2.5 rounded-btn",
        "bg-transparent border-0 text-muted-foreground cursor-pointer flex-none",
        "hover:text-foreground hover:bg-wash-soft",
        open && "text-foreground bg-wash-soft",
      )}
      aria-expanded={open}
      aria-label="Toggle vitals"
      onClick={onClick}
    >
      <Gauge size={14} />
    </button>
  );
}

export { VitalsCluster };

// Tablet/desktop: vitals render inline, unchanged. On phone this renders nothing — TopBar owns
// the phone treatment: a toggle button that grows the command bar downward by one full-width
// vitals ROW on the bar's own surface (the old floating popover was removed).
export default function Vitals() {
  const bp = useBreakpoint();
  if (bp === "phone") return null;
  return <VitalsCluster />;
}
