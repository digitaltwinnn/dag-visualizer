"use client";
import { useState } from "react";
import { Panel } from "@/components/docs/AboutDoc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useTrendsWindow, { useTrendsRange } from "@/components/useTrendsWindow";
import { cutRange, leadingTrim, pickRangeTier, sliceWindow, trimNewestPartial } from "@/src/data/trendWindow";
import TrendChart, { type TrendLine } from "@/components/docs/TrendChart";
import { METAGRAPHS } from "@/src/net/current";
import { useStore } from "@/src/store/store";
import { applyClickActions } from "@/src/store/applyClickActions";
import { filterToggleActions } from "@/src/engine/domain/pickActions";
import { metagraphById } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";
import { cn } from "@/lib/utils";
import { Table2 } from "lucide-react";
import { SELECTED_ROW } from "@/components/selection";

// THE TRENDS DOCUMENT (user, 2026-09-06; widened twice since) — the first UI consumer of the
// trends backend: one daily-resolution chart per stored metric over the /api/trends 1y window,
// leading-trimmed to where measuring began. It rides the doc-overlay recipe like About and
// Design (registry entry in views.ts, thin route, footer + info-menu toggles follow).
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

// THE ZOOM (user, 2026-09-07: "can we zoom in?") — the window picker is the tiers made
// visible: 1H and 24H read the 5-minute buckets (48 h retention), 7D and 30D the hourly tier,
// 1Y and ALL the daily tier. Same charts, same honesty rules, finer buckets. 1Y and ALL split
// 2026-09-09 (user — the ranges stay consistent with the vitals rim, which is also where 1H
// came from the same day): 1Y is the trailing year, ALL is the store's whole depth (the `all`
// window), both leading-trimmed to where measuring began, so ALL says exactly as much as has
// been measured. 1H rides the 24h payload, sliced to the newest hour — a window is not always
// an API window of its own.
const ZOOMS = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "All" },
] as const;
type ZoomId = (typeof ZOOMS)[number]["id"];

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

const stepMsOfMain = (w: { stepMs: number } | undefined): number => w?.stepMs ?? 86400000;

