"use client";

import { useStore } from "@/src/store/store";
import { metagraphById, filterAccent } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { compositionRows } from "@/src/data/composition";
import { isGlobalActivityScope, type Activity } from "@/src/data/api";
import { cn } from "@/lib/utils";
import type { NodeInfo } from "@/src/data/types";

// Structural cyan for the live-activity sparklines (lane-correct: cyan = the live accent).
const CYAN = "var(--primary)";

// The one sentence a per-hour vital owes the reader: what it was measured over. The basis is
// READ, never assumed — `spanHr` comes from the buffer's own timestamps, so this sentence stays
// true whatever the chain's cadence does. `unit` names what a sample IS in this scope.
function windowNote(a: Activity | null | undefined, unit: string): string | undefined {
  if (!a) return undefined;
  const mins = a.spanHr * 60;
  const span = mins < 1 ? `${Math.round(mins * 60)}s` : `${Math.round(mins)} min`;
  return `Rate extrapolated from ${a.samples} ${unit} over ~${span}.`;
}

// ⚠️ A `title` alone would make the basis MOUSE-ONLY. It rides a plain `<div>`, which is neither
// focusable nor named, so a keyboard or screen-reader user has no route to the sentence that says
// what the number is extrapolated from — and under rule 10 that basis is part of the reading, not
// decoration. The vital is not a control and must not become a tab stop in the command bar, so the
// text is carried in the DOM as well, `sr-only`: the tooltip serves the pointer, the span serves
// everyone else, from one string.
function Vital({ label, value, spark, title }: { label: string; value: React.ReactNode; spark?: number[]; title?: string }) {
  return (
    <div className="flex flex-col gap-0.5 flex-none" title={title}>
      <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground whitespace-nowrap">{label}</span>
      <span
        className={cn(
          "flex items-center gap-[7px]",
          // Sparklines condense away at ≤1460px (1240 → 1360 → 1460): the constant-width vitals
          // reservation (VitalsCluster's overlay grid) is sized by the WIDEST cluster — the
          // sparkline-bearing ledger one — so its width tracks both the network's live figures
          // (anchors/hr crossing 1,000 added a digit) and the cluster's own slot count. The
          // ORDINAL vital claimed the reserved third slot, and at 1400px the row then needed
          // 1360px inside a 1346px bar: the overflow clipped the RAW switch off the bar's right
          // edge (measured 2026-08-03). Condensing frees ~134px (2 × 60px chart + gap), which
          // leaves ~47px of digit headroom at the new threshold. NB the sizing is DATA-dependent,
          // so this is a floor, not a proof — check the row's scrollWidth against its clientWidth
          // after adding a vital, don't reason about it.
          "max-[1460px]:gap-0 max-[1460px]:[&_.recharts-wrapper]:hidden",
        )}
      >
        <span className="font-mono font-bold text-foreground tabular-nums whitespace-nowrap max-[1120px]:text-body">{value}</span>
        {spark && <Sparkline data={spark} color={CYAN} />}
      </span>
      {title && <span className="sr-only">{title}</span>}
    </div>
  );
}

// The composition counting, shared with the bottom VitalsBand (2026-08-30) so the phone strip's
// cluster and the band's donut can never disagree about the same four numbers. Cluster entries
// are deduped to machines first (a hybrid appears once per cluster it runs), then counted by
// their composition label (src/data/composition). The keys are EVERY label that vocabulary can
// produce, so they SUM to the selection.
export function compositionCounts(
  metaList: { id: string; nodes: NodeInfo[] }[],
  filter: string,
): Record<string, number> {
  const cfg = metagraphById(filter);
  const counts: Record<string, number> = { Hybrid: 0, Consensus: 0, Currency: 0, Data: 0 };
  // A VIRTUAL network (the unlisted set) is committed-but-machineless BY NATURE (2026-08-07,
  // one-home design): an empty selection with em-dashes, never the whole network's numbers.
  const isUnlisted = displayNetwork(filter)?.virtual === true;
  const cores = cfg ? metaList.filter((m) => m.id === cfg.id) : isUnlisted ? [] : metaList;
  for (const mg of cores) {
    const machines = new Map<string, NodeInfo>();
    for (const n of mg.nodes) {
      const k = n.ip || JSON.stringify(n);
      if (!machines.has(k)) machines.set(k, n);
    }
    for (const row of compositionRows([...machines.values()]))
      if (row.label in counts) counts[row.label]! += row.count;
  }
  return counts;
}

