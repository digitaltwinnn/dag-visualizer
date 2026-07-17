# View Transitions (Staged Gather Choreography) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One staged choreography for every 3D-view switch: OUT (old furniture fades, nodes fly staggered to per-network staging grids at the top of the viewport) → invisible BOUNDARY (destination layout applied) → IN (new furniture builds, nodes fly staggered to their destination positions, camera flies).

**Architecture:** A pure domain state machine (`viewTransition.ts`) owns phases/timing/stagger/furniture alphas; a pure layout module (`gatherLayout.ts`) computes per-network near-square staging grids; the scene consumes both — NodeFabric blends every instanced matrix toward its camera-anchored gather slot by the node's staggered weight, each view multiplies its furniture opacities by its `furnitureAlpha`, and the Engine drives the machine from mode changes, applying morph/`ledgerT`/spin as snapped layout parameters at the boundary. `morph` and `ledgerT` stop being flight blends.

**Tech Stack:** TypeScript, Three.js (vanilla), vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-17-view-transitions-design.md` (approved). Read it first.

## Global Constraints

- Zero-allocation render loop: per-frame code reuses construction-time scratch; event-time allocation must carry a comment.
- Engine layering (`layerBoundaries.test.ts` enforces): `domain/` imports THREE math + config + types only; `scene/` never touches store/react; `Engine.ts` is the only store bridge.
- New domain behaviour ships WITH colocated tests (`npm test` gates).
- Durations (spec): `DUR_OUT = 0.9`, `DUR_IN = 1.0`, `STAGGER_SPREAD = 0.25` — named exported constants, tuned live only in the final task.
- The choreography applies to the three 3D views (`hyper`/`geo`/`ledger`); flat views keep today's canvas fade.
- Picking is suppressed while a transition is active.
- Per-change gate: `npx tsc --noEmit && npm test` before every commit.
- The dev server is already running on http://localhost:3000 (coordinator-owned) — workers must NOT start/kill servers. Engine/scene constructor changes need a full page reload.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `domain/viewTransition.ts` — the state machine

**Files:**
- Create: `src/engine/domain/viewTransition.ts`
- Create: `src/engine/domain/viewTransition.test.ts`

**Interfaces:**
- Consumes: `smooth` from `./nodeLayout` (existing: `m*m*(3-2*m)`).
- Produces (later tasks rely on these exact names):
  - `type View3D = "hyper" | "geo" | "ledger"`
  - `DUR_OUT: 0.9`, `DUR_IN: 1.0`, `STAGGER_SPREAD: 0.25` (exported consts)
  - `class ViewTransition` with: `phase: "idle"|"out"|"in"`, `from: View3D|null`, `to: View3D|null`, `settle(view: View3D): void`, `start(from: View3D, to: View3D): void`, `tick(dt: number): boolean` (true exactly once, on the OUT→IN boundary frame), `gatherWeight(rank: number, count: number): number`, `furnitureAlpha(view: View3D): number`, `active(): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/domain/viewTransition.test.ts
import { describe, it, expect } from "vitest";
import { ViewTransition, DUR_OUT, DUR_IN, STAGGER_SPREAD } from "./viewTransition";

const settled = (v: "hyper" | "geo" | "ledger" = "hyper") => {
  const tr = new ViewTransition();
  tr.settle(v);
  return tr;
};

describe("phase sequencing", () => {
  it("is idle after settle: inactive, current view's furniture full, weight 0", () => {
    const tr = settled("geo");
    expect(tr.active()).toBe(false);
    expect(tr.furnitureAlpha("geo")).toBe(1);
    expect(tr.furnitureAlpha("hyper")).toBe(0);
    expect(tr.gatherWeight(0, 10)).toBe(0);
  });

  it("runs OUT then IN and settles on the destination", () => {
    const tr = settled("hyper");
    tr.start("hyper", "ledger");
    expect(tr.phase).toBe("out");
    // advance to just before the boundary — no flip yet
    expect(tr.tick(DUR_OUT - 0.01)).toBe(false);
    // crossing DUR_OUT fires the boundary EXACTLY once
    expect(tr.tick(0.02)).toBe(true);
    expect(tr.phase).toBe("in");
    expect(tr.tick(0.01)).toBe(false); // never twice
    // finish IN → idle, settled on the destination
    tr.tick(DUR_IN);
    expect(tr.phase).toBe("idle");
    expect(tr.to).toBe("ledger");
    expect(tr.active()).toBe(false);
    expect(tr.furnitureAlpha("ledger")).toBe(1);
  });
});

