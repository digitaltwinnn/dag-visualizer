import { describe, expect, it } from "vitest";
import { addIds, decodeSketch, encodeSketch, estimate, mergeInto, newSketch } from "./sketch";

const ids = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `device-${from + i}`);
const within = (got: number, truth: number, tol = 0.05) => Math.abs(got - truth) / truth <= tol;

describe("the device sketch (R22: our own HLL, p = 12, stored as a string)", () => {
  it("estimates 1,000 / 10,000 / 100,000 distinct ids within 5%", () => {
    for (const n of [1000, 10000, 100000]) {
      const got = estimate(addIds(newSketch(), ids(0, n)));
      expect(within(got, n), `${n}: got ${got}`).toBe(true);
    }
  });

  it("an empty sketch estimates 0, and adding the same ids twice changes nothing", () => {
    expect(estimate(newSketch())).toBe(0);
    const once = addIds(newSketch(), ids(0, 500));
    const twice = addIds(addIds(newSketch(), ids(0, 500)), ids(0, 500));
    expect(twice).toEqual(once);
  });

  it("a merge is the union: it estimates the union and equals the union's own sketch byte for byte, either way round", () => {
    const a = () => addIds(newSketch(), ids(0, 6000));
    const b = () => addIds(newSketch(), ids(4000, 10000)); // 2,000 shared
    const ab = mergeInto(a(), b()), ba = mergeInto(b(), a());
    expect(ab).toEqual(addIds(newSketch(), ids(0, 10000)));
    expect(ba).toEqual(ab);
    expect(within(estimate(ab), 10000)).toBe(true);
  });

  it("encode → decode round-trips byte for byte, and the encoded value is never JSON", () => {
    const s = addIds(newSketch(), ids(0, 3000));
    const enc = encodeSketch(s);
    expect(enc.startsWith("hll12:")).toBe(true);
    expect(decodeSketch(enc)).toEqual(s);
    expect(decodeSketch(encodeSketch(newSketch()))).toEqual(newSketch());
    expect(() => JSON.parse(enc)).toThrow();
  });

  it("decodes anything it did not write as null: a wrong prefix, a wrong length, garbage", () => {
    const body = encodeSketch(newSketch()).slice("hll12:".length);
    expect(decodeSketch(`hll14:${body}`)).toBeNull();
    expect(decodeSketch(body)).toBeNull();
    expect(decodeSketch(`hll12:${Buffer.alloc(100).toString("base64")}`)).toBeNull();
    expect(decodeSketch("hll12:not*base64!")).toBeNull();
    expect(decodeSketch(`hll12:${Buffer.alloc(4096, 200).toString("base64")}`)).toBeNull(); // no rank reaches 200
    expect(decodeSketch(null)).toBeNull();
    expect(decodeSketch(42)).toBeNull();
  });
});
