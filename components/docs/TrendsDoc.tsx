"use client";
import { useEffect, useState } from "react";
import { Panel } from "@/components/docs/AboutDoc";
import TrendChart, { type TrendLine } from "@/components/docs/TrendChart";
import { METAGRAPHS } from "@/src/net/current";
import { netUrl } from "@/src/net/current";
import { displayNetwork } from "@/src/data/unlisted";

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
  buckets: number[];
  series: Record<string, (number | null)[]>;
}

type Fetched = { state: "loading" } | { state: "error" } | { state: "ready"; data: TrendsPayload };

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
    <section id={id} className="mt-12 scroll-mt-24">
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

  useEffect(() => {
    let dead = false;
    fetch(netUrl("/api/trends?window=1y"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: TrendsPayload) => { if (!dead) setFetched({ state: "ready", data }); })
      .catch(() => { if (!dead) setFetched({ state: "error" }); });
    return () => { dead = true; };
  }, []);

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
  const spanMonths = buckets.length > 1 ? Math.max(1, Math.round((buckets[buckets.length - 1] - buckets[0]) / 2592000000)) : null;
  // COUNTER charts drop the window's partial edge days (the first bucket starts mid-day at the
  // window cutoff, the last IS today, still filling) — a partial sum charted as a day reads as
  // a crash, the classic last-bucket lie. GAUGE charts keep them: a point sample is complete
  // the moment it is taken, and trimming today would hide the fleet's only readings.
  const cBuckets = buckets.slice(1, -1);
  const trim = (points: (number | null)[]): (number | null)[] => points.slice(1, -1);

  const dag = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 2 : 0 })}`;
  const secs = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}s`;
  const mb = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;

  return (
    <article className="pt-14">
      <p className="text-micro tracking-caps uppercase text-muted-foreground">Trends</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.01em] leading-tight">
        {spanMonths ? `${spanMonths} months of the network, measured daily` : "The network, measured daily"}
      </h1>
      <p className="mt-5 text-base text-foreground-dim leading-relaxed">
        Every reading below is summed from the chain&apos;s own records — each global snapshot and
        each metagraph snapshot, bucketed by the day it happened. A break in a line is a period
        nothing measured, never a zero; a zero is a day that really anchored nothing.
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
        <>
          <Section
            id="ledger"
            title="The base ledger"
            lead="One subject, three readings: how many global snapshots the day produced, how many metagraph snapshots they anchored, and the day's blocks."
          >
            <TrendChart name="Global snapshots" unit="/day" buckets={cBuckets} lines={[{ label: "ticks", points: trim(S(p, "g.ticks")) }]} />
            <TrendChart name="Snapshots anchored" unit="/day" buckets={cBuckets} lines={[{ label: "anchored", points: trim(S(p, "g.anchors")) }]} />
            <TrendChart name="Blocks" unit="/day" buckets={cBuckets} lines={[{ label: "blocks", points: trim(S(p, "g.blocks")) }]} />
          </Section>

          <Section
            id="continuity"
            title="Continuity"
            lead="How steadily the ledger ticked: the average spacing between snapshots and each day's single longest pause — a tall spike is a stall, however brief."
          >
            <TrendChart name="Mean gap" unit="seconds" buckets={cBuckets} format={secs} lines={[{ label: "mean", points: trim(meanGap(p)) }]} />
            <TrendChart name="Longest pause" unit="seconds · the day's single widest gap" buckets={cBuckets} format={secs} lines={[{ label: "max", points: trim(S(p, "g.gapMax")) }]} />
          </Section>

          <Section
            id="networks"
            title="Snapshots by metagraph"
            lead="Each network's own daily snapshot count — its cadence is its choice, so every panel carries its own scale."
          >
            {/* Ordered by the LAST measured day's count, busiest first (user, 2026-09-07). The
                vitals' catalog-order rule guards live charts that would reshuffle under the
                reader as ticks land; a document laid out once per visit can rank honestly, and
                here the ranking IS a reading. Dormant chains sink to the bottom. */}
            {METAGRAPHS.filter((m) => m.id)
              .map((m) => {
                const points = trim(S(p, `m.${m.id}.snaps`));
                const last = points.reduce<number | null>((acc, v) => (v != null ? v : acc), null);
                return { m, points, last };
              })
              .sort((a, b) => (b.last ?? -1) - (a.last ?? -1))
              .map(({ m, points }) => {
                const net = displayNetwork(m.id);
                const line: TrendLine = { label: "snapshots", points, hue: net?.hue };
                return <TrendChart key={m.id} name={net?.name ?? m.id!} unit="/day" buckets={cBuckets} lines={[line]} />;
              })}
          </Section>

          <Section
            id="economics"
            title="Economics"
            lead="What anchoring paid and carried, summed over the publicly listed metagraphs — a floor, exactly as the cards state it: unlisted channels pay too."
          >
            <TrendChart name="Fees paid" unit="DAG/day · floor" buckets={cBuckets} format={dag} lines={[{ label: "fees", points: trim(scale(S(p, "g.feeFloor"), 1e-8)) }]} />
            <TrendChart name="Data anchored" unit="/day · floor" buckets={cBuckets} format={mb} lines={[{ label: "data", points: trim(scale(S(p, "g.kbFloor"), 1 / 1024)) }]} />
          </Section>

          <Section
            id="fleet"
            title="Fleet"
            lead="Node counts are sampled live, hourly — there is no historical record of the fleet to read back, so these series begin the day measuring started and fill forward."
          >
            <TrendChart name="Nodes" unit="total" buckets={buckets} lines={[{ label: "nodes", points: S(p, "f.nodes") }]} />
            <TrendChart
              name="Layers"
              unit="node-roles"
              buckets={buckets}
              lines={[
                { label: "L0", points: S(p, "f.layer.l0") },
                { label: "dL1", points: S(p, "f.layer.dl1"), dash: true },
              ]}
            />
          </Section>
        </>
      )}
    </article>
  );
}
