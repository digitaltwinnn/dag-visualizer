import type { TrendBand, TrendLine } from "@/components/docs/TrendChart";
import type { SubmittersWindow } from "@/app/api/submitters/assemble";
import { SUBMITTERS, submitterLabel, type SubmitterKind } from "@/src/data/submitters";
import { cardNetwork } from "@/src/engine/domain/trendStack";
import { submitterHudCss } from "@/src/palette/submitterHue";

// THE DATA SUBMITTERS CARD'S PURE HALF (History, 2026-11-27): which card the slot draws for the
// network the deck stands on, the span it asks the read route for, and the chart it draws — the
// range's total batches with the organisations as bands that partition it (ruling R4). The pane
// (`TrendSubmittersPane.tsx`) renders these and nothing else decides them.

/** What the card is about: every network that names its submitters, one network's organisations or
 *  devices, or a network whose data names no one we can read. */
export type SubmittersCardState =
  | { mode: "all" }
  | { mode: "none"; net: string }
  | { mode: "organisations" | "devices"; net: string };

/** The card for `scope` (null = no single network). `carriesData` says whether a network names its
 *  submitters (the network has a `SUBMITTERS` row) — one that does but sent nothing in the range
 *  still draws its chart, at 0; one that does not reads `noSubmitterLine` and is never fetched for. */
export function submittersCardState(scope: string | null, carriesData: (id: string) => boolean): SubmittersCardState {
  if (scope == null) return { mode: "all" };
  if (!carriesData(scope)) return { mode: "none", net: scope };
  return { mode: SUBMITTERS[scope]?.kind === "device" ? "devices" : "organisations", net: scope };
}

/** THE SENTENCE FOR A NETWORK WITH NO `SUBMITTERS` ROW (ruling R21): true by construction — its
 *  data names no submitter this app reads — never a claim about what the chain carried in the range,
 *  which nothing here measures (rule 10). */
export function noSubmitterLine(network: string): string {
  return `${network}'s data names no submitter this app reads, so there is no one to show`;
}

/** A COUNT OF SUBMITTERS AS THE CARDS SAY IT: "5 organisations", "about 1,438 devices". An
 *  `estimate` (Dor's HyperLogLog counts, R19 — `SubmittersWindow.estimate`) says "about", so an
 *  estimate is never shown as exact (rule 10); one block's own ids are exact and pass false. */
export function countWords(n: number, kind: SubmitterKind, estimate: boolean): string {
  const noun = kind === "organisation" ? (n === 1 ? "organisation" : "organisations") : n === 1 ? "device" : "devices";
  return `${estimate ? "about " : ""}${n.toLocaleString()} ${noun}`;
}

/** THE NETWORK THE DECK STANDS ON (`trendStack.cardNetwork`, the rule the Range card's lead reads),
 *  with All and the DAG's own plane — the hypergraph, every network at once — as no single one. */
export function submittersScope(filter: string, focus: string | null, front: string | null): string | null {
  const net = cardNetwork(filter, focus, front);
  return net === "all" || net === "dag" ? null : net;
}

const H = 3_600_000;
const DAY_MS = 86_400_000;
/** The span on screen as the read route is asked it, both ends moved UP to whole hours (the store's
 *  finest tier): a trailing window ends at the clock, and an unsnapped end would be a new URL — a new
 *  fetch — on every render. Moving both ends the same way keeps the length, so the 30-day window
 *  stays inside the route's hourly tier (snapped outward it read daily); the hour holding the clock
 *  is in the range — the bucket still being written, which the route answers null — and the
 *  window's partial first hour is not. */
export function querySpan(span: { fromMs: number; toMs: number }): { fromMs: number; toMs: number } {
  return { fromMs: Math.ceil(span.fromMs / H) * H, toMs: Math.ceil(span.toMs / H) * H };
}

/** How many organisations take a band of their own; the rest are one "Other" band. */
export const BAND_MAX = 5;

export interface ShareRow {
  key: string;
  label: string;
  hue: string;
  updates: number;
  /** Of the range's batches credited to an organisation, 0..1. */
  share: number;
}

/** THE ORGANISATIONS' CHART (ruling R4). The first line is each bucket's total batches (Σ every
 *  organisation), null where the bucket is unmeasured; the bands PARTITION it, which is what
 *  `TrendChart`'s `stack` requires: the top `BAND_MAX` palette members by the range's totals, each in
 *  its own hue, and every other organisation summed into one "Other (n)" band in the neutral. The
 *  share rows are the same partition over the whole range, so the table and the legend agree. */
