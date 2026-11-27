import { describe, expect, it } from "vitest";
import { DED_ID, DOR_ID } from "@/src/data/submitters";
import { assembleSubmitters, windowRange24h } from "./assemble";
import { subField, subSlotOf } from "./keys";

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

  it("counts Dor devices exactly as a union, with no series or totals", () => {
    const hashes = hashesFor(DOR_ID, [[T0, "a", 1], [T0, "b", 4], [T0 + H, "b", 1], [T0 + H, "c", 1]]);
    const w = assembleSubmitters({
      net: DOR_ID, tier: "1h", fromMs: T0, toMs: T0 + 2 * H, hashes,
      span: { from: String(T0), to: String(T0 + 2 * H) }, names: null,
    });
    expect(w.kind).toBe("device");
    expect(w.distinct).toEqual([2, 2]);
    expect(w.rangeDistinct).toBe(3);
    expect(w.series).toEqual([]);
    expect(w.totals).toEqual([]);
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

  it("is all null with no span; rangeDistinct is null", () => {
    const w = assembleSubmitters({ net: DED_ID, tier: "1h", fromMs: T0, toMs: T0 + 2 * H, hashes: {}, span: null, names: null });
    expect(w.measured).toBeNull();
    expect(w.distinct).toEqual([null, null]);
    expect(w.rangeDistinct).toBeNull();
    expect(w.series).toEqual([]);
  });

  it("counts organisations seen from the names hash and the 1d years, and dates the first", () => {
    const w = assembleSubmitters({
      net: DED_ID, tier: "1d", fromMs: T0, toMs: T0 + H, hashes: {}, span: null,
      names: { a: "{}", b: "{}" },
      yearHashes: { "sub:mainnet:x:1d:2026": { "03-05|b": "1", "02-01|c": "2" } },
    });
    expect(w.seenTotal).toBe(3);
    expect(w.firstSeenMs).toBe(Date.UTC(2026, 1, 1));
  });
});

describe("windowRange24h", () => {
  it("is the 24 whole hours ending at the newest whole measured hour", () => {
    const r = windowRange24h({ from: String(T0), to: String(T0 + 30 * H + 1800000) }, T0 + 99 * H);
    expect(r).toEqual({ fromMs: T0 + 6 * H, toMs: T0 + 30 * H });
  });
  it("ends at the current hour when nothing is measured", () => {
    expect(windowRange24h(null, T0 + 50 * H + 5)).toEqual({ fromMs: T0 + 26 * H, toMs: T0 + 50 * H });
  });
});
