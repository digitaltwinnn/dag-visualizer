"use client";

import { useStore } from "@/src/store/store";
import { metagraphById, filterAccent, getAnchor } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";
import { networkKind, rolesOf, IdentityDot, RoleChips } from "@/components/inspector/parts";
import { compositionRows } from "@/src/data/composition";
import type { NodeInfo } from "@/src/data/types";
import { identityHudCss } from "@/src/palette/identity";
import { METATYPE_ICONS, VIEW_ICONS } from "@/components/icons";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { isGlobalActivityScope, type Activity } from "@/src/data/api";
import { POLL } from "@/src/engine/config";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { useSceneYield } from "@/components/RailShade";
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

// The composition counting (moved home from the retired topbar/Vitals cluster, 2026-08-30 —
// this module is its one consumer now that the phone strip renders the band's own cards).
// Cluster entries are deduped to machines first (a hybrid appears once per cluster it runs),
// then counted by their composition label; the keys are EVERY label the vocabulary can produce,
// so they SUM to the selection.
export function compositionCounts(
  metaList: { id: string; nodes: NodeInfo[] }[],
  filter: string,
): Record<string, number> {
  const cfg = metagraphById(filter);
  const counts: Record<string, number> = { Hybrid: 0, Consensus: 0, Currency: 0, Data: 0 };
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
    <div className={cn(
      // The plate is the COMMAND BAR's own glass (`--topbar-glass` — a gradient token, so the
      // arbitrary-property form per CSS trap 3): the band is that bar's sibling instrument, and
      // the earlier `bg-card/40` was tuned under light and sat near-invisible over the dark
      // scene's glow (user, 2026-08-30: "in dark the card needs a bit more contrast").
      "flex flex-col gap-1 rounded-lg border border-border/60 [background:var(--topbar-glass)] backdrop-blur-sm px-3 py-1.5 min-w-0 flex-1 basis-0",
      className,
    )}>
      <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground whitespace-nowrap leading-none">{label}</span>
      <div className="flex items-center gap-2 min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** A row of labelled micro horizontal bars (the geo country / provider / layer read) — one
 *  measure, one hue, widths on the row max, every bar named (identity never colour-alone). */
function MicroBars({ rows, accent, labelW = 26 }: { rows: { key: string; label: React.ReactNode; count: number }[]; accent: string; labelW?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-[3px] w-full self-center min-w-0">
      {rows.map((r) => (
        <span key={r.key} className="flex items-center gap-1.5 min-w-0">
          {/* NO uppercase transform: the layer codes are ONE vocabulary (L0/cL1/dL1 — case is
              part of the code) and provider names are names; country codes arrive uppercase. */}
          <span className="text-micro text-muted-foreground flex-none truncate leading-none" style={{ width: labelW }}>{r.label}</span>
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

/** One type's glyph — "data + currency" is deliberately the data+currency PAIR (no third
 *  metaphor; see METATYPE_ICONS), "hypergraph" the hyper view's own Orbit. */
function TypeGlyph({ t, className, color }: { t: string; className?: string; color?: string }) {
  if (t === "data + currency") {
    return (
      <span aria-hidden className="flex items-center gap-0.5 flex-none" style={color ? { color } : undefined}>
        <METATYPE_ICONS.data className={className} />
        <METATYPE_ICONS.currency className={className} />
      </span>
    );
  }
  const Icon =
    t === "hypergraph" ? VIEW_ICONS.hyper
    : t === "mixed set" ? METATYPE_ICONS.mixed
    : t === "currency" ? METATYPE_ICONS.currency
    : t === "data" ? METATYPE_ICONS.data
    : METATYPE_ICONS.unknown;
  return <Icon aria-hidden className={cn("flex-none", className)} style={color ? { color } : undefined} />;
}

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

  // A COMMITTED SCOPE flips the card from a DISTRIBUTION to a CHARACTERISTIC (user, 2026-08-30:
  // "'currency 1' and a bar ... is more a single characteristic than a count"): one network has a
  // type, not a type breakdown, so the eyebrow goes singular and the value is the type — icon +
  // word. The DAG answers networkKind's own "hypergraph" (the hyper view's Orbit), the unlisted
  // set the honest "mixed set". "all" keeps the count with one icon+count entry per type — icons
  // over bars (user, same day): a type is a KIND, not a magnitude, so a glyph says it better
  // than a share bar, and the same glyphs then serve the filtered card unchanged.
  const singleWord =
    filter === "dag" ? "hypergraph"
    : displayNetwork(filter)?.virtual === true ? "mixed set"
    : cfg ? (TYPE_ORDER.find((t) => types[t]! > 0) ?? "unknown")
    : null;

  return (
    <>
      {singleWord != null ? (
        <BandCard label={cfg ? "Metagraph type" : "Network type"}>
          {/* SUBTLE on purpose (user): a characteristic is a quiet reading, not a headline —
              the number cards keep the bold mono, a word does not. */}
          <TypeGlyph t={singleWord} className="size-3.5" color={accent} />
          <span className="font-mono text-caption text-foreground whitespace-nowrap">{singleWord}</span>
        </BandCard>
      ) : (
      <BandCard label="Metagraphs" className="flex-[1.4]">
        {/* THE COMPOSITION CARD'S OWN SHAPE (user, 2026-08-30: "the same design (1 total value +
            4 subsets) — the one used for node composition looks best"): the two cards are sibling
            share-of-whole readings, so they wear one donut + dot-legend design. The type GLYPHS
            keep their home on the filtered face, where the card states a single characteristic. */}
        <Donut counts={types} accent={accent} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {TYPE_ORDER.map((t, i) => (
            <span key={t} className="flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden className="size-1.5 rounded-full flex-none" style={{ background: accent, opacity: DONUT_STEPS[i] ?? 0.2 }} />
              <span className="text-micro tracking-[0.08em] uppercase text-muted-foreground">{t === "data + currency" ? "both" : t}</span>
              <span className="font-mono font-bold text-caption tabular-nums text-foreground"><Odometer int value={types[t]!} /></span>
            </span>
          ))}
        </div>
      </BandCard>
      )}
      <BandCard label="Nodes">
        <span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={selNodes.length || null} /></span>
      </BandCard>
      <BandCard label="Node composition" className="flex-[1.5]">
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
      <BandCard label="Network layers">
        <MicroBars accent={accent} labelW={34} rows={[
          { key: "l0", label: <RoleChips codes={["L0"]} />, count: layers.l0! },
          { key: "cl1", label: <RoleChips codes={["cL1"]} />, count: layers.cl1! },
          { key: "dl1", label: <RoleChips codes={["dL1"]} />, count: layers.dl1! },
        ]} />
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
      {topCountries.length > 0 && (
        <BandCard label="Nodes by country" className="flex-[1.4]">
          <div className="flex w-full items-center gap-2">
            <MicroBars accent={accent} labelW={18} rows={topCountries.map((c) => ({ key: c.cc, label: c.cc, count: c.count }))} />
            {restC > 0 && <span className="text-micro text-muted-foreground whitespace-nowrap self-end pb-0.5">+{countries.length - topCountries.length} more · {restC}</span>}
          </div>
        </BandCard>
      )}
      <BandCard label="Providers"><span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={ispCounts.size || null} /></span></BandCard>
      {topIsps.length > 0 && (
        <BandCard label="Top providers" className="flex-[1.6]">
          {/* labelW 92 → 150 (user, 2026-08-30): the card had spare width while "Hetzner
              Online GmbH" truncated — the name is the row's identity, so it gets the room. */}
          <MicroBars accent={accent} labelW={150} rows={topIsps.map(([isp, n]) => ({ key: isp, label: isp, count: n }))} />
        </BandCard>
      )}
    </>
  );
}

// The declicked tick bar-chart — the LiveStrip's honesty rules verbatim, minus every
// interaction: unfiltered each bar is the tick's TOTAL anchors in cyan on the window max;
// filtered it is THAT network's own anchors on its OWN scale in its identity hue, empty ticks
// as honest gaps. Only the newest bar glows. A regular bar chart, nothing more.
function TickBars({ accent, isMeta, filter }: { accent: string; isMeta: boolean; filter: string }) {
  // The FULL retained window (the old strip's own choice): a fixed slice left the wide card's
  // right side empty (user, 2026-08-30 — "a lot of room available to the right").
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots);
  const bars = snaps.map((d) => {
    const total = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : 0;
    const mine = isMeta ? getAnchor(d.timestamp)?.metaCounts?.get(filter) ?? 0 : total;
    return { v: isMeta ? mine : total, ord: d.ordinal };
  });
  const max = Math.max(1, ...bars.map((b) => b.v));
  return (
    <div className="flex items-end justify-end gap-[2px] h-[34px] w-full self-end pb-0.5" aria-hidden>
      {bars.length === 0 && <span className="text-micro text-muted-foreground self-center">acquiring…</span>}
      {bars.map((b, i) => {
        const latest = i === bars.length - 1;
        return (
          <span
            key={b.ord}
            className="flex-1 max-w-[9px] rounded-t-[2px]"
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
      {/* stretch: the fixed 64px chart left the card's right half empty (user, 2026-08-30) */}
      <span className="flex-1 min-w-0 self-center"><Sparkline data={spark} color="var(--primary)" height={26} stretch /></span>
      {note && <span className="sr-only">{note}</span>}
    </BandCard>
  );
  // WHO anchors, HOW MUCH, HOW OFTEN, then the per-tick picture (user ordering, 2026-08-30):
  // the roster leads, the anchor rate beside it, the cadence, and the chart closes the row.
  return (
    <>
      <AnchoringNetworks />
      {scoped
        ? rate("DAG fees/hour", activity?.feesPerHour, activity?.feesSeries, basis && `$DAG this network pays to anchor. ${basis}`)
        : rate("Anchors/hour", activity?.anchorsPerHour, activity?.anchoredSeries, basis && `Metagraph snapshots anchored into the global chain. ${basis}`)}
      {rate("Snapshots/hour", activity?.snapsPerHour, activity?.cadenceSeries, basis)}
      <BandCard label="Anchors per global snapshot" className="flex-[2] min-w-[220px]">
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
    <BandCard label="Metagraphs anchoring">
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
  // The band steps back with the rails while the user's hand is on the camera (user, 2026-08-30)
  // — the same one read the RailShade dims on, at the recipe's own tempos (away 0.3s, the return
  // faster: it answers a gesture already finished).
  const yielding = useSceneYield();
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
        // 26px each side — the RAILS' own outer margin (#leftcol/#rightcol, globals.css), so the
        // band's edges align with the rail cards and never cover the RailThread rulers that live
        // in that margin (user, 2026-08-30: the band "sits on top of the rail of the side panels").
        "fixed z-10 left-[26px] right-[26px] bottom-[calc(var(--footer-h,0px)+10px)] pointer-events-none",
        "flex items-stretch gap-2",
        "transition-opacity duration-[180ms] ease-out motion-reduce:transition-none",
        yielding && "opacity-40 duration-300",
        !live && "saturate-[.45]",
      )}
      style={{ ["--vb-accent"]: accent } as CSSProperties}
    >
      {!live && <span className="self-center"><NoSignalDot /></span>}
      {mode === "hyper" && <HyperCells accent={accent} />}
      {mode === "geo" && <GeoCells accent={accent} />}
      {mode === "ledger" && <LedgerCells accent={accent} filter={filter} />}
      {/* NO filter-scope hairline (user, 2026-08-30 — removed): unlike the old bar cluster's
          bare numbers, the band's own charts already wear the identity accent under a filter,
          so the scope is stated by the vitals themselves. */}
    </section>
  );
}

/** The PHONE home of the vitals (user pick, 2026-08-30 — option 1): the SAME cards, riding the
 *  filter strip's second row as a horizontal scroll instead of a fixed band — the strip is
 *  already where phone vitals live and growing downward is its one mechanism, so no new surface
 *  or vertical space is claimed. Cards go content-sized (`flex-none basis-auto` overrides the
 *  band's even distribution at higher specificity) with a floor so the stretch sparklines have
 *  real width to measure. TopBar gates the row on `vitalsLane`, the band's own policy flag. */
export function VitalsStripRow() {
  const mode = useStore((s) => s.mode);
  const live = useStore((s) => s.live);
  const filter = useStore((s) => s.filter);
  const scopeHue = filter !== "all" ? filterAccent(filter) : null;
  const accent = scopeHue ?? "var(--primary)";
  return (
    <div
      className={cn(
        "flex items-stretch gap-2 overflow-x-auto slim-scroll pb-1 min-w-0 flex-1",
        "[&>*]:flex-none [&>*]:basis-auto [&>*]:min-w-[150px]",
        !live && "saturate-[.45]",
      )}
      style={{ ["--vb-accent"]: accent } as CSSProperties}
    >
      {!live && <span className="self-center flex-none min-w-0!"><NoSignalDot /></span>}
      {mode === "hyper" && <HyperCells accent={accent} />}
      {mode === "geo" && <GeoCells accent={accent} />}
      {mode === "ledger" && <LedgerCells accent={accent} filter={filter} />}
    </div>
  );
}
