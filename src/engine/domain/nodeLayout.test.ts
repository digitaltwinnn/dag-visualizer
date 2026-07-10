import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  GOLDEN_ANGLE, lerp, smooth, discFall, fibShellPos, spreadCoLocated,
  stackSizes, STACK_MIN, STACK_MAX,
} from "./nodeLayout";

describe("lerp / smooth / GOLDEN_ANGLE", () => {
  it("lerp interpolates linearly", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it("smooth is a smoothstep-shaped ease with fixed endpoints", () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBeCloseTo(0.5, 10);
  });

  it("GOLDEN_ANGLE matches the fibonacci-spacing constant", () => {
    expect(GOLDEN_ANGLE).toBeCloseTo(Math.PI * (3 - Math.sqrt(5)), 12);
  });
});

describe("discFall", () => {
  // js/globe.js:43 — THREE.MathUtils.smoothstep(facing, 0.12, 0.42)
  it("is 0 at facing=0 (edge-on)", () => {
    expect(discFall(0)).toBe(0);
  });
  it("is 1 at facing=1 (dead on)", () => {
    expect(discFall(1)).toBe(1);
  });
});

describe("fibShellPos", () => {
  // js/globe.js:225-230 inline formula, i=0 of n=10 on a shell of radius 8, flatten 1:
  // y=1, rr=0, phi=0 -> (cos(0)*0*8, 1*8*1, sin(0)*0*8) = (0, 8, 0)
  it("matches the inline formula at i=0", () => {
    const p = fibShellPos(0, 10, 8, 1);
    expect(p).toBeInstanceOf(THREE.Vector3);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(8, 10);
    expect(p.z).toBeCloseTo(0, 10);
  });

  it("matches the inline formula at the last index (y=-1)", () => {
    // i = n-1 -> y = 1 - 2 = -1, rr = 0 -> (0, -rad*flatten, 0)
    const p = fibShellPos(9, 10, 8, 1);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(-8, 10);
    expect(p.z).toBeCloseTo(0, 10);
  });

  it("applies flatten to the y component only", () => {
    const p = fibShellPos(0, 10, 8, 0.78);
    expect(p.y).toBeCloseTo(8 * 0.78, 10);
  });

  it("returns a new Vector3 each call (no shared scratch)", () => {
    const a = fibShellPos(1, 10, 8, 1);
    const b = fibShellPos(1, 10, 8, 1);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("spreadCoLocated", () => {
  const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

  it("is deterministic — same input directions produce identical output vectors", () => {
    const dirsA = [dir(1, 0, 0), dir(1, 0.001, 0), dir(1, -0.001, 0.001), dir(1, 0.002, -0.001)];
    const dirsB = dirsA.map((d) => d.clone());

    const clustersA = spreadCoLocated(dirsA);
    const clustersB = spreadCoLocated(dirsB);

    expect(dirsA.length).toBe(dirsB.length);
    dirsA.forEach((d, i) => {
      expect(d.x).toBeCloseTo(dirsB[i].x, 12);
      expect(d.y).toBeCloseTo(dirsB[i].y, 12);
      expect(d.z).toBeCloseTo(dirsB[i].z, 12);
    });
    expect(clustersA.length).toBe(clustersB.length);
  });

  it("keeps a singleton's spread at 0", () => {
    const dirs = [dir(0, 1, 0)];
    const clusters = spreadCoLocated(dirs);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(1);
    expect(clusters[0].spread).toBe(0);
  });

  it("keeps a 7-node co-located group as ONE stack at the cluster centre (honeycomb cell 0)", () => {
    // All 7 start at (nearly) the same point, well within the default groupDeg (0.8deg) —
    // ≤ STACK_MAX nodes = a single stack, so every member sits exactly on the centre cell.
    const dirs = Array.from({ length: 7 }, (_, i) =>
      dir(1, i * 0.0005, i * -0.0003),
    );
    const clusters = spreadCoLocated(dirs);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(7);
    const centre = clusters[0].center;
    for (const d of dirs) {
      const angle = Math.acos(THREE.MathUtils.clamp(d.dot(centre), -1, 1));
      expect(angle).toBeLessThanOrEqual(1e-6); // one stack: all members share the centre direction
    }
  });

  it("tiles a multi-stack group as adjacent honeycomb cells (spacingDeg apart)", () => {
    const N = 23; // stackSizes(23) -> multiple stacks
    const dirs = Array.from({ length: N }, () => new THREE.Vector3(0, 0, 1));
    const spacingDeg = 0.8;
    const clusters = spreadCoLocated(dirs, { spacingDeg });
    expect(clusters).toHaveLength(1);
    // distinct stack directions = the number of chunks; each non-centre stack sits a whole
    // multiple of ~spacing from the centre cell ring structure (adjacent cells touch).
    const uniq = new Set(dirs.map((d) => `${d.x.toFixed(6)},${d.y.toFixed(6)},${d.z.toFixed(6)}`));
    expect(uniq.size).toBe(stackSizes(N).length);
    const pitch = (spacingDeg * Math.PI) / 180;
    const centre = clusters[0].center;
    for (const d of dirs) {
      const angle = Math.acos(THREE.MathUtils.clamp(d.dot(centre), -1, 1));
      expect(angle).toBeLessThanOrEqual(pitch * 2.01); // all cells within the first two rings here
    }
  });

  it("keeps two angularly distant groups as 2 clusters", () => {
    const groupA = [dir(1, 0, 0), dir(1, 0.001, 0), dir(1, -0.001, 0)];
    const groupB = [dir(0, 1, 0), dir(0.001, 1, 0), dir(-0.001, 1, 0.001)];
    const clusters = spreadCoLocated([...groupA, ...groupB]);
    expect(clusters).toHaveLength(2);
  });
});

describe("stackSizes (chip-stack chunking)", () => {
  it("sizes always sum to K and never exceed STACK_MAX", () => {
    for (let K = 1; K <= 80; K++) {
      const sizes = stackSizes(K);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(K);
      for (const sz of sizes) {
        expect(sz).toBeGreaterThanOrEqual(1);
        expect(sz).toBeLessThanOrEqual(STACK_MAX);
      }
    }
  });

  it("a group up to STACK_MAX is one honest stack; larger groups prefer STACK_MIN.. chunks", () => {
    expect(stackSizes(3)).toEqual([3]);
    expect(stackSizes(STACK_MAX)).toEqual([STACK_MAX]);
    const sizes = stackSizes(30);
    expect(sizes.length).toBeGreaterThan(1);
    // all but at most one stack reach the preferred minimum
    expect(sizes.filter((sz) => sz < STACK_MIN).length).toBeLessThanOrEqual(1);
  });

  it("is deterministic", () => {
    expect(stackSizes(67)).toEqual(stackSizes(67));
  });
});

describe("spreadCoLocated levels (chip stacks)", () => {
  it("fills a level for every input and stacks co-located nodes 0..h-1", () => {
    const N = 23;
    const dirs = Array.from({ length: N }, () => new THREE.Vector3(0, 0, 1)); // one co-located site
    const levels: number[] = [];
    const clusters = spreadCoLocated(dirs, undefined, levels);
    expect(clusters.length).toBe(1);
    expect(levels.length).toBe(N);
    for (const l of levels) expect(l).toBeGreaterThanOrEqual(0);
    // levels per stack are contiguous from 0: the number of level-0 chips == the number of stacks,
    // and the whole set sums to the stackSizes chunking of N.
    const zeroCount = levels.filter((l) => l === 0).length;
    expect(zeroCount).toBe(stackSizes(N).length);
  });

  it("a lone node gets level 0", () => {
    const dirs = [new THREE.Vector3(1, 0, 0)];
    const levels: number[] = [];
    spreadCoLocated(dirs, undefined, levels);
    expect(levels).toEqual([0]);
  });
});