// Hypergraph vitals — the network's **structure** (who/what), filter-aware: how many MACHINES
// of each composition make up the current selection (user, 2026-07-12 — replaced the per-layer
// L0/cL1/dL1 role counts: the composition vocabulary is what the hyper explorer + the dossier
// table speak, so the vitals now agree with them). The counting lives in `compositionCounts`
// above (one home, shared with the VitalsBand).
// Filtered: an em-dash for a composition the selection doesn't have (stable columns, no reflow).
function HyperVitals() {
  const filter = useStore((s) => s.filter);
  const metaList = useStore((s) => s.metaList);
  const cfg = metagraphById(filter);
  const isUnlisted = displayNetwork(filter)?.virtual === true;
  const counts = compositionCounts(metaList, filter);

  const cell = (n: number) =>
    (cfg || isUnlisted) && n === 0 ? <span className="text-muted-foreground italic opacity-60">—</span> : <Odometer int value={n} />;

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
// cadence, what that traffic costs or how much of it there is, and the bytes it anchors, with
// trend charts in structural cyan (the live-activity accent, not the filter colour).
//
// ⚠️ SLOT 2 SWAPS WITH THE SCOPE, because "anchors" is two different quantities (2026-08-12).
// Globally `anchorsPerHour` is Σ metagraphSnapshotCount — snapshots anchored; filtered it is the
// distinct global ticks that network landed in, an order of magnitude smaller for a batching
// metagraph like DOR. One label over two quantities is a lie about whichever one you are not
// looking at, and the filtered reading is near-redundant with Snaps/hr anyway (every metagraph
// snapshot anchors). So under a filter the slot shows the network's DAG fees instead — exact,
// distinct from its neighbours, and it retires a FAKE SPARKLINE: `_metaActivity` sets
// `anchoredSeries` to the cadence series, "shape only", so the filtered anchors chart was
// plotting cadence under an anchors label. `feesSeries` is that network's real per-snapshot fees.
//
// ⚠️ EVERY RATE HERE IS AN EXTRAPOLATION, so each vital carries a `title` naming its own basis
// (see Activity.samples / spanHr). The two scopes reach very differently: measured 2026-08-12 the
// global buffer held 52 ticks over ~24 min (a ×2.5 reach), while DOR's held 160 snapshots over
// ~7 min (×8.6) — the metagraph buffers cap by snapshot COUNT, so a batching network's window is
// deep in count and shallow in time. That is the same conditioning the byte vital was dropped
// over, and it is why the basis is REPORTED rather than assumed: the sentence stays true when the
// window moves under it. The global readings reconcile against the chain — 126 snaps/hr and
// 2,985 anchors/hr against 128 and 2,998 measured live over 60 ticks, both within 2%.
function LedgerVitals() {
  const activity = useStore((s) => s.activity);
  const filter = useStore((s) => s.filter);
  // The SAME predicate getActivity branches on, so the labels can't describe the other stream.
  const scoped = !isGlobalActivityScope(filter);
  const basis = windowNote(activity, scoped ? "snapshots" : "global ticks");
  return (
    <>
      <Vital
        label="Snaps/hr"
        title={basis}
        value={<Odometer value={activity?.snapsPerHour} />}
        spark={activity?.cadenceSeries}
      />
      {scoped ? (
        <Vital
          label="DAG fees/hr"
          title={basis && `$DAG this network pays to anchor. ${basis}`}
          value={<Odometer value={activity?.feesPerHour} />}
          spark={activity?.feesSeries}
        />
      ) : (
        <Vital
          label="Anchors/hr"
          title={basis && `Metagraph snapshots anchored into the global chain. ${basis}`}
          value={<Odometer value={activity?.anchorsPerHour} />}
          spark={activity?.anchoredSeries}
        />
      )}
      {/* NO BYTE VITAL (user, 2026-08-12: "I want facts not guestimates" — then: drop the column).
          KB anchored per hour is the natural third reading here, and the same unit the snapshot
          card states, but every route to it from what the app holds today is an estimate: the
          polled metagraph buffers carry `sizeInKB` yet are capped by snapshot COUNT, so a batching
          network's window is deep in count and shallow in time and any rate from it propagates
          burst density — measured, that read twice the complete figure while labelled a lower
          bound. Mean size from the exact reads × the measured rate is better conditioned and still
          an estimate. A vitals slot states facts, so there is no slot until a historical series
          exists to make it one. See api.ts `_metaActivity` for the numbers behind this. */}
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

// Phone's compact toggle button is GONE (user, 2026-08-15): the vitals now ride the filter
// strip as a second row, so the bar row carries no vitals control at all on phone — the
// separate 44px toggle was starving the row the filter button lives in.

export { VitalsCluster };

// The desktop-inline wrapper is GONE (2026-08-30): the vitals left the bar for the bottom
// VitalsBand. This module stays as the PHONE cluster (the filter strip's second row, unchanged)
// and the one home of `compositionCounts`, which the band's donut shares.