describe("gatherWeight (staggered)", () => {
  it("rank 0 leads and the last rank still completes within the phase", () => {
    const tr = settled();
    tr.start("hyper", "geo");
    tr.tick(STAGGER_SPREAD / 2); // half the spread in
    expect(tr.gatherWeight(0, 20)).toBeGreaterThan(0); // leader is flying
    expect(tr.gatherWeight(19, 20)).toBe(0); //          last hasn't started
    tr.tick(DUR_OUT - STAGGER_SPREAD / 2 - 1e-9); //     end of OUT
    expect(tr.gatherWeight(19, 20)).toBeCloseTo(1, 5); // everyone gathered
  });

  it("is monotonic and clamped to [0,1] during OUT", () => {
    const tr = settled();
    tr.start("hyper", "geo");
    let prev = -1;
    for (let i = 0; i < 30; i++) {
      tr.tick(DUR_OUT / 30);
      const w = tr.gatherWeight(5, 10);
      expect(w).toBeGreaterThanOrEqual(Math.max(0, prev));
      expect(w).toBeLessThanOrEqual(1);
      prev = w;
    }
  });

  it("runs 1 -> 0 during IN (staggered dissolve)", () => {
    const tr = settled();
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT); // boundary crossed exactly (residual 0)
    expect(tr.gatherWeight(0, 10)).toBe(1);
    tr.tick(DUR_IN / 2);
    const mid = tr.gatherWeight(0, 10);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    tr.tick(DUR_IN / 2);
    expect(tr.gatherWeight(9, 10)).toBe(0);
  });

  it("a 1-count group never divides by zero", () => {
    const tr = settled();
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT / 2);
    expect(Number.isFinite(tr.gatherWeight(0, 1))).toBe(true);
  });
});

describe("furnitureAlpha exclusivity", () => {
  it("only the from-view is lit during OUT (fading), only the to-view during IN (rising)", () => {
    const tr = settled("hyper");
    tr.start("hyper", "ledger");
    tr.tick(DUR_OUT / 2);
    expect(tr.furnitureAlpha("hyper")).toBeGreaterThan(0);
    expect(tr.furnitureAlpha("hyper")).toBeLessThan(1);
    expect(tr.furnitureAlpha("ledger")).toBe(0);
    expect(tr.furnitureAlpha("geo")).toBe(0);
    tr.tick(DUR_OUT); // into IN
    expect(tr.furnitureAlpha("hyper")).toBe(0);
    expect(tr.furnitureAlpha("ledger")).toBeGreaterThan(0);
  });

  it("the from-view reaches exactly 0 at the boundary", () => {
    const tr = settled("geo");
    tr.start("geo", "hyper");
    tr.tick(DUR_OUT);
    expect(tr.furnitureAlpha("geo")).toBe(0);
  });
});

