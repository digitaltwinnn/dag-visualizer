"use client";

import { Gauge } from "lucide-react";
import { useStore } from "@/src/store/store";
import { metagraphById, filterAccent } from "@/src/data/network";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { compositionRows } from "@/src/data/composition";
import { useBreakpoint } from "@/components/useBreakpoint";
import { cn } from "@/lib/utils";
import type { NodeInfo } from "@/src/data/types";

// Structural cyan for the live-activity sparklines (lane-correct: cyan = the live accent).
const CYAN = "var(--primary)";

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

// Hypergraph vitals — the network's **structure** (who/what), filter-aware: how many MACHINES
// of each composition make up the current selection (user, 2026-07-12 — replaced the per-layer
// L0/cL1/dL1 role counts: the composition vocabulary is what the hyper explorer + the dossier
// table speak, so the vitals now agree with them). Cluster entries are deduped to machines
// first (a hybrid appears once per cluster it runs), then counted by their composition label
// (src/data/composition). The columns are EVERY label that vocabulary can produce, so they SUM
// to the selection (2026-08-02: "Consensus" — dedicated-L0, 16 of them on the DAG core — had no
// column, so hyper read 146 machines where geo read 162 nodes for the same selection; user).
// Filtered: an em-dash for a composition the selection doesn't have (stable columns, no reflow).
function HyperVitals() {
  const filter = useStore((s) => s.filter);
  const metaList = useStore((s) => s.metaList);
  const cfg = metagraphById(filter);

  // Order: the make-up that dominates every real network first, then the dedicated roles in
  // layer order (L0 → cL1 → dL1) — the same order `compositionRows` emits them in.
  const counts: Record<string, number> = { Hybrid: 0, Consensus: 0, Currency: 0, Data: 0 };
  const cores = cfg ? metaList.filter((m) => m.id === cfg.id) : metaList;
  for (const mg of cores) {
    const machines = new Map<string, NodeInfo>();
    for (const n of mg.nodes) {
      const k = n.ip || JSON.stringify(n);
      if (!machines.has(k)) machines.set(k, n);
    }
    for (const row of compositionRows([...machines.values()]))
      if (row.label in counts) counts[row.label]! += row.count;
  }

  const cell = (n: number) =>
    cfg && n === 0 ? <span className="text-muted-foreground italic opacity-60">—</span> : <Odometer int value={n} />;

  return (
    <>
      {Object.entries(counts).map(([label, n]) => (
        <Vital key={label} label={label} value={cell(n)} />
      ))}
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
  // FILTER-SCOPE hairline (user, 2026-07-11): with a network committed, the vitals silently
  // showed FILTERED numbers with nothing marking the scope. The active cluster wears a 1px
  // soft-tipped identity hairline under it — the "thread = resting identity cue" language
  // (numbers/sparklines stay untinted; identity only on the mark). "all" renders nothing:
  // global is the default state, defaults carry no mark.
  const filter = useStore((s) => s.filter);
  const scopeHue = filter !== "all" ? filterAccent(filter) : null;
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
              "relative col-start-1 row-start-1 flex items-center",
              align === "center" ? "justify-center" : "justify-end",
              gaps,
              mode !== m && "invisible",
            )}
          >
            {body}
            {scopeHue && mode === m && (
              <span
                aria-hidden
                className="absolute -bottom-[5px] left-0 right-0 h-px opacity-60 transition-opacity duration-300 motion-reduce:transition-none"
                // The shared soft-tipped hairline recipe — full colour across the middle,
                // easing out only in the last ~15% each side (user, 2026-07-12: the bare
                // transparent→hue→transparent ramp faded most of the line away).
                style={{ background: `linear-gradient(90deg, transparent, ${scopeHue} 15%, ${scopeHue} 85%, transparent)` }}
              />
            )}
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
