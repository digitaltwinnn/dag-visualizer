"use client";
import { useEffect, useState } from "react";
import { Panel } from "@/components/docs/AboutDoc";
import TrendChart, { type TrendLine } from "@/components/docs/TrendChart";
import { METAGRAPHS } from "@/src/net/current";
import { netUrl } from "@/src/net/current";
import { displayNetwork } from "@/src/data/unlisted";

// THE TRENDS DOCUMENT (user, 2026-09-06: a chart per metric; widened to six months the same day) — the first UI consumer of the trends backend: one daily-resolution chart per
// stored metric over the /api/trends 180d window. It rides the doc-overlay recipe like About
// and Design (registry entry in views.ts, thin route, footer + info-menu toggles follow).
//
// HONESTY (rule 10, the trends store's own contract rendered): a null bucket draws as a GAP,
// never a zero — the copy says so once, up front. The fees/bytes charts carry the FLOOR label
// (tracked metagraphs only, the cards' own register). The fleet section states its birthday:
// node-count gauges cannot be backfilled (no historical record of the fleet exists upstream),
// so those series begin the day the sampler first ran and fill forward.
//
// Charts are SMALL MULTIPLES per network rather than one many-hued plot (the dataviz rule the
// vitals band follows: identity is never colour-alone, and eleven series in one frame is a
// legend puzzle, not a reading). Catalog order, like the tick bars — a chart that reorders by
// size cannot be followed across visits.

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
      <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function TrendsDoc() {
  const [fetched, setFetched] = useState<Fetched>({ state: "loading" });

  useEffect(() => {
    let dead = false;
    fetch(netUrl("/api/trends?window=180d"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: TrendsPayload) => { if (!dead) setFetched({ state: "ready", data }); })
      .catch(() => { if (!dead) setFetched({ state: "error" }); });
    return () => { dead = true; };
  }, []);

  const p = fetched.state === "ready" ? fetched.data : undefined;
  const buckets = p?.buckets ?? [];
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
        Six months of the network, measured daily
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
            id="anchoring"
            title="Anchoring"
            lead="What the base ledger settles: how many metagraph snapshots each day's global snapshots anchored, and the day's blocks."
          >
            <TrendChart name="Snapshots anchored" unit="/day" buckets={cBuckets} lines={[{ label: "anchored", points: trim(S(p, "g.anchors")) }]} />
            <TrendChart name="Blocks" unit="/day" buckets={cBuckets} lines={[{ label: "blocks", points: trim(S(p, "g.blocks")) }]} />
          </Section>

          <Section
            id="networks"
            title="Snapshots by metagraph"
            lead="Each network's own daily snapshot count — its cadence is its choice, so every panel carries its own scale."
          >
            {METAGRAPHS.filter((m) => m.id).map((m) => {
              const net = displayNetwork(m.id);
              const line: TrendLine = { label: "snapshots", points: trim(S(p, `m.${m.id}.snaps`)), hue: net?.hue };
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
            id="cadence"
            title="Base-ledger cadence"
            lead="The global snapshot rhythm: how many ticks a day, how far apart on average, and the day's single longest pause."
          >
            <TrendChart name="Global snapshots" unit="/day" buckets={cBuckets} lines={[{ label: "ticks", points: trim(S(p, "g.ticks")) }]} />
            <TrendChart name="Mean gap" unit="seconds" buckets={cBuckets} format={secs} lines={[{ label: "mean", points: trim(meanGap(p)) }]} />
            <TrendChart name="Longest pause" unit="seconds · the day's single widest gap" buckets={cBuckets} format={secs} lines={[{ label: "max", points: trim(S(p, "g.gapMax")) }]} />
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
