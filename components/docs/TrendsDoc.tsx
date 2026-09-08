"use client";
import { useEffect, useState } from "react";
import { Panel } from "@/components/docs/AboutDoc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TrendChart, { type TrendLine } from "@/components/docs/TrendChart";
import { METAGRAPHS, netUrl } from "@/src/net/current";
import { displayNetwork } from "@/src/data/unlisted";
import { cn } from "@/lib/utils";

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
  v: 1;
  stepMs: number;
  buckets: number[];
  series: Record<string, (number | null)[]>;
}

type Fetched = { state: "loading" } | { state: "error" } | { state: "ready"; data: TrendsPayload };

// THE ZOOM (user, 2026-09-07: "can we zoom in?") — the window picker is the tiers made
// visible: 24H reads the 5-minute buckets (48 h retention), 7D and 30D the hourly tier, ALL
// the daily tier. Same charts, same honesty rules, finer buckets. "ALL" is the 1y window with
// the unmeasured prefix trimmed, so it says exactly as much as has been measured.
const ZOOMS = [
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "1y", label: "All" },
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
  return `24 hours of the network, ${grain}`;
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
  const [fetched, setFetched] = useState<Fetched>({ state: "loading" });
  const [zoom, setZoom] = useState<ZoomId>("1y");

  // Refetch per zoom; the PREVIOUS payload stays on screen until the new one lands (the CDN
  // answers in ~no time, and swapping through a loading flash would blank every chart).
  useEffect(() => {
    let dead = false;
    fetch(netUrl(`/api/trends?window=${zoom}`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: TrendsPayload) => { if (!dead) setFetched({ state: "ready", data }); })
      .catch(() => { if (!dead) setFetched({ state: "error" }); });
    return () => { dead = true; };
  }, [zoom]);

  const raw = fetched.state === "ready" ? fetched.data : undefined;
  // LEADING TRIM: the 1y window reaches further back than measuring does, and months of
  // leading null days would draw as a long empty runway. Uncovered days at the START are
  // dropped (coverage = g.ticks measured), so the axis begins where history begins and the
  // page widens by itself as the store grows. Interior gaps still draw as gaps — only the
  // unmeasured PREFIX goes.
  const firstCovered = raw ? Math.max(0, raw.series["g.ticks"]?.findIndex((v) => v != null) ?? 0) : 0;
  const p = raw
    ? {
        ...raw,
        buckets: raw.buckets.slice(firstCovered),
        series: Object.fromEntries(Object.entries(raw.series).map(([k, v]) => [k, v.slice(firstCovered)])),
      }
    : undefined;
  const buckets = p?.buckets ?? [];
  const stepMs = p?.stepMs ?? 86400000;
  // COUNTER charts drop partial edge buckets — a partial sum charted whole reads as a crash,
  // the classic last-bucket lie. Daily windows lose both edges (the cutoff day starts mid-day,
  // the last IS today, still filling); sub-daily windows lose only the newest bucket (stored
  // fine buckets are complete once written — only the current slot is still filling). GAUGE
  // charts keep everything: a point sample is complete the moment it is taken, and trimming
  // today would hide the fleet's only readings.
  const lead = stepMs >= 86400000 ? 1 : 0;
  const cBuckets = buckets.slice(lead, -1);
  const trim = (points: (number | null)[]): (number | null)[] => points.slice(lead, -1);

  // The unit word follows the tier — an hourly bucket labelled "/day" would misstate every
  // reading by a factor of 24.
  const per = stepMs >= 86400000 ? "/day" : stepMs >= 3600000 ? "/hour" : "/5 min";
  const bucketWord = stepMs >= 86400000 ? "daily" : stepMs >= 3600000 ? "hourly" : "five-minute";
  const dag = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 2 : 0 })}`;
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
        return <TrendChart key={m.id} name={net?.name ?? m.id!} unit={unit} buckets={cBuckets} stepMs={stepMs} format={fmt} lines={[line]} />;
      });
  /** Per-network GAUGE panels (fleet): untrimmed — a point sample is complete the moment it
   *  is taken — and null where never sampled (gauges are not zero-filled). */
  const netGaugePanels = (unit: string) =>
    METAGRAPHS.filter((m) => m.id)
      .map((m) => {
        const points = S(p, `f.nodes.${m.id}`);
        const last = points.reduce<number | null>((acc, v) => (v != null ? v : acc), null);
        return { m, points, last };
      })
      .sort((a, b) => (b.last ?? -1) - (a.last ?? -1))
      .map(({ m, points }) => {
        const net = displayNetwork(m.id);
        const line: TrendLine = { label: "nodes", points, hue: net?.hue };
        return <TrendChart key={m.id} name={net?.name ?? m.id!} unit={unit} buckets={buckets} stepMs={stepMs} lines={[line]} />;
      });
  /** Per-network CONTINUITY panels: real measured gap stats (m.{id}.gapSum/gapMax — sampled
   *  from 2026-09-07 on; the sampler always held the record timestamps, it just discarded
   *  them). Mean = gapSum/snaps per bucket; a day÷snaps approximation was rejected — for a
   *  batching network (DOR: dozens of snapshots in one tick, then idle) it reads as spacing
   *  that never existed. Ranked by the latest reading, most-stalled first. */
  const netGapPanels = (kind: "mean" | "max") =>
    METAGRAPHS.filter((m) => m.id)
      .map((m) => {
        const sum = S(p, `m.${m.id}.gapSum`);
        const snaps = S(p, `m.${m.id}.snaps`);
        const gmax = S(p, `m.${m.id}.gapMax`);
        const points =
          kind === "mean"
            ? sum.map((v, i) => (v != null && snaps[i] != null && snaps[i]! > 0 ? v / snaps[i]! : null))
            : gmax;
        const last = points.reduce<number | null>((acc, v) => (v != null ? v : acc), null);
        return { m, points, last };
      })
      .sort((a, b) => (b.last ?? -1) - (a.last ?? -1))
      .map(({ m, points }) => {
        const net = displayNetwork(m.id);
        const line: TrendLine = { label: kind, points: trim(points), hue: net?.hue };
        return <TrendChart key={m.id} name={net?.name ?? m.id!} unit="seconds" buckets={cBuckets} stepMs={stepMs} format={secs} lines={[line]} />;
      });
  const secs = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}s`;
  const mb = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;

  // The zoom — a filter over every chart at once; it rides each inner section row so it is
  // always beside the control it composes with.
  const zoomPicker = (
    <div role="group" aria-label="Time window" className="inline-flex items-center rounded-lg bg-muted p-[3px]">
      {ZOOMS.map((z) => (
        <button
          key={z.id}
          type="button"
          aria-pressed={zoom === z.id}
          onClick={() => setZoom(z.id)}
          className={
            zoom === z.id
              ? "h-7 px-3 rounded-md text-label tracking-caps uppercase text-foreground bg-[var(--panel-solid)] shadow-sm"
              : "h-7 px-3 rounded-md text-label tracking-caps uppercase text-muted-foreground hover:text-foreground"
          }
        >
          {z.label}
        </button>
      ))}
    </div>
  );
  // SECTIONS AS SUB-TABS (user, 2026-09-07): one section at a time inside each drawer. The
  // hierarchy carries the design: the outer pair is the file-cabinet (primary), the inner
  // switcher the segmented-pill register the zoom already wears (secondary) — two drawer
  // levels would read as furniture. Continuity lives under Hypergraph on its own: the base
  // ledger's steadiness is a hypergraph concern, and it deliberately doesn't blend with
  // anchoring (the user's own earlier split).
  const innerTrigger = "text-label tracking-caps uppercase px-3 data-[state=active]:bg-[var(--panel-solid)]!";

  return (
    <article className="pt-14">
      <p className="text-micro tracking-caps uppercase text-muted-foreground">Trends</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.01em] leading-tight">
        {buckets.length > 1 ? spanPhrase(buckets, stepMs) : "The network, measured"}
      </h1>
      <p className="mt-5 text-base text-foreground-dim leading-relaxed">
        Every reading below is summed from the chain&apos;s own records — each global snapshot and
        each metagraph snapshot, bucketed by when it happened. A break in a line is a period
        nothing measured, never a zero; a zero is a stretch that really anchored nothing.
      </p>

      {fetched.state === "loading" && (
        <Panel className="mt-8 py-4 px-5">
          <p className="text-label text-muted-foreground">reading the measured history…</p>
        </Panel>
      )}
      {fetched.state === "error" && (
        <Panel className="mt-8 py-4 px-5">
          <p className="text-label text-muted-foreground">
            The trends store is unreachable right now. It recovers on its own — reopen this page
            in a moment.
          </p>
        </Panel>
      )}

      {p && (
        <Tabs defaultValue="hypergraph" className="mt-6 gap-0">
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


          <TabsContent value="hypergraph">
          <Tabs defaultValue="snapshots" className="gap-0">
            <div className="flex items-center justify-between gap-3 flex-wrap pt-4">
              <TabsList aria-label="Hypergraph sections">
                <TabsTrigger value="snapshots" className={innerTrigger}>Snapshots</TabsTrigger>
                <TabsTrigger value="economics" className={innerTrigger}>Economics</TabsTrigger>
                <TabsTrigger value="fleet" className={innerTrigger}>Nodes</TabsTrigger>
                <TabsTrigger value="continuity" className={innerTrigger}>Continuity</TabsTrigger>
              </TabsList>
              {zoomPicker}
            </div>
          <TabsContent value="snapshots">
          <Section
            id="ledger"
            title="The base ledger"
            lead="One subject, three readings: how many global snapshots were produced, how many metagraph snapshots they anchored, and the blocks that came with them."
          >
            <TrendChart name="Global snapshots" unit={per} buckets={cBuckets} stepMs={stepMs} lines={[{ label: "ticks", points: trim(S(p, "g.ticks")) }]} />
            <TrendChart name="Snapshots anchored" unit={per} buckets={cBuckets} stepMs={stepMs} lines={[{ label: "anchored", points: trim(S(p, "g.anchors")) }]} />
            <TrendChart name="Blocks" unit={per} buckets={cBuckets} stepMs={stepMs} lines={[{ label: "blocks", points: trim(S(p, "g.blocks")) }]} />
          </Section>
          </TabsContent>
          <TabsContent value="continuity">
          <Section
            id="continuity"
            title="Continuity"
            lead="How steadily the ledger ticked: the average spacing between snapshots and each bucket's single longest pause — a tall spike is a stall, however brief."
          >
            <TrendChart name="Mean gap" unit="seconds" buckets={cBuckets} stepMs={stepMs} format={secs} lines={[{ label: "mean", points: trim(meanGap(p)) }]} />
            <TrendChart name="Longest pause" unit={`seconds · the ${stepMs >= 86400000 ? "day" : "bucket"}'s single widest gap`} buckets={cBuckets} stepMs={stepMs} format={secs} lines={[{ label: "max", points: trim(S(p, "g.gapMax")) }]} />
          </Section>
          </TabsContent>
          <TabsContent value="economics">
          <Section
            id="economics"
            title="Economics"
            lead="What anchoring paid and carried, summed over the publicly listed metagraphs — a floor, exactly as the cards state it: unlisted channels pay too."
          >
            <TrendChart name="Fees paid" unit={`DAG${per} · floor`} buckets={cBuckets} stepMs={stepMs} format={dag} lines={[{ label: "fees", points: trim(scale(S(p, "g.feeFloor"), 1e-8)) }]} />
            <TrendChart name="Data anchored" unit={`${per} · floor`} buckets={cBuckets} stepMs={stepMs} format={mb} lines={[{ label: "data", points: trim(scale(S(p, "g.kbFloor"), 1 / 1024)) }]} />
          </Section>
          </TabsContent>
          <TabsContent value="fleet">
          <Section
            id="fleet"
            title="Nodes"
            lead="Node counts are sampled live, hourly — there is no historical record of the fleet to read back, so these series begin the day measuring started and fill forward."
          >
            {stepMs < 3600000 ? (
              /* The gauges are HOURLY instruments — at the 5-minute zoom there is nothing they
                 could honestly show, and "no measurements" would wrongly read as an outage. */
              <p className="text-label text-muted-foreground">
                Node counts are an hourly instrument — pick 7D or wider to see them.
              </p>
            ) : (
              <>
                <TrendChart name="Nodes" unit="total" buckets={buckets} stepMs={stepMs} lines={[{ label: "nodes", points: S(p, "f.nodes") }]} />
                <TrendChart
                  name="Metagraph layers"
                  unit="layer-roles"
                  buckets={buckets}
                  stepMs={stepMs}
                  lines={[
                    { label: "L0", points: S(p, "f.layer.l0") },
                    { label: "dL1", points: S(p, "f.layer.dl1"), dash: true },
                  ]}
                />
              </>
            )}
          </Section>
          </TabsContent>
          </Tabs>
          </TabsContent>

          <TabsContent value="metagraphs">
          <Tabs defaultValue="snapshots" className="gap-0">
            <div className="flex items-center justify-between gap-3 flex-wrap pt-4">
              <TabsList aria-label="Metagraph sections">
                <TabsTrigger value="snapshots" className={innerTrigger}>Snapshots</TabsTrigger>
                <TabsTrigger value="economics" className={innerTrigger}>Economics</TabsTrigger>
                <TabsTrigger value="fleet" className={innerTrigger}>Nodes</TabsTrigger>
                <TabsTrigger value="continuity" className={innerTrigger}>Continuity</TabsTrigger>
              </TabsList>
              {zoomPicker}
            </div>
          <TabsContent value="snapshots">
          <Section
            id="networks"
            title="Snapshots"
            lead={`Each network's own ${bucketWord} snapshot count — its cadence is its choice, so every panel carries its own scale, busiest first.`}
          >
            {netPanels("snaps", per)}
          </Section>
          </TabsContent>
          <TabsContent value="economics">
          <Section
            id="net-fees"
            title="Fees paid"
            lead="What each network paid the base ledger to anchor — exact, from its own snapshot records (these are the terms the Hypergraph tab's floor sums)."
          >
            {netPanels("fee", `DAG${per}`, 1e-8, dag)}
          </Section>

          <Section
            id="net-data"
            title="Data anchored"
            lead="How much state each network sealed into the base ledger — exact, from its own snapshot records."
          >
            {netPanels("kb", per, 1 / 1024, mb)}
          </Section>
          </TabsContent>
          <TabsContent value="fleet">
          <Section
            id="net-fleet"
            title="Nodes"
            lead="Each network's own node count, sampled live every hour — no historical fleet record exists upstream, so these begin the day measuring started and fill forward."
          >
            {stepMs < 3600000 ? (
              <p className="text-label text-muted-foreground">
                Node counts are an hourly instrument — pick 7D or wider to see them.
              </p>
            ) : (
              netGaugePanels("nodes")
            )}
          </Section>
          </TabsContent>
          <TabsContent value="continuity">
          <Section
            id="net-continuity"
            title="Continuity"
            lead="How steadily each network sealed its own snapshots — the average spacing and the single longest pause per bucket. Measuring began 7 Sep 2026; earlier history shows as unmeasured."
          >
            {netGapPanels("mean")}
          </Section>

          <Section
            id="net-pause"
            title="Longest pause"
            lead="Each network's single widest gap per bucket — a tall spike is that network stalling, however briefly."
          >
            {netGapPanels("max")}
          </Section>
          </TabsContent>
          </Tabs>
          </TabsContent>
          </div>
        </Tabs>
      )}
    </article>
  );
}
