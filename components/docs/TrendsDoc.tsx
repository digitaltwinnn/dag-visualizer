"use client";
import { useState } from "react";
import { Panel } from "@/components/docs/AboutDoc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useTrendsSlice from "@/components/useTrendsSlice";
import { type ZoomId } from "@/src/data/trendWindow";
import TrendChart, { type TrendLine } from "@/components/docs/TrendChart";
import {
  TREND_METRICS,
  type CounterMetric,
  formatDag as dag,
  formatMb as mb,
  formatSeconds as secs,
  metricSeries,
  metricUnit,
  perPhrase,
  rankByLast,
  seriesKey,
  sharedCeiling,
  tierWord,
  trimCounterEdges,
} from "@/src/data/trendSeries";
import { METAGRAPHS } from "@/src/net/current";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";

import { cn } from "@/lib/utils";
import { PICKER_GROUP, ScaleToggle, ScopeChip, WindowPicker, zoomBtn } from "@/components/trendPickers";
import { openRecords, spanOfWindow } from "@/components/trendDoors";
import { scopeEmptyCopy, trendRoster, trendScope } from "@/src/data/trendScope";

// THE TRENDS DOCUMENT (user, 2026-09-06; widened twice since) — the first UI consumer of the
// trends backend: one daily-resolution chart per stored metric over the /api/trends 1y window,
// leading-trimmed to where measuring began. It is the History view's RAW REGISTER (2026-09-18):
// the measured history is ONE rung of the observation ladder read two ways — the 3D stack of
// chart planes, and this document behind that view's RAW toggle (`viewPolicy.rawSurface`, mounted
// by datasection/DocumentSurface). It rode the doc-overlay recipe until then, alongside About and
// Design; a doc overlay cannot host it, because opening one forces `section` back to "scene".
//
// HONESTY (rule 10, the trends store's own contract rendered): a null bucket draws as a GAP,
// never a zero — the copy says so once, up front. The fees/bytes charts carry the FLOOR label
// (tracked metagraphs only, the cards' own register). The fleet section states its birthday:
// node-count gauges cannot be backfilled (no historical record of the fleet exists upstream),
// so those series begin the day the sampler first ran and fill forward.
//
// Charts are SMALL MULTIPLES per network rather than one many-hued plot (the dataviz rule the
// vitals band follows: identity is never colour-alone, and eleven series in one frame is a
// legend puzzle, not a reading), stacked in ONE COLUMN so the shared time axis aligns across
// metrics, and ranked busiest-first (see the networks section for why that departs from the
// vitals' catalog-order rule).

interface TrendsPayload {
  stepMs: number;
  buckets: number[];
  series: Record<string, (number | null)[]>;
}


/** The h1's span phrase, from the measured buckets themselves. */
function spanPhrase(buckets: number[], stepMs: number): string {
  if (buckets.length < 2) return "The network";
  const spanMs = buckets[buckets.length - 1] - buckets[0];
  const grain = stepMs >= 86400000 ? "measured daily" : stepMs >= 3600000 ? "measured hourly" : "measured every five minutes";
  const months = Math.round(spanMs / 2592000000);
  if (months >= 2) return `${months} months of the network, ${grain}`;
  const days = Math.round(spanMs / 86400000);
  if (days >= 2) return `${days} days of the network, ${grain}`;
  if (spanMs >= 2 * 3600000) return `24 hours of the network, ${grain}`;
  return `The last hour of the network, ${grain}`;
}

const S = (p: TrendsPayload | undefined, name: string): (number | null)[] =>
  p?.series[name] ?? [];

/** mean gap per bucket = gapSum / ticks, where both were measured (ticks > 0). */
function meanGap(p: TrendsPayload): (number | null)[] {
  const ticks = S(p, "g.ticks");
  const sum = S(p, "g.gapSum");
  return ticks.map((t, i) => (t != null && t > 0 && sum[i] != null ? sum[i]! / t : null));
}

const scale = (points: (number | null)[], k: number): (number | null)[] =>
  points.map((v) => (v == null ? null : v * k));

// The pickers' group + pill classes are `components/trendPickers.tsx` — shared with the History
// view's band timeline, which wears the same window control (2026-09-18).

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      // mt-8 is the BETWEEN-sections rhythm; the first section in a tab drawer has no
      // predecessor, and the drawer's own padding is the inset (user, 2026-09-12: "does the
      // header text inside the tab need so much top margin?" — measured 52px, the panel's
      // 20 plus this 32). first:mt-0 leaves the drawer's 20px, matching its own px-5.
      className="mt-8 first:mt-0 scroll-mt-24"
    >
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 border-t border-border" />
      <p className="mt-3 text-label text-muted-foreground leading-relaxed">{lead}</p>
      {/* ONE COLUMN (user, 2026-09-07): every chart shares the same time axis, so
          stacking aligns the days vertically and a dip can be followed across metrics. */}
      <div className="mt-4 grid gap-y-7">{children}</div>
    </section>
  );
}

