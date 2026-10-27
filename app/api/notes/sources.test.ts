import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrendsWindowData } from "@/src/data/trendWindow";
import { pickRangeTier } from "@/src/data/trendWindow";
import { CATALOG } from "@/src/engine/config";
import type { NoteReads } from "./sources";

// The builders are mocked here: these tests pin what `factsFor` READS (the per-view table: tiers
// and windows) and the INPUT it assembles for each builder. The builders' own behaviour is their
// colocated tests' business; `generate.test.ts` runs one real builder end to end.
vi.mock("@/src/data/noteFactsTrend", () => ({ trendFacts: vi.fn() }));
vi.mock("@/src/data/noteFactsLedger", () => ({ ledgerFacts: vi.fn() }));
vi.mock("@/src/data/noteFactsHyper", () => ({ hyperFacts: vi.fn() }));
vi.mock("@/src/data/noteFactsGeo", () => ({ geoFacts: vi.fn() }));

const { trendFacts } = await import("@/src/data/noteFactsTrend");
const { ledgerFacts } = await import("@/src/data/noteFactsLedger");
const { hyperFacts } = await import("@/src/data/noteFactsHyper");
const { geoFacts } = await import("@/src/data/noteFactsGeo");
const { cleanBlurb, factsFor, noteSupported, readGeoDays, readSpan, storeReads } = await import("./sources");
const realGeo = await vi.importActual<typeof import("@/src/data/noteFactsGeo")>("@/src/data/noteFactsGeo");

const H = 3_600_000;
const D = 86_400_000;
const NOW = Date.UTC(2026, 9, 27, 12, 30);
const USDC = CATALOG.mainnet.find((m) => m.name === "USDC.dag")?.id ?? CATALOG.mainnet[0]!.id;

/** A payload tagged by what was asked for, so a builder input can be traced to its read. */
function payload(tag: string, buckets: number[] = [0], series: Record<string, (number | null)[]> = {}): TrendsWindowData & { tag: string } {
  return { tag, buckets, stepMs: H, series, now: NOW };
}

interface Call { tier: string; from: number; to: number }
function fakeReads(over: Partial<NoteReads> = {}): NoteReads & { calls: Call[]; geoCalls: { from: number; to: number }[] } {
  const calls: Call[] = [];
  const geoCalls: { from: number; to: number }[] = [];
  return {
    calls,
    geoCalls,
    async span(_net, tier, from, to) {
      calls.push({ tier, from, to });
      return payload(`${tier}:${from}:${to}`);
    },
    async geoDays(_net, from, to) {
      geoCalls.push({ from, to });
      return { geoDays: { "2026-10-27": { "f.cc.DE": 3, "f.cc.dag.FR": 1 } }, providerNames: { hetzner: "Hetzner" } };
    },
    ...over,
  };
}

const FACT = { label: "Snapshots anchored, per day, this span", value: 1200, kind: "count" as const, text: "1,200" };

beforeEach(() => {
  vi.mocked(trendFacts).mockReset().mockReturnValue({ facts: [FACT], days: [], names: ["USDC.dag"], blurbs: [] });
  vi.mocked(ledgerFacts).mockReset().mockReturnValue({ facts: [FACT], names: ["USDC.dag"] });
  vi.mocked(hyperFacts).mockReset().mockReturnValue({ facts: [FACT], names: ["USDC.dag"], blurbs: ["USDC.dag is: x"], setKey: "a,b" });
  vi.mocked(geoFacts).mockReset().mockReturnValue({ facts: [FACT], names: ["USDC.dag"] });
});

