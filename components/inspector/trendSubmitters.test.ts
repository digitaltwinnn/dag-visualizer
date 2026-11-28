import { describe, it, expect } from "vitest";
import { DED_ID, DOR_ID, SUBMITTERS } from "@/src/data/submitters";
import type { SubmittersWindow } from "@/app/api/submitters/assemble";
import { submittersCardState, submittersScope, querySpan, organisationChart, measuredFloor, noSubmitterLine, countWords, BAND_MAX } from "@/components/inspector/trendSubmitters";

const USDC = "DAG0S16WDgdAvh8VvroR6MWLdjmHYdzAF5S181xh";
const carries = (id: string) => Object.hasOwn(SUBMITTERS, id);
const H = 3_600_000;

describe("submittersCardState — which card History's Data submitters slot draws", () => {
  it("no network in scope → the list of networks that carry data", () => {
    expect(submittersCardState(null, carries)).toEqual({ mode: "all" });
  });
  it("a network with no SUBMITTERS row → the no-data sentence, no fetch", () => {
    expect(submittersCardState(USDC, carries)).toEqual({ mode: "none", net: USDC });
  });
  it("Digital Evidence → its organisations", () => {
    expect(submittersCardState(DED_ID, carries)).toEqual({ mode: "organisations", net: DED_ID });
  });
  it("Dor → its devices, counted", () => {
    expect(submittersCardState(DOR_ID, carries)).toEqual({ mode: "devices", net: DOR_ID });
  });
});

describe("noSubmitterLine — a network with no SUBMITTERS row (R21)", () => {
  it("says what is true by construction, never what the chain carried", () => {
    expect(noSubmitterLine("USDC.dag")).toBe("USDC.dag's data names no submitter this app reads, so there is no one to show");
    expect(noSubmitterLine("USDC.dag")).not.toMatch(/carried|data blocks/);
  });
});

describe("countWords — a count as the cards say it; an HLL estimate says \"about\" (R19)", () => {
  it("names organisations exactly and devices as an estimate", () => {
    expect(countWords(5, "organisation", false)).toBe("5 organisations");
    expect(countWords(1, "organisation", false)).toBe("1 organisation");
    expect(countWords(1438, "device", true)).toBe("about 1,438 devices");
    expect(countWords(1, "device", true)).toBe("about 1 device");
    expect(countWords(3, "device", false)).toBe("3 devices"); // an exact count (a block's own ids) says no "about"
  });
});

describe("submittersScope — the deck's network, the hypergraph read as every network", () => {
  it("the focus, else the filter, else the plane in front (`cardNetwork`)", () => {
    expect(submittersScope("all", DED_ID, USDC)).toBe(DED_ID);
    expect(submittersScope(DOR_ID, null, DED_ID)).toBe(DOR_ID);
    expect(submittersScope("all", null, DED_ID)).toBe(DED_ID);
  });
  it("All, and the DAG's own plane, have no single network", () => {
    expect(submittersScope("all", null, null)).toBeNull();
    expect(submittersScope("all", null, "dag")).toBeNull();
    expect(submittersScope("dag", null, null)).toBeNull();
  });
});

describe("querySpan — the span on screen as a stable read", () => {
  it("moves both ends up to whole hours, so the clock moving inside an hour asks the same URL", () => {
    expect(querySpan({ fromMs: 10 * H + 5, toMs: 20 * H + 5 })).toEqual({ fromMs: 11 * H, toMs: 21 * H });
    expect(querySpan({ fromMs: 10 * H + 999, toMs: 20 * H + 999 })).toEqual({ fromMs: 11 * H, toMs: 21 * H });
  });
  it("keeps a trailing window's length, so 30 days stay on the route's hourly tier", () => {
    const D = 24 * H;
    const now = 1_795_000_000_123;
    const q = querySpan({ fromMs: now - 30 * D, toMs: now });
    expect(q.toMs - q.fromMs).toBe(30 * D);
  });
  it("leaves an hour-aligned span as it is", () => {
    expect(querySpan({ fromMs: 10 * H, toMs: 20 * H })).toEqual({ fromMs: 10 * H, toMs: 20 * H });
  });
  it("always asks on hour edges, which is all the read route accepts (PR review I3)", () => {
    for (const [fromMs, toMs] of [[1, 2], [1_795_000_000_123, 1_797_592_000_999], [7 * H - 1, 9 * H + 1], [0.5, H + 0.25]]) {
      const q = querySpan({ fromMs: fromMs!, toMs: toMs! });
      expect(q.fromMs % H).toBe(0);
      expect(q.toMs % H).toBe(0);
    }
  });
});

const win = (over: Partial<SubmittersWindow>): SubmittersWindow => ({
  net: DED_ID,
  kind: "organisation",
  unit: "batches",
  tier: "1h",
  stepMs: H,
  buckets: [0, H, 2 * H],
  measured: { from: 0, to: 3 * H },
  holes: [],
  estimate: false,
  names: {},
  series: [],
  distinct: [0, 0, 0],
  rangeDistinct: 0,
  totals: [],
  seenTotal: 0,
  firstSeenMs: null,
  palette: [],
  ...over,
});

