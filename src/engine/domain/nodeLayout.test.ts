import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  GOLDEN_ANGLE, lerp, smooth, discFall, fibShellPos, spreadCoLocated,
  stackSizes, STACK_MIN, STACK_MAX, ringEven, ringStackRadii, ringStackPos,
  armillaryFrame, ringFramePos, armillaryRings, armillaryPos,
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

  it("gives each KEY its own stack at a shared site (per-metagraph partition)", () => {
    const key = (d: THREE.Vector3) => `${d.x.toFixed(6)},${d.y.toFixed(6)},${d.z.toFixed(6)}`;

    // 6 nodes at the SAME point. Without keys, stackSizes(6) = [6] → ONE stack on one cell.
    const noKeyDirs = Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, 1));
    spreadCoLocated(noKeyDirs);
    expect(new Set(noKeyDirs.map(key)).size).toBe(1); // one stack = one direction

    // Same 6 nodes, keyed 'a','a','a','b','b','b' → each metagraph forms its OWN 3-chip stack on
    // its OWN honeycomb cell (two distinct directions), and each stack's levels run 0..2.
    const dirs = Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, 1));
    const keys = ["a", "a", "a", "b", "b", "b"];
    const levels: number[] = [];
    const clusters = spreadCoLocated(dirs, undefined, levels, keys);
    expect(clusters).toHaveLength(1);

    const aDirs = new Set(dirs.filter((_, i) => keys[i] === "a").map(key));
    const bDirs = new Set(dirs.filter((_, i) => keys[i] === "b").map(key));
    expect(aDirs.size).toBe(1); // all 'a' chips share one cell
    expect(bDirs.size).toBe(1); // all 'b' chips share another
    expect([...aDirs][0]).not.toBe([...bDirs][0]); // the two stacks sit on different cells
    expect(new Set(dirs.map(key)).size).toBe(2); // two stacks total, not one

    const levelsFor = (k: string) => levels.filter((_, i) => keys[i] === k).slice().sort();
    expect(levelsFor("a")).toEqual([0, 1, 2]);
    expect(levelsFor("b")).toEqual([0, 1, 2]);
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

describe("hypergraph orbital rings (redesign)", () => {
  const at = (v: THREE.Vector3) => Math.hypot(v.x, v.z);

  it("ringEven places n nodes evenly on one flat ring of radius r (y = 0)", () => {
    const n = 6, r = 3.4;
    const pos = Array.from({ length: n }, (_, i) => ringEven(i, n, r));
    for (const p of pos) {
      expect(p.y).toBe(0);
      expect(at(p)).toBeCloseTo(r, 10); // every node exactly on the ring
    }
    // even spacing: consecutive nodes are 2π/n apart
    const ang = (p: THREE.Vector3) => Math.atan2(p.z, p.x);
    const d = ((ang(pos[1]) - ang(pos[0])) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    expect(d).toBeCloseTo((2 * Math.PI) / n, 10);
  });

  it("ringStackRadii fills concentric rings from r0 by pitch until every node has a slot", () => {
    // a small count fits ONE ring
    expect(ringStackRadii(3, 4, 1.6, 0.9)).toEqual([4]);
    // a big count needs multiple rings, increasing by pitch, covering all n
    const radii = ringStackRadii(150, 4, 1.6, 0.9);
    expect(radii.length).toBeGreaterThan(1);
    radii.forEach((r, k) => expect(r).toBeCloseTo(4 + k * 1.6, 10));
    const capacity = radii.reduce((s, r) => s + Math.max(1, Math.floor((2 * Math.PI * r) / 0.9)), 0);
    expect(capacity).toBeGreaterThanOrEqual(150);
  });

  it("ringStackPos lays every node flat (y = 0) on one of the stack's ring radii", () => {
    const n = 150, r0 = 4, pitch = 1.6, gap = 0.9;
    const radii = ringStackRadii(n, r0, pitch, gap);
    for (let i = 0; i < n; i++) {
      const p = ringStackPos(i, n, r0, pitch, gap);
      expect(p.y).toBe(0);
      const onARing = radii.some((r) => Math.abs(at(p) - r) < 1e-9);
      expect(onARing).toBe(true);
    }
  });
});

describe("hypergraph armillary rings (redesign v2)", () => {
  it("armillaryFrame gives an orthonormal in-plane basis; k=0/tilt=0 is the horizontal ring", () => {
    const f = armillaryFrame(0, 3, 0);
    expect(f.t.length()).toBeCloseTo(1, 10);
    expect(f.b.length()).toBeCloseTo(1, 10);
    expect(f.t.dot(f.b)).toBeCloseTo(0, 10);
    expect(f.t.x).toBeCloseTo(1, 10); // t = (1,0,0)
    expect(f.b.z).toBeCloseTo(1, 10); // b = (0,0,1)
    expect(f.b.y).toBeCloseTo(0, 10);
  });

  it("ringFramePos puts every node exactly on the ring of radius r, in the frame's plane", () => {
    const f = armillaryFrame(1, 3, 1.15); // a tilted ring
    const n = 5, r = 3.6;
    const normal = f.t.clone().cross(f.b).normalize();
    for (let i = 0; i < n; i++) {
      const p = ringFramePos(i, n, r, f);
      expect(p.length()).toBeCloseTo(r, 10);    // same diameter
      expect(p.dot(normal)).toBeCloseTo(0, 10); // lies in the ring plane
    }
  });

  it("armillaryRings scales with count and clamps to [min, max]", () => {
    expect(armillaryRings(1)).toBe(2);                    // min
    expect(armillaryRings(150)).toBe(7);                  // max
    expect(armillaryRings(6, 10, 1, 3)).toBe(1);          // 6/10 -> 1, min 1
    expect(armillaryRings(88)).toBeGreaterThan(2);        // scales up
  });

  it("armillaryPos keeps every node on a SAME-diameter ring across distinct tilted planes", () => {
    const n = 150, r = 9, rings = 6, tilt = 1.15;
    for (let i = 0; i < n; i++) {
      expect(armillaryPos(i, n, r, rings, tilt).length()).toBeCloseTo(r, 6); // one diameter
    }
    // the `rings` frames are genuinely distinct planes (distinct normals)
    const normals = new Set<string>();
    for (let k = 0; k < rings; k++) {
      const f = armillaryFrame(k, rings, tilt);
      const nrm = f.t.clone().cross(f.b).normalize();
      normals.add(`${nrm.x.toFixed(3)},${nrm.y.toFixed(3)},${nrm.z.toFixed(3)}`);
    }
    expect(normals.size).toBe(rings);
  });
});
