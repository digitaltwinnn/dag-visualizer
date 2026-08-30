"use client";

import { useStore } from "@/src/store/store";
import { metagraphById, filterAccent, getAnchor } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";
import { compositionCounts } from "@/components/topbar/Vitals";
import { networkKind, rolesOf, IdentityDot } from "@/components/inspector/parts";
import { identityHudCss } from "@/src/palette/identity";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { isGlobalActivityScope, type Activity } from "@/src/data/api";
import { POLL } from "@/src/engine/config";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

// THE VITALS BAND — the bottom instrument lane (2026-08-30, replacing the bar's vitals region;
// docs/superpowers/plans/2026-08-30-vitals-bottom-band.md). One slim full-width row of read-only
// info cards, per 3D view: hyper leads with a composition DONUT (the four counts are shares of
// one fleet — the one honest home for a donut), geo with its footprint numbers plus a
// nodes-by-country micro-bar row, and the ledger with its two rate cards (number + sparkline)
// beside the declicked tick bar-chart that used to be the LiveStrip.
//
// READ-ONLY BY CONSTRUCTION: the band writes no store state and takes no pointer events at all
// (`pointer-events-none` on the root — the user's rule: "no clicking etc required on any
// visualization here at the bottom"). Every route the old strip's clicks served survives
// elsewhere: the explorer rows and the global card's pager commit ticks.
//
// Colour follows rule 3: micro-charts in structural cyan; the identity hue appears only under a
// committed filter, exactly the strip's old rule — the donut and bars read `--vb-accent`, one
// inline var per band. Identity is never colour-alone: every donut segment is named by its
// legend row, every country bar by its code, every rate by its eyebrow (dataviz discipline).

// The four composition segments' opacity STEPS over the one accent hue (the house device: calm
// and dim variants are the same token at low opacity, never a bespoke tone). Fixed order, fixed
// step per label — a filter that empties a segment must not repaint the survivors.
const DONUT_STEPS = [1, 0.66, 0.42, 0.24] as const;

function windowNote(a: Activity | null | undefined, unit: string): string | undefined {
  if (!a) return undefined;
  const mins = a.spanHr * 60;
  const span = mins < 1 ? `${Math.round(mins * 60)}s` : `${Math.round(mins)} min`;
  return `Rate extrapolated from ${a.samples} ${unit} over ~${span}.`;
}

/** The band's one cell recipe: a quiet plate (spineless — cards carry no resting edge signal),
 *  eyebrow in the bar's own caps register, body below. Every card is `flex-1 basis-0` so the
 *  row DISTRIBUTES EVENLY across the full width (user, 2026-08-30 — a centred clump read as
 *  leftover; equal cards read as one designed instrument strip); a wider instrument passes its
 *  own flex via className. */
