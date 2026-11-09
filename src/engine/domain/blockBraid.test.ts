import { describe, it, expect } from "vitest";
import { LINK_BEND, LINK_SAMPLES, STRETCH_WORDS_MIN, blockPlace, forkSpread, referenceSegments, sCurve, silentRun, stretchLabel } from "./blockBraid";

describe("forkSpread — a layered DAG drawing on the chamber's time axis, its forks opening up and down", () => {
  const b = (hash: string, height: number, ord: number, parents: string[] = []) => ({ hash, height, ord, parents });
  it("lays a straight chain on the centre line (y = the band's centre)", () => {
    const z = forkSpread([b("a", 1, 10), b("b", 2, 11, ["a"]), b("c", 3, 12, ["b"])], 1);
    expect([z.get("a"), z.get("b"), z.get("c")]).toEqual([0, 0, 0]);
  });
  it("splits two siblings symmetrically around their parent, one spacing above and one below", () => {
    const z = forkSpread([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"])], 1.5);
    expect([z.get("s1"), z.get("s2")]).toEqual([-1.5, 1.5]);
  });
  it("brings a child of both siblings back to the centre line (the diamond closes)", () => {
    const z = forkSpread([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s1", "s2"])], 1);
    expect(z.get("c")).toBe(0);
  });
  it("takes the barycenter of the parents it can place, and the centre line with none", () => {
    const z = forkSpread([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s2", "gone"]), b("o", 5, 14, ["away"])], 1);
    expect(z.get("c")).toBe(1);
    expect(z.get("o")).toBe(0);
  });
  it("keeps every block it placed before where it stands, so a newer block moves no older one", () => {
    const base = [b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s1"])];
    const before = forkSpread(base, 1);
    const after = forkSpread([...base, b("n", 4, 20, ["c"])], 1, before);
    for (const h of ["a", "s1", "s2", "c"]) expect(after.get(h)).toBe(before.get(h));
    expect(after.get("n")).toBe(before.get("c"));
  });
  it("moves no block when the window's OLDEST block leaves it", () => {
    const before = forkSpread([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s2"])], 1);
    const after = forkSpread([b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s2"])], 1, before);
    for (const h of ["s1", "s2", "c"]) expect(after.get(h)).toBe(before.get(h));
  });
  it("seats a sibling that arrives later in the nearest free place around the barycenter", () => {
    const before = forkSpread([b("a", 1, 10), b("s1", 2, 11, ["a"])], 1);
    expect(before.get("s1")).toBe(0);
    const after = forkSpread([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"])], 1, before);
    expect([after.get("s1"), after.get("s2")]).toEqual([0, 1]);
  });
  it("seats a block on the LATTICE nearest its parents' mean, so the spread never decays into fractions", () => {
    // Two parents a lane apart: the mean (0.5) rounds to a lattice place, and repeated averaging
    // down a long chain cannot shrink every fork to a sliver of a lane (found live, D8).
    const z = forkSpread([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s2", "a"])], 1);
    expect(Number.isInteger(z.get("c"))).toBe(true);
    // A half rounds toward the centre line (review N2): the centre and the lane above merge ON it.
    expect(z.get("c")).toBe(0);
  });
  it("rounds a merge SYMMETRICALLY: a merge with the lane above and its mirror below land the same distance from the centre (N2)", () => {
    // s1 stands below (−1), s2 above (+1). The centre block `a` merges with each in turn.
    const up = forkSpread([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s2", "a"])], 1);
    const down = forkSpread([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s1", "a"])], 1);
    expect([up.get("s1"), up.get("s2")]).toEqual([-1, 1]);
    expect(Math.abs(up.get("c")!)).toBe(Math.abs(down.get("c")!));
    expect(up.get("c")).toBe(0);
    expect(down.get("c")).toBe(0);
    expect(Object.is(down.get("c"), -0)).toBe(false);
    // Off the centre too: lanes +1 and +2 merge onto +1, and their mirror −1 and −2 onto −1.
    const far = (lo: number, hi: number) => {
      const prior = new Map([["p", lo], ["q", hi]]);
      return forkSpread([b("p", 1, 10), b("q", 1, 11), b("c", 2, 12, ["p", "q"])], 1, prior).get("c");
    };
    expect(far(1, 2)).toBe(1);
    expect(far(-1, -2)).toBe(-1);
  });
  it("a long chain merging a side lane, above then below, does not drift off the centre line (N2)", () => {
    // The main chain m0 → m1 → …; each m_i merges m_(i−1) with a sibling standing a lane ABOVE on odd
    // steps and a lane BELOW on even ones (seated through `prior`, as a later-read sibling is). Every
    // merge is a half: the main chain must stay on 0 — `Math.round` lifted it a lane on the first
    // merge above, and the chain then rode off-centre.
    const blocks: { hash: string; height: number; ord: number; parents: string[] }[] = [b("m0", 0, 0)];
    const prior = new Map<string, number>([["m0", 0]]);
    for (let i = 1; i <= 12; i++) {
      prior.set(`f${i}`, i % 2 ? 1 : -1);
      blocks.push(b(`f${i}`, 2 * i - 1, 2 * i - 1, [`m${i - 1}`]));
      blocks.push(b(`m${i}`, 2 * i, 2 * i, [`m${i - 1}`, `f${i}`]));
    }
    const z = forkSpread(blocks, 1, prior);
    const main = Array.from({ length: 13 }, (_, i) => z.get(`m${i}`)! + 0);
    expect(main).toEqual(Array(13).fill(0));
  });
  it("waits to place a block while a parent's read is still pending", () => {
    const z = forkSpread([b("c", 3, 13, ["p"])], 1, new Map(), new Set(["p"]));
    expect(z.has("c")).toBe(false);
  });
});
describe("referenceSegments — every reference a read states", () => {
  const b = (hash: string, parents: string[]) => ({ hash, height: 1, parents: parents.map((p) => ({ hash: p, height: 0 })), txCount: 1, amount: 1, fee: 0, signers: 3, transfers: [] });
  const at = (h: string) => (h === "p1" ? [0, 0, 0] as const : h === "c" ? [2, 0, 1] as const : null);
  it("runs a segment to every parent placed, child first, naming both ends", () => {
    const r = referenceSegments([b("c", ["p1"])], at, -6);
    expect(Array.from(r.pos)).toEqual([2, 0, 1, 0, 0, 0]);
    expect(r.ends).toEqual(["c", "p1"]);
  });
  it("runs a STUB toward a parent outside the window: the older side, at the block's own z, its far end unnamed", () => {
    const r = referenceSegments([b("c", ["p1", "gone"])], at, -6);
    expect(Array.from(r.pos.slice(6))).toEqual([2, 0, 1, -6, 0, 1]);
    expect(r.ends.slice(2)).toEqual(["c", null]);
  });
  it("draws nothing for a block not placed", () => {
    expect(referenceSegments([b("x", ["p1"])], at, -6).pos.length).toBe(0);
  });
});
describe("stretchLabel — a silent stretch's words", () => {
  it("states the run past the floor in the app's one short span, and nothing for a short gap", () => {
    expect(stretchLabel(1364, 4 * 3_600_000)).toBe("1,364 snapshots · 4h");
    expect(stretchLabel(STRETCH_WORDS_MIN, 3_600_000)).toBeNull();
    expect(stretchLabel(STRETCH_WORDS_MIN + 1, 60_000)).toMatch(/^201 snapshots · /);
  });
});

describe("silentRun", () => {
  it("states the snapshots and time between two block ticks, and nothing for adjacent ticks", () => {
    expect(silentRun(100, 859, 0, 7_920_000)).toEqual({ snapshots: 758, ms: 7_920_000 });
    expect(silentRun(100, 101, 0, 10_000)).toBeNull();
  });
});

describe("sCurve — a reference link that starts and ends horizontal", () => {
  const a = [0, 0, 0] as const;
  const b = [-10, 4, 2] as const;
  it("lands its first and last points exactly on the link's two ends, in n + 1 points", () => {
    const out: number[] = [];
    expect(sCurve(a, b, LINK_SAMPLES, out)).toBe((LINK_SAMPLES + 1) * 3);
    expect(out.slice(0, 3)).toEqual([0, 0, 0]);
    expect(out.slice(-3)).toEqual([-10, 4, 2]);
  });
  it("leaves and arrives along the trail's axis: the tangent at both ends has no height or width", () => {
    const n = 1000;
    const out: number[] = [];
    sCurve(a, b, n, out);
    const slope = (i: number, j: number) => Math.hypot(out[j * 3 + 1] - out[i * 3 + 1], out[j * 3 + 2] - out[i * 3 + 2]) / Math.abs(out[j * 3] - out[i * 3]);
    expect(slope(0, 1)).toBeLessThan(0.01);
    expect(slope(n - 1, n)).toBeLessThan(0.01);
    expect(LINK_BEND).toBeGreaterThan(0);
  });
  it("writes into a scratch buffer at an offset and says where it stopped", () => {
    const buf = new Float32Array(3 + 3 * 3);
    expect(sCurve(a, b, 2, buf, 3)).toBe(12);
    expect(Array.from(buf.slice(9))).toEqual([-10, 4, 2]);
  });
});

describe("blockPlace — a block is placed once, never moved after it is drawn", () => {
  const read = { parents: ["p"] };
  it("draws nothing while the window holds", () => {
    expect(blockPlace(true, read, false, 2)).toBeNull();
  });
  it("never draws a parentless read (a data block)", () => {
    expect(blockPlace(false, { parents: [] }, true, 0)).toBeNull();
  });
  it("stands a placed block at its place", () => {
    expect(blockPlace(false, read, false, -1)).toBe(-1);
  });
  it("waits for a read block whose parent is still in flight, rather than drawing it on the centre line", () => {
    expect(blockPlace(false, read, false, undefined)).toBeNull();
  });
  it("puts a block on the centre line only once the reads have settled (a missed read or parent)", () => {
    expect(blockPlace(false, undefined, false, undefined)).toBeNull();
    expect(blockPlace(false, undefined, true, undefined)).toBe(0);
    expect(blockPlace(false, read, true, undefined)).toBe(0);
  });
});