describe("noteSupported", () => {
  it("accepts each view's own subjects and spans, nothing else", () => {
    expect(noteSupported("hyper", "all", "day")).toBe(true);
    expect(noteSupported("hyper", "dag", "day")).toBe(true);
    expect(noteSupported("hyper", USDC, "day")).toBe(true);
    expect(noteSupported("hyper", "all", "7d")).toBe(false);
    expect(noteSupported("geo", "cc:DE", "day")).toBe(true);
    expect(noteSupported("geo", "cc:de", "day")).toBe(false);
    expect(noteSupported("hyper", "cc:DE", "day")).toBe(false);
    expect(noteSupported("ledger", "all", "hours")).toBe(true);
    expect(noteSupported("ledger", "all", "day")).toBe(false);
    expect(noteSupported("trend", "dag", "7d")).toBe(true);
    expect(noteSupported("trend", USDC, `r${NOW - D}-${NOW}`)).toBe(true);
    expect(noteSupported("trend", "dag", `r${NOW}-${NOW - D}`)).toBe(false);
    expect(noteSupported("trend", "dag", "hours")).toBe(false);
  });

  it("refuses an unlisted subject in every view", () => {
    for (const [view, span] of [["hyper", "day"], ["geo", "day"], ["ledger", "hours"], ["trend", "7d"]] as const) {
      expect(noteSupported(view, "unlisted", span)).toBe(false);
      expect(noteSupported(view, "DAGnotTrackedAnywhere000000000000000000", span)).toBe(false);
    }
  });
});

describe("factsFor — the subject's display name for the gate (R39)", () => {
  it("names one network or one country; the whole network has none", async () => {
    const name = async (view: "hyper" | "geo" | "ledger" | "trend", subject: string, span: "day" | "hours" | "7d") =>
      (await factsFor("mainnet", view, subject, span, NOW, fakeReads()))!.subjectName;
    expect(await name("trend", "dag", "7d")).toBeUndefined();
    expect(await name("trend", USDC, "7d")).toBe("USDC.dag");
    expect(await name("hyper", "all", "day")).toBeUndefined();
    expect(await name("hyper", "dag", "day")).toBe("DAG"); // the DAG core is a network in hyper
    expect(await name("geo", "all", "day")).toBeUndefined();
    expect(await name("geo", "cc:DE", "day")).toBe("Germany");
    expect(await name("geo", USDC, "day")).toBe("USDC.dag");
    expect(await name("ledger", "all", "hours")).toBeUndefined();
    expect(await name("ledger", USDC, "hours")).toBe("USDC.dag");
  });
});

describe("noteSupported — the ledger's whole network is ONE subject", () => {
  it("ledger dag is not a second copy of ledger all (identical facts, two notes an hour)", () => {
    expect(noteSupported("ledger", "dag", "hours")).toBe(false);
    expect(noteSupported("ledger", "all", "hours")).toBe(true);
  });
});