describe("organisationChart — the range's total, partitioned by organisation (R4)", () => {
  const ids = ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"];
  // Eight organisations, a1 busiest; the palette holds seven of them (h8 is outside it).
  const w = win({
    names: { a1: "Open Poker" },
    series: ids.map((id, k) => ({ id, points: [null, 8 - k, 1] })),
    distinct: [null, 8, 8],
    rangeDistinct: 8,
    totals: ids.map((id, k) => ({ id, updates: 9 - k })),
    palette: ["g7", "a1", "b2", "c3", "d4", "e5", "f6"],
  });
  const chart = organisationChart(w, "var(--ded)");

  it("the first line is the bucket's total batches, null where unmeasured", () => {
    expect(chart.lines).toHaveLength(1);
    expect(chart.lines[0]!.hue).toBe("var(--ded)");
    expect(chart.lines[0]!.points).toEqual([null, 8 + 7 + 6 + 5 + 4 + 3 + 2 + 1, 8]);
  });
  it("the top five palette members by the range's totals are bands of their own, in their own hue", () => {
    const named = chart.stack.slice(0, BAND_MAX);
    expect(BAND_MAX).toBe(5);
    expect(named.map((b) => b.key)).toEqual(["a1", "b2", "c3", "d4", "e5"]);
    expect(named[0]!.label).toBe("Open Poker");
    expect(named[1]!.label).toBe("Org b2");
    for (const b of named) expect(b.hue).toMatch(/^oklch\(/);
  });
  it("everything else is ONE Other band in the neutral, counting its organisations", () => {
    const other = chart.stack[BAND_MAX]!;
    expect(chart.stack).toHaveLength(BAND_MAX + 1);
    expect(other.label).toBe("Other (3)");
    expect(other.hue).toBe("var(--muted-foreground)");
    expect(other.points).toEqual([null, 3 + 2 + 1, 3]);
  });
  it("the bands partition the first line — they sum to it in every bucket", () => {
    chart.lines[0]!.points.forEach((v, i) => {
      const sum = chart.stack.reduce<number | null>((n, b) => (b.points[i] == null ? n : (n ?? 0) + b.points[i]!), null);
      expect(sum).toBe(v);
    });
  });
  it("the share rows are the bands with each one's share of the range", () => {
    expect(chart.shares.map((r) => r.label)).toEqual(["Open Poker", "Org b2", "Org c3", "Org d4", "Org e5", "Other (3)"]);
    const total = ids.reduce((n, _, k) => n + 9 - k, 0);
    expect(chart.shares[0]!.updates).toBe(9);
    expect(chart.shares[0]!.share).toBeCloseTo(9 / total);
    expect(chart.shares[BAND_MAX]!.updates).toBe(4 + 3 + 2); // f6, g7, h8 over the range
  });
  it("an organisation outside the palette never takes a band, however busy in the range", () => {
    const busy = win({
      series: [{ id: "zz", points: [5, 5, 5] }, { id: "a1", points: [1, 1, 1] }],
      distinct: [2, 2, 2],
      totals: [{ id: "zz", updates: 15 }, { id: "a1", updates: 3 }],
      palette: ["a1"],
    });
    const c = organisationChart(busy, "x");
    expect(c.stack.map((b) => b.label)).toEqual(["Org a1", "Other (1)"]);
  });
  it("a measured range nobody sent in is a chart at 0, with no bands", () => {
    const quiet = organisationChart(win({}), "x");
    expect(quiet.lines[0]!.points).toEqual([0, 0, 0]);
    expect(quiet.stack).toEqual([]);
    expect(quiet.shares).toEqual([]);
  });
});

describe("measuredFloor — the line under the chart when the range reaches before measuring began", () => {
  const stamp = (ms: number) => `@${ms}`;
  it("nothing measured at all says so", () => {
    expect(measuredFloor(win({ measured: null, distinct: [null, null, null] }), stamp)).toBe("Not measured yet");
  });
  it("a range starting before the span names the first measured bucket", () => {
    expect(measuredFloor(win({ measured: { from: H + 5, to: 3 * H }, distinct: [null, null, 1] }), stamp)).toBe(`Not measured before @${2 * H}`);
  });
  it("a range wholly inside the span has no line", () => {
    expect(measuredFloor(win({}), stamp)).toBeNull();
  });
  it("the 1h pill — one bucket, the one still being written — says so, never a blank card", () => {
    const now = win({ buckets: [3 * H], distinct: [null], measured: { from: 0, to: 3 * H + 600_000 } });
    expect(measuredFloor(now, stamp)).toBe("Measured by the hour; this hour is still being read.");
    // the sampler has not reached this hour yet (its last run ended in the previous one)
    const early = win({ buckets: [3 * H], distinct: [null], measured: { from: 0, to: 3 * H - 600_000 } });
    expect(measuredFloor(early, stamp)).toBe("Measured by the hour; this hour is still being read.");
  });
  it("a range reaching past where the sampler stopped says since when (a stalled sampler)", () => {
    const after = win({ buckets: [10 * H, 11 * H], distinct: [null, null], measured: { from: 0, to: 3 * H + 5 } });
    expect(measuredFloor(after, stamp)).toBe(`Not measured since @${3 * H + 5}`);
    const tail = win({ buckets: [0, H, 2 * H, 3 * H, 4 * H, 5 * H], distinct: [1, 1, null, null, null, null], measured: { from: 0, to: 2 * H + 5 } });
    expect(measuredFloor(tail, stamp)).toBe(`Not measured since @${2 * H + 5}`);
  });
  it("a hole inside the range is said, and is never read as the start of measuring (R20)", () => {
    const holed = win({ distinct: [null, 0, 0], holes: [{ from: 0, to: H }] });
    expect(measuredFloor(holed, stamp)).toBe("Part of this range is not measured");
  });
});