export default function TrendsDoc() {
  // ⚠️ THE DOCUMENT OPENS ON WHAT THE SCENE WAS SHOWING (2026-09-19).
  // Convention 12's ladder says each step down CARRIES ITS CONTEXT, and the two faces of rung 2
  // are one step apart: a reader who brushed Feb–Jun on the History timeline and pressed RAW was
  // handed the whole measured span back, which is the same lost-context complaint the per-chart
  // records door exists to answer one rung further down.
  //
  // So the window and the range are SEEDED from the store's own channels — `trendWindow` and
  // `trendRange`, the ones the stack and the band read — and read ONCE AT MOUNT, exactly like
  // `initialTab` below and for the same reason: `datasection/DocumentSurface` mounts this
  // component when the raw register OPENS, so "at mount" is "when the reader asked to read it".
  //
  // ⚠️ SEEDED, NOT FOLLOWED, AND NEVER WRITTEN BACK. After mount these are the page's own state:
  // the document's pickers move them and the stack behind it does not move. A subscription would
  // make the document a second view of one window rather than a document (and would fight the
  // reader's own pill the moment the band's cursor wrote), and a write back the other way would
  // make reading the page silently re-cut the scene you left. The channels are read through
  // `getState()` for that reason — a one-shot read is what the seed IS, and the adjacent
  // `filter` read two blocks down is deliberately SUBSCRIBED, so the two must not be confused.
  const [zoom, setZoom] = useState<ZoomId>(() => useStore.getState().trendWindow);
  // THE RANGE — a drag on any chart (convention 12's zoom). ONE selection for the whole
  // page: the shared-axis column means every chart cuts to it together. Picking a zoom pill
  // clears it (the pill IS a range statement); the chip row beside the pills states it, and
  // the "records" action on per-network charts hands it one rung down the ladder.
  // `metaId` = whose chart the drag was drawn on (user, 2026-09-09: DOR committed, a range
  // dragged on BIOFI's chart, "go to raw: no biofi in the filter" — a range must remember
  // its network, and the standalone records button prefers it over the committed filter).
  // A range arriving from the SCENE carries no metagraph — the timeline brushes the whole stack,
  // not one plane — so it seeds `metaId: null` and the records door falls back to the committed
  // filter, which is exactly what that door does for the global charts already.
  const [range, setRange] = useState<{ fromMs: number; toMs: number; metaId?: string | null } | null>(() => {
    const r = useStore.getState().trendRange;
    return r ? { fromMs: r.fromMs, toMs: r.toMs, metaId: null } : null;
  });
  // ONE section selection for BOTH drawers (user, 2026-09-09: "have it once drive both
  // tabs") — the two cabinets carry the same four sections, and an uncontrolled pair reset
  // the pick on every drawer switch. The zoom/range already lives at page level; making the
  // inner Tabs controlled by one state is the whole fix, and only one control row is ever
  // on screen (the inactive drawer unmounts).
  const [sectionTab, setSectionTab] = useState("snapshots");
  // ⚠️ ONE SCALE OR EACH ITS OWN — and the reader picks (user, 2026-09-14: "looks like they are
  // equal because the scale is different"). Exactly right, and it is the classic small-multiples
  // trap: a column of per-network charts that each autoscale answers "how did THIS network's week
  // go?" beautifully and "which of these networks is bigger?" with a flat lie, because a chain
  // anchoring three a day and one anchoring forty draw the same silhouette.
  //
  // Neither answer is the right default for everyone, so this is a CONTROL rather than a ruling:
  // `own` keeps each chart's shape legible (the peaks, the dips, the quiet stretches), `shared`
  // puts them all on the busiest one's scale so the column reads as a comparison.
  //
  // ⚠️ SHARED IS THE DEFAULT (user, 2026-09-14, the same round that asked for the control): a
  // column of charts is read AS a column before it is read one chart at a time, so whatever the
  // sections are titled, the first thing this page says is a comparison — and the autoscaled
  // version said it wrongly. A reader who wants one network's own shape asks for it with one
  // click and gets a chart that is still fully legible; a reader who never touches the control
  // is not left with the flat lie. The honest reading is the one that needs no gesture.
  // The peak readout stays each chart's OWN number in both modes (TrendChart's `ownMax`), so a
  // sliver can still say how high it actually got.
  const [scaleMode, setScaleMode] = useState<"own" | "shared">("shared");
  // THE WINDOW, IN ONE CALL (2026-09-18) — which payloads this zoom (and any committed range)
  // needs and how each is cut are `planTrendFetch`/`assembleTrendSlice` in src/data/trendWindow,
  // fetched by `useTrendsSlice`. ONE HOME with the 3D trend stack, which reads the same hook off
  // the store's own window: this page and that view are two registers of one rung (convention
  // 12), and they already share the chart primitive and the per-network series maths. The auto-
  // tiering, the 1H slice, the fleet's hourly payload and the daily readout's 90d window all
  // moved there with their reasons; the document's zoom and range stay LOCAL state after the
  // mount SEED above, because the window a reader picks on this page is the page's own.
  const { p, buckets, stepMs, pF, fBuckets, fStep, fleetPending, daily, error } = useTrendsSlice(zoom, range);
  // ⚠️ THE COMMITTED NETWORK SCOPES EVERY PER-NETWORK COLUMN (user, 2026-09-14: "Trends is a
  // doc-page, but actually it shows data that could benefit from the metagraph filter … hide the
  // other metagraph charts"). ONE roster, read by all three panel builders, so a section cannot
  // answer the filter differently from the section under it — and SUBSCRIBED, unlike the mount-
  // once `initialTab` below: picking a chip in the bar's filter strip must cut the charts under
  // the reader's eyes — and over a raw layer the command bar keeps its whole ordinary face, so
  // the strip is simply there. "all" is every catalog network, as before.
  //
  // A filter with no catalog row — the DAG core, the unlisted channels — leaves this EMPTY, and
  // that is honest rather than broken: the trends store keys its series per listed metagraph, so
  // there is genuinely nothing measured here for either. The tab says which case it is and names
  // where the reading does live; see `scopeEmpty`.
  const filter = useStore((s) => s.filter);
  // ONE ROSTER RULE, shared with the History view's stack (`src/data/trendScope.ts`, 2026-09-19):
  // which chains a filter leaves in scope is a property of the trends store, not of this page.
  const roster = trendRoster(filter).map((id) => METAGRAPHS.find((m) => m.id === id)!);

  // A committed metagraph opens the document on that side of the network. The THIRD of this
  // component's mount-once reads, with the window and the range above, and all three answer the
  // same question — what was the reader looking at when they asked for this page? Read ONCE AT
  // MOUNT, and the mount is the RAW TOGGLE: `datasection/DocumentSurface` mounts this component when the raw
  // register OPENS and unmounts it when the recede finishes, so "at mount" is "when the reader
  // asked to read it" — which is what makes this read the committed filter as it stands right
  // then. (It was briefly mounted with the VIEW instead, and that latched the answer before the
  // reader had committed anything; the surface's header carries that history.) The Tabs stay
  // uncontrolled, so browsing them afterwards owes the filter nothing, while the roster above
  // stays SUBSCRIBED so a chip picked mid-read still cuts the charts under the reader's eyes. The
  // DAG core's history is the Hypergraph tab — only a catalog metagraph flips the default.
  const [initialTab] = useState<"hypergraph" | "metagraphs">(() => {
    const f = useStore.getState().filter;
    return f !== "dag" && metagraphById(f) ? "metagraphs" : "hypergraph";
  });

  // COUNTER charts drop partial edge buckets — a partial sum charted whole reads as a crash, the
  // classic last-bucket lie. Which edges go is `trimCounterEdges` (src/data/trendSeries.ts), one
  // home with the 3D stack; the axis and every line are cut by the same call.
  const cBuckets = trimCounterEdges(buckets, stepMs);
  const trim = (points: (number | null)[]): (number | null)[] => trimCounterEdges(points, stepMs);

  // The unit word follows the tier — an hourly bucket labelled "per day" would misstate every
  // reading by a factor of 24. Prose ("per day"), not the "/day" glyph (user, 2026-09-09:
  // "what is /day?" — the slash form made the head four cryptic fragments; spelled out, the
  // head reads as a sentence: "Global snapshots per day … Sep 8 · 1,863").
  const per = perPhrase(stepMs);
  // The tier in words, from the one table both registers read (`tierWord`): this one is the
  // ADJECTIVE form, because it lands inside a section's lead sentence, while the cursor card's
  // aside takes the short label. Two spellings of one vocabulary had grown in the two components.
  const bucketWord = tierWord(stepMs, "attributive");
  /** The daily tier's newest COMPLETE day for a counter series (yesterday — today still
   *  fills), scaled like the chart it captions; undefined off the hourly zooms. */
  const dayReadout = (name: string, k = 1): { value: number; word: string } | undefined => {
    if (!daily) return undefined;
    const series = daily.series[name];
    for (let i = (series?.length ?? 0) - 1; i >= 0; i--) {
      if (series![i] != null) return { value: series![i]! * k, word: "latest full day" };
    }
    return undefined;
  };
  /** The Metagraphs tab's panel list: one chart per catalog network for one stored metric,
   *  ranked by the LAST measured day, busiest first (per-section — each ranking is its own
   *  reading). The vitals' catalog-order rule guards live charts that reshuffle under the
   *  reader; a document laid out once per visit can rank honestly. */
  // COUNTER metrics only — the four that ARE one stored row per network. A gauge needs the fleet
  // payload (netGaugePanels) and continuity is derived from two rows (netGapPanels), so the type
  // says which four this builder can actually serve rather than leaving it to the reader.
  const netPanels = (metric: CounterMetric) => {
    const spec = TREND_METRICS[metric];
    // ⚠️ ONE RANKING FUNCTION, ONE CEILING FUNCTION (2026-09-19). `rankByLast` is what "busiest
    // first" MEANS in this app and `sharedCeiling` is what "same scale" means — the 3D stack reads
    // both, so writing either out inline here is the two registers of one rung quietly ordering or
    // scaling the same networks differently. The ceiling's old `Math.max(0, ...flatMap(…))` was
    // also the spread the stack had already replaced: one argument per measured bucket, which is
    // the shape that throws `RangeError` the day the store grows past the engine's argument limit.
    const ptsById = new Map(roster.map((m) => [m.id!, trim(metricSeries(metric, m.id!, p?.series ?? {}).points)]));
    const nets = new Map(roster.map((m) => [m.id!, m]));
    const panels = rankByLast([...ptsById.keys()], (id) => ptsById.get(id)!).map((id) => ({
      m: nets.get(id)!,
      points: ptsById.get(id)!,
    }));
    // The shared ceiling is the busiest network's peak ACROSS THIS SECTION — per section, because
    // each section is its own quantity (snapshots, blocks, fees, KB) and a scale shared across
    // units would mean nothing. Undefined in `own` mode, which is TrendChart's "scale yourself".
    const sharedMax = scaleMode === "shared" ? sharedCeiling(panels.map((x) => x.points)) : undefined;
    return panels.map(({ m, points }) => {
      const net = displayNetwork(m.id);
      const line: TrendLine = { label: metric, points, hue: net?.hue };
      return <TrendChart key={m.id} onRange={onRangeFor(m.id!)} inspect={() => inspectRange(m.id!)} inspectCommits={net?.name ?? m.id!} name={net?.name ?? m.id!} unit={metricUnit(metric, stepMs)} readout={dayReadout(seriesKey(metric, m.id!), spec.scale)} buckets={cBuckets} stepMs={stepMs} format={spec.format} lines={[line]} scaleMax={sharedMax} />;
    });
  };
  /** Per-network GAUGE panels (fleet): untrimmed — a point sample is complete the moment it
   *  is taken — and null where never sampled (gauges are not zero-filled). */
  /** Per-network GAUGE panels ride the FLEET payload (hourly at fine windows — see `pF`). */
  const netGaugePanels = () => {
    // The LAYER LINES (user, 2026-09-11: "metagraph nodes don't show the role") — the same
    // three-line treatment the hypergraph tab's Network layers chart wears, per network, in
    // its identity hue: total solid, each layer the fleet chart's own dash. Which layers a
    // network runs comes from the LIVE roster (metaList), so the legend names the roles the
    // moment the panel renders; the lines themselves fill forward from the day the sampler
    // began keeping f.layer.{id}.{role} (the section's own stated rule for gauges).
    const metaList = useStore.getState().metaList;
    const DASH: Record<string, string | boolean> = { l0: "", cl1: "2 4", dl1: "6 4" };
    const SHORT: Record<string, string> = { l0: "L0", cl1: "cL1", dl1: "dL1" };
    // Ranked through the one ranking function, like every other section (see `netPanels`).
    const ptsById = new Map(roster.map((m) => [m.id!, metricSeries("nodes", m.id!, pF?.series ?? {}).points]));
    const nets = new Map(roster.map((m) => [m.id!, m]));
    return rankByLast([...ptsById.keys()], (id) => ptsById.get(id)!)
      .map((id) => ({ m: nets.get(id)!, points: ptsById.get(id)! }))
      .map(({ m, points }) => {
        const net = displayNetwork(m.id);
        const roster = metaList.find((x) => x.id === m.id);
        const present = ["l0", "cl1", "dl1"].filter((r) => roster?.nodes.some((n) => (n.roles?.length ? n.roles : [n.layer]).includes(r)));
        const lines: TrendLine[] = [
          { label: "nodes", points, hue: net?.hue },
          ...present.map((r) => ({ label: SHORT[r]!, points: S(pF, `f.layer.${m.id}.${r}`), hue: net?.hue, dash: DASH[r] || true })),
        ];
        return <TrendChart key={m.id} onRange={onRangeFor(m.id!)} inspect={() => inspectRange(m.id!)} inspectCommits={net?.name ?? m.id!} name={net?.name ?? m.id!} unit={metricUnit("nodes", fStep)} buckets={fBuckets} stepMs={fStep} lines={lines} />;
      });
  };
  /** Per-network CONTINUITY panels: real measured gap stats (m.{id}.gapSum/gapMax — live
   *  since 2026-09-07, and BACKFILLED to Jan 1 by the 2026-09-09 gaps walk: ~13M records
   *  re-walked for their timestamps alone, since the ordinary backfills never kept them).
   *  Mean = gapSum/snaps per bucket; a day÷snaps approximation was rejected — for a
   *  batching network (DOR: dozens of snapshots in one tick, then idle) it reads as spacing
   *  that never existed. Ranked by the latest reading, most-stalled first. */
  const netGapPanels = () => {
    // Ranked through the one ranking function, like every other section (see `netPanels`) —
    // most-stalled first falls out of it, since the value IS the mean spacing.
    const seriesById = new Map(roster.map((m) => [m.id!, metricSeries("continuity", m.id!, p?.series ?? {})]));
    const nets = new Map(roster.map((m) => [m.id!, m]));
    return rankByLast([...seriesById.keys()], (id) => seriesById.get(id)!.points)
      .map((id) => ({ m: nets.get(id)!, s: seriesById.get(id)! }))
      .map(({ m, s }) => {
        const net = displayNetwork(m.id);
        const line: TrendLine = { label: "mean", points: trim(s.points), hue: net?.hue };
        // `sampled` = the chain's own snaps series: amber only where the SAMPLER missed;
        // a null point over a sampled bucket (a quiet stretch — nothing to space) just
        // breaks the line (user, 2026-09-09: DOR's quiet buckets wore outage amber).
        return <TrendChart key={m.id} onRange={onRangeFor(m.id!)} inspect={() => inspectRange(m.id!)} inspectCommits={net?.name ?? m.id!} name={net?.name ?? m.id!} unit={metricUnit("continuity", stepMs)} buckets={cBuckets} stepMs={stepMs} format={TREND_METRICS.continuity.format} sampled={trim(s.sampled!)} gaps={trim(s.gaps!)} lines={[line]} />;
      });
  };

  // ONE RUNG DOWN THE LADDER (convention 12) — `components/trendDoors.ts`, shared with the
  // History view's cursor card since 2026-09-19. The sequence (commit the network through the one
  // write path, hand the span to the log, land on the view that can show records) lived here and
  // is now called from two surfaces, so they cannot land a reader in different places.
  const inspectRange = (metaId: string | null) => {
    // No custom range = the WINDOW you are looking at (user, 2026-09-09: "that button can
    // always exist") — the zoom is a range statement too, so the ladder's door is always open.
    openRecords(metaId, range ?? spanOfWindow(buckets, stepMs));
  };
  const onRange = (fromMs: number, toMs: number) => setRange({ fromMs, toMs, metaId: null });
  /** The per-network charts' drag: the range carries the chart's own chain. */
  const onRangeFor = (metaId: string) => (fromMs: number, toMs: number) => setRange({ fromMs, toMs, metaId });
  /** The global charts' door: no chain of their own, so the committed catalog filter rides
   *  along when there is one, and the unscoped log otherwise. */
  const inspectHere = () => {
    const f = useStore.getState().filter;
    inspectRange(range?.metaId ?? (metagraphById(f) && f !== "dag" ? f : null));
  };
  // THE WINDOW PICKER is `components/trendPickers.tsx`'s `WindowPicker`, shared with the History
  // view's band timeline (2026-09-18) — same six windows, same range chip, same pressed register.
  // The doc keeps its zoom in LOCAL state (the window a reader picks while reading the page is the
  // page's), so it clears its own range where the store's setter does that by itself.
  const zoomPicker = (
    <WindowPicker
      zoom={zoom}
      range={range}
      stepMs={stepMs}
      onPick={(id) => { setZoom(id); setRange(null); }}
      onClearRange={() => setRange(null)}
    />
  );
  // ⚠️ NO RECORDS BUTTON IN THE TOOLBAR (user, 2026-09-13: "the links are already inside the
  // tabs"). It was the ladder's one standalone control (2026-09-09), added before every chart
  // carried its own — and once each chart did, the toolbar's copy said the same thing a second
  // time, one level further from the buckets it opens. The bridge is unchanged: `inspectHere`
  // still reaches the anchor log, from the chart whose range you are actually reading.
  // SECTIONS AS SUB-TABS (user, 2026-09-07): one section at a time inside each drawer. The
  // hierarchy carries the design: the outer pair is the file-cabinet (primary), the inner
  // switcher the segmented-pill register the zoom already wears (secondary) — two drawer
  // levels would read as furniture. Continuity lives under Hypergraph on its own: the base
  // ledger's steadiness is a hypergraph concern, and it deliberately doesn't blend with
  // anchoring (the user's own earlier split).
  // flex-none + a fixed h-8: the primitive's triggers are flex-1 at a %-height, which is what
  // spread them wide and broke when the list WRAPS on phone (the h-auto rows below) — as
  // compact pills they pack left and wrap cleanly (user, 2026-09-08: the tabs overflowed).
  /* The scale control — `trendPickers.tsx`'s shared `ScaleToggle` (extracted 2026-09-19 for the
     History view's Networks card: the same question about the same charts, and a second copy of a
     control with this much reasoning in it is the drift that file exists to prevent). It is
     rendered ONLY on the metagraphs tab, because a scale shared across charts is only a question
     where there is a COLUMN of comparable charts; the hypergraph tab's charts each measure a
     different quantity, and under a commit there is one network left. */
  const scaleToggle = <ScaleToggle shared={scaleMode === "shared"} onChange={(on) => setScaleMode(on ? "shared" : "own")} />;
  // The scope pill and its × are `trendPickers.tsx`'s `ScopeChip` (the document's alone since the
  // explorer lost its scope mark, 2026-09-26) — one statement of "what is applied, and how to clear it".
  const scopeChip = <ScopeChip filter={filter} className="mr-auto" />;
  /* The scoped tab with nothing to draw. Both cases are real commits a reader can reach from the
     bar, and neither is a failure — the trends store keeps one series set per LISTED metagraph,
     so the DAG core and the unlisted channels have no per-network record here by construction.
     The sentences are `src/data/trendScope.ts`'s, shared since 2026-09-19 with the History view's
     stack, which meets the same two commits and must not describe them differently: the FACT is
     the store's and travels verbatim, while the ROUTE names a gesture available on THIS surface
     (the empty-state rule — here, the tab row above). */
  const scopeCopy = scopeEmptyCopy(trendScope(filter), "document");
  const scopeEmpty = scopeCopy && (
    <p className="mt-3 text-label text-muted-foreground max-w-[62ch]">
      {scopeCopy.fact} {scopeCopy.route}
    </p>
  );
  const topicPicker = (
    <div role="group" aria-label="Topic" className={PICKER_GROUP}>
      {/* The topic's user-facing word is "Fees" (user, 2026-09-11: "Economics = Fees" — the
          plainer word for what the sections show: fees paid, and the data they anchored);
          the internal id stays `economics`, one concept two registers. */}
      {([["snapshots", "Snapshots"], ["economics", "Fees"], ["fleet", "Nodes"], ["continuity", "Continuity"]] as const).map(([id, label]) => (
        <button key={id} type="button" aria-pressed={sectionTab === id} onClick={() => setSectionTab(id)} className={zoomBtn(sectionTab === id)}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <article className="pt-14">
      <p className="text-micro tracking-caps uppercase text-muted-foreground">Trends</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.01em] leading-tight">
        {buckets.length > 1 ? spanPhrase(buckets, stepMs) : "The network, measured"}
      </h1>
      {/* HUMAN VOICE (user, 2026-09-09 — the /about rule reaches every doc page: say what
          the reader can DO, in their own gestures — "click", not "opens"). The amber/gray
          vocabulary left the intro at user call; the continuity section's own lead still
          carries it where those bands actually appear. */}
      <p className="mt-5 text-sm text-foreground-dim leading-relaxed">
        This is the network&apos;s history, drawn from its own records. Use it to see how busy
        each chain has been and how steadily it ran: pick a time window, or drag across any
        chart to zoom into a moment that interests you — and when something catches your eye,
        click <em>snapshot records</em> to see the actual snapshots behind it.
      </p>

      {!p && !error && (
        <Panel className="mt-8 py-4 px-5">
          <p className="text-label text-muted-foreground">reading the measured history…</p>
        </Panel>
      )}
      {!p && error && (
        <Panel className="mt-8 py-4 px-5">
          <p className="text-label text-muted-foreground">
            The trends store is unreachable right now. It recovers on its own — reopen this page
            in a moment.
          </p>
        </Panel>
      )}

      {p && (
        <>
        {/* ONE LINE on desktop, a full-width STACK on the phone (user, 2026-09-12: "the
            topics and range do not fit on one line — perhaps both underneath each other and
            full width?"). At 390px the three controls already wrapped, but each landed on its
            own ragged indent (measured: 33 / 156 / 193), which read as three stray controls
            rather than one toolbar. Stacking costs NOTHING vertically — the same three lines —
            and each picker spanning the width distributes its pills evenly, which also grows
            their hit boxes on the surface that needs them. `max-[700px]` is the phone arm
            every other tier rule here uses (CSS trap 8). */}
        <div className="mt-6 flex items-center justify-between gap-2 flex-wrap max-[700px]:flex-col max-[700px]:items-stretch">
          {topicPicker}
          {zoomPicker}
        </div>
        <Tabs
          defaultValue={initialTab}
          // A NETWORK-STAMPED RANGE LOSES ITS STAMP ON THE HYPERGRAPH TAB (user, 2026-09-09:
          // "drop the biofi filter but keep the date range") — the dates are tab-agnostic,
          // but the stamp means "the chart this was drawn on", and above global charts it
          // would caption charts it does not describe. Dropped is dropped: switching back
          // does not resurrect it (drag again on a network's chart to re-stamp).
          onValueChange={(v) => {
            if (v === "hypergraph") setRange((r) => (r?.metaId ? { fromMs: r.fromMs, toMs: r.toMs, metaId: null } : r));
          }}
          className="mt-3 gap-0"
        >
          {/* TWO TABS (user, 2026-09-07): the hypergraph's own readings vs the per-metagraph
              ones — the same split every 3D view draws. FILE-CABINET recipe (the channel pane's,
              verbatim — user, same day: "they look like pills and the body has no outline; same
              design issue before on metagraph details"): the active tab is an outlined
              rounded-top drawer label whose fill notches THROUGH the row's baseline hairline
              into the outlined body below, so label and contents read as one drawer. */}
          <TabsList
            variant="line"
            // THE HAIRLINE REGISTER, like the raw channel pane's cabinet (user, 2026-09-26, two
            // rounds: it took the wash ladder for an afternoon and was "still too colourful" — a
            // drawer is a container for records and prose, and in this app a plate that size in
            // the accent reads as a committed region). The pickers above keep the ladder: they
            // are controls.
            className="relative flex h-auto flex-none w-full gap-1 rounded-none p-0 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border/50"
            aria-label="Which side of the network"
          >
            {(["hypergraph", "metagraphs"] as const).map((id) => (
              <TabsTrigger
                key={id}
                value={id}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 h-8 px-2 rounded-t-md! rounded-b-none!",
                  "text-label tracking-caps uppercase font-normal",
                  "text-muted-foreground bg-transparent border border-transparent border-b-0",
                  "hover:text-foreground hover:bg-wash-soft",
                  "after:hidden focus-visible:ring-0 focus-visible:border-transparent",
                  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
                  "data-[state=active]:z-[1] data-[state=active]:text-foreground data-[state=active]:shadow-none",
                  "data-[state=active]:border-border/50! data-[state=active]:bg-[var(--panel-solid)]!",
                )}
              >
                {id === "hypergraph" ? "Hypergraph" : "Metagraphs"}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* The drawer's own outline — the tab row's baseline hairline is its top edge (the
              channel pane's rule), so the active tab's panel-solid fill bridges into it. */}
          <div className="border border-t-0 border-border/50 rounded-b-md px-5 pb-8">


          <TabsContent value="hypergraph" className="pt-5">
          {sectionTab === "snapshots" && (<>
          <Section
            id="ledger"
            title="Global snapshots"
            lead="How many global snapshots were produced, and how many metagraph snapshots they anchored."
          >
            <TrendChart onRange={onRange} inspect={inspectHere} name="Global snapshots" unit={per} readout={dayReadout("g.ticks")} buckets={cBuckets} stepMs={stepMs} lines={[{ label: "ticks", points: trim(S(p, "g.ticks")) }]} />
            <TrendChart onRange={onRange} inspect={inspectHere} name="Metagraph snapshots anchored" unit={per} readout={dayReadout("g.anchors")} buckets={cBuckets} stepMs={stepMs} lines={[{ label: "anchored", points: trim(S(p, "g.anchors")) }]} />
          </Section>
          <Section
            id="ledger-blocks"
            title="Blocks"
            // Paired with the metagraph Blocks lead (user, 2026-09-11): same opening shape,
            // each side saying what ITS blocks carry — here the DAG ledger's own
            // transactions; no batching-mechanism claim (the state/blocks correction), and
            // no volume commentary either ("most seal none" cut — user: "no opinion of the
            // volume, let charts do the work").
            lead="The blocks the global snapshots carried. Here a block carries the DAG ledger's own transactions — a DAG transfer rides as one."
          >
            <TrendChart onRange={onRange} inspect={inspectHere} name="Blocks" unit={per} readout={dayReadout("g.blocks")} buckets={cBuckets} stepMs={stepMs} lines={[{ label: "blocks", points: trim(S(p, "g.blocks")) }]} />
          </Section>
          </>)}
          {sectionTab === "continuity" && (
          <Section
            id="continuity"
            title="Global snapshot continuity"
            lead="How regularly the global snapshots were produced, and how long the pauses were. Gray marks a pause that is normal for this network; amber marks one unusually long by its own history; a striped area means this app was not watching at the time."
          >
            <TrendChart onRange={onRange} inspect={inspectHere} name="Mean gap" unit="seconds" buckets={cBuckets} stepMs={stepMs} format={secs} sampled={trim(S(p, "g.ticks"))} gaps={trim(S(p, "g.gapMax"))} lines={[{ label: "mean", points: trim(meanGap(p)) }]} />
            <TrendChart onRange={onRange} inspect={inspectHere} name="Longest pause" unit={`seconds · the ${stepMs >= 86400000 ? "day" : "bucket"}'s single widest gap`} buckets={cBuckets} stepMs={stepMs} format={secs} sampled={trim(S(p, "g.ticks"))} gaps={trim(S(p, "g.gapMax"))} lines={[{ label: "max", points: trim(S(p, "g.gapMax")) }]} />
          </Section>
          )}
          {sectionTab === "economics" && (<>
          <Section
            id="economics"
            title="Total fees paid"
            lead="What the metagraphs paid to anchor into the global ledger."
          >
            <TrendChart onRange={onRange} inspect={inspectHere} name="Fees paid" unit={`DAG ${per} · at least`} readout={dayReadout("g.feeFloor", 1e-8)} buckets={cBuckets} stepMs={stepMs} format={dag} lines={[{ label: "fees", points: trim(scale(S(p, "g.feeFloor"), 1e-8)) }]} />
          </Section>
          <Section
            id="economics-data"
            title="Total data anchored"
            lead="How much data the metagraphs anchored into the global ledger."
          >
            <TrendChart onRange={onRange} inspect={inspectHere} name="Data anchored" unit={`${per} · at least`} readout={dayReadout("g.kbFloor", 1 / 1024)} buckets={cBuckets} stepMs={stepMs} format={mb} lines={[{ label: "data", points: trim(scale(S(p, "g.kbFloor"), 1 / 1024)) }]} />
          </Section>
          </>)}
          {sectionTab === "fleet" && (
          <Section
            id="fleet"
            title="Total nodes"
            lead="Every node across the whole network — the DAG's own validators and every metagraph's nodes — counted live each hour. The layers split the work: L0 agrees on a network's state and creates its snapshots, currency L1 (cL1) moves its token, data L1 (dL1) takes in what applications write — and one node can run several."
          >
            {fleetPending ? (
              /* The gauges are HOURLY instruments; at fine zooms their hourly payload is a
                 separate fetch — this line only stands while it is in flight. */
              <p className="text-label text-muted-foreground">reading the hourly samples…</p>
            ) : (
              <>
                <TrendChart onRange={onRange} inspect={inspectHere} name="Nodes" unit="total" buckets={fBuckets} stepMs={fStep} lines={[{ label: "nodes", points: S(pF, "f.nodes") }]} />
                <TrendChart
                  onRange={onRange}
                  inspect={inspectHere}
                  // "Network layers" — the vitals band's own card name for this exact reading
                  // (user, 2026-09-09: "Metagraph layers · layer-roles" wasn't descriptive,
                  // and cL1 was missing from the plot; all three protocol layers now draw —
                  // solid / dotted / dashed on the one structural hue, named in the legend).
                  // Unit stays SHORT and says "nodes", never "machines" (user, same day);
                  // the hybrid-counts-per-layer nuance is deliberately unstated (user cut it
                  // from the section lead too — the legend's three named lines carry enough).
                  name="Network layers"
                  unit="total nodes per layer"
                  buckets={fBuckets}
                  stepMs={fStep}
                  lines={[
                    { label: "L0", points: S(pF, "f.layer.l0") },
                    { label: "cL1", points: S(pF, "f.layer.cl1"), dash: "2 4" },
                    { label: "dL1", points: S(pF, "f.layer.dl1"), dash: true },
                  ]}
                />
              </>
            )}
          </Section>
          )}
          </TabsContent>

          <TabsContent value="metagraphs" className="pt-5">
          {/* The scale control sits INSIDE this tab, not in the toolbar above it: it governs
              these charts only, and a control that appears and disappears as the reader crosses
              the tab row would read as the toolbar losing a button. Right-aligned so the tab's
              own content still opens on its first section heading. */}
          <div className="flex items-center gap-2 justify-end max-[700px]:flex-wrap">
            {scopeChip}
            {/* A scale shared across ONE chart is not a setting (the plank's own rule: an axis
                with nothing to navigate is absent, not disabled) — under a commit the column is
                a single network and the control has nothing left to say. */}
            {roster.length > 1 && scaleToggle}
          </div>
          {roster.length === 0 ? scopeEmpty : (<>
          {sectionTab === "snapshots" && (<>
          <Section
            id="networks"
            title="Metagraph snapshots anchored to global"
            lead={`Each network's own ${bucketWord} snapshot count.`}
          >
            {netPanels("snapshots")}
          </Section>
          <Section
            id="net-blocks"
            title="Blocks per metagraph"
            // ⚠️ No mechanism claim beyond what the raw page shows (user, 2026-09-11, twice):
            // a snapshot has TWO carriers (its state, and its blocks) and networks split
            // their payload between them differently (DED: state empty, records in blocks;
            // others the reverse), with no crisp delineation we've measured. Simplified the
            // same day — the two-carrier fact, one example each, the zero rule.
            lead="The blocks each network carried inside its own snapshots. A block carries transactions — a token transfer, or a batch of application records — and it is one of two places a snapshot carries work: the other is its state, and each network decides what goes where. A zero means no blocks, not no activity."
          >
            {netPanels("blocks")}
          </Section>
          </>)}
          {sectionTab === "economics" && (<>
          <Section
            id="net-fees"
            title="Fees paid per metagraph"
            lead="What each network paid to anchor into the global ledger."
          >
            {netPanels("fees")}
          </Section>

          <Section
            id="net-data"
            title="Data anchored per metagraph"
            lead="How much data each network anchored into the global ledger."
          >
            {netPanels("kb")}
          </Section>
          </>)}
          {sectionTab === "fleet" && (
          <Section
            id="net-fleet"
            title="Nodes per metagraph"
            lead="Each network's own node count, sampled live every hour, with a line for each layer it runs: L0 agrees on its state and creates its snapshots, cL1 moves its token, dL1 takes in what applications write."
          >
            {fleetPending ? (
              <p className="text-label text-muted-foreground">reading the hourly samples…</p>
            ) : (
              netGaugePanels()
            )}
          </Section>
          )}
          {sectionTab === "continuity" && (
          <Section
            id="net-continuity"
            title="Continuity per metagraph"
            lead="How regularly each network produced its own snapshots. Some write steadily and some in bursts, so each is judged against its own rhythm: gray marks a normal pause, amber one unusually long for that network. A striped area means this app was not watching at the time."
          >
            {netGapPanels()}
          </Section>
          )}
          </>)}
          </TabsContent>
          </div>
        </Tabs>
        </>
      )}
    </article>
  );
}