describe("factsFor — the per-view read table", () => {
  it("trend 7d: 1h for the span and the one before, 1d with a 30-day lead-in for the days", async () => {
    const r = fakeReads();
    const out = await factsFor("mainnet", "trend", "dag", "7d", NOW, r);
    expect(r.calls).toEqual([
      { tier: "1h", from: NOW - 7 * D, to: NOW },
      { tier: "1h", from: NOW - 14 * D, to: NOW - 7 * D },
      { tier: "1d", from: NOW - 37 * D, to: NOW },
    ]);
    const input = vi.mocked(trendFacts).mock.calls[0]![0];
    expect(input.subject).toBe("dag");
    expect(input.zoom).toBe("7d");
    expect(input.span).toEqual({ fromMs: NOW - 7 * D, toMs: NOW });
    expect((input.cur as { tag?: string }).tag).toBe(`1h:${NOW - 7 * D}:${NOW}`);
    expect((input.prev as { tag?: string }).tag).toBe(`1h:${NOW - 14 * D}:${NOW - 7 * D}`);
    expect((input.daily as { tag?: string }).tag).toBe(`1d:${NOW - 37 * D}:${NOW}`);
    expect(input.names.dag).toBe("DAG");
    expect(input.names[USDC]).toBe("USDC.dag");
    const BIOFI = CATALOG.mainnet.find((m) => m.name === "BioFi")!.id;
    expect(input.blurbs[BIOFI]).toBeTruthy();
    expect(out!.spanFrom).toBe(NOW - 7 * D);
    expect(out!.spanTo).toBe(NOW);
    expect(out!.label).toBe("the hypergraph");
    // R20: the span's own length, as a duration fact the gate can back "the last 7 days" with.
    expect(out!.facts).toContainEqual(expect.objectContaining({ label: "Span length", value: 604_800, kind: "duration", text: "7d" }));
  });

  it("trend 24h reads 1h and no days; 1h reads 5m", async () => {
    const r = fakeReads();
    await factsFor("mainnet", "trend", USDC, "24h", NOW, r);
    expect(r.calls).toEqual([
      { tier: "1h", from: NOW - D, to: NOW },
      { tier: "1h", from: NOW - 2 * D, to: NOW - D },
    ]);
    expect(vi.mocked(trendFacts).mock.calls[0]![0].daily).toBeNull();
    expect(vi.mocked(trendFacts).mock.calls[0]![0].zoom).toBe("24h");

    const r2 = fakeReads();
    const out = await factsFor("mainnet", "trend", USDC, "1h", NOW, r2);
    expect(r2.calls).toEqual([
      { tier: "5m", from: NOW - H, to: NOW },
      { tier: "5m", from: NOW - 2 * H, to: NOW - H },
    ]);
    expect(out!.label).toBe("USDC.dag");
    expect(out!.facts).toContainEqual(expect.objectContaining({ label: "Span length", value: 3600 }));
  });

  it("trend 30d and 1y read 1d with the days' lead-in", async () => {
    for (const [span, ms] of [["30d", 30 * D], ["1y", 365 * D]] as const) {
      const r = fakeReads();
      await factsFor("mainnet", "trend", "dag", span, NOW, r);
      expect(r.calls).toEqual([
        { tier: "1d", from: NOW - ms, to: NOW },
        { tier: "1d", from: NOW - 2 * ms, to: NOW - ms },
        { tier: "1d", from: NOW - ms - 30 * D, to: NOW },
      ]);
    }
  });

  it("trend all reads 1d once, starts where measuring began and has no previous span", async () => {
    const day0 = Date.UTC(2025, 6, 1);
    const buckets = [day0 - 2 * D, day0 - D, day0, day0 + D];
    const raw = { buckets, stepMs: D, now: NOW, series: { "g.ticks": [null, null, 5, 6] } };
    const r = fakeReads({ async span(_n, tier, from, to) { r.calls.push({ tier, from, to }); return raw; } });
    const out = await factsFor("mainnet", "trend", "dag", "all", NOW, r);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]!.tier).toBe("1d");
    const input = vi.mocked(trendFacts).mock.calls[0]![0];
    expect(input.prev).toBeNull();
    expect(input.cur.buckets).toEqual([day0, day0 + D]);
    expect(input.daily).toBe(raw);
    expect(input.span).toEqual({ fromMs: day0, toMs: NOW });
    expect(out!.spanFrom).toBe(day0);
    expect(out!.facts).toContainEqual(expect.objectContaining({ label: "Span length", value: (NOW - day0) / 1000 }));
  });

  it("trend all with nothing measured is no note", async () => {
    const raw = { buckets: [NOW - D], stepMs: D, now: NOW, series: { "g.ticks": [null] } };
    const out = await factsFor("mainnet", "trend", "dag", "all", NOW, fakeReads({ span: async () => raw }));
    expect(out).toBeNull();
    expect(trendFacts).not.toHaveBeenCalled();
  });

  it("a brushed range reads the tier the range is charted at, and the equal span before it", async () => {
    const from = Date.UTC(2026, 9, 1);
    const to = Date.UTC(2026, 9, 11);
    const r = fakeReads();
    await factsFor("mainnet", "trend", "dag", `r${from}-${to}`, NOW, r);
    const tier = pickRangeTier(from, to);
    expect(r.calls).toEqual([
      { tier, from, to },
      { tier, from: from - (to - from), to: from },
    ]);
    const input = vi.mocked(trendFacts).mock.calls[0]![0];
    expect(input.zoom).toBe("range");
    expect(input.daily).toBeNull();
  });

  it("ledger: 5m over 6 hours and 1h over 7 days; both windows stated", async () => {
    const r = fakeReads();
    const out = await factsFor("mainnet", "ledger", "all", "hours", NOW, r);
    expect(r.calls).toEqual([
      { tier: "5m", from: NOW - 6 * H, to: NOW },
      { tier: "1h", from: NOW - 7 * D, to: NOW },
    ]);
    const input = vi.mocked(ledgerFacts).mock.calls[0]![0];
    expect(input.subject).toBe("all");
    expect((input.recent as { tag?: string }).tag).toBe(`5m:${NOW - 6 * H}:${NOW}`);
    expect((input.week as { tag?: string }).tag).toBe(`1h:${NOW - 7 * D}:${NOW}`);
    expect(out!.spanFrom).toBe(NOW - 6 * H);
    expect(out!.label).toBe("the whole network");
    expect(out!.facts).toContainEqual(expect.objectContaining({ label: "Recent window", value: 21_600, kind: "duration" }));
    expect(out!.facts).toContainEqual(expect.objectContaining({ label: "Usual window", value: 604_800, kind: "duration" }));
    expect(out!.days).toEqual([]);
    expect(out!.blurbs).toEqual([]);
  });

  it("hyper: 1h over 30 days, 1d over 60 (a 30-day lead-in), the span the last 30 days; setKey passes through", async () => {
    const r = fakeReads();
    const out = await factsFor("mainnet", "hyper", "all", "day", NOW, r);
    expect(r.calls).toEqual([
      { tier: "1h", from: NOW - 30 * D, to: NOW },
      { tier: "1d", from: NOW - 60 * D, to: NOW },
    ]);
    const input = vi.mocked(hyperFacts).mock.calls[0]![0];
    expect(input.span).toEqual({ fromMs: NOW - 30 * D, toMs: NOW });
    expect((input.fleet as { tag?: string }).tag).toBe(`1h:${NOW - 30 * D}:${NOW}`);
    expect((input.daily as { tag?: string }).tag).toBe(`1d:${NOW - 60 * D}:${NOW}`);
    expect(out!.setKey).toBe("a,b");
    expect(out!.blurbs).toEqual(["USDC.dag is: x"]);
    expect(out!.facts).toContainEqual(expect.objectContaining({ label: "Span length", value: 2_592_000 }));
    // The facts speak of the last day and the last week too (R30).
    expect(out!.facts).toContainEqual(expect.objectContaining({ label: "Day", value: 86_400, kind: "duration" }));
    expect(out!.facts).toContainEqual(expect.objectContaining({ label: "Week", value: 604_800, kind: "duration" }));
  });

  it("geo: the geo family and the tiers' 1d over 41 days (R29), pivoted by day; a country subject", async () => {
    const day = Date.UTC(2026, 9, 26);
    const tiers = { buckets: [day - D, day], stepMs: D, now: NOW, series: { "f.cc.DE": [4, null], "f.cc.US": [2, 3], "g.ticks": [1, 1], "f.nodes": [9, 9] } };
    const r = fakeReads({ async span(_n, tier, from, to) { r.calls.push({ tier, from, to }); return tiers; } });
    const out = await factsFor("mainnet", "geo", "cc:DE", "day", NOW, r);
    expect(r.geoCalls).toEqual([{ from: NOW - 41 * D, to: NOW }]);
    expect(r.calls).toEqual([{ tier: "1d", from: NOW - 41 * D, to: NOW }]);
    const input = vi.mocked(geoFacts).mock.calls[0]![0];
    expect(input.subject).toEqual({ cc: "DE" });
    expect(input.ccDays).toEqual({ "2026-10-25": { "f.cc.DE": 4, "f.cc.US": 2 }, "2026-10-26": { "f.cc.US": 3 } });
    expect(input.geoDays).toEqual({ "2026-10-27": { "f.cc.DE": 3, "f.cc.dag.FR": 1 } });
    expect(input.providerNames).toEqual({ hetzner: "Hetzner" });
    expect(input.countryNames).toMatchObject({ DE: "Germany", US: "United States", FR: "France" });
    expect(out!.label).toBe("Germany");
    expect(out!.spanFrom).toBe(NOW - 30 * D);
    expect(out!.facts).toContainEqual(expect.objectContaining({ label: "Span length", value: 2_592_000 }));
  });

  it("geo, through the real builder: a partial outage 30 days back is never the month-ago anchor (R29)", async () => {
    vi.mocked(geoFacts).mockImplementation(realGeo.geoFacts);
    const today = Math.floor(NOW / D) * D;
    const NORMAL = { DE: 50, US: 30 };
    const OUTAGE = { DE: 20, US: 12 }; // a partial outage hour, read as the whole day
    const level = (dayMs: number) => (dayMs === today - 31 * D || dayMs === today - 30 * D ? OUTAGE : NORMAL);
    const daysIn = (from: number) => {
      const out: number[] = [];
      for (let t = Math.floor(from / D) * D; t <= NOW; t += D) out.push(t);
      return out;
    };
    const geoField = (cc: Record<string, number>) => Object.fromEntries(Object.entries(cc).map(([c, n]) => [`f.cc.${c}`, n]));
    const reads: NoteReads = {
      async geoDays(_n, from) {
        return { geoDays: Object.fromEntries(daysIn(from).map((t) => [new Date(t).toISOString().slice(0, 10), geoField(level(t))])), providerNames: {} };
      },
      async span(_n, _tier, from) {
        const buckets = daysIn(from);
        return { buckets, stepMs: D, now: NOW, series: { "g.ticks": buckets.map(() => 1), "f.cc.DE": buckets.map((t) => level(t).DE), "f.cc.US": buckets.map((t) => level(t).US) } };
      },
    };
    const monthAgo = (facts: { label: string; value: number }[]) => facts.filter((f) => /a month ago/.test(f.label));

    // The defect, shown: over a 31-day read the outage pair sits at the read's head, is judged
    // against itself, and becomes the anchor ("Germany rose 150%").
    const head = await reads.geoDays("mainnet", NOW - 31 * D, NOW);
    const ccHead = await reads.span("mainnet", "1d", NOW - 31 * D, NOW);
    const ccDays31 = Object.fromEntries(ccHead.buckets.map((b, i) => [new Date(b).toISOString().slice(0, 10), { "f.cc.DE": ccHead.series["f.cc.DE"]![i]!, "f.cc.US": ccHead.series["f.cc.US"]![i]! }]));
    const short = realGeo.geoFacts({ subject: "all", geoDays: head.geoDays, ccDays: ccDays31, providerNames: {}, countryNames: { DE: "Germany", US: "United States" }, names: {} })!;
    expect(monthAgo(short.facts).some((f) => f.label.endsWith("now against a month ago") && f.value === 2.5)).toBe(true);

    // The fix: the read reaches 41 days back, the pair is judged against the week before it and
    // fails, and no change fact reads from it.
    const out = await factsFor("mainnet", "geo", "all", "day", NOW, reads);
    const changes = monthAgo(out!.facts);
    expect(changes.length).toBeGreaterThan(0);
    for (const f of changes) {
      if (f.label.endsWith("now against a month ago")) expect(f.value).toBe(1);
      else expect([NORMAL.DE, NORMAL.US, NORMAL.DE + NORMAL.US]).toContain(f.value); // a country, or the fleet's located total
    }
  });

  it("a builder's null is no note", async () => {
    vi.mocked(ledgerFacts).mockReturnValue(null);
    expect(await factsFor("mainnet", "ledger", "all", "hours", NOW, fakeReads())).toBeNull();
  });

  it("an unsupported request reads nothing", async () => {
    const r = fakeReads();
    expect(await factsFor("mainnet", "trend", "unlisted", "7d", NOW, r)).toBeNull();
    expect(r.calls).toEqual([]);
  });

  it("a read that throws propagates (the generator counts it as a store outage)", async () => {
    const r = fakeReads({ span: async () => { throw new Error("down"); } });
    await expect(factsFor("mainnet", "ledger", "all", "hours", NOW, r)).rejects.toThrow("down");
  });
});