export function organisationChart(w: SubmittersWindow, totalHue: string): { lines: TrendLine[]; stack: TrendBand[]; shares: ShareRow[] } {
  const measured = (i: number) => w.distinct[i] != null;
  const pointsOf = new Map(w.series.map((s) => [s.id, s.points]));
  const sum = (ids: readonly string[]) =>
    w.buckets.map((_, i) => (measured(i) ? ids.reduce((n, id) => n + (pointsOf.get(id)?.[i] ?? 0), 0) : null));
  const all = w.series.map((s) => s.id);
  const total = sum(all);
  const inPalette = new Set(w.palette);
  const named = w.totals.filter((t) => inPalette.has(t.id)).slice(0, BAND_MAX);
  const namedIds = new Set(named.map((t) => t.id));
  const others = w.totals.filter((t) => !namedIds.has(t.id));
  const grand = w.totals.reduce((n, t) => n + t.updates, 0);

  const stack: TrendBand[] = named.map((t) => ({
    key: t.id,
    label: submitterLabel(t.id, w.names),
    hue: submitterHudCss(t.id, w.palette),
    points: w.buckets.map((_, i) => (measured(i) ? (pointsOf.get(t.id)?.[i] ?? 0) : null)),
  }));
  const shares: ShareRow[] = named.map((t, k) => ({ key: t.id, label: stack[k]!.label, hue: stack[k]!.hue!, updates: t.updates, share: grand > 0 ? t.updates / grand : 0 }));
  if (others.length) {
    const label = `Other (${others.length})`;
    const hue = "var(--muted-foreground)";
    stack.push({ key: "other", label, hue, points: sum(others.map((t) => t.id)) });
    const updates = others.reduce((n, t) => n + t.updates, 0);
    shares.push({ key: "other", label, hue, updates, share: grand > 0 ? updates / grand : 0 });
  }
  return { lines: [{ label: "Batches", points: total, hue: totalHue }], stack, shares };
}

/** THE LINE UNDER THE CHART (rule 10): every way a bucket of the range is not measured is SAID, never
 *  left as an empty plot. In order:
 *  - nothing measured at all — "Not measured yet";
 *  - the range runs more than a bucket past where the sampler's span ends (a stalled sampler, or a
 *    range wholly after it) — "Not measured since <stamp of the span's end>";
 *  - the range is the bucket still being written (the 1h pill: one in-progress bucket, always null) —
 *    "Measured by the hour; this hour is still being read.";
 *  - the range starts before the span — "Not measured before <first measured bucket>", named in
 *    `stamp`'s words (`localTime.bucketStamp` at the window's own step — a UTC day at the daily tier);
 *  - a hole inside it (R20, the hours a gap left unread) — "Part of this range is not measured".
 *  Null when the range is measured throughout. */
export function measuredFloor(w: SubmittersWindow, stamp: (ms: number) => string): string | null {
  if (!w.measured) return "Not measured yet";
  if (!w.buckets.length) return null;
  const step = w.stepMs;
  const first = w.buckets[0]!, last = w.buckets[w.buckets.length - 1]!;
  const writing = Math.floor(w.measured.to / step) * step; // the bucket the sampler is still writing
  if (last > writing + step) return `Not measured since ${stamp(w.measured.to)}`;
  if (first >= writing && w.distinct.every((v) => v == null)) {
    return step >= DAY_MS ? "Measured by the day; this day is still being read." : "Measured by the hour; this hour is still being read.";
  }
  if (first < w.measured.from) {
    const from = w.buckets.find((t, i) => t >= w.measured!.from && w.distinct[i] != null) ?? Math.ceil(w.measured.from / step) * step;
    return `Not measured before ${stamp(from)}`;
  }
  return w.holes.length ? "Part of this range is not measured" : null;
}

/** THE FLOOR LINE UNDER A 24-HOUR COUNT (ruling R23, rule 10): a count over the last 24 hours counts
 *  only the hours measured, so when some of them are not — the newest hour before the run passes it,
 *  the first day after deploy, a hole — it is a floor and says so, "23 of 24 hours measured", with
 *  the number itself unchanged. Null when every hour is measured, and when none is (that state
 *  already reads as not measured). An hour is measured exactly where the window's `distinct` holds a
 *  value: the read side sets it from its one rule (`assemble.bucketMeasured` — inside the span, in
 *  no hole), so this counts that rule's answer rather than restating it. */
export function measuredHoursLine(w: Pick<SubmittersWindow, "distinct">): string | null {
  const n = w.distinct.length;
  const k = w.distinct.filter((v) => v != null).length;
  return k === 0 || k === n ? null : `${k} of ${n} hours measured`;
}
