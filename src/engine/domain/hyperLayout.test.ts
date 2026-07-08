import { describe, it, expect } from "vitest";
import { META_ORBIT, metaAnchor } from "./hyperLayout";

describe("metaAnchor", () => {
  it("is deterministic (same slot in, same anchor out)", () => {
    const a = metaAnchor(3, 10);
    const b = metaAnchor(3, 10);
    expect(a).toEqual(b);
  });

  it("orbits at ≥ the base radius, staggered per slot (i % 4 steps)", () => {
    for (let i = 0; i < 10; i++) {
      const { radius } = metaAnchor(i, 10);
      expect(radius).toBeCloseTo(META_ORBIT + (i % 4) * 3.2, 10);
      expect(radius).toBeGreaterThanOrEqual(META_ORBIT);
    }
  });

  it("distributes slots around the full circle (angle a = i/n · 2π)", () => {
    const n = 10;
    for (let i = 0; i < n; i++) expect(metaAnchor(i, n).a).toBeCloseTo((i / n) * Math.PI * 2, 10);
  });

  it("the xz position matches the returned angle/radius/inclination", () => {
    const { x, z, a, radius, incl } = metaAnchor(5, 10);
    expect(x).toBeCloseTo(Math.cos(a) * radius, 10);
    expect(z).toBeCloseTo(Math.sin(a) * radius * Math.cos(incl), 10);
  });
});
