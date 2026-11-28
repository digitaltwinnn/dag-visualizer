import { describe, expect, it } from "vitest";
import { DED_ID, DOR_ID } from "@/src/data/submitters";
import { assembleSubmitters, measuredSketchKeys, windowRange24h, ORG_PALETTE_MAX } from "./assemble";
import { subField, subSketchKeyOf, subSlotOf } from "./keys";
import { addIds, encodeSketch, newSketch } from "./sketch";

const H = 3600000;
const T0 = Date.UTC(2026, 10, 10, 0); // an hour boundary

function hashesFor(net: string, rows: [number, string, number][]) {
  const out: Record<string, Record<string, string>> = {};
  for (const [t, id, n] of rows) {
    const { key, bucket } = subSlotOf(net, "1h", t);
    (out[key] ??= {})[subField(bucket, id)] = String(n);
  }
  return out;
}

describe("assembleSubmitters", () => {
  const span = { from: String(T0 + 2 * H), to: String(T0 + 5 * H + 1800000), cursor: "9" };

  it("is null before the measured span and for the in-progress bucket, 0 for a quiet organisation inside", () => {
    const hashes = hashesFor(DED_ID, [[T0 + 2 * H, "a", 3], [T0 + 3 * H, "b", 1], [T0 + 4 * H, "a", 2]]);
    const w = assembleSubmitters({ net: DED_ID, tier: "1h", fromMs: T0, toMs: T0 + 6 * H, hashes, span, names: null });
    expect(w.buckets).toEqual([0, 1, 2, 3, 4, 5].map((i) => T0 + i * H));
    // buckets 0,1 precede the span; 2,3,4 are whole; 5 holds `to` and is in progress
    expect(w.series.find((s) => s.id === "a")!.points).toEqual([null, null, 3, 0, 2, null]);
    expect(w.series.find((s) => s.id === "b")!.points).toEqual([null, null, 0, 1, 0, null]);
    expect(w.distinct).toEqual([null, null, 1, 1, 1, null]);
    expect(w.totals).toEqual([{ id: "a", updates: 5 }, { id: "b", updates: 1 }]);
    expect(w.rangeDistinct).toBe(2);
    expect(w.measured).toEqual({ from: T0 + 2 * H, to: T0 + 5 * H + 1800000 });
  });

  it("counts Dor devices from their sketches: a bucket its count field, the range the estimate of the union (R22)", () => {
    const { key, bucket } = subSlotOf(DOR_ID, "1h", T0);
    const a = encodeSketch(addIds(newSketch(), ["d1", "d2"])), b = encodeSketch(addIds(newSketch(), ["d2", "d3"]));
    const input = {
      net: DOR_ID, tier: "1h" as const, fromMs: T0, toMs: T0 + 3 * H,
      hashes: { [key]: { [bucket]: "2" } },
      span: { from: String(T0), to: String(T0 + 2 * H + 1) }, names: null,
    };
    const w = assembleSubmitters({ ...input, sketches: [a, b] });
    expect(w.kind).toBe("device");
    expect(w.estimate).toBe(true);
    expect(w.distinct).toEqual([2, 0, null]); // the second hour has no count field (measured, none); the third is in progress
    expect(w.rangeDistinct).toBe(3); // d2 in both hours is one device
    expect(w.series).toEqual([]);
    expect(w.totals).toEqual([]);
    // An absent sketch is no devices; an undecodable one leaves the range unmeasured, the buckets still read.
    expect(assembleSubmitters({ ...input, sketches: [a, null] }).rangeDistinct).toBe(2);
    const bad = assembleSubmitters({ ...input, sketches: [a, "hll12:garbage"] });
    expect(bad.rangeDistinct).toBeNull();
    expect(bad.distinct).toEqual([2, 0, null]);
    // nothing measured: no count, even with sketches handed in
    const none = assembleSubmitters({ net: DOR_ID, tier: "1h", fromMs: T0, toMs: T0 + H, hashes: {}, span: null, names: null, sketches: [a] });
    expect(none.rangeDistinct).toBeNull();
    expect(none.distinct).toEqual([null]);
    // an organisation window is exact
    expect(assembleSubmitters({ net: DED_ID, tier: "1h", fromMs: T0, toMs: T0 + H, hashes: {}, span: null, names: null }).estimate).toBe(false);
  });

  describe("measuredSketchKeys — the sketches a device range unions (R22)", () => {
    const D = 24 * H;
    const D0 = T0, D1 = T0 + D, D2 = T0 + 2 * D;
    const sk = (tier: "1h" | "1d", t: number) => subSketchKeyOf(DOR_ID, tier, t);
    const hours = (from: number, n: number) => Array.from({ length: n }, (_, i) => sk("1h", from + i * H));
    const wide = { from: String(D0 - 5 * D), to: String(D2 + 10 * D) };

    it("a range of whole days with edge hours: the day sketch for each whole day, hour sketches at the edges", () => {
      expect(measuredSketchKeys(DOR_ID, "1h", D0 - 2 * H, D2 + 3 * H, wide, null)).toEqual([
        ...hours(D0 - 2 * H, 2), sk("1d", D0), sk("1d", D1), ...hours(D2, 3),
      ]);
    });

    it("a hole inside a day takes that day's measured hours instead of its day sketch", () => {
      const holes = { [String(D1 + 5 * H)]: String(D1 + 7 * H) };
      expect(measuredSketchKeys(DOR_ID, "1h", D0, D2, wide, holes)).toEqual([
        sk("1d", D0), ...hours(D1, 5), ...hours(D1 + 7 * H, 17),
      ]);
    });

    it("a day the span covers only in part reads its measured hours: the in-progress hour is not one", () => {
      const span = { from: String(D0), to: String(D0 + 20 * H + 1) };
      expect(measuredSketchKeys(DOR_ID, "1h", D0, D1, span, null)).toEqual(hours(D0, 20));
    });

    it("a 24-hour window anchored mid-day reads hours only", () => {
      expect(measuredSketchKeys(DOR_ID, "1h", D0 + 10 * H, D1 + 10 * H, wide, null)).toEqual(hours(D0 + 10 * H, 24));
    });

    it("the daily tier: the day sketch of each measured day", () => {
      const span = { from: String(D0), to: String(D2 + 5 * H) }; // D2 holds `to`: in progress
      expect(measuredSketchKeys(DOR_ID, "1d", D0 - D, D2 + D, span, null)).toEqual([sk("1d", D0), sk("1d", D1)]);
    });
  });

  it("carries only the label map in names, and an unnamed organisation is still in series and totals", () => {
    const hashes = hashesFor(DED_ID, [[T0, "a", 1], [T0, "z", 2]]);
    const w = assembleSubmitters({
      net: DED_ID, tier: "1h", fromMs: T0, toMs: T0 + H, hashes,
      span: { from: String(T0), to: String(T0 + H) },
      names: { a: JSON.stringify({ name: "Acme", source: "ded", namedAt: 1 }), bad: "{not json" },
    });
    expect(w.names).toEqual({ a: "Acme" });
    expect(w.series.map((s) => s.id).sort()).toEqual(["a", "z"]);
    expect(w.totals.map((t) => t.id)).toEqual(["z", "a"]);
  });

  it("nulls every bucket overlapping a hole (R20) and leaves it out of rangeDistinct and totals", () => {
    const sp = { from: String(T0), to: String(T0 + 4 * H) };
    const hashes = hashesFor(DED_ID, [[T0, "a", 1], [T0 + H, "b", 5], [T0 + 2 * H, "a", 2]]);
    const holes = { [String(T0 + H)]: String(T0 + 2 * H) };
    const w = assembleSubmitters({ net: DED_ID, tier: "1h", fromMs: T0, toMs: T0 + 4 * H, hashes, span: sp, names: null, holes });
    expect(w.distinct).toEqual([1, null, 1, 0]);
    expect(w.series.map((x) => x.id)).toEqual(["a"]); // b sent only inside the hole
    expect(w.series[0]!.points).toEqual([1, null, 2, 0]);
    expect(w.totals).toEqual([{ id: "a", updates: 3 }]);
    expect(w.rangeDistinct).toBe(1);
    expect(w.holes).toEqual([{ from: T0 + H, to: T0 + 2 * H }]);
    // the daily tier: a day overlapping an hour's hole is not measured either
    const d = assembleSubmitters({ net: DED_ID, tier: "1d", fromMs: T0, toMs: T0 + 48 * H, hashes: {}, span: { from: String(T0), to: String(T0 + 50 * H) }, names: null, holes });
    expect(d.distinct).toEqual([null, 0]);
    // a hole outside the range is not carried; an unreadable field is no hole
    const far = assembleSubmitters({ net: DED_ID, tier: "1h", fromMs: T0, toMs: T0 + H, hashes: {}, span: sp, names: null, holes: { [String(T0 + 3 * H)]: String(T0 + 4 * H), x: "y" } });
    expect(far.holes).toEqual([]);
    expect(far.distinct).toEqual([0]);
  });

  it("is all null with no span; rangeDistinct is null", () => {
    const w = assembleSubmitters({ net: DED_ID, tier: "1h", fromMs: T0, toMs: T0 + 2 * H, hashes: {}, span: null, names: null });
    expect(w.measured).toBeNull();
    expect(w.distinct).toEqual([null, null]);
    expect(w.rangeDistinct).toBeNull();
    expect(w.series).toEqual([]);
  });

  it("counts organisations SEEN from the 1d tier only (a seeded, unwalked name is not seen), and dates the first", () => {
    const w = assembleSubmitters({
      net: DED_ID, tier: "1d", fromMs: T0, toMs: T0 + H, hashes: {}, span: null,
      names: { a: "{}", b: "{}" },
      yearHashes: { "sub:mainnet:x:1d:2026": { "03-05|b": "1", "02-01|c": "2" } },
    });
    expect(w.seenTotal).toBe(2); // b and c; a is only named
    expect(w.firstSeenMs).toBe(Date.UTC(2026, 1, 1));
  });
});