describe("cleanBlurb — a catalog blurb in the house voice", () => {
  it("turns a dash clause into a comma and keeps a joining hyphen", () => {
    expect(cleanBlurb("DoD-vetted data-fingerprinting as a service — immutable proof of data authenticity, anchored to the Global L0."))
      .toBe("DoD-vetted data-fingerprinting as a service, immutable proof of data authenticity, anchored to the Global L0.");
    expect(cleanBlurb("A ledger – for data - anchored.")).toBe("A ledger, for data, anchored.");
  });
  it("drops a sentence holding a banned word, and is empty when nothing is left", () => {
    expect(cleanBlurb("A USDC representation issued as a metagraph for fast, feeless transfers on the Hypergraph.")).toBe("");
    expect(cleanBlurb("A decentralized exchange metagraph for swapping Constellation-ecosystem assets.")).toBe("");
    expect(cleanBlurb("Swaps tokens. Decentralized and feeless. Runs on L0.")).toBe("Swaps tokens. Runs on L0.");
  });
  it("cleans the catalog the model is shown: no banned word or dash clause reaches a builder", async () => {
    await factsFor("mainnet", "trend", "dag", "7d", NOW, fakeReads());
    const { blurbs } = vi.mocked(trendFacts).mock.calls[0]![0];
    expect(Object.keys(blurbs).length).toBeGreaterThan(0);
    for (const b of Object.values(blurbs)) {
      expect(b).not.toMatch(/—|\s[–-]\s/);
      expect(b).not.toMatch(/feeless|decentrali|machine|\btick/i);
      expect(b).not.toBe("");
    }
    expect(blurbs[USDC]).toBeUndefined(); // its one sentence says "feeless"
  });
});