describe("retargeting", () => {
  it("mid-OUT to a new destination just swaps `to` (gather continues uninterrupted)", () => {
    const tr = settled("hyper");
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT / 2);
    const w = tr.gatherWeight(3, 10);
    tr.start("hyper", "ledger");
    expect(tr.phase).toBe("out");
    expect(tr.to).toBe("ledger");
    expect(tr.gatherWeight(3, 10)).toBeCloseTo(w, 10); // weight untouched
  });

  it("mid-OUT back to the origin reverses into IN with weight continuity", () => {
    const tr = settled("hyper");
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT * 0.6);
    const w = tr.gatherWeight(0, 1);
    tr.start("geo", "hyper"); // user flipped back
    expect(tr.phase).toBe("in");
    expect(tr.to).toBe("hyper");
    expect(tr.gatherWeight(0, 1)).toBeCloseTo(w, 5); // no jump for the base node
  });

  it("mid-IN to a third view re-enters OUT seeded from the current weight", () => {
    const tr = settled("hyper");
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT);
    tr.tick(DUR_IN * 0.4); // 40% into IN via the real frame path (weight descending)
    const w = tr.gatherWeight(0, 1);
    tr.start("geo", "ledger");
    expect(tr.phase).toBe("out");
    expect(tr.from).toBe("geo");
    expect(tr.to).toBe("ledger");
    expect(tr.gatherWeight(0, 1)).toBeCloseTo(w, 5); // base-weight continuity
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/engine/domain/viewTransition.test.ts`
Expected: FAIL — `Cannot find module './viewTransition'`.

- [ ] **Step 3: Implement**

```ts
// src/engine/domain/viewTransition.ts
// The ONE view-transition state machine (spec: docs/superpowers/specs/
// 2026-07-17-view-transitions-design.md). Every 3D-view switch runs the staged choreography:
//   OUT  (t: 0→DUR_OUT)  — the from-view's furniture fades out while nodes fly, staggered,
//                          to the gathering grids (gatherWeight 0→1).
//   BOUNDARY (one frame)  — tick() returns true exactly once; the Engine applies the
//                          destination layout (morph snap, ledger placement, spin) while the
//                          nodes are fully gathered and both furnitures are dark.
//   IN   (t: 0→DUR_IN)   — the to-view's furniture builds while nodes fly, staggered, to
//                          their destination poses (gatherWeight 1→0); the camera flies.
// Pure and allocation-free; the scene calls gatherWeight per node per frame.
import { smooth } from "./nodeLayout";

export type View3D = "hyper" | "geo" | "ledger";

export const DUR_OUT = 0.9; //         teardown + gather, incl. the stagger spread
export const DUR_IN = 1.0; //          build + placement + camera flight
export const STAGGER_SPREAD = 0.25; // window over which node flights START (rank-ordered)

// A node's flight lasts the phase minus the spread, so the LAST starter still lands in-phase.
const FLIGHT_OUT = DUR_OUT - STAGGER_SPREAD;
const FLIGHT_IN = DUR_IN - STAGGER_SPREAD;

export class ViewTransition {
  phase: "idle" | "out" | "in" = "idle";
  from: View3D | null = null;
  to: View3D | null = null; // while idle: the SETTLED view
  private t = 0;

  // Adopt `view` as the settled state with no animation (boot, or a non-3D interlude).
  settle(view: View3D): void {
    this.phase = "idle";
    this.from = null;
    this.to = view;
    this.t = 0;
  }

  active(): boolean {
    return this.phase !== "idle";
  }

  // Begin or RETARGET a transition (spec: no teleports — weights stay continuous).
  start(from: View3D, to: View3D): void {
    if (this.phase === "idle") {
      this.from = from;
      this.to = to;
      this.phase = "out";
      this.t = 0;
      return;
    }
    if (this.phase === "out") {
      if (to === this.from) {
        // Flipped back to the origin mid-gather → reverse into IN, seeding t so the
        // UN-staggered base weight is continuous (per-node stagger reorders slightly).
        this.to = this.from;
        this.from = from;
        // Continuity inverts against FLIGHT_* (the gatherWeight denominators), NOT the raw
        // DUR_* phase lengths — inverting against DUR_* breaks the no-teleport contract.
        this.t = (1 - this.t / FLIGHT_OUT) * FLIGHT_IN;
        this.phase = "in";
      } else {
        this.to = to; // gather continues; only the destination changes
      }
      return;
    }
    // phase === "in": nodes are dispersing toward this.to — gather them again toward `to`.
    if (to === this.to) return; // already heading there
    this.from = this.to;
    this.to = to;
    this.t = (1 - this.t / FLIGHT_IN) * FLIGHT_OUT; // base-weight continuity vs the FLIGHT_* denominators (see test)
    this.phase = "out";
  }

  // Advance the clock. Returns TRUE exactly once — on the frame the OUT phase completes
  // (the boundary): the caller applies the destination layout then.
  tick(dt: number): boolean {
    if (this.phase === "idle") return false;
    this.t += dt;
    if (this.phase === "out" && this.t >= DUR_OUT) {
      this.t -= DUR_OUT;
      this.phase = "in";
      return true;
    }
    if (this.phase === "in" && this.t >= DUR_IN) {
      this.settle(this.to!);
    }
    return false;
  }

  // This frame's gather weight for the node ranked `rank` of `count` in its staging grid
  // (row-major within its network square): 0 = at its view pose, 1 = at its grid slot.
  gatherWeight(rank: number, count: number): number {
    if (this.phase === "idle") return 0;
    const delay = (rank / Math.max(1, count - 1)) * STAGGER_SPREAD;
    if (this.phase === "out") {
      return smooth(Math.min(1, Math.max(0, (this.t - delay) / FLIGHT_OUT)));
    }
    return 1 - smooth(Math.min(1, Math.max(0, (this.t - delay) / FLIGHT_IN)));
  }

  // Furniture multiplier for `view` this frame. At most one view is ever lit (spec:
  // furniture never overlaps the flight); idle lights only the settled view.
  furnitureAlpha(view: View3D): number {
    if (this.phase === "idle") return view === this.to ? 1 : 0;
    if (this.phase === "out") return view === this.from ? 1 - smooth(Math.min(1, this.t / DUR_OUT)) : 0;
    return view === this.to ? smooth(Math.min(1, this.t / DUR_IN)) : 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/domain/viewTransition.test.ts` — Expected: PASS (all).
Then: `npx tsc --noEmit && npm test` — Expected: clean, all suites green (layer-boundary test must accept the new domain file: it imports only `./nodeLayout`).

- [ ] **Step 5: Commit**

```bash
git add src/engine/domain/viewTransition.ts src/engine/domain/viewTransition.test.ts
git commit -m "feat(transition): the view-transition state machine (out/boundary/in, stagger, furniture alphas)"
```

---

### Task 2: `domain/gatherLayout.ts` — the staging grids

**Files:**
- Create: `src/engine/domain/gatherLayout.ts`
- Create: `src/engine/domain/gatherLayout.test.ts`

**Interfaces:**
- Produces (Task 3/4 rely on these exact names):
  - `interface GatherSlot { u: number; v: number; rank: number; count: number }` — `u` in CELL units centred on 0 (x-axis of the staging row), `v` in cell units, 0 at the top edge, increasing DOWNWARD as negative values (`v = -(row + 0.5)`), `rank` = row-major index within the network's grid (the stagger rank), `count` = the network's node count.
  - `function gatherSlots(groups: { id: string; count: number }[]): Map<string, GatherSlot[]>` — one entry per group id, slots in rank order.
  - `const GATHER_GUTTER = 1.5` — empty cells between adjacent network squares.

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/domain/gatherLayout.test.ts
import { describe, it, expect } from "vitest";
import { gatherSlots, GATHER_GUTTER } from "./gatherLayout";

describe("gatherSlots", () => {
  it("gives every node exactly one slot, rank-ordered row-major", () => {
    const m = gatherSlots([{ id: "dag", count: 5 }]);
    const s = m.get("dag")!;
    expect(s).toHaveLength(5);
    s.forEach((slot, i) => {
      expect(slot.rank).toBe(i);
      expect(slot.count).toBe(5);
    });
    // 5 nodes → cols = ceil(√5) = 3: ranks 0..2 on row 0, 3..4 on row 1
    expect(s[0].v).toBe(s[2].v);
    expect(s[3].v).toBeLessThan(s[0].v); // rows grow DOWNWARD (negative v)
  });

  it("grids are near-square: cols = ceil(sqrt(n))", () => {
    const s = gatherSlots([{ id: "dor", count: 21 }]).get("dor")!;
    const cols = new Set(s.map((x) => x.u)).size;
    expect(cols).toBe(5); // ceil(√21)
  });

  it("a big network's square is visibly wider than a small one's (DAG rule)", () => {
    const m = gatherSlots([
      { id: "dag", count: 164 },
      { id: "paca", count: 3 },
    ]);
    const width = (slots: { u: number }[]) =>
      Math.max(...slots.map((s) => s.u)) - Math.min(...slots.map((s) => s.u));
    expect(width(m.get("dag")!)).toBeGreaterThan(width(m.get("paca")!) * 3);
  });

  it("packs groups left-to-right sorted by count desc with the gutter, centred on u=0", () => {
    const m = gatherSlots([
      { id: "small", count: 4 }, // 2×2
      { id: "big", count: 16 }, // 4×4 — sorts FIRST despite input order
    ]);
    const big = m.get("big")!, small = m.get("small")!;
    const bigMax = Math.max(...big.map((s) => s.u));
    const smallMin = Math.min(...small.map((s) => s.u));
    expect(smallMin - bigMax).toBeCloseTo(GATHER_GUTTER + 1, 10); // gutter between edge cells
    // centred: overall extent symmetric about 0
    const allU = [...big, ...small].map((s) => s.u);
    expect(Math.max(...allU) + Math.min(...allU)).toBeCloseTo(0, 10);
  });

  it("is deterministic and skips zero-count groups", () => {
    const a = gatherSlots([{ id: "x", count: 7 }, { id: "empty", count: 0 }]);
    const b = gatherSlots([{ id: "x", count: 7 }, { id: "empty", count: 0 }]);
    expect(a.get("x")).toEqual(b.get("x"));
    expect(a.has("empty")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/engine/domain/gatherLayout.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/engine/domain/gatherLayout.ts
// The staging-grid layout for the view-transition choreography (spec 2026-07-17): each
// network's nodes gather into one near-square grid ("a small coloured square" — the nodes
// ARE the pixels, identity-hued), squares packed in a row sorted by size, so the DAG's big
// block reads next to the small metagraphs'. Pure 2D CELL units; the scene maps cells onto a
// camera-anchored plane at the top of the viewport per frame. Event-time only (data
// rebuilds) — allocation here is fine.

export interface GatherSlot {
  u: number; //     x, in cell units, centred on 0 across the whole staging row
  v: number; //     y, in cell units; 0 = top edge, rows DOWNWARD: v = -(row + 0.5)
  rank: number; //  row-major index within the network's grid — the stagger rank
  count: number; // the network's node count (stagger denominator)
}

export const GATHER_GUTTER = 1.5; // empty cells between adjacent network squares

export function gatherSlots(groups: { id: string; count: number }[]): Map<string, GatherSlot[]> {
  const live = groups.filter((g) => g.count > 0).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  // First pass: each group's grid dims + the packed row's total width (in cells).
  const dims = live.map((g) => {
    const cols = Math.ceil(Math.sqrt(g.count));
    return { g, cols, rows: Math.ceil(g.count / cols) };
  });
  const totalW = dims.reduce((w, d) => w + d.cols, 0) + GATHER_GUTTER * Math.max(0, dims.length - 1);
  // Second pass: slots, packed left→right starting at -totalW/2.
  const out = new Map<string, GatherSlot[]>();
  let x0 = -totalW / 2;
  for (const { g, cols } of dims) {
    const slots: GatherSlot[] = [];
    for (let i = 0; i < g.count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      slots.push({ u: x0 + col + 0.5, v: -(row + 0.5), rank: i, count: g.count });
    }
    out.set(g.id, slots);
    x0 += cols + GATHER_GUTTER;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/domain/gatherLayout.test.ts` — PASS. Then `npx tsc --noEmit && npm test` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/domain/gatherLayout.ts src/engine/domain/gatherLayout.test.ts
git commit -m "feat(transition): per-network staging grids (near-square, packed, deterministic)"
```

---

### Task 3: NodeFabric — the gather blend on both instanced write loops

**Files:**
- Modify: `src/engine/scene/objects/NodeFabric.ts` (the `FrameCtx` interface; `writeValidatorFrame`; `writeMetaFrame`)
- Modify: `src/engine/scene/Globe.ts` (the persistent `_ctx` literal in the constructor, ~line 191)
- Modify: `src/engine/domain/records.ts` (gather fields on both record types)

**Interfaces:**
- Consumes: `ViewTransition.gatherWeight(rank, count)` (Task 1).
- Produces: `FrameCtx` gains `transition: ViewTransition | null` and `gather: { origin: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; cell: number }` (persistent objects, written per frame by Globe in Task 4; `cell` = world size of one grid cell). Record types gain `gU: number; gV: number; gRank: number; gCount: number` (default 0; assigned event-time in Task 4).

- [ ] **Step 1: Add the record fields**

In `src/engine/domain/records.ts`, add to BOTH `ValidatorRecord` and `MetaNodeRecord`:

```ts
  // Staging-grid slot for the view-transition choreography (domain/gatherLayout, assigned
  // event-time by Globe when the node set is (re)built): cell-unit position + stagger rank.
  gU: number;
  gV: number;
  gRank: number;
  gCount: number;
```

Initialize them to `0` wherever Globe constructs the records (Grep `roles:` / the record-literal sites in `Globe.ts` — both the validator build loop and the metagraph build loop; add `gU: 0, gV: 0, gRank: 0, gCount: 0,` to each literal).

- [ ] **Step 2: Extend FrameCtx**

In `NodeFabric.ts`, add to the `FrameCtx` interface (after `dimScaleMetaV`):

```ts
  // View-transition inputs (persistent objects; Globe writes them each frame):
  transition: import("../../domain/viewTransition").ViewTransition | null;
  gather: { origin: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; cell: number };
```

Use a top-of-file `import type { ViewTransition } from "../../domain/viewTransition";` instead of the inline import type. In `Globe.ts`'s `_ctx` constructor literal add:

```ts
      transition: null,
      gather: { origin: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), cell: 0.55 },
```

- [ ] **Step 3: Blend in both write loops**

Add ONE module-scope scratch next to the existing `_vec`/`_geoVec` scratch in `NodeFabric.ts`:

```ts
const _gatherV = new THREE.Vector3(); // scratch: a node's world-space staging-grid position
```

In `writeValidatorFrame`, immediately BEFORE `_dummy.updateMatrix()` is called for the sphere AND for the hex (i.e. after `_dummy.position` and `_dummy.scale` are final for each mesh), insert the shared blend — factor it as a small private method so both loops and both meshes use one code path:

```ts
  // Blend the composed pose toward the node's staging-grid slot by its staggered gather
  // weight (view-transition choreography). Runs on the already-final _dummy pose so it is
  // the LAST word on position/scale; ctx.gather's vectors are group-LOCAL (Globe converts
  // the camera-anchored plane once per frame). Uniform GATHER_SCALE reads as tidy grid dots.
  private _applyGather(ctx: FrameCtx, gU: number, gV: number, rank: number, count: number): void {
    const tr = ctx.transition;
    if (!tr || !tr.active()) return;
    const w = tr.gatherWeight(rank, count);
    if (w <= 0) return;
    _gatherV
      .copy(ctx.gather.origin)
      .addScaledVector(ctx.gather.right, gU * ctx.gather.cell)
      .addScaledVector(ctx.gather.up, gV * ctx.gather.cell);
    _dummy.position.lerp(_gatherV, w);
    const s = 1 + (GATHER_SCALE / Math.max(1e-6, _dummy.scale.x) - 1) * w;
    _dummy.scale.multiplyScalar(s);
  }
```

with a module constant near `META_REST_SCALE`:

```ts
const GATHER_SCALE = 0.22; // uniform node size at the staging grid (tidy, equal pixels)
```

Call it in `writeValidatorFrame` before EACH `updateMatrix()` (`this._applyGather(ctx, u.gU, u.gV, u.gRank, u.gCount)`) and in `writeMetaFrame` before each `updateMatrix()` (`this._applyGather(ctx, r.gU, r.gV, r.gRank, r.gCount)`) — including the ledger branch's chip write (nodes must gather out of the ledger too). Zero-scaled (hidden) meshes can skip it: only apply where the written scale is non-zero.

- [ ] **Step 4: Gate + test**

`npx tsc --noEmit && npm test` — all suites green (no behaviour change yet: `transition` is null everywhere).
Load http://localhost:3000 (full reload) — all three views render exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/engine/scene/objects/NodeFabric.ts src/engine/scene/Globe.ts src/engine/domain/records.ts
git commit -m "feat(transition): gather blend plumbed through both instanced write loops (inert)"
```

---

### Task 4: Globe — gather slots on build, the camera-anchored plane, geo furniture alpha

**Files:**
- Modify: `src/engine/scene/Globe.ts`

**Interfaces:**
- Consumes: `gatherSlots` (Task 2); `ViewTransition` (Task 1); `FrameCtx.gather` (Task 3).
- Produces (Engine relies on): `Globe.transition: ViewTransition | null` (public field, set once by the Engine); `Globe.setGatherFrame(origin: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void` (world-space in, stored group-LOCAL); `Globe.applyLedgerLayout(on: boolean): void` (replaces `setLedger` — snaps `ledgerT`/spin at the boundary).

- [ ] **Step 1: Assign gather slots at build time**

In the method where BOTH record arrays exist after a (re)build (the end of `setMetagraphs` — it runs after `setNodes` on every data pass; Grep `_buildDensityGlow()` at ~line 421 and insert immediately before it), add:

```ts
    // Staging-grid slots for the view-transition choreography (event-time: data rebuilds).
    const groups = [{ id: "dag", count: this.nodes.length }];
    const byMeta = new Map<string, typeof this.metaNodes>();
    for (const r of this.metaNodes) {
      let a = byMeta.get(r.metaId);
      if (!a) byMeta.set(r.metaId, (a = []));
      a.push(r);
    }
    for (const [id, arr] of byMeta) groups.push({ id, count: arr.length });
    const slots = gatherSlots(groups);
    const dagSlots = slots.get("dag");
    if (dagSlots) this.nodes.forEach((u, i) => { const s = dagSlots[i]; u.gU = s.u; u.gV = s.v; u.gRank = s.rank; u.gCount = s.count; });
    for (const [id, arr] of byMeta) {
      const ss = slots.get(id);
      if (ss) arr.forEach((r, i) => { const s = ss[i]; r.gU = s.u; r.gV = s.v; r.gRank = s.rank; r.gCount = s.count; });
    }
```

(import `gatherSlots` from `../domain/gatherLayout`.)

- [ ] **Step 2: The transition ref + the group-local gather frame**

Add fields + setters:

```ts
  transition: import("../domain/viewTransition").ViewTransition | null = null;

  // The camera-anchored staging plane, converted to group-LOCAL once per frame (the
  // instanced matrices are written in group space). World-space in.
  setGatherFrame(origin: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    const g = this._ctx.gather;
    g.origin.copy(origin);
    this.group.worldToLocal(g.origin);
    g.right.copy(right).transformDirection(this._groupInv());
    g.up.copy(up).transformDirection(this._groupInv());
  }
```

where `_groupInv()` returns a construction-time scratch `Matrix4` updated per call: `this._invM.copy(this.group.matrixWorld).invert()` (add `private _invM = new THREE.Matrix4();`). In `_frameCtx`, add `ctx.transition = this.transition;` (the `gather` object is already the persistent one).

- [ ] **Step 3: Retire the setLedger pin → boundary-applied layout**

Replace `setLedger` (Globe.ts:816-825) with:

```ts
  // BOUNDARY-applied ledger layout (view-transition choreography): called by the Engine at
  // the invisible mid-transition boundary — nodes are gathered, so the snap can't be seen.
  // ledgerT stopped being an eased flight; it is now a pure layout parameter (the IN-phase
  // flight is the gather dissolve).
  applyLedgerLayout(on: boolean): void {
    this.ledger = on;
    if (on) {
      this.group.rotation.set(0, 0, 0);
      this.ledgerT = 1;
    } else {
      this.ledgerT = 0;
    }
  }
```

and DELETE the `ledgerT` easing branch in `update()` (Globe.ts:893-896, the `if (this.ledger) { this.ledgerT += ...; rotation.set(0,0,0) }` block) — replace it with `if (this.ledger) { this.group.rotation.set(0, 0, 0); } else if (this.spin) { ... }` (keep the spin chain otherwise intact).

- [ ] **Step 4: Geo furniture alpha**

In `setMorph` (Globe.ts:827+), multiply the geo furniture by the transition's alpha. At the top of the method add:

```ts
    const vAlpha = this.transition ? this.transition.furnitureAlpha("geo") : 1;
```

then change the two gate lines to ride it:

```ts
    const surf = this.ledger ? 0 : surfFade(m) * vAlpha;
    const extras = this.ledger ? 0 : extrasFade(m) * vAlpha;
```

(everything downstream — geoFades, density pools, walls, roses, arcs — already multiplies `surf`/`extras`, so this is the single choke point.)

- [ ] **Step 5: Gate + commit**

`npx tsc --noEmit && npm test`; grep check: `grep -n "setLedger" src/engine/Engine.ts src/engine/scene/Globe.ts` — the Engine still calls `globe.setLedger` (fixed in Task 7); temporarily keep a one-line alias so the build stays green:

```ts
  setLedger(on: boolean): void { this.applyLedgerLayout(on); } // TEMP alias — removed in the Engine wiring task
```

```bash
git add src/engine/scene/Globe.ts
git commit -m "feat(transition): globe gather slots + camera-anchored frame + boundary ledger layout"
```

---

### Task 5: HyperView — view alpha + OUT blackout

**Files:**
- Modify: `src/engine/scene/views/HyperView.ts`

**Interfaces:**
- Produces (Engine relies on): `HyperView.setViewAlpha(a: number): void` — 0..1 multiplier over ALL hyper furniture.

- [ ] **Step 1: The alpha field + setter**

```ts
  private _viewAlpha = 1; // furnitureAlpha("hyper") — the view-transition build/teardown fade

  // The view-transition furniture multiplier (Engine, per frame). At 0 the spot is also
  // blacked out — a lit stage light over dark furniture is the lingering-light bug class.
  setViewAlpha(a: number): void {
    this._viewAlpha = a;
    if (a <= 0.001) this._spot.blackout();
  }
```

- [ ] **Step 2: Thread the multiplier**

In `update()`, every per-frame opacity/emissive write multiplies by `this._viewAlpha`. Find the write sites with `grep -n "opacity\|emissiveIntensity" src/engine/scene/views/HyperView.ts` and multiply each per-frame assignment in `update()` (NOT the constructor base values): the core material fade (`coreReveal` application), hub `emissiveIntensity`/material opacity writes, hoop material opacity writes (the `HOOP_OP` application), fill opacity writes (`FILL_OP`), tether opacity writes, packet opacity writes, and the spot's fade argument (`this._spot.update(dt, on, fade * this._viewAlpha)`). Pattern for each site: `mat.opacity = <existing expression> * this._viewAlpha;`. The dial-in effect must reach ZERO at alpha 0 — after the edit, set `_viewAlpha = 0` temporarily in the constructor and verify the hyper view renders NOTHING but nodes; revert the temporary value.

- [ ] **Step 3: Gate + commit**

`npx tsc --noEmit && npm test`; full-reload visual check: hyper renders as before (alpha rests at 1).

```bash
git add src/engine/scene/views/HyperView.ts
git commit -m "feat(transition): hyper furniture rides the view alpha (spot blacks out at 0)"
```

---

### Task 6: LedgerView — the build-in reveal

**Files:**
- Modify: `src/engine/scene/views/LedgerView.ts`

**Interfaces:**
- Produces (Engine relies on): `LedgerView.setViewAlpha(a: number): void` — 0..1; also gates `group.visible` (`visible = a > 0.001 && <existing conditions>`).

- [ ] **Step 1: Field + setter (same shape as Task 5)**

```ts
  private _viewAlpha = 1;

  setViewAlpha(a: number): void {
    this._viewAlpha = a;
    this.group.visible = a > 0.001;
    if (a <= 0.001) this._spot.blackout();
  }
```

- [ ] **Step 2: Thread the multiplier**

`grep -n "opacity\|setColorAt\|emissiveIntensity" src/engine/scene/views/LedgerView.ts` — multiply every PER-FRAME write in `update()`/the per-tick refresh by `this._viewAlpha`: the pane material opacity, the floor-label opacities, trail-block opacity targets (`sel ? 0.95 : 0.88 * slotFade` → `(sel ? 0.95 : 0.88 * slotFade(t.slot)) * this._viewAlpha`), tile brightness (`bright` factor → `bright * this._viewAlpha`), dial opacities (`DIAL_REST_OP` applications), link/pulse brightness, and the spot fade. Same zero-check as Task 5: with alpha forced 0 the chamber is fully dark (only the reused nodes render); revert.

- [ ] **Step 3: Gate + commit**

`npx tsc --noEmit && npm test`; visual: Snapshots renders as before at alpha 1.

```bash
git add src/engine/scene/views/LedgerView.ts
git commit -m "feat(transition): ledger chamber rides the view alpha (real build-in/teardown)"
```

---

### Task 7: Engine — drive the machine

**Files:**
- Modify: `src/engine/Engine.ts`

**Interfaces:**
- Consumes: everything above. Removes the TEMP `Globe.setLedger` alias (call `applyLedgerLayout` at the boundary instead).

- [ ] **Step 1: Own the machine**

```ts
  private transition = new ViewTransition();
  private _gatherO = new THREE.Vector3(); // scratch: staging-plane origin (world)
  private _gatherR = new THREE.Vector3();
  private _gatherU2 = new THREE.Vector3();
  private _pendingBoundary: Mode | null = null; // destination whose layout applies at the boundary
```

Constructor (after `this.globe` exists): `this.globe.transition = this.transition; this.transition.settle(this.mode === "geo" ? "geo" : this.mode === "ledger" ? "ledger" : "hyper");`

- [ ] **Step 2: Mode switch → start()**

In `_applyMode` (the mode-subscription handler, Engine.ts ~440): the current code calls `this.layers.setLedger(inLedger)` / `this.globe.setLedger(inLedger)` immediately (lines 450-452) and then runs per-mode camera/layout blocks. Restructure:

```ts
    const is3D = (m: Mode): m is View3D => m === "hyper" || m === "geo" || m === "ledger";
    if (is3D(prevMode) && is3D(mode) && prevMode !== mode) {
      this.transition.start(prevMode, mode);
      this._pendingBoundary = mode;
      // Camera + destination layout wait for the boundary; filters/policies apply now.
    } else if (is3D(mode)) {
      this.transition.settle(mode); //   from/to a flat view: no choreography (canvas fades)
      this._applyDestLayout(mode); //    immediate, as today
    }
```

Extract the CURRENT per-mode layout+camera code (the `layers.setLedger`/`globe.setLedger` calls, the `mode === "ledger"` block lines 463-476, and the hyper/geo camera-focus calls further down) into one private `_applyDestLayout(mode: Mode)` — moved verbatim, with `globe.setLedger(inLedger)` replaced by `globe.applyLedgerLayout(inLedger)` (delete the TEMP alias in Globe). Everything else in `_applyMode` (policy flags, sims, filter reassertion, country clear, pick-hint state) stays immediate.

- [ ] **Step 3: The render loop**

In the render loop, after the bloom block and BEFORE the morph easing (Engine.ts ~913):

```ts
      // ---- view-transition choreography ------------------------------------------------
      if (this.transition.tick(dt) && this._pendingBoundary) {
        // The BOUNDARY: nodes gathered, both furnitures dark — apply the destination
        // layout + start the camera flight, all invisible.
        const dest = this._pendingBoundary;
        this._pendingBoundary = null;
        if (dest === "geo") this.morph = 1;
        if (dest === "hyper") this.morph = 0;
        this._applyDestLayout(dest);
      }
      // The staging plane: top of the viewport, camera-anchored (world space; Globe
      // converts to group-local). Height/depth from the camera frustum so it reads the
      // same at any pose. GATHER_DIST/TOP_FRAC are Engine-local named constants.
      if (this.transition.active()) {
        this.ctx.camera.getWorldDirection(this._gatherR); // reuse as fwd temporarily
        this._gatherO.copy(this.ctx.camera.position).addScaledVector(this._gatherR, GATHER_DIST);
        this._gatherU2.copy(this.ctx.camera.up).normalize();
        const h = Math.tan(THREE.MathUtils.degToRad(this.ctx.camera.fov / 2)) * GATHER_DIST;
        this._gatherO.addScaledVector(this._gatherU2, h * GATHER_TOP_FRAC);
        this._gatherR.cross(this._gatherU2).normalize(); // fwd × up = screen-LEFT in three.js
        this._gatherR.negate(); //                          → screen-right (+u must run rightward)
        this.globe.setGatherFrame(this._gatherO, this._gatherR, this._gatherU2);
      }
```

with module constants `const GATHER_DIST = 34;` (staging plane depth) and `const GATHER_TOP_FRAC = 0.62;` (fraction of the half-height up from centre — the top band). NB compute right as `fwd × up` then orient so +u runs screen-right; verify on screen and fix the sign ONCE (leave a comment).

Then change the morph line (Engine.ts:916-917) to freeze during transitions (the boundary snaps it):

```ts
      const target = policy.morph === "toGeo" ? 1 : policy.morph === "frozen" ? this.morph : 0;
      if (!this.transition.active()) this.morph += (target - this.morph) * Math.min(1, dt * 1.1);
```

Feed the alphas each frame (right after the morph block):

```ts
      this.layers.setViewAlpha(this.transition.furnitureAlpha("hyper"));
      this.ledger.setViewAlpha(this.transition.furnitureAlpha("ledger"));
      // geo's alpha is read inside globe.setMorph via globe.transition
```

Keep `this.ledger.update(dt)` running while `mode === "ledger" || this.transition.from === "ledger" || this.transition.to === "ledger"` (the teardown/build must animate; adjust the existing `if (mode === "ledger")` gate around `_refreshLedger`/`ledger.update`).

`layers.root.visible` (Engine.ts:918): change to also stay visible during transitions: `this.layers.root.visible = this.morph < 0.985 || this.transition.active();`

- [ ] **Step 4: Suppress picking mid-flight**

In `_pickablesFor` (or at the top of `_handleClick`/`_handleMove`'s pick path), early-return nothing while `this.transition.active()` — one line each, commented `// nodes are mid-flight; raycasting moving targets misleads (spec)`.

- [ ] **Step 5: Gate + visual + commit**

`npx tsc --noEmit && npm test`. Full-reload visual pass (this is the first task where the choreography is LIVE):
- hyper→geo: hyper furniture fades, nodes assemble into top-of-view squares (DAG big), boundary, globe builds while nodes fly down; camera flies during IN.
- geo→ledger, ledger→hyper: same shape; no lingering furniture, no teleports, ~2s total.
- Mid-transition view switch (double-click through the switcher): retargets without jumps.

```bash
git add src/engine/Engine.ts src/engine/scene/Globe.ts
git commit -m "feat(transition): engine drives the staged gather choreography end-to-end"
```

---

### Task 8: Live tuning + reduced-motion + phone check

**Files:**
- Modify (values only): `src/engine/domain/viewTransition.ts`, Engine's `GATHER_DIST`/`GATHER_TOP_FRAC`, NodeFabric's `GATHER_SCALE`.

- [ ] **Step 1:** Drive all six 3D transitions in the browser (chrome-devtools MCP; JPEG@50 screenshots, script-clicks). Judge: legibility of the squares, stagger readability, total wait. Adjust `DUR_OUT`/`DUR_IN`/`STAGGER_SPREAD`/`GATHER_*` constants — keep total ≤ 2s (spec: balanced, not waited-for). Update the constants' comments with the tuned rationale.
- [ ] **Step 2:** Phone breakpoint (narrow viewport): squares must fit the width — if the row overflows, reduce `cell` (the `FrameCtx.gather.cell` default in Globe) proportionally to `camera.aspect` in the Engine's staging-plane block (one line: `this.globe.setGatherCell(baseCell * Math.min(1, aspect / 1.6))` — add the trivial setter).
- [ ] **Step 3:** `npx tsc --noEmit && npm test`, commit:

```bash
git add -A && git commit -m "tune(transition): timing/staging constants from live review"
```

---

### Task 9: Docs — CLAUDE.md + README + progress ledger

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: CLAUDE.md** — rewrite the stale contracts:
  - The overview's "Only `hyper`↔`geo` morph … the blue L0 core literally grows out into the globe" paragraph → describe the staged gather choreography (all three 3D pairs; morph/ledgerT are boundary-applied layout parameters; OUT/boundary/IN with durations; the staging grids; stagger).
  - The Snapshots section's "appears already-formed — no entry animation" bullet → the build-in reveal.
  - The `domain/` module list → add `viewTransition.ts` + `gatherLayout.ts` one-liners.
  - The `dimModel.ts`/`nodeLayout.ts` bullets stay (already accurate).
- [ ] **Step 2: README.md** — read it fully first; update any user-facing description of the views/morph ("morphs into a globe" or similar) to mention the staged transition; add nothing speculative. If the README doesn't describe transitions, leave it untouched and note that in the commit body.
- [ ] **Step 3: progress ledger** — append to `.superpowers/sdd/progress.md`: date, branch, the spec/plan paths, per-task status, decisions (choreography replaces morph flight; picking suppressed mid-flight), carried-forward minors.
- [ ] **Step 4:** `npm test` (the CLAUDE.md-quoting conventions have no test, but the suite must stay green), commit:

```bash
git add CLAUDE.md README.md .superpowers/sdd/progress.md
git commit -m "docs(transition): CLAUDE.md/README describe the staged gather choreography"
```

---

## Final verification (after Task 9)

- `npx tsc --noEmit && npm test` — clean, all suites.
- `npx next build` with the dev server still running — clean; `/api/metagraphs` stays `○` 10m.
- Full visual pass: all six 3D-pair transitions, one flat-view round-trip (canvas fade unchanged), filter committed during a transition (lands correctly), LiveStrip bar click mid-transition (snapshot selection still works after settle), phone breakpoint.
- `superpowers:requesting-code-review` on the branch before merge.