function BandCard({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border border-border/50 bg-card/40 backdrop-blur-sm px-3 py-1.5 min-w-0 flex-1 basis-0", className)}>
      <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground whitespace-nowrap leading-none">{label}</span>
      <div className="flex items-center gap-2 min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** A row of labelled micro horizontal bars (the geo country / provider / layer read) — one
 *  measure, one hue, widths on the row max, every bar named (identity never colour-alone). */
function MicroBars({ rows, accent, labelW = 26 }: { rows: { key: string; label: string; count: number }[]; accent: string; labelW?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-[3px] w-full self-center min-w-0">
      {rows.map((r) => (
        <span key={r.key} className="flex items-center gap-1.5 min-w-0">
          {/* NO uppercase transform: the layer codes are ONE vocabulary (L0/cL1/dL1 — case is
              part of the code) and provider names are names; country codes arrive uppercase. */}
          <span className="text-micro text-muted-foreground flex-none truncate" style={{ width: labelW }}>{r.label}</span>
          <span aria-hidden className="h-[5px] rounded-full flex-none" style={{ background: accent, opacity: 0.75, width: `${Math.max(4, (r.count / max) * 72)}px` }} />
          <span className="font-mono text-micro tabular-nums text-foreground">{r.count}</span>
        </span>
      ))}
    </div>
  );
}

/** The composition donut — four shares of one fleet as stroke arcs on a single accent hue at
 *  stepped opacities, the total in the hole. Pure SVG, no interaction; 2px surface gaps between
 *  segments (the dataviz spacer rule) via a gap subtracted from each arc. */
function Donut({ counts, accent }: { counts: Record<string, number>; accent: string }) {
  const entries = Object.entries(counts);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const R = 15.5, C = 2 * Math.PI * R, GAP = 2;
  let acc = 0;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="flex-none -rotate-90">
      {total > 0 &&
        entries.map(([label, n], i) => {
          if (n <= 0) return null;
          const frac = n / total;
          const len = Math.max(0, frac * C - GAP);
          const off = -acc * C;
          acc += frac;
          return (
            <circle
              key={label}
              cx="22" cy="22" r={R}
              fill="none"
              stroke={accent}
              strokeOpacity={DONUT_STEPS[i] ?? 0.2}
              strokeWidth="6"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={off}
            />
          );
        })}
      {total === 0 && <circle cx="22" cy="22" r={R} fill="none" stroke="var(--border)" strokeWidth="6" />}
      <text x="22" y="22" transform="rotate(90 22 22)" textAnchor="middle" dominantBaseline="central" className="font-mono font-bold fill-[var(--foreground)]" fontSize="11">
        {total || "—"}
      </text>
    </svg>
  );
}

// hyper — the structure cells (4): METAGRAPHS with a by-type stacked bar (networkKind is the
// one home for the type read — "unknown" is the honest word for a 0-node network whose roles
// can't be known), the COMPOSITION donut, the LAYERS' own populations (the shells' vocabulary:
// how many L0 / cL1 / dL1 processes run in the selection), and the fleet NODES total.
const TYPE_ORDER = ["data", "currency", "data + currency", "unknown"] as const;

function HyperCells({ accent }: { accent: string }) {
  const filter = useStore((s) => s.filter);
  const metaList = useStore((s) => s.metaList);
  const selNodes = useStore((s) => s.selNodes);
  const cfg = metagraphById(filter);
  const scoped = !!cfg || displayNetwork(filter)?.virtual === true;
  const counts = compositionCounts(metaList, filter);

  // Metagraphs by TYPE — the DAG core is not a metagraph (one node model: it is the
  // metagraph-shaped CORE), so it stays out of this count; a committed filter scopes to it.
  const metas = metaList.filter((m) => m.id !== "dag" && (!cfg || m.id === cfg.id));
  const types: Record<string, number> = { data: 0, currency: 0, "data + currency": 0, unknown: 0 };
  for (const m of metas) {
    const kind = networkKind(m.id, m.nodes);
    if (kind === "data and currency metagraph") types["data + currency"]!++;
    else if (kind === "currency metagraph") types.currency!++;
    else if (kind === "data metagraph") types.data!++;
    else types.unknown!++; // bare "metagraph": zero locatable nodes, roles unknowable
  }
  const typeTotal = metas.length;

  // The layers' populations: one count per PROCESS layer across the selection's machines —
  // rolesOf is the one fallback home (a role list, else the single primary layer).
  const layers: Record<string, number> = { l0: 0, cl1: 0, dl1: 0 };
  const layerScope = cfg ? metaList.filter((m) => m.id === cfg.id) : displayNetwork(filter)?.virtual === true ? [] : metaList;
  for (const m of layerScope) {
    const seen = new Set<string>();
    for (const n of m.nodes) {
      const k = n.ip || JSON.stringify(n);
      if (seen.has(k)) continue;
      seen.add(k);
      for (const r of rolesOf(n)) if (r in layers) layers[r]!++;
    }
  }

  return (
    <>
      <BandCard label="Metagraphs" className="flex-[1.3]">
        <span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={typeTotal || null} /></span>
        <div className="flex flex-col gap-1 min-w-0 flex-1 self-center">
          {/* the by-type stacked bar — shares of the listed set, 2px surface gaps */}
          <div aria-hidden className="flex h-[6px] w-full gap-[2px]">
            {TYPE_ORDER.map((t, i) =>
              types[t]! > 0 ? (
                <span key={t} className="rounded-full" style={{ background: accent, opacity: DONUT_STEPS[i] ?? 0.2, flexGrow: types[t]!, flexBasis: 0 }} />
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {TYPE_ORDER.map((t, i) =>
              types[t]! > 0 ? (
                <span key={t} className="flex items-center gap-1 whitespace-nowrap">
                  <span aria-hidden className="size-1.5 rounded-full flex-none" style={{ background: accent, opacity: DONUT_STEPS[i] ?? 0.2 }} />
                  <span className="text-micro uppercase text-muted-foreground">{t}</span>
                  <span className="font-mono text-micro tabular-nums text-foreground">{types[t]}</span>
                </span>
              ) : null,
            )}
          </div>
        </div>
      </BandCard>
      <BandCard label="Composition" className="flex-[1.5]">
        <Donut counts={counts} accent={accent} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {Object.entries(counts).map(([label, n], i) => (
            <span key={label} className="flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden className="size-1.5 rounded-full flex-none" style={{ background: accent, opacity: DONUT_STEPS[i] ?? 0.2 }} />
              <span className="text-micro tracking-[0.08em] uppercase text-muted-foreground">{label}</span>
              <span className="font-mono font-bold text-caption tabular-nums text-foreground">
                {scoped && n === 0 ? <span className="text-muted-foreground italic opacity-60">—</span> : <Odometer int value={n} />}
              </span>
            </span>
          ))}
        </div>
      </BandCard>
      <BandCard label="Layers">
        <MicroBars accent={accent} rows={[
          { key: "l0", label: "L0", count: layers.l0! },
          { key: "cl1", label: "cL1", count: layers.cl1! },
          { key: "dl1", label: "dL1", count: layers.dl1! },
        ]} />
      </BandCard>
      <BandCard label="Nodes">
        <span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={selNodes.length || null} /></span>
      </BandCard>
    </>
  );
}

// geo — the footprint cells (5): three numbers, nodes-by-country micro-bars (the view's own
// axis) and TOP PROVIDERS (the hosting-concentration read — the same facts the cohort explorer
// speaks). Single hue — one measure per chart, magnitude only.
function GeoCells({ accent }: { accent: string }) {
  const lb = useStore((s) => s.leaderboard);
  const selNodes = useStore((s) => s.selNodes);
  const countries = lb?.countries ?? [];
  const total = selNodes.length;
  const ispCounts = new Map<string, number>();
  for (const r of selNodes) {
    const isp = "geo" in r.pick ? r.pick.geo?.isp : undefined;
    if (isp) ispCounts.set(isp, (ispCounts.get(isp) ?? 0) + 1);
  }
  const topIsps = [...ispCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topCountries = countries.slice(0, 3);
  const restC = countries.slice(3).reduce((s, c) => s + c.count, 0);
  return (
    <>
      <BandCard label="Nodes"><span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={total || null} /></span></BandCard>
      <BandCard label="Countries"><span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={countries.length || null} /></span></BandCard>
      <BandCard label="Providers"><span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={ispCounts.size || null} /></span></BandCard>
      {topCountries.length > 0 && (
        <BandCard label="Nodes by country" className="flex-[1.4]">
          <div className="flex w-full items-center gap-2">
            <MicroBars accent={accent} labelW={18} rows={topCountries.map((c) => ({ key: c.cc, label: c.cc, count: c.count }))} />
            {restC > 0 && <span className="text-micro text-muted-foreground whitespace-nowrap self-end pb-0.5">+{countries.length - topCountries.length} more · {restC}</span>}
          </div>
        </BandCard>
      )}
      {topIsps.length > 0 && (
        <BandCard label="Top providers" className="flex-[1.6]">
          <MicroBars accent={accent} labelW={92} rows={topIsps.map(([isp, n]) => ({ key: isp, label: isp, count: n }))} />
        </BandCard>
      )}
    </>
  );
}

// The declicked tick bar-chart — the LiveStrip's honesty rules verbatim, minus every
// interaction: unfiltered each bar is the tick's TOTAL anchors in cyan on the window max;
// filtered it is THAT network's own anchors on its OWN scale in its identity hue, empty ticks
// as honest gaps. Only the newest bar glows. A regular bar chart, nothing more.
const TICK_BARS = 32;

function TickBars({ accent, isMeta, filter }: { accent: string; isMeta: boolean; filter: string }) {
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots);
  const recent = snaps.slice(-TICK_BARS);
  const bars = recent.map((d) => {
    const total = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : 0;
    const mine = isMeta ? getAnchor(d.timestamp)?.metaCounts?.get(filter) ?? 0 : total;
    return { v: isMeta ? mine : total, ord: d.ordinal };
  });
  const max = Math.max(1, ...bars.map((b) => b.v));
  return (
    <div className="flex items-end gap-[2px] h-[34px] w-full self-end pb-0.5" aria-hidden>
      {bars.length === 0 && <span className="text-micro text-muted-foreground self-center">acquiring…</span>}
      {bars.map((b, i) => {
        const latest = i === bars.length - 1;
        return (
          <span
            key={b.ord}
            className="flex-1 max-w-[7px] rounded-t-[2px]"
            style={{
              height: b.v > 0 ? `${Math.max(8, (b.v / max) * 100)}%` : "2px",
              background: accent,
              opacity: b.v > 0 ? (latest ? 1 : 0.55) : 0.18,
              boxShadow: latest && b.v > 0 ? `0 0 6px ${accent}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

// ledger — the activity cells: the two rates as number + sparkline cards (slot 2 swaps with the
// scope exactly as the bar's vitals did: filtered, "anchors" would be a different quantity, so
// the network's DAG fees show instead), and the tick chart as one wide card.
function LedgerCells({ accent, filter }: { accent: string; filter: string }) {
  const activity = useStore((s) => s.activity);
  const scoped = !isGlobalActivityScope(filter);
  const cfg = metagraphById(filter);
  const isMeta = !!cfg && filter !== "all" && filter !== "dag";
  const basis = windowNote(activity, scoped ? "snapshots" : "global ticks");
  const rate = (label: string, value: number | undefined, spark: number[] | undefined, note?: string) => (
    <BandCard label={label}>
      <span className="font-mono font-bold text-foreground tabular-nums whitespace-nowrap"><Odometer value={value} /></span>
      <Sparkline data={spark} color="var(--primary)" width={64} height={26} />
      {note && <span className="sr-only">{note}</span>}
    </BandCard>
  );
  return (
    <>
      {rate("Snaps/hr", activity?.snapsPerHour, activity?.cadenceSeries, basis)}
      {scoped
        ? rate("DAG fees/hr", activity?.feesPerHour, activity?.feesSeries, basis && `$DAG this network pays to anchor. ${basis}`)
        : rate("Anchors/hr", activity?.anchorsPerHour, activity?.anchoredSeries, basis && `Metagraph snapshots anchored into the global chain. ${basis}`)}
      <AnchoringNetworks />
      <BandCard label={isMeta ? "Anchors per tick" : "Anchors per global tick"} className="flex-[2] min-w-[220px]">
        <TickBars accent={accent} isMeta={isMeta} filter={filter} />
      </BandCard>
    </>
  );
}

// The distinct metagraphs seen anchoring across the retained window — EXACT (the anchor index's
// own id sets, never inferred) — with each network's identity dot: the app-wide identity-dot
// language (a presence roster, not a chart series), names carried sr-only since the band takes
// no pointer events. A committed filter is a LENS: the window-wide fact stands un-edited.
function AnchoringNetworks() {
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots);
  const ids = new Set<string>();
  for (const d of snaps) {
    const mc = getAnchor(d.timestamp)?.metaCounts;
    if (mc) for (const id of mc.keys()) ids.add(id);
  }
  const list = [...ids];
  return (
    <BandCard label="Networks anchoring">
      <span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={list.length || null} /></span>
      <span className="flex flex-wrap items-center gap-1 max-w-[120px]">
        {list.slice(0, 12).map((id) => <IdentityDot key={id} hue={identityHudCss(id)} />)}
      </span>
      <span className="sr-only">{list.map((id) => metagraphById(id)?.name ?? id).join(", ")}</span>
    </BandCard>
  );
}

/** The band. Mounted by BottomStream (per viewPolicy.vitalsLane + scene pose + rails visible);
 *  this component reads the mode only to pick which view's cells to lay out. */
export default function VitalsBand() {
  const mode = useStore((s) => s.mode);
  const live = useStore((s) => s.live);
  const filter = useStore((s) => s.filter);
  const scopeHue = filter !== "all" ? filterAccent(filter) : null;
  // Rule 3: structural cyan is the charts' resting hue; a committed filter re-points the one
  // accent var at the identity hue (the strip's old rule, kept).
  const accent = scopeHue ?? "var(--primary)";
  return (
    <section
      id="vitalsband"
      aria-label="View vitals"
      className={cn(
        // pointer-events-none: the band is a read-only instrument — orbit drags pass through it.
        "fixed z-10 left-4 right-4 bottom-[calc(var(--footer-h,0px)+10px)] pointer-events-none",
        "flex items-stretch gap-2",
        !live && "saturate-[.45]",
      )}
      style={{ ["--vb-accent"]: accent } as CSSProperties}
    >
      {!live && <span className="self-center"><NoSignalDot /></span>}
      {mode === "hyper" && <HyperCells accent={accent} />}
      {mode === "geo" && <GeoCells accent={accent} />}
      {mode === "ledger" && <LedgerCells accent={accent} filter={filter} />}
      {/* FILTER-SCOPE hairline (the bar's device, kept): with a network committed the numbers are
          silently filtered — the band wears the identity hairline along its bottom edge. */}
      {scopeHue && (
        <span
          aria-hidden
          className="absolute -bottom-[6px] left-[10%] right-[10%] h-px opacity-60"
          style={{ background: `linear-gradient(90deg, transparent, ${scopeHue} 15%, ${scopeHue} 85%, transparent)` }}
        />
      )}
    </section>
  );
}