describe("the store reads", () => {
  it("readSpan is the tile route's body: the tier hashes, assembled", async () => {
    const asked: string[] = [];
    const store = {
      async hgetall(key: string) {
        asked.push(key);
        return key === "t:mainnet:1h:2026-10" ? { "27-10|g.ticks": "4", "27-10|m.x.snaps": "7", "27-11|g.ticks": "2" } : null;
      },
    };
    const from = Date.UTC(2026, 9, 27, 10);
    const out = await readSpan("mainnet", "1h", from, from + 3 * H, store, NOW);
    expect(asked).toEqual(["t:mainnet:1h:2026-10"]);
    expect(out.buckets).toEqual([from, from + H, from + 2 * H]);
    expect(out.stepMs).toBe(H);
    expect(out.now).toBe(NOW);
    expect(out.series["g.ticks"]).toEqual([4, 2, null]);
    expect(out.series["m.x.snaps"]).toEqual([7, 0, null]);
  });

  it("readGeoDays reads the year hashes in the window and the provider names", async () => {
    const asked: string[] = [];
    const hashes: Record<string, Record<string, string | number>> = {
      "geo:mainnet:2025": { "12-30|f.cc.DE": 1, "12-31|f.cc.DE": "2" },
      "geo:mainnet:2026": { "01-01|f.cc.DE": 3, "01-01|f.isp.hetzner": 3, "01-02|f.cc.usdc.FR": 1, "02-01|f.cc.DE": 9 },
      "geo:mainnet:isp": { hetzner: "Hetzner Online GmbH" },
    };
    const store = { async hgetall(key: string) { asked.push(key); return (hashes[key] as Record<string, string>) ?? null; } };
    const out = await readGeoDays("mainnet", Date.UTC(2025, 11, 31, 6), Date.UTC(2026, 0, 2, 6), store);
    expect(asked.sort()).toEqual(["geo:mainnet:2025", "geo:mainnet:2026", "geo:mainnet:isp"]);
    expect(out.geoDays).toEqual({
      "2025-12-31": { "f.cc.DE": 2 },
      "2026-01-01": { "f.cc.DE": 3, "f.isp.hetzner": 3 },
      "2026-01-02": { "f.cc.usdc.FR": 1 },
    });
    expect(out.providerNames).toEqual({ hetzner: "Hetzner Online GmbH" });
  });

  it("storeReads reads each hash once per note", async () => {
    let n = 0;
    const store = { async hgetall() { n++; return null; } };
    const reads = storeReads(NOW, store);
    await reads.span("mainnet", "1d", NOW - 30 * D, NOW);
    await reads.span("mainnet", "1d", NOW - 60 * D, NOW - 30 * D);
    expect(n).toBe(1); // one year hash, read once
  });
});