describe("palette", () => {
  const yh = {
    "sub:mainnet:x:1d:2025": { "12-31|k": "5" },
    "sub:mainnet:x:1d:2026": Object.fromEntries([
      ...["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => [`01-02|${id}`, String(10 + i)]),
      ["01-03|k", "5"], ["01-03|a", "0"],
    ]),
  };
  const base = { net: DED_ID, tier: "1h" as const, hashes: {}, span: null, names: null, yearHashes: yh };
  it("is the seven busiest of all time, busiest first, ties by id", () => {
    const w = assembleSubmitters({ ...base, fromMs: T0, toMs: T0 + H });
    // sums: h17 g16 f15 e14 d13 c12 b11, then a10 and k10 (tied, a first) fall past the cap
    expect(w.palette).toEqual(["h", "g", "f", "e", "d", "c", "b"]);
    expect(w.palette).toHaveLength(ORG_PALETTE_MAX);
  });
  it("is the same for two different ranges", () => {
    const a = assembleSubmitters({ ...base, fromMs: T0, toMs: T0 + H });
    const b = assembleSubmitters({ ...base, fromMs: T0 + 90 * H, toMs: T0 + 95 * H });
    expect(b.palette).toEqual(a.palette);
  });
  it("is empty for devices", () => {
    expect(assembleSubmitters({ ...base, net: DOR_ID, fromMs: T0, toMs: T0 + H }).palette).toEqual([]);
  });
});

describe("windowRange24h", () => {
  it("is the 24 whole hours ending at the current hour, whatever the span says: a stalled sampler reads unmeasured hours, never days-old figures as the last 24 hours", () => {
    expect(windowRange24h(T0 + 50 * H + 5)).toEqual({ fromMs: T0 + 26 * H, toMs: T0 + 50 * H });
    expect(windowRange24h(T0 + 50 * H)).toEqual({ fromMs: T0 + 26 * H, toMs: T0 + 50 * H });
  });
});