const scale = (points: (number | null)[], k: number): (number | null)[] =>
  points.map((v) => (v == null ? null : v * k));

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-24">
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
  const [zoom, setZoom] = useState<ZoomId>("all");
  // THE RANGE — a drag on any chart (convention 12's zoom). ONE selection for the whole
  // page: the shared-axis column means every chart cuts to it together. Picking a zoom pill
  // clears it (the pill IS a range statement); the chip row beside the pills states it, and
  // the "records" action on per-network charts hands it one rung down the ladder.
  // `metaId` = whose chart the drag was drawn on (user, 2026-09-09: DOR committed, a range
  // dragged on BIOFI's chart, "go to raw: no biofi in the filter" — a range must remember
  // its network, and the standalone records button prefers it over the committed filter).
  const [range, setRange] = useState<{ fromMs: number; toMs: number; metaId?: string | null } | null>(null);
  // ONE section selection for BOTH drawers (user, 2026-09-09: "have it once drive both
  // tabs") — the two cabinets carry the same four sections, and an uncontrolled pair reset
  // the pick on every drawer switch. The zoom/range already lives at page level; making the
  // inner Tabs controlled by one state is the whole fix, and only one control row is ever
  // on screen (the inactive drawer unmounts).
  const [sectionTab, setSectionTab] = useState("snapshots");
  // AUTO-TIER (map-tile edition, 2026-09-10): a selected range picks the FINEST tier whose
  // HISTORY FLOOR its start clears (pickRangeTier — since the keep-forever flip, retention
  // no longer prunes, but the floors record where fine grain begins to exist) and fetches
  // the few calendar-unit tiles it touches; daily ranges keep riding the one `all` payload.
  const rangeTier = range ? pickRangeTier(range.fromMs, range.toMs) : null;
  // ONE fetch path with the band (review, 2026-09-09 — the doc carried its own raw fetch
  // and a second, divergent leading-trim): the hook brings the shared cache (a rim-to-doc
  // hop re-uses the band's payload), the pulse-strip health reporting, and the 5-minute
  // refresh. The hook keeps the previous window's payload until the new one lands, which
  // preserves the doc's own no-loading-flash rule on zoom changes.
  const fetched = useTrendsWindow(range ? (rangeTier === "1d" ? "all" : null) : zoom === "1h" ? "24h" : zoom);
  const rangeTiles = useTrendsRange(
    range && (rangeTier === "5m" || rangeTier === "1h") ? { tier: rangeTier, fromMs: range.fromMs, toMs: range.toMs } : null,
  );
  // Opened from a committed metagraph's dossier ("Show the trends", 2026-09-08), the page
  // opens on that side of the network. Read ONCE at mount (the doc remounts per open): the
  // Tabs stay uncontrolled, so browsing the tabs afterwards owes the filter nothing. The DAG
  // core's history is the Hypergraph tab — only a catalog metagraph flips the default.
  const [initialTab] = useState<"hypergraph" | "metagraphs">(() => {
    const f = useStore.getState().filter;
    return f !== "dag" && metagraphById(f) ? "metagraphs" : "hypergraph";
  });

  // THE FLEET RIDES THE HOURLY TIER at fine zooms (user, 2026-09-09: "1H/24H on Nodes says
  // no data while 7D has it") — the gauges are written hourly+daily only, so the 5m payload
  // honestly lacks them; instead of gating, the Nodes sections fetch the 7d hourly payload
  // and slice it to the picked span (the rim's own recipe). Small, shared-cache fetch, made
  // only while a fine zoom stands.
  const fleetFine = useTrendsWindow(!range && (zoom === "1h" || zoom === "24h") ? "7d" : null);
  const fleetTiles = useTrendsRange(
    range && rangeTier === "5m" ? { tier: "1h", fromMs: range.fromMs, toMs: range.toMs } : null,
  );
  // COUNTER READOUTS AT DAY SCALE (user, 2026-09-09: 7D's "latest full hour" answered too
  // fine a question for a week-wide view): at the hourly zooms the counter charts' head
  // readout rides the DAILY tier's own newest complete day — the store's exact sums, the
  // same cached 90d payload the vitals rim already shares. No client re-summing.
  const daily = useTrendsWindow(zoom === "7d" || zoom === "30d" ? "90d" : null);
  const raw = fetched.data ?? undefined;
  // 1H is the 24h payload's newest hour (the rim's own recipe — sliceWindow measures from
  // the payload's newest bucket, so a cached payload yields a consistent hour). A committed
  // RANGE replaces the zoom's cut entirely.
  const windowedRaw =
    range
      ? rangeTier === "1d"
        ? raw && cutRange(raw, range.fromMs, range.toMs)
        : rangeTiles.data
          ? cutRange(rangeTiles.data, range.fromMs, range.toMs)
          : undefined
      : zoom === "1h" && raw
        ? sliceWindow(raw, 3_600_000)
        : raw;
  // LEADING TRIM (src/data/trendWindow — the one home since the review): the 1y window
  // reaches further back than measuring does, and months of leading null days would draw as
  // a long empty runway. The axis begins where history begins and the page widens by itself
  // as the store grows; interior gaps still draw as gaps — only the unmeasured PREFIX goes.
  const p: TrendsPayload | undefined = windowedRaw ? leadingTrim(windowedRaw) : undefined;
  const buckets = p?.buckets ?? [];
  const stepMs = p?.stepMs ?? 86400000;
  // COUNTER charts drop partial edge buckets — a partial sum charted whole reads as a crash,
  // the classic last-bucket lie. Daily windows lose both edges (the cutoff day starts mid-day,
  // the last IS today, still filling); sub-daily windows lose only the newest bucket (stored
  // fine buckets are complete once written — only the current slot is still filling). GAUGE
  // charts keep everything: a point sample is complete the moment it is taken, and trimming
  // today would hide the fleet's only readings.
  const fleetRaw =
    stepMsOfMain(windowedRaw) < 3600000
      ? range
        ? fleetTiles.data && cutRange(fleetTiles.data, range.fromMs, range.toMs)
        : fleetFine.data && sliceWindow(fleetFine.data, zoom === "1h" ? 3_600_000 : 24 * 3_600_000)
      : undefined;
  const pF = fleetRaw ?? p;
  const fBuckets = fleetRaw?.buckets ?? buckets;
  const fStep = fleetRaw?.stepMs ?? stepMs;
  const lead = stepMs >= 86400000 ? 1 : 0;
  const cBuckets = buckets.slice(lead, -1);
  const trim = (points: (number | null)[]): (number | null)[] => points.slice(lead, -1);

  // The unit word follows the tier — an hourly bucket labelled "per day" would misstate every
  // reading by a factor of 24. Prose ("per day"), not the "/day" glyph (user, 2026-09-09:
  // "what is /day?" — the slash form made the head four cryptic fragments; spelled out, the
  // head reads as a sentence: "Global snapshots per day … Sep 8 · 1,863").
  const per = stepMs >= 86400000 ? "per day" : stepMs >= 3600000 ? "per hour" : "per 5 min";
  const bucketWord = stepMs >= 86400000 ? "daily" : stepMs >= 3600000 ? "hourly" : "five-minute";
  const dag = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 2 : 0 })}`;
  /** The daily tier's newest COMPLETE day for a counter series (yesterday — today still
   *  fills), scaled like the chart it captions; undefined off the hourly zooms. */
  const dayReadout = (name: string, k = 1): { value: number; word: string } | undefined => {
    if (!daily.data) return undefined;
    const d = trimNewestPartial(daily.data);
    const series = d.series[name];
    for (let i = (series?.length ?? 0) - 1; i >= 0; i--) {
      if (series![i] != null) return { value: series![i]! * k, word: "latest full day" };
    }
    return undefined;
  };
  /** The Metagraphs tab's panel list: one chart per catalog network for one stored metric,
   *  ranked by the LAST measured day, busiest first (per-section — each ranking is its own
   *  reading). The vitals' catalog-order rule guards live charts that reshuffle under the
   *  reader; a document laid out once per visit can rank honestly. */
  const netPanels = (suffix: string, unit: string, k = 1, fmt?: (v: number) => string) =>
    METAGRAPHS.filter((m) => m.id)
      .map((m) => {
        const points = trim(scale(S(p, `m.${m.id}.${suffix}`), k));
        const last = points.reduce<number | null>((acc, v) => (v != null ? v : acc), null);
        return { m, points, last };
      })
      .sort((a, b) => (b.last ?? -1) - (a.last ?? -1))
      .map(({ m, points }) => {
        const net = displayNetwork(m.id);
        const line: TrendLine = { label: suffix, points, hue: net?.hue };
        return <TrendChart key={m.id} onRange={onRangeFor(m.id!)} inspect={() => inspectRange(m.id!)} name={net?.name ?? m.id!} unit={unit} readout={dayReadout(`m.${m.id}.${suffix}`, k)} buckets={cBuckets} stepMs={stepMs} format={fmt} lines={[line]} />;
      });
  /** Per-network GAUGE panels (fleet): untrimmed — a point sample is complete the moment it
   *  is taken — and null where never sampled (gauges are not zero-filled). */
  /** Per-network GAUGE panels ride the FLEET payload (hourly at fine zooms — see fleetRaw). */
  const netGaugePanels = (unit: string) =>
    METAGRAPHS.filter((m) => m.id)
      .map((m) => {
        const points = S(pF, `f.nodes.${m.id}`);
        const last = points.reduce<number | null>((acc, v) => (v != null ? v : acc), null);
        return { m, points, last };
      })
      .sort((a, b) => (b.last ?? -1) - (a.last ?? -1))
      .map(({ m, points }) => {
        const net = displayNetwork(m.id);
        const line: TrendLine = { label: "nodes", points, hue: net?.hue };
        return <TrendChart key={m.id} onRange={onRangeFor(m.id!)} inspect={() => inspectRange(m.id!)} name={net?.name ?? m.id!} unit={unit} buckets={fBuckets} stepMs={fStep} lines={[line]} />;
      });
  /** Per-network CONTINUITY panels: real measured gap stats (m.{id}.gapSum/gapMax — live
   *  since 2026-09-07, and BACKFILLED to Jan 1 by the 2026-09-09 gaps walk: ~13M records
   *  re-walked for their timestamps alone, since the ordinary backfills never kept them).
   *  Mean = gapSum/snaps per bucket; a day÷snaps approximation was rejected — for a
   *  batching network (DOR: dozens of snapshots in one tick, then idle) it reads as spacing
   *  that never existed. Ranked by the latest reading, most-stalled first. */
  const netGapPanels = () =>
    METAGRAPHS.filter((m) => m.id)
      .map((m) => {
        const sum = S(p, `m.${m.id}.gapSum`);
        const snaps = S(p, `m.${m.id}.snaps`);
        const gmax = S(p, `m.${m.id}.gapMax`);
        const points = sum.map((v, i) => (v != null && snaps[i] != null && snaps[i]! > 0 ? v / snaps[i]! : null));
        const last = points.reduce<number | null>((acc, v) => (v != null ? v : acc), null);
        return { m, points, last, gmax };
      })
      .sort((a, b) => (b.last ?? -1) - (a.last ?? -1))
      .map(({ m, points, gmax }) => {
        const net = displayNetwork(m.id);
        const line: TrendLine = { label: "mean", points: trim(points), hue: net?.hue };
        // `sampled` = the chain's own snaps series: amber only where the SAMPLER missed;
        // a null point over a sampled bucket (a quiet stretch — nothing to space) just
        // breaks the line (user, 2026-09-09: DOR's quiet buckets wore outage amber).
        return <TrendChart key={m.id} onRange={onRangeFor(m.id!)} inspect={() => inspectRange(m.id!)} name={net?.name ?? m.id!} unit="seconds" buckets={cBuckets} stepMs={stepMs} format={secs} sampled={trim(S(p, `m.${m.id}.snaps`))} gaps={trim(gmax)} lines={[line]} />;
      });
  const secs = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}s`;
  const mb = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;

  // ONE RUNG DOWN THE LADDER (convention 12): hand the selected range to the anchor log's
  // date search. The network commit rides the pickActions table (rule 2 — the same
  // filterToggleActions row the explorer uses, guarded so it never toggles OFF); the range
  // itself travels the one-shot store bridge the log consumes on sight. Closing the doc
  // before opening the raw layer matters: setDocPage forces section back to "scene".
  const inspectRange = (metaId: string | null) => {
    // No custom range = the WINDOW you are looking at (user, 2026-09-09: "that button can
    // always exist") — the zoom is a range statement too, so the ladder's door is always open.
    const span =
      range ?? (buckets.length ? { fromMs: buckets[0], toMs: buckets[buckets.length - 1] + stepMs } : null);
    if (!span) return;
    const st = useStore.getState();
    if (metaId && st.filter !== metaId) applyClickActions(filterToggleActions(metaId, st.filter));
    st.setLogSeek({ metaId, fromMs: span.fromMs, toMs: span.toMs });
    st.setDocPage(null);
    // The anchor log is the LEDGER view's raw projection — the ladder lands on the rung
    // that can actually show records (mode navigation, not a selection).
    if (st.mode !== "ledger") st.setMode("ledger");
    st.setSection("data");
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
  const stampRange = (ms: number): string =>
    new Date(ms).toLocaleString(undefined, {
      month: "short", day: "numeric",
      ...(stepMs < 86400000 ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
      timeZone: "UTC",
    });
  // The zoom — a filter over every chart at once; it rides each inner section row so it is
  // always beside the control it composes with. An active RANGE joins the group as one more
  // (pressed) option (user, 2026-09-09: a chip beside the group read as a second control),
  // carrying its own × and the ladder's "records" action so the bridge is reachable from any
  // tab. Compact sizing throughout (h-6/px-2/text-micro — the h-7 pills stopped fitting one
  // line beside the section tabs once ALL and the range joined, same user note).
  // The PRESSED register is the RIM'S (user, 2026-09-09: "styled differently in bottom bar
  // than in the trend view — deliberate?" — no, drift: the rim adopted this picker's register
  // in 2026-09-08's round, then evolved to SELECTED_ROW while this stayed behind; same
  // control, one language now). The section pills above deliberately keep the tab register —
  // a section is furniture, a window is a committed selection.
  const zoomBtn = (pressed: boolean) =>
    cn(
      "h-6 px-2 rounded-md text-micro tracking-caps uppercase",
      pressed ? cn("font-bold text-foreground", SELECTED_ROW) : "text-muted-foreground hover:text-foreground hover:bg-wash-hover",
    );
  const zoomPicker = (
    <div role="group" aria-label="Time window" className="inline-flex items-center rounded-lg bg-muted p-[3px]">
      {!range && ZOOMS.map((z) => (
        <button
          key={z.id}
          type="button"
          aria-pressed={!range && zoom === z.id}
          onClick={() => { setZoom(z.id); setRange(null); }}
          className={zoomBtn(!range && zoom === z.id)}
        >
          {z.label}
        </button>
      ))}
      {range && (
        <span className={cn("h-6 px-2 inline-flex items-center gap-1.5 rounded-md text-micro font-bold text-foreground whitespace-nowrap", SELECTED_ROW)}>
          <span className="tabular-nums">
            {range.metaId ? `${displayNetwork(range.metaId)?.ticker ?? ""} · ` : ""}
            {stampRange(range.fromMs)}–{stampRange(range.toMs)}
          </span>
          <button
            type="button"
            onClick={() => setRange(null)}
            title="Clear the selected range"
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      )}
    </div>
  );
  // THE LADDER'S BUTTON, its own control beside the group (user, 2026-09-09: "a separate
  // button and be specific") — names the destination: the Snapshots view's raw data search.
  const rangeInspect = buckets.length ? (
    <button
      type="button"
      onClick={inspectHere}
      title="Open this range in the Snapshots view's raw data search (uses the committed network's chain when one is filtered)"
      className="ml-auto inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-micro tracking-caps uppercase text-[var(--primary)]/80 hover:text-[var(--primary)] hover:bg-wash-soft whitespace-nowrap"
    >
      <Table2 aria-hidden className="size-3" />
      snapshot records
    </button>
  ) : null;
  // SECTIONS AS SUB-TABS (user, 2026-09-07): one section at a time inside each drawer. The
  // hierarchy carries the design: the outer pair is the file-cabinet (primary), the inner
  // switcher the segmented-pill register the zoom already wears (secondary) — two drawer
  // levels would read as furniture. Continuity lives under Hypergraph on its own: the base
  // ledger's steadiness is a hypergraph concern, and it deliberately doesn't blend with
  // anchoring (the user's own earlier split).
  // flex-none + a fixed h-8: the primitive's triggers are flex-1 at a %-height, which is what
  // spread them wide and broke when the list WRAPS on phone (the h-auto rows below) — as
  // compact pills they pack left and wrap cleanly (user, 2026-09-08: the tabs overflowed).
  const topicPicker = (
    <div role="group" aria-label="Topic" className="inline-flex items-center rounded-lg bg-muted p-[3px]">
      {([["snapshots", "Snapshots"], ["economics", "Economics"], ["fleet", "Nodes"], ["continuity", "Continuity"]] as const).map(([id, label]) => (
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

      {!p && !fetched.error && (
        <Panel className="mt-8 py-4 px-5">
          <p className="text-label text-muted-foreground">reading the measured history…</p>
        </Panel>
      )}
      {!p && fetched.error && (
        <Panel className="mt-8 py-4 px-5">
          <p className="text-label text-muted-foreground">
            The trends store is unreachable right now. It recovers on its own — reopen this page
            in a moment.
          </p>
        </Panel>
      )}

      {p && (
        <>
        <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
          {topicPicker}
          <div className="flex items-center gap-3 flex-wrap justify-end">{zoomPicker}{rangeInspect}</div>
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
          {sectionTab === "snapshots" && (
          <Section
            id="ledger"
            title="The base ledger"
            lead="One subject, three readings: how many global snapshots were produced, how many metagraph snapshots they anchored, and the blocks that came with them."
          >
            <TrendChart onRange={onRange} inspect={inspectHere} name="Global snapshots" unit={per} readout={dayReadout("g.ticks")} buckets={cBuckets} stepMs={stepMs} lines={[{ label: "ticks", points: trim(S(p, "g.ticks")) }]} />
            <TrendChart onRange={onRange} inspect={inspectHere} name="Snapshots anchored" unit={per} readout={dayReadout("g.anchors")} buckets={cBuckets} stepMs={stepMs} lines={[{ label: "anchored", points: trim(S(p, "g.anchors")) }]} />
            <TrendChart onRange={onRange} inspect={inspectHere} name="Blocks" unit={per} readout={dayReadout("g.blocks")} buckets={cBuckets} stepMs={stepMs} lines={[{ label: "blocks", points: trim(S(p, "g.blocks")) }]} />
          </Section>
          )}
          {sectionTab === "continuity" && (
          <Section
            id="continuity"
            title="Continuity"
            lead="How regularly the network produced its snapshots, and how long its pauses were. Gray marks a pause that is normal for this network; amber marks one unusually long by its own history; a striped area means this app was not watching at the time."
          >
            <TrendChart onRange={onRange} inspect={inspectHere} name="Mean gap" unit="seconds" buckets={cBuckets} stepMs={stepMs} format={secs} sampled={trim(S(p, "g.ticks"))} gaps={trim(S(p, "g.gapMax"))} lines={[{ label: "mean", points: trim(meanGap(p)) }]} />
            <TrendChart onRange={onRange} inspect={inspectHere} name="Longest pause" unit={`seconds · the ${stepMs >= 86400000 ? "day" : "bucket"}'s single widest gap`} buckets={cBuckets} stepMs={stepMs} format={secs} sampled={trim(S(p, "g.ticks"))} gaps={trim(S(p, "g.gapMax"))} lines={[{ label: "max", points: trim(S(p, "g.gapMax")) }]} />
          </Section>
          )}
          {sectionTab === "economics" && (
          <Section
            id="economics"
            title="Economics"
            lead="How much data the metagraphs anchored into the global ledger, and what they paid for it."
          >
            <TrendChart onRange={onRange} inspect={inspectHere} name="Fees paid" unit={`DAG ${per} · at least`} readout={dayReadout("g.feeFloor", 1e-8)} buckets={cBuckets} stepMs={stepMs} format={dag} lines={[{ label: "fees", points: trim(scale(S(p, "g.feeFloor"), 1e-8)) }]} />
            <TrendChart onRange={onRange} inspect={inspectHere} name="Data anchored" unit={`${per} · at least`} readout={dayReadout("g.kbFloor", 1 / 1024)} buckets={cBuckets} stepMs={stepMs} format={mb} lines={[{ label: "data", points: trim(scale(S(p, "g.kbFloor"), 1 / 1024)) }]} />
          </Section>
          )}
          {sectionTab === "fleet" && (
          <Section
            id="fleet"
            title="Nodes"
            lead="Node counts are sampled live, hourly."
          >
            {stepMs < 3600000 && !fleetRaw ? (
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
          {sectionTab === "snapshots" && (
          <Section
            id="networks"
            title="Snapshots"
            lead={`Each network's own ${bucketWord} snapshot count.`}
          >
            {netPanels("snaps", per)}
          </Section>
          )}
          {sectionTab === "economics" && (<>
          <Section
            id="net-fees"
            title="Fees paid"
            lead="What each network paid the base ledger to anchor."
          >
            {netPanels("fee", `DAG ${per}`, 1e-8, dag)}
          </Section>

          <Section
            id="net-data"
            title="Data anchored"
            lead="How much state each network sealed into the base ledger."
          >
            {netPanels("kb", per, 1 / 1024, mb)}
          </Section>
          </>)}
          {sectionTab === "fleet" && (
          <Section
            id="net-fleet"
            title="Nodes"
            lead="Each network's own node count, sampled live every hour."
          >
            {stepMs < 3600000 && !fleetRaw ? (
              <p className="text-label text-muted-foreground">reading the hourly samples…</p>
            ) : (
              netGaugePanels("nodes")
            )}
          </Section>
          )}
          {sectionTab === "continuity" && (
          <Section
            id="net-continuity"
            title="Continuity"
            lead="How regularly each network produced its own snapshots. Some write steadily and some in bursts, so each is judged against its own rhythm: gray marks a normal pause, amber one unusually long for that network. A striped area means this app was not watching at the time."
          >
            {netGapPanels()}
          </Section>
          )}
          </TabsContent>
          </div>
        </Tabs>
        </>
      )}
    </article>
  );
}
