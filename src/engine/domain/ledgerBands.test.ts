import { describe, it, expect } from "vitest";
import {
  UNLISTED_KEY, makeBarSpec, fillBarSpec, ribbonQuad, RIBBON_LANE_HALF,
  type RibbonQuad,
} from "./ledgerBands";
import { BAR_MAX_W, BAR_MIN_W, SEED_W, BYTE_SCALE_KB, LANE_HALF_Z } from "./ledgerLayout";
import { METAGRAPHS } from "@/src/net/current";

const KB = 1024;
const ORDER = METAGRAPHS.map((m) => m.id);
const A = ORDER[0], B = ORDER[1];

describe("fillBarSpec", () => {
  it("renders an unmeasured tick at minimum width with no bands", () => {
    const s = fillBarSpec(makeBarSpec(), null, ORDER, 4);
    expect(s.measured).toBe(false);
    expect(s.width).toBeCloseTo(BAR_MIN_W, 6);
    expect(s.bandCount).toBe(0);
    expect(s.anchored).toBe(4);
    expect(s.kb).toBe(0);
  });

  it("renders a measured tick that anchored nothing as a seam at the SEED's own footprint", () => {
    // The seam wears the seed's square (user, 2026-08-30): the two special rows share ONE shape
    // and height alone separates them — flat = unread, full = measured-empty.
    const s = fillBarSpec(makeBarSpec(), new Map(), ORDER, 0);
    expect(s.measured).toBe(true);
    expect(s.width).toBeCloseTo(SEED_W, 6);
    expect(s.z0).toBeCloseTo(-SEED_W / 2, 6);
    expect(s.bandCount).toBe(0);
  });

  it("scales width against the fixed reference and never below the seam", () => {
    const half = fillBarSpec(makeBarSpec(), new Map([[A, (BYTE_SCALE_KB / 2) * KB]]), ORDER, 1);
    expect(half.width).toBeCloseTo(BAR_MAX_W / 2, 4);
    const tiny = fillBarSpec(makeBarSpec(), new Map([[A, 1]]), ORDER, 1);
    expect(tiny.width).toBeCloseTo(BAR_MIN_W, 6);
  });

  // The WIDTH clips at the floor edge rather than rescaling the whole past — but `kb` keeps the
  // true size, because that is what the scene's SIZE column reads: the clip is a bound on the
  // drawing, never on the measurement.
  it("clips an over-reference tick at the floor edge, keeping the true size", () => {
    const s = fillBarSpec(makeBarSpec(), new Map([[A, BYTE_SCALE_KB * 12 * KB]]), ORDER, 40);
    expect(s.width).toBeCloseTo(BAR_MAX_W, 6);
    expect(s.kb).toBeCloseTo(BYTE_SCALE_KB * 12, 3);
  });

  it("lays bands proportionally, contiguously, in lane order, centered on the field", () => {
    const s = fillBarSpec(
      makeBarSpec(),
      new Map([[B, 3 * KB], [A, 1 * KB]]), // insertion order deliberately not lane order
      ORDER,
      2,
    );
    expect(s.bandCount).toBe(2);
    expect(s.bands[0].key).toBe(A);
    expect(s.bands[1].key).toBe(B);
    expect(s.z0).toBeCloseTo(-s.width / 2, 6); // centered (user, 2026-08-06)
    expect(s.bands[0].z0).toBeCloseTo(s.z0, 6);
    expect(s.bands[0].z1).toBeCloseTo(s.bands[1].z0, 6);
    expect(s.bands[1].z1).toBeCloseTo(s.z0 + s.width, 6);
    // 1:3 of the width
    expect(s.bands[0].z1 - s.bands[0].z0).toBeCloseTo(s.width / 4, 5);
  });

  it("puts unlisted bytes in a neutral band at the end", () => {
    const s = fillBarSpec(makeBarSpec(), new Map([[A, KB], [UNLISTED_KEY, KB]]), ORDER, 2);
    expect(s.bandCount).toBe(2);
    expect(s.bands[1].key).toBe(UNLISTED_KEY);
    expect(s.bands[1].z1).toBeCloseTo(s.z0 + s.width, 6);
  });

  it("reuses the same spec object and array entries across fills (event-time only)", () => {
    const s = makeBarSpec();
    const bands = s.bands;
    const first = bands[0];
    fillBarSpec(s, new Map([[A, KB], [B, KB]]), ORDER, 2);
    fillBarSpec(s, new Map([[A, KB]]), ORDER, 1);
    expect(s.bands).toBe(bands);
    expect(s.bands[0]).toBe(first);
    expect(s.bandCount).toBe(1);
  });
});

describe("ribbonQuad", () => {
  it("tapers from the lane's fixed footprint onto the band's own span", () => {
    const band = { key: A, z0: -4, z1: 2, bytes: 10 };
    const out: RibbonQuad = { topZ0: 0, topZ1: 0, botZ0: 0, botZ1: 0 };
    ribbonQuad(5, RIBBON_LANE_HALF, band, out);
    expect(out.topZ0).toBeCloseTo(5 - RIBBON_LANE_HALF, 6);
    expect(out.topZ1).toBeCloseTo(5 + RIBBON_LANE_HALF, 6);
    expect(out.botZ0).toBe(-4);
    expect(out.botZ1).toBe(2);
    expect(out).toBe(ribbonQuad(5, RIBBON_LANE_HALF, band, out));
  });

  it("keeps the lane footprint inside the field", () => {
    expect(RIBBON_LANE_HALF).toBeGreaterThan(0);
    expect(RIBBON_LANE_HALF).toBeLessThan(LANE_HALF_Z);
  });
});
