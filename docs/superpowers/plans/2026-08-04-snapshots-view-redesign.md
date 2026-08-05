# Snapshots (ledger) 3D View Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Snapshots view as two snapshot floors — metagraph-snapshot lanes above, a byte-wide global-snapshot bar below, joined by tapering ribbons — with the validators moved to make-up rails on the floors' front edges, and give a metagraph snapshot its own selectable card.

**Architecture:** All new geometry math lands in pure `src/engine/domain/` modules with colocated tests (`ledgerLayout`, `ledgerBands`, `ledgerRails`, `ledgerModel`, `cameraRig`, `pickActions`); the Three.js side splits `LedgerView.ts` into a composition shell plus three adapters (`ByteBar`, `Ribbons`, `NodeRails`) that read domain and write GPU; `Engine.ts` remains the only store bridge and gains the new pick wiring, focus resolvers and the scale-drift dev-warning. The data side widens `/api/snapshot/[ordinal]` with brotli-decoded per-entry rows, adds a per-channel deep route and a currency-activity route, and `RawSnapshotBridge` gains a boot backfill plus the deep fetch.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Zustand, vanilla Three.js, Vitest, Node `zlib.brotliDecompress`, `unstable_cache`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-snapshots-view-redesign-design.md`. Branch: `snapshots-redesign`.
- **Layer rules are enforced by tests:** `domain/` imports only THREE math + `config` + data *types* (no `scene/`, no react, no store values); `scene/` reads domain and writes GPU (no store, no react); `Engine.ts` is the only store bridge.
- **Every VALUE export of a `domain/` module must be referenced by its sibling `*.test.ts`** (`domainExportCoverage.test.ts`). Type-only exports are skipped.
- **Per-frame method bodies in `scene/` and `Engine.ts` loop phases allocate nothing** — no `new THREE.*` / `.clone()` unless the line carries an `event-time` comment (`noFrameAllocations.test.ts`).
- **No raw `0xRRGGBB` / `#rrggbb` / `rgb()` colours** in `src/engine/` or `components/` outside the documented allowlists (`noHardcodedColors.test.ts`). Grayscale (r==g==b) is always allowed. The neutral "unlisted" tone must come from a `SceneColors` token; the identity scene map stays a required `LedgerView` constructor argument.
- **Scene modules never compare `Mode` strings**, every `scene/views/*.ts` (except `GeoView.ts`) must contain `setViewAlpha(`, views never write their root group's `visible`, and `getWorldPosition(` / `getMatrixAt(` in Engine framing paths need a `render-state OK` marker (`sceneViewContract.test.ts`).
- **No component may call a selection setter directly** — every selection write goes through `domain/pickActions.ts` builders + `src/store/applyClickActions.ts` (`components/selectionBoundary.test.ts`; sole allowlisted exception: `FollowController`).
- **`railLadderBoundary.test.ts` is untouched** — the metagraph snapshot is a card slot with **no** ladder rung, exactly like the global snapshot (`snap`). `domain/focusLadder.ts` is not modified.
- **Never derive size from fee.** Bytes come from `content.length` (summed) or the decoded payload; fee is an opaque reported value.
- **Honesty rules:** a tick with no exact read yet renders **unmeasured** (dashed outline, minimum width, no bands) — width is never inferred from anchor count or fee. A tick that anchored nothing renders as a **minimum-width seam**, not a gap. A tile from a tick older than the polled buffer is **anonymous**: drawn, not pickable.
- **Scale reference:** `BYTE_SCALE_KB = 60` (provisional, p99-calibrated per spec §6.3), fixed, with clipping and an overflow multiplier stated on the clipped bar's label.
- **User-facing copy rule:** the Snapshots stack **anchors state**; "settlement" is reserved for the DAG a snapshot pays. Internal identifiers keep their existing names (`LedgerView`, `ledgerLayout`, …).
- **Design tokens first** in any component styling: the HUD type scale (`text-micro`/`text-label`/`text-body`/`text-title`) and structural tokens, never raw pixel/hex values.
- **Ghost hint copy names the gesture and its route**, not "… to inspect it".
- **Commit trailer on every commit:** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Per-task gate:** `npx tsc --noEmit` and `npm test` must both pass before the task's commit.
- **Dev-server discipline:** exactly one `next dev` on port 3000, shared; workers must not start or kill servers.

---

## Axis convention (read once — every geometry task depends on it)

The ledger group is rotated by `LEDGER.viewRotY = -Math.PI / 2` about Y, which maps local `(x, y, z)` to world `(-z, y, x)`. Therefore, in the **local** ledger frame every module below works in:

| local axis | meaning | on screen (resting face-on camera) |
|---|---|---|
| **+X** | toward the camera; the lead slot is `x = 0` and the trail runs to **−X** | depth (trail recedes) |
| **+Y** | floor height | up |
| **+Z** | the lane / width field, `ledgerSite(i, n).z` from `−LANE_HALF_Z` (lane 0) to `+LANE_HALF_Z` | left |

So: floors are XZ planes at two Y heights; the byte bar's **width is its Z extent**; node rails run **along Z** at positive X (in front of the lead slot); the gutters sit beyond the lane field at **negative Z** (screen right).

---

## File Structure

**Domain (pure, colocated tests):**

| file | responsibility |
|---|---|
| `src/engine/domain/ledgerLayout.ts` *(modify)* | the two floor heights, lane field extents, gutter bounds, rail constants + `railX`/`railY`, the baked `BYTE_SCALE_KB` reference and byte→width mapping bounds. `LAYER_GEOM` keeps all six ids, half now rail geometry. `HYP_SPLIT` + `DIAL_R` retired. |
| `src/engine/domain/ledgerBands.ts` *(create)* | pure byte→bar model: band spans in Z, clipping + overflow multiplier, minimum-width seam, unmeasured state, ribbon quad endpoints. |
| `src/engine/domain/ledgerRails.ts` *(create)* | pure machine→rail model: make-up partition, empty-rail suppression + collapse, chip positions along a rail, the layer-rung→rail lighting overlap. |
| `src/engine/domain/ledgerModel.ts` *(modify)* | slot model retained; per-slot `ts` for tile identity, lead-row `forming` settling. |
| `src/engine/domain/cameraRig.ts` *(modify)* | `ledgerFloorFraming` (renamed from `ledgerLayerFraming`) + `ledgerRailFraming`. |
| `src/engine/domain/pickActions.ts` *(modify)* | `metaSnapSelectActions` (tile) and `bandSelectActions` (band); `clearAllActions` sweeps the new slot. |

**Store:**

| file | responsibility |
|---|---|
| `src/store/store.ts` *(modify)* | the `metaSnap` selection channel + `metaSnapDeep` cache channel, `SelSlot` entry. |
| `src/store/applyClickActions.ts` *(modify)* | one executor effect for the `metaSnap` action kind. |

**Scene (Three adapters):**

| file | responsibility |
|---|---|
| `src/engine/scene/objects/NodeRails.ts` *(create)* | rail hairlines, rail labels, rail pick proxies, rail dim/lighting response. |
| `src/engine/scene/objects/ByteBar.ts` *(create)* | the per-tick byte bar: band meshes, unmeasured outline, clip mark, bar labels, band picks. |
| `src/engine/scene/objects/Ribbons.ts` *(create)* | lead-row + hot-row tapering ribbons and the pulse centrelines that ride them. |
| `src/engine/scene/views/LedgerView.ts` *(modify)* | composition: two floors, lane tiles, gutters, the three adapters, `SceneView` alpha/fade ownership. Dials, cubic links, centre block + plain trail removed. |
| `src/engine/scene/Globe.ts` *(modify)* | ledger placement writes **rail** positions; one record per machine (`ledgerHide` on the non-primary layer record). |
| `src/engine/domain/records.ts` *(modify)* | `MetaNodeRecord.ledgerHide`. |

**Engine:**

| file | responsibility |
|---|---|
| `src/engine/Engine.ts` *(modify)* | tile/band pick wiring, the tile identity resolver, floor-vs-rail focus resolution, currency-activity + exact-read forwarding, the scale drift dev-warning, the `metaSnap` clears. |

**Data / API:**

| file | responsibility |
|---|---|
| `src/data/types.ts` *(modify)* | `MetaSnapSel`, `ChannelSnapRow`, `ChannelSnapDeep`, `CurrencyActivity`; `SnapshotExact.rows`. |
| `src/data/anchorLog.ts` *(modify)* | `snapsAtTick()` — the pure per-tick per-metagraph snapshot lookup behind tile identity. |
| `src/data/api.ts` *(modify)* | `MetaSnapRecord` widened with the free per-snapshot facts (`height`, `subHeight`, `blocks`, `epochProgress`). |
| `src/data/ledgerLayers.ts` *(modify)* | display copy for the two floors and the four rail-hosted node layers. |
| `app/api/snapshot/[ordinal]/route.ts` *(modify)* | per-entry `rows` from brotli-decoded `content`, alongside the existing summed `perMeta`. |
| `app/api/snapshot/[ordinal]/channel/[address]/route.ts` *(create)* | the full decode for one anchored entry, cached immutably per pair. |
| `app/api/currency-activity/route.ts` *(create)* | the batched last-currency-transaction read for the ten metagraphs. |
| `scripts/bake-ledger-scale.ts` *(create)* | offline calibration of `BYTE_SCALE_KB`. |

**Components:**

| file | responsibility |
|---|---|
| `components/RawSnapshotBridge.tsx` *(modify)* | boot backfill of the previous eight ordinals + the deep per-channel fetch. |
| `components/railCards.ts` *(modify)* | the `metaSnap` slot and its ghost hint. |
| `components/icons.tsx` *(modify)* | the metagraph-snapshot kind mark. |
| `components/inspector/MetaSnapPane.tsx` *(create)* | the metagraph snapshot card: tier 1 + tier 2 rows, the state-aware deeper affordance, the shape facts. |
| `components/Inspector.tsx` *(modify)* | mount the new pane in the non-ladder slot group. |
| `components/LedgerPanel.tsx` *(modify)* | the explorer's floors + rails vocabulary. |
| `components/datasection/ChannelStatePanel.tsx` *(create)* | the decoded payload renderer in the raw layer. |
| `components/datasection/AnchorLogTable.tsx` *(modify)* | row selection opens the state panel for that snapshot. |

---

## Task 1: Ledger layout foundations

**Files:**
- Modify: `src/engine/domain/ledgerLayout.ts` (append after `ledgerSite`, line ~100)
- Test: `src/engine/domain/ledgerLayout.test.ts`

**Interfaces:**
- Consumes: existing `LEDGER`, `LANE_SPREAD`, `ledgerSite(i, n)` from the same module.
- Produces:
  - `type LedgerFloorId = "msnap" | "gl0"`
  - `type RailGroup = "meta" | "dag"`
  - `const FLOOR_IDS: readonly LedgerFloorId[]`
  - `const FLOOR_Y: Record<LedgerFloorId, number>`
  - `const LANE_HALF_Z: number`
  - `const GUTTER_W: number`, `const GUTTER_CZ: number`
  - `const BAR_Z0: number`, `const BAR_MAX_W: number`, `const BAR_MIN_W: number`, `const BAR_H: number`, `const BAR_D: number`
  - `const BYTE_SCALE_KB: number`
  - `const RAIL_X0: number`, `const RAIL_PITCH_X: number`, `const RAIL_Y_LIFT: number`, `const RAIL_CHIP_PITCH_Z: number`, `const RAIL_ROW_LIFT: number`, `const RAIL_CAP: number`
  - `function railX(visibleIndex: number): number`
  - `function railY(group: RailGroup, row: number): number`
  - `const RAIL_GROUP_FLOOR: Record<RailGroup, LedgerFloorId>`
  - `type LaneSpan = { cz: number; hz: number; hidden: boolean }`
  - `function laneSpan(i: number, n: number, committedIdx: number | null): LaneSpan` — the upper floor's lane geometry under a filter (spec §5.2: *"Committing rearranges the upper floor: the lane takes the whole floor, other lanes' tiles leave"*). Consumed by `LedgerView`'s tile layout (Task 16).

- [ ] **Step 1: Write the failing test**

Append to `src/engine/domain/ledgerLayout.test.ts`:

```ts
import {
  FLOOR_IDS, FLOOR_Y, LANE_HALF_Z, GUTTER_W, GUTTER_CZ,
  BAR_Z0, BAR_MAX_W, BAR_MIN_W, BAR_H, BAR_D, BYTE_SCALE_KB,
  RAIL_X0, RAIL_PITCH_X, RAIL_Y_LIFT, RAIL_CHIP_PITCH_Z, RAIL_ROW_LIFT, RAIL_CAP,
  RAIL_GROUP_FLOOR, railX, railY, laneSpan, LEDGER, ledgerSite,
} from "./ledgerLayout";
import { METAGRAPHS } from "../config";

describe("two-floor chamber (redesign 2026-08-04)", () => {
  it("keeps only the two snapshot layers as floors, at today's heights", () => {
    expect([...FLOOR_IDS]).toEqual(["msnap", "gl0"]);
    expect(FLOOR_Y.msnap).toBe(LEDGER.rowMSnap);
    expect(FLOOR_Y.gl0).toBe(LEDGER.rowGL0);
    // The 13.5-unit separation the ribbons run through is deliberately unchanged.
    expect(FLOOR_Y.msnap - FLOOR_Y.gl0).toBeCloseTo(13.5, 6);
  });

  it("spans the lane field symmetrically about z=0", () => {
    const n = METAGRAPHS.length;
    expect(ledgerSite(0, n).z).toBeCloseTo(-LANE_HALF_Z, 6);
    expect(ledgerSite(n - 1, n).z).toBeCloseTo(LANE_HALF_Z, 6);
  });

  it("puts the gutter outside the lane field, on the screen-right (−Z) side", () => {
    expect(GUTTER_CZ).toBeLessThan(-LANE_HALF_Z);
    expect(GUTTER_CZ + GUTTER_W / 2).toBeLessThanOrEqual(-LANE_HALF_Z + 1e-9);
    expect(GUTTER_W).toBeCloseTo((2 * LANE_HALF_Z) / 6, 6);
  });

  it("starts the byte bar at lane 0's end and can grow across the whole field", () => {
    expect(BAR_Z0).toBeCloseTo(-LANE_HALF_Z, 6);
    expect(BAR_MAX_W).toBeCloseTo(2 * LANE_HALF_Z, 6);
    expect(BAR_MIN_W).toBeGreaterThan(0);
    expect(BAR_MIN_W).toBeLessThan(BAR_MAX_W);
    expect(BAR_H).toBeGreaterThan(0);
    // Depth stays inside one slot so consecutive ticks never touch.
    expect(BAR_D).toBeLessThan(3.6);
  });

  it("carries the baked p99 scale reference in KB", () => {
    expect(BYTE_SCALE_KB).toBe(60);
  });

  it("steps rails toward the camera and stacks overflow rows upward", () => {
    expect(railX(0)).toBeCloseTo(RAIL_X0, 6);
    expect(railX(2)).toBeCloseTo(RAIL_X0 + 2 * RAIL_PITCH_X, 6);
    expect(railY("meta", 0)).toBeCloseTo(FLOOR_Y.msnap + RAIL_Y_LIFT, 6);
    expect(railY("dag", 1)).toBeCloseTo(FLOOR_Y.gl0 + RAIL_Y_LIFT + RAIL_ROW_LIFT, 6);
    expect(RAIL_GROUP_FLOOR.meta).toBe("msnap");
    expect(RAIL_GROUP_FLOOR.dag).toBe("gl0");
    expect(RAIL_CAP).toBe(Math.floor((2 * LANE_HALF_Z) / RAIL_CHIP_PITCH_Z) + 1);
  });

  it("keeps every lane in its own slice with nothing committed", () => {
    const n = METAGRAPHS.length;
    for (let i = 0; i < n; i++) {
      const s = laneSpan(i, n, null);
      expect(s.hidden).toBe(false);
      expect(s.cz).toBeCloseTo(ledgerSite(i, n).z, 6);
      // Each lane owns one slice of the field, so n lanes tile it without overlapping.
      expect(s.hz).toBeCloseTo(LANE_HALF_Z / n, 6);
    }
  });

  it("gives a committed lane the whole floor and takes the others away (spec §5.2)", () => {
    const n = METAGRAPHS.length;
    const on = laneSpan(3, n, 3);
    expect(on.hidden).toBe(false);
    expect(on.cz).toBeCloseTo(0, 6);
    expect(on.hz).toBeCloseTo(LANE_HALF_Z, 6);
    for (const i of [0, 2, 4, n - 1]) {
      expect(laneSpan(i, n, 3).hidden).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/engine/domain/ledgerLayout.test.ts`
Expected: FAIL — `No "FLOOR_IDS" export is defined on the "./ledgerLayout" module`.

- [ ] **Step 3: Write the implementation**

Append to `src/engine/domain/ledgerLayout.ts` (after `ledgerSite`, keeping every existing export in place for now — `HYP_SPLIT`/`DIAL_R` are retired in Task 13, with their consumers):

```ts
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TWO-FLOOR CHAMBER (redesign 2026-08-04). Only snapshot layers get a plane; the four node
// layers render as RAILS on the front edge of the floor they belong to (see ledgerRails.ts).
//
// Local frame (the group is rotated -90° about Y, so local (x,y,z) → world (-z,y,x)):
//   +X = toward the camera; the lead slot is x=0 and the trail runs to -X.
//   +Y = floor height.
//   +Z = the lane / width field; ledgerSite(0,n).z is the -Z end, screen RIGHT is -Z.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type LedgerFloorId = "msnap" | "gl0";
export const FLOOR_IDS: readonly LedgerFloorId[] = ["msnap", "gl0"];

// The five retired planes are REMOVED, not redistributed — the two survivors keep the heights
// (and therefore the 13.5-unit ribbon run) they already had.
export const FLOOR_Y: Record<LedgerFloorId, number> = {
  msnap: LEDGER.rowMSnap,
  gl0: LEDGER.rowGL0,
};

/** Half the Z extent the metagraph lanes spread over (ledgerSite's outermost |z|). */
export const LANE_HALF_Z = (LEDGER.depth * LANE_SPREAD) / 2;

// ── Gutters (spec §4.5) — a narrow strip beyond the lane field, screen-right (−Z) on both
// floors: the currency status line above, the $DAG blocks below. ~1/6 of the field.
export const GUTTER_W = (2 * LANE_HALF_Z) / 6;
export const GUTTER_CZ = -LANE_HALF_Z - GUTTER_W / 2;

// ── The byte bar (spec §4.2) — fixed height and depth; WIDTH (the Z extent) alone encodes the
// bytes the tick carried. It starts at lane 0's end so band order and lane order agree and the
// ribbons splay without crossing.
export const BAR_Z0 = -LANE_HALF_Z;
export const BAR_MAX_W = 2 * LANE_HALF_Z;
export const BAR_MIN_W = 0.55; // the zero-anchor SEAM: a tick that carried nothing still happened
export const BAR_H = 0.9;
export const BAR_D = 1.6;

/** The fixed scale reference: KB carried at which the bar fills the floor. Calibrated to the p99
 *  of anchored KB per tick (spec §6.3) and baked offline by `scripts/bake-ledger-scale.ts`;
 *  ticks above it clip at the floor edge and state their overflow as a multiplier. Provisional
 *  value from the 533-tick sample of 2026-08-04 (p99 = 31 KB over 6 of 10 metagraphs), scaled for
 *  the metagraphs and unlisted channels that sample missed. */
export const BYTE_SCALE_KB = 60;

// ── Node rails (spec §4.4) — run along Z at the FRONT (+X, camera-side) edge of their floor,
// one rail per non-empty make-up group, stepping toward the camera as more rails appear.
export type RailGroup = "meta" | "dag";
export const RAIL_GROUP_FLOOR: Record<RailGroup, LedgerFloorId> = { meta: "msnap", dag: "gl0" };

export const RAIL_X0 = 3.2;          // the first rail, clear of the lead slot's tiles
export const RAIL_PITCH_X = 1.7;     // step toward the camera per visible rail
export const RAIL_Y_LIFT = 0.35;     // chips stand ON the floor plane
export const RAIL_CHIP_PITCH_Z = 0.62;
export const RAIL_ROW_LIFT = 0.34;   // an over-long rail wraps into stacked rows, chip-stack idiom
/** Machines per rail row before it wraps upward. */
export const RAIL_CAP = Math.floor((2 * LANE_HALF_Z) / RAIL_CHIP_PITCH_Z) + 1;

export function railX(visibleIndex: number): number {
  return RAIL_X0 + visibleIndex * RAIL_PITCH_X;
}

export function railY(group: RailGroup, row: number): number {
  return FLOOR_Y[RAIL_GROUP_FLOOR[group]] + RAIL_Y_LIFT + row * RAIL_ROW_LIFT;
}

// ── The committed-filter rearrangement (spec §5.2): "Committing rearranges the upper floor: the
// lane takes the whole floor, other lanes' tiles leave, rails dim non-member machines." So a lane
// is not merely dimmed under a filter — it gives up its slice, and the committed lane grows into
// the whole Z field so its tiles read at the same size the "all" view gives ten lanes together.
export type LaneSpan = {
  /** Lane centre in local Z. */
  cz: number;
  /** Half the Z extent this lane may lay tiles across. */
  hz: number;
  /** True when another lane is committed and this one lays no tiles at all. */
  hidden: boolean;
};

export function laneSpan(i: number, n: number, committedIdx: number | null): LaneSpan {
  if (committedIdx === null) return { cz: ledgerSite(i, n).z, hz: LANE_HALF_Z / n, hidden: false };
  if (committedIdx === i) return { cz: 0, hz: LANE_HALF_Z, hidden: false };
  return { cz: ledgerSite(i, n).z, hz: LANE_HALF_Z / n, hidden: true };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/engine/domain/ledgerLayout.test.ts && npm test && npx tsc --noEmit`
Expected: PASS (including `domainExportCoverage`, which now sees every new value export referenced by the sibling test).

- [ ] **Step 5: Commit**

```bash
git add src/engine/domain/ledgerLayout.ts src/engine/domain/ledgerLayout.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): two-floor chamber geometry — floors, gutters, bar and rail constants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The byte-bar band model

**Files:**
- Create: `src/engine/domain/ledgerBands.ts`
- Test: `src/engine/domain/ledgerBands.test.ts`

**Interfaces:**
- Consumes: `BAR_Z0`, `BAR_MAX_W`, `BAR_MIN_W`, `BYTE_SCALE_KB`, `LANE_HALF_Z` from `./ledgerLayout`; `METAGRAPHS` from `../config`.
- Produces:
  - `const UNLISTED_KEY = "unlisted"`
  - `interface Band { key: string; z0: number; z1: number; bytes: number }`
  - `interface BarSpec { measured: boolean; anchored: number; kb: number; z0: number; width: number; clipped: boolean; overflow: number; bands: Band[]; bandCount: number }`
  - `function makeBarSpec(): BarSpec` — the preallocated, reusable spec (bands array sized `METAGRAPHS.length + 1`)
  - `function fillBarSpec(out: BarSpec, bytesByKey: ReadonlyMap<string, number> | null, order: readonly string[], anchored: number): BarSpec`
  - `interface RibbonQuad { topZ0: number; topZ1: number; botZ0: number; botZ1: number }`
  - `function ribbonQuad(laneZ: number, laneHalf: number, band: Band, out: RibbonQuad): RibbonQuad`
  - `const RIBBON_LANE_HALF: number`

- [ ] **Step 1: Write the failing test**

Create `src/engine/domain/ledgerBands.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  UNLISTED_KEY, makeBarSpec, fillBarSpec, ribbonQuad, RIBBON_LANE_HALF,
  type RibbonQuad,
} from "./ledgerBands";
import { BAR_Z0, BAR_MAX_W, BAR_MIN_W, BYTE_SCALE_KB, LANE_HALF_Z } from "./ledgerLayout";
import { METAGRAPHS } from "../config";

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

  it("renders a measured tick that anchored nothing as a minimum-width seam", () => {
    const s = fillBarSpec(makeBarSpec(), new Map(), ORDER, 0);
    expect(s.measured).toBe(true);
    expect(s.width).toBeCloseTo(BAR_MIN_W, 6);
    expect(s.bandCount).toBe(0);
  });

  it("scales width against the fixed reference and never below the seam", () => {
    const half = fillBarSpec(makeBarSpec(), new Map([[A, (BYTE_SCALE_KB / 2) * KB]]), ORDER, 1);
    expect(half.width).toBeCloseTo(BAR_MAX_W / 2, 4);
    expect(half.clipped).toBe(false);
    expect(half.overflow).toBe(1);
    const tiny = fillBarSpec(makeBarSpec(), new Map([[A, 1]]), ORDER, 1);
    expect(tiny.width).toBeCloseTo(BAR_MIN_W, 6);
  });

  it("clips an over-reference tick and states the overflow multiplier", () => {
    const s = fillBarSpec(makeBarSpec(), new Map([[A, BYTE_SCALE_KB * 12 * KB]]), ORDER, 40);
    expect(s.width).toBeCloseTo(BAR_MAX_W, 6);
    expect(s.clipped).toBe(true);
    expect(s.overflow).toBeCloseTo(12, 3);
    expect(s.kb).toBeCloseTo(BYTE_SCALE_KB * 12, 3);
  });

  it("lays bands proportionally, contiguously, in lane order from BAR_Z0", () => {
    const s = fillBarSpec(
      makeBarSpec(),
      new Map([[B, 3 * KB], [A, 1 * KB]]), // insertion order deliberately not lane order
      ORDER,
      2,
    );
    expect(s.bandCount).toBe(2);
    expect(s.bands[0].key).toBe(A);
    expect(s.bands[1].key).toBe(B);
    expect(s.bands[0].z0).toBeCloseTo(BAR_Z0, 6);
    expect(s.bands[0].z1).toBeCloseTo(s.bands[1].z0, 6);
    expect(s.bands[1].z1).toBeCloseTo(BAR_Z0 + s.width, 6);
    // 1:3 of the width
    expect(s.bands[0].z1 - s.bands[0].z0).toBeCloseTo(s.width / 4, 5);
  });

  it("puts unlisted bytes in a neutral band at the end", () => {
    const s = fillBarSpec(makeBarSpec(), new Map([[A, KB], [UNLISTED_KEY, KB]]), ORDER, 2);
    expect(s.bandCount).toBe(2);
    expect(s.bands[1].key).toBe(UNLISTED_KEY);
    expect(s.bands[1].z1).toBeCloseTo(BAR_Z0 + s.width, 6);
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/engine/domain/ledgerBands.test.ts`
Expected: FAIL — `Failed to load ./ledgerBands`.

- [ ] **Step 3: Write the implementation**

Create `src/engine/domain/ledgerBands.ts`:

```ts
// The BYTE BAR's pure model (redesign 2026-08-04, spec §4.2/§6.2/§6.3): the global snapshot is ONE
// object whose WIDTH is the bytes it carries, divided into bands proportional to each metagraph's
// sealed payload, in lane order, with unlisted channels as a neutral band at the end.
//
// Honesty rules encoded here, not in the adapter:
//   • no exact read yet          → `measured: false`, minimum width, NO bands (never inferred
//                                  from anchor count and never from the fee)
//   • measured, anchored nothing → a minimum-width SEAM (the tick still happened)
//   • over the fixed reference   → clipped at the floor edge, `overflow` states by how much
//
// Allocation-free after construction: `makeBarSpec()` preallocates one band record per listed
// metagraph plus the unlisted aggregate, and `fillBarSpec()` only writes into them.
import { BAR_Z0, BAR_MAX_W, BAR_MIN_W, BYTE_SCALE_KB, LANE_HALF_Z } from "./ledgerLayout";
import { METAGRAPHS } from "../config";

/** The band key for every anchor from a metagraph that isn't publicly listed. */
export const UNLISTED_KEY = "unlisted";

export interface Band {
  key: string;   // metagraph id (== its state-channel address), or UNLISTED_KEY
  z0: number;
  z1: number;
  bytes: number;
}

export interface BarSpec {
  measured: boolean;  // false = the exact read hasn't landed (spec §6.2)
  anchored: number;   // the authoritative anchored count, from the polled feed
  kb: number;
  z0: number;
  width: number;
  clipped: boolean;
  overflow: number;   // ×N past the reference; 1 when the bar fits
  bands: Band[];      // PREALLOCATED; only the first `bandCount` are live
  bandCount: number;
}

const MAX_BANDS = METAGRAPHS.length + 1;
const BYTES_FULL = BYTE_SCALE_KB * 1024;

export function makeBarSpec(): BarSpec {
  const bands: Band[] = [];
  for (let i = 0; i < MAX_BANDS; i++) bands.push({ key: "", z0: 0, z1: 0, bytes: 0 });
  return { measured: false, anchored: 0, kb: 0, z0: BAR_Z0, width: BAR_MIN_W, clipped: false, overflow: 1, bands, bandCount: 0 };
}

/**
 * @param bytesByKey null = unmeasured; otherwise key → bytes carried (UNLISTED_KEY aggregated).
 * @param order      the lane order (metagraph ids); bands follow it so ribbons never cross.
 * @param anchored   the tick's authoritative anchored count (polled, exact from tick 1).
 */
export function fillBarSpec(
  out: BarSpec,
  bytesByKey: ReadonlyMap<string, number> | null,
  order: readonly string[],
  anchored: number,
): BarSpec {
  out.anchored = anchored;
  out.z0 = BAR_Z0;
  out.bandCount = 0;
  out.clipped = false;
  out.overflow = 1;

  if (!bytesByKey) {
    out.measured = false;
    out.kb = 0;
    out.width = BAR_MIN_W;
    return out;
  }

  out.measured = true;
  let total = 0;
  for (const [, b] of bytesByKey) total += b;
  out.kb = total / 1024;

  if (total >= BYTES_FULL) {
    out.width = BAR_MAX_W;
    out.clipped = true;
    out.overflow = total / BYTES_FULL;
  } else {
    out.width = Math.max(BAR_MIN_W, (total / BYTES_FULL) * BAR_MAX_W);
  }

  if (total <= 0) return out; // a measured tick that anchored nothing: the seam, no bands

  let z = BAR_Z0;
  let n = 0;
  for (let i = 0; i < order.length && n < MAX_BANDS; i++) {
    const bytes = bytesByKey.get(order[i]) ?? 0;
    if (bytes <= 0) continue;
    const band = out.bands[n++];
    band.key = order[i];
    band.bytes = bytes;
    band.z0 = z;
    z += (bytes / total) * out.width;
    band.z1 = z;
  }
  const unlisted = bytesByKey.get(UNLISTED_KEY) ?? 0;
  if (unlisted > 0 && n < MAX_BANDS) {
    const band = out.bands[n++];
    band.key = UNLISTED_KEY;
    band.bytes = unlisted;
    band.z0 = z;
    z += (unlisted / total) * out.width;
    band.z1 = z;
  }
  // Absorb float drift into the last band so the bar's right edge is exactly z0 + width.
  if (n > 0) out.bands[n - 1].z1 = BAR_Z0 + out.width;
  out.bandCount = n;
  return out;
}

// ── Ribbons (spec §4.3) — one tapering quad per anchoring lane, from the lane's fixed footprint
// above onto its own band below. The lane counts snapshots, the band measures bytes; the ribbon is
// the relationship.
export interface RibbonQuad { topZ0: number; topZ1: number; botZ0: number; botZ1: number }

/** Half the Z footprint a lane's ribbon leaves from — the lane cell, not the tile grid. */
export const RIBBON_LANE_HALF = LANE_HALF_Z / METAGRAPHS.length;

export function ribbonQuad(laneZ: number, laneHalf: number, band: Band, out: RibbonQuad): RibbonQuad {
  out.topZ0 = laneZ - laneHalf;
  out.topZ1 = laneZ + laneHalf;
  out.botZ0 = band.z0;
  out.botZ1 = band.z1;
  return out;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/engine/domain/ledgerBands.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/domain/ledgerBands.ts src/engine/domain/ledgerBands.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): pure byte-bar band model — clipping, seam, unmeasured, ribbon quads

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The node-rail model

**Files:**
- Create: `src/engine/domain/ledgerRails.ts`
- Test: `src/engine/domain/ledgerRails.test.ts`

**Interfaces:**
- Consumes: `railX`, `railY`, `RAIL_CAP`, `RAIL_CHIP_PITCH_Z`, `LANE_HALF_Z`, `type RailGroup` from `./ledgerLayout`.
- Produces:
  - `type RailKind = "l1only" | "hybrid" | "l0only"`
  - `const RAIL_ORDER: readonly RailKind[]`
  - `function railKindOf(roles: readonly string[]): RailKind | null`
  - `function visibleRails(counts: ReadonlyMap<RailKind, number>): RailKind[]`
  - `function railChipPos(group: RailGroup, visibleIndex: number, slot: number, out: THREE.Vector3): THREE.Vector3`
  - `function railLayerId(group: RailGroup, kind: RailKind): "ml0" | "ml1" | "hypl0" | "hypl1"`
  - `function railLit(layerId: string, group: RailGroup, kind: RailKind): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/engine/domain/ledgerRails.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  RAIL_ORDER, railKindOf, visibleRails, railChipPos, railLayerId, railLit,
  type RailKind,
} from "./ledgerRails";
import { railX, railY, RAIL_CAP, RAIL_CHIP_PITCH_Z, LANE_HALF_Z } from "./ledgerLayout";

const counts = (o: Partial<Record<RailKind, number>>) =>
  new Map<RailKind, number>(Object.entries(o) as [RailKind, number][]);

describe("railKindOf", () => {
  it("partitions machines by make-up, each machine on exactly one rail", () => {
    expect(railKindOf(["l0", "cl1", "dl1"])).toBe("hybrid");
    expect(railKindOf(["l0", "dl1"])).toBe("hybrid");
    expect(railKindOf(["dl1"])).toBe("l1only");
    expect(railKindOf(["cl1"])).toBe("l1only");
    expect(railKindOf(["l0"])).toBe("l0only");
  });

  it("returns null for a machine with no ledger-relevant role", () => {
    expect(railKindOf([])).toBeNull();
    expect(railKindOf(["unknown"])).toBeNull();
  });
});

describe("visibleRails", () => {
  it("keeps the fixed order and hides empty rails so the rest collapse up", () => {
    expect(visibleRails(counts({ l1only: 19, hybrid: 3, l0only: 0 }))).toEqual(["l1only", "hybrid"]);
    expect(visibleRails(counts({ hybrid: 3 }))).toEqual(["hybrid"]);
    // The DAG's own validators: L0-only and L1-only machines, no hybrids — the same rule, a
    // different outcome.
    expect(visibleRails(counts({ l1only: 40, l0only: 160 }))).toEqual(["l1only", "l0only"]);
    expect(visibleRails(counts({}))).toEqual([]);
    expect([...RAIL_ORDER]).toEqual(["l1only", "hybrid", "l0only"]);
  });
});

describe("railChipPos", () => {
  it("lays chips along Z at the rail's own X, centred on the field", () => {
    const out = new THREE.Vector3();
    railChipPos("meta", 1, 0, out);
    expect(out.x).toBeCloseTo(railX(1), 6);
    expect(out.y).toBeCloseTo(railY("meta", 0), 6);
    expect(out.z).toBeCloseTo(-LANE_HALF_Z, 6);
    railChipPos("meta", 1, 2, out);
    expect(out.z).toBeCloseTo(-LANE_HALF_Z + 2 * RAIL_CHIP_PITCH_Z, 6);
  });

  it("wraps an over-long rail into a stacked row rather than running off the floor", () => {
    const out = new THREE.Vector3();
    railChipPos("dag", 0, RAIL_CAP, out);
    expect(out.y).toBeCloseTo(railY("dag", 1), 6);
    expect(out.z).toBeCloseTo(-LANE_HALF_Z, 6);
  });

  it("returns the out vector it was given", () => {
    const out = new THREE.Vector3();
    expect(railChipPos("meta", 0, 0, out)).toBe(out);
  });
});

describe("railLayerId / railLit", () => {
  it("names each rail's own layer, hybrid siding with the L0 that produces the floor below", () => {
    expect(railLayerId("meta", "l1only")).toBe("ml1");
    expect(railLayerId("meta", "hybrid")).toBe("ml0");
    expect(railLayerId("meta", "l0only")).toBe("ml0");
    expect(railLayerId("dag", "l1only")).toBe("hypl1");
    expect(railLayerId("dag", "l0only")).toBe("hypl0");
  });

  it("lights rails by OVERLAP — the hybrid rail answers to both rungs", () => {
    expect(railLit("ml1", "meta", "l1only")).toBe(true);
    expect(railLit("ml1", "meta", "hybrid")).toBe(true);
    expect(railLit("ml1", "meta", "l0only")).toBe(false);
    expect(railLit("ml0", "meta", "l0only")).toBe(true);
    expect(railLit("ml0", "meta", "hybrid")).toBe(true);
    expect(railLit("ml0", "meta", "l1only")).toBe(false);
    expect(railLit("hypl0", "dag", "l0only")).toBe(true);
    expect(railLit("hypl1", "dag", "l1only")).toBe(true);
    // A rung on the other group's floor never lights these rails.
    expect(railLit("hypl0", "meta", "hybrid")).toBe(false);
    expect(railLit("msnap", "meta", "hybrid")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/engine/domain/ledgerRails.test.ts`
Expected: FAIL — `Failed to load ./ledgerRails`.

- [ ] **Step 3: Write the implementation**

Create `src/engine/domain/ledgerRails.ts`:

```ts
// NODE RAILS (redesign 2026-08-04, spec §4.4): the validators leave the floors and line up on the
// FRONT edge of the floor they belong to, partitioned by MAKE-UP — each machine on exactly one
// rail, so the hybrid machines that run both layers are counted once instead of twice.
//
// The layer rungs deliberately OVERLAP the rails: committing `ml1` lights the L1-only rail AND the
// hybrid rail; `ml0` lights L0-only and hybrid. The hybrid rail answering to both rungs is the
// visual statement that they are the same machines — what the old two-floor layout got wrong.
//
// An EMPTY rail hides and the remaining rails collapse up (the explorer's composition groups only
// ever emit groups that exist). Applied to the DAG's own validators the same rule yields two rails
// and hides the empty hybrid one.
import * as THREE from "three";
import { railX, railY, RAIL_CAP, RAIL_CHIP_PITCH_Z, LANE_HALF_Z, type RailGroup } from "./ledgerLayout";

export type RailKind = "l1only" | "hybrid" | "l0only";

/** Fixed rail order, front (camera-side) first: L1 work arrives, hybrids sit between, L0 seals. */
export const RAIL_ORDER: readonly RailKind[] = ["l1only", "hybrid", "l0only"];

/** A machine's rail from its roles. `null` = it runs nothing this chamber renders. */
export function railKindOf(roles: readonly string[]): RailKind | null {
  const l0 = roles.includes("l0");
  const l1 = roles.includes("cl1") || roles.includes("dl1");
  if (l0 && l1) return "hybrid";
  if (l1) return "l1only";
  if (l0) return "l0only";
  return null;
}

/** The rails that actually have machines, in RAIL_ORDER — the visible index is the X step. */
export function visibleRails(counts: ReadonlyMap<RailKind, number>): RailKind[] {
  return RAIL_ORDER.filter((k) => (counts.get(k) ?? 0) > 0);
}

/** Chip `slot` (0-based, within its rail) → its position in the local ledger frame. */
export function railChipPos(group: RailGroup, visibleIndex: number, slot: number, out: THREE.Vector3): THREE.Vector3 {
  const row = Math.floor(slot / RAIL_CAP);
  const col = slot - row * RAIL_CAP;
  out.set(railX(visibleIndex), railY(group, row), -LANE_HALF_Z + col * RAIL_CHIP_PITCH_Z);
  return out;
}

/** The layer id a rail's own pick commits. Hybrid sides with the L0 that produces the floor it
 *  stands on — the machines are the same, and the L0 rung is the one the snapshot floor is about. */
export function railLayerId(group: RailGroup, kind: RailKind): "ml0" | "ml1" | "hypl0" | "hypl1" {
  if (group === "meta") return kind === "l1only" ? "ml1" : "ml0";
  return kind === "l1only" ? "hypl1" : "hypl0";
}

/** Does a committed layer rung light this rail? The overlap rule above. */
export function railLit(layerId: string, group: RailGroup, kind: RailKind): boolean {
  const l1 = group === "meta" ? "ml1" : "hypl1";
  const l0 = group === "meta" ? "ml0" : "hypl0";
  if (layerId === l1) return kind === "l1only" || kind === "hybrid";
  if (layerId === l0) return kind === "l0only" || kind === "hybrid";
  return false;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/engine/domain/ledgerRails.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/domain/ledgerRails.ts src/engine/domain/ledgerRails.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): pure node-rail model — make-up partition, empty-rail collapse, rung overlap

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Slot identity and the forming lead row

**Files:**
- Modify: `src/engine/domain/ledgerModel.ts` (`LaneBlock` ~line 60, `trail` field, `lane()`, `anchorMetaBlock()`, `seedHistory()`, `setData()`)
- Test: `src/engine/domain/ledgerModel.test.ts`

**Interfaces:**
- Consumes: `Anchor`, `GlobalSnapshot` from `@/src/data/types` (already imported).
- Produces (additions to the existing exports):
  - `const LEAD_SETTLE_MS = 7000`
  - `LedgerModel.trail: { ordinal: number; slot: number; ts: string }[]`
  - `LaneBlock.ts: string` and `LaneBlock.count: number`
  - `LedgerModel.leadForming: boolean`
  - `LedgerModel.tickTs: string | null`

- [ ] **Step 1: Write the failing test**

Append to `src/engine/domain/ledgerModel.test.ts`:

```ts
import { LEAD_SETTLE_MS } from "./ledgerModel";

describe("slot identity + the forming lead row (redesign 2026-08-04)", () => {
  const snap = (ordinal: number, ts: string): GlobalSnapshot => ({
    ordinal, timestamp: ts, hash: `h${ordinal}`, metagraphSnapshotCount: 2,
  });
  const anchorAt = (touched: number, counts: [string, number][]): Anchor => ({
    fee: 0, count: counts.reduce((a, [, n]) => a + n, 0),
    metaIds: new Set(counts.map(([id]) => id)),
    metaCounts: new Map(counts), touched,
  });

  it("carries each trail slot's own timestamp, so a tile can name its snapshot", () => {
    const m = new LedgerModel();
    const id = METAGRAPHS[0].id;
    m.setData([snap(1, "t1"), snap(2, "t2")], () => anchorAt(Date.now(), [[id, 2]]));
    expect(m.trail.map((t) => t.ts)).toContain("t2");
    expect(m.tickTs).toBe("t2");
    const lane = m.lanes.get(id)!;
    const lead = lane.blocks.find((b) => b.slot === 0)!;
    expect(lead.ts).toBe("t2");
    expect(lead.count).toBe(2);
  });

  it("says the lead row is forming until the anchor count goes quiet", () => {
    const m = new LedgerModel();
    const id = METAGRAPHS[0].id;
    m.setData([snap(1, "t1")], () => anchorAt(Date.now(), [[id, 1]]));
    expect(m.leadForming).toBe(true);
    m.setData([snap(1, "t1")], () => anchorAt(Date.now() - LEAD_SETTLE_MS - 1, [[id, 1]]));
    expect(m.leadForming).toBe(false);
  });

  it("holds the ~7s settling idiom AnchoredTags already uses", () => {
    expect(LEAD_SETTLE_MS).toBe(7000);
  });
});
```

(The file already imports `LedgerModel`, `GlobalSnapshot`, `Anchor` and `METAGRAPHS`; add `LEAD_SETTLE_MS` to the existing import from `./ledgerModel` instead of a second import statement if one is present.)

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/engine/domain/ledgerModel.test.ts`
Expected: FAIL — `No "LEAD_SETTLE_MS" export is defined`.

- [ ] **Step 3: Write the implementation**

In `src/engine/domain/ledgerModel.ts`:

```ts
// A tick keeps collecting metagraph snapshots for seconds after it appears (the anchor index's
// `touched` grows). The lead row says so rather than pretending it is final — the same ~7s window
// AnchoredTags uses for its FLOOR/COMPLETE gate. The BAR below does not settle: once the exact
// read measures it, it is final.
export const LEAD_SETTLE_MS = 7000;
```

Extend `LaneBlock` and the trail entry:

```ts
export interface LaneBlock {
  x: number;
  slot: number;
  fade: number;
  size: number;
  filled: boolean;
  ox: number;
  oz: number;
  link: boolean;
  ts: string;     // the anchoring global tick's timestamp — the tile's identity join (spec §6.1)
  count: number;  // snapshots this metagraph anchored into this tick
}
```

```ts
  trail: { ordinal: number; slot: number; ts: string }[] = [];
  tickTs: string | null = null;
  leadForming = false;
```

- In `anchorMetaBlock(id, count)`, add `ts` and `count` to every block it writes (thread the tick's timestamp in as a third parameter `ts: string`, and pass `this.tickTs ?? ""` from `setData`; blocks created for older slots carry the timestamp recorded for that slot).
- In `seedHistory` and `setData`, push `{ ordinal, slot, ts: s.timestamp }` into `trail` instead of `{ ordinal, slot }`.
- At the end of `setData`, after the anchor is read:

```ts
    this.tickTs = latest.timestamp;
    // `touched` is the ms the anchor count last GREW; quiet for LEAD_SETTLE_MS = settled.
    this.leadForming = !!a && Date.now() - a.touched < LEAD_SETTLE_MS;
```

Keep the documented early return (`!a || !a.metaCounts` → `[]`) exactly as it is; set `leadForming = false` on that path.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/engine/domain/ledgerModel.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/domain/ledgerModel.ts src/engine/domain/ledgerModel.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): per-slot timestamps for tile identity + the forming lead row

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Floor and rail camera framings

**Files:**
- Modify: `src/engine/domain/cameraRig.ts` (rename `ledgerLayerFraming`, add `ledgerRailFraming`)
- Modify: `src/engine/Engine.ts` (the two `ledgerLayerFraming` call sites: the import line and `_focusLayer`)
- Test: `src/engine/domain/cameraRig.test.ts`

**Interfaces:**
- Consumes: `CameraFraming` (existing).
- Produces:
  - `function ledgerFloorFraming(y: number, out: CameraFraming): void` — the diagonal layer-focus pose, unchanged numbers, renamed for the two-floor world.
  - `function ledgerRailFraming(x: number, y: number, out: CameraFraming): void` — frames a rail along the front edge, looking across it.
- `ledgerLayerFraming` no longer exists; Engine imports `ledgerFloorFraming` instead.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/domain/cameraRig.test.ts`:

```ts
import { ledgerFloorFraming, ledgerRailFraming } from "./cameraRig";

describe("ledger framings (two-floor chamber)", () => {
  it("frames a floor on the same diagonal the layer focus always used", () => {
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    ledgerFloorFraming(4, out);
    expect(out.pos.toArray()).toEqual([-7, 10.2, 23.5]);
    expect(out.target.toArray()).toEqual([0, 3, 0]);
  });

  it("frames a rail from in front of it, looking along the field", () => {
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    ledgerRailFraming(3.2, 2.85, out);
    // In front of the rail (further toward the camera) and slightly above it.
    expect(out.pos.z).toBeGreaterThan(0);
    expect(out.pos.y).toBeGreaterThan(2.85);
    expect(out.target.x).toBeCloseTo(0, 6);
    expect(out.target.y).toBeCloseTo(2.85, 6);
    // The rail runs across Z, so the pose must not be pushed off to one end of it.
    expect(out.target.z).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/engine/domain/cameraRig.test.ts`
Expected: FAIL — `No "ledgerFloorFraming" export is defined`.

- [ ] **Step 3: Write the implementation**

In `src/engine/domain/cameraRig.ts`, replace `ledgerLayerFraming` with:

```ts
// The FLOOR focus pose (renamed from ledgerLayerFraming with the two-floor redesign, 2026-08-04):
// the DIAGONAL is deliberately kept as the layer-focus move — the resting pose stays face-on, and
// stepping onto a floor is what tilts the room.
export function ledgerFloorFraming(y: number, out: CameraFraming): void {
  out.pos.set(-7, y + 6.2, 23.5);
  out.target.set(0, y - 1, 0);
}

// A RAIL focus pose (spec §5.1): rails run across Z at the front (+X) edge of their floor, so the
// camera drops to their height and stands off in front, looking back along the field. The target
// stays at z=0 so a long rail is framed centred rather than at one end.
export function ledgerRailFraming(x: number, y: number, out: CameraFraming): void {
  out.pos.set(x * LEDGER_VIEW_SCALE + 2.5, y + 3.4, 16.5);
  out.target.set(0, y, 0);
}
```

Add near the top of the module (the rail X arrives already scaled by the Engine, so this constant is only the documented lean-in nudge — keep the value inline if `LEDGER` is not already imported here):

```ts
// The ledger group's uniform scale; rail X positions are handed in pre-scaled, this is the
// stand-off nudge in the same units.
const LEDGER_VIEW_SCALE = 1;
```

In `src/engine/Engine.ts`, change the import `ledgerLayerFraming` → `ledgerFloorFraming` and its single call inside `_focusLayer` accordingly (the fuller `_focusLayer` rewrite lands in Task 17).

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/engine/domain/cameraRig.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/domain/cameraRig.ts src/engine/domain/cameraRig.test.ts src/engine/Engine.ts
git commit -m "$(cat <<'EOF'
feat(ledger): floor and rail camera framings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The `metaSnap` selection channel

**Files:**
- Modify: `src/data/types.ts` (add `MetaSnapSel` beside `PickDescriptor`)
- Modify: `src/store/store.ts` (`SelSlot` line 14, the state interface ~line 65, defaults ~line 216, setters ~line 253)
- Modify: `src/store/applyClickActions.ts`
- Modify: `src/engine/domain/pickActions.ts` (the `ClickAction` union only)
- Test: `src/store/store.test.ts`, `src/store/applyClickActions.test.ts`

**Interfaces:**
- Produces:
  - `interface MetaSnapSel { metaId: string; ordinal: number; hash: string; globalOrdinal: number; ts: string }` (in `src/data/types.ts`)
  - `useStore.metaSnap: MetaSnapSel | null`, `useStore.setMetaSnap(sel: MetaSnapSel | null): void`
  - `ClickAction | { kind: "metaSnap"; sel: MetaSnapSel | null }`
  - `SelSlot` gains `"metaSnap"`

- [ ] **Step 1: Write the failing test**

Append to `src/store/store.test.ts`:

```ts
describe("the metagraph-snapshot slot", () => {
  it("holds one metagraph snapshot and bumps the selection stack like every other slot", () => {
    const sel = { metaId: "DAG0", ordinal: 745190, hash: "abc", globalOrdinal: 4200, ts: "t" };
    useStore.getState().setMetaSnap(sel);
    expect(useStore.getState().metaSnap).toEqual(sel);
    expect(useStore.getState().selStack[0]).toBe("metaSnap");
    useStore.getState().setMetaSnap(null);
    expect(useStore.getState().metaSnap).toBeNull();
    expect(useStore.getState().selStack).not.toContain("metaSnap");
  });
});
```

Append to `src/store/applyClickActions.test.ts`:

```ts
it("applies a metaSnap action to exactly the metaSnap channel", () => {
  const sel = { metaId: "DAG0", ordinal: 7, hash: "h", globalOrdinal: 42, ts: "t" };
  applyClickActions([{ kind: "metaSnap", sel }]);
  expect(useStore.getState().metaSnap).toEqual(sel);
  applyClickActions([{ kind: "metaSnap", sel: null }]);
  expect(useStore.getState().metaSnap).toBeNull();
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/store/store.test.ts src/store/applyClickActions.test.ts`
Expected: FAIL — `setMetaSnap is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/data/types.ts`:

```ts
/** A selected METAGRAPH SNAPSHOT — a tile on the upper floor (redesign 2026-08-04, spec §7.1).
 *  A card SLOT, not a focus-ladder rung: like the global snapshot it has its own store channel
 *  and a fixed rail slot, and appears in no LADDER. `metaId` is the metagraph's id, which IS its
 *  state-channel address, so it keys `SnapshotExact.perMeta` directly. */
export interface MetaSnapSel {
  metaId: string;
  ordinal: number;       // the metagraph snapshot's OWN ordinal
  hash: string;
  globalOrdinal: number; // the global tick it anchored into
  ts: string;            // that tick's timestamp — the anchor join
}
```

In `src/store/store.ts`:

```ts
export type SelSlot = "node" | "snap" | "metaSnap" | "layer" | "country" | "cohort" | "composition";
```

```ts
  // The selected METAGRAPH SNAPSHOT (a tile on the ledger's upper floor). LEDGER-SCOPED like
  // `snap`: Engine.setMode clears it on the way out of the view. A selStack slot like `snap`.
  metaSnap: MetaSnapSel | null;
```

```ts
  metaSnap: null,
```

```ts
  setMetaSnap: (metaSnap) => set((s) => ({ metaSnap, selStack: bumpStack(s.selStack, "metaSnap", !!metaSnap) })),
```

with `setMetaSnap: (sel: MetaSnapSel | null) => void;` declared beside `setSnap` and `MetaSnapSel` added to the `@/src/data/types` import.

In `src/engine/domain/pickActions.ts`, extend the union (and import the type):

```ts
  | { kind: "metaSnap"; sel: MetaSnapSel | null }
```

In `src/store/applyClickActions.ts`, add to the switch:

```ts
      case "metaSnap": st.setMetaSnap(a.sel); break;
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/store && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/store/store.ts src/store/store.test.ts src/store/applyClickActions.ts src/store/applyClickActions.test.ts src/engine/domain/pickActions.ts
git commit -m "$(cat <<'EOF'
feat(ledger): the metaSnap selection channel and its one executor effect

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Tile and band click semantics

**Files:**
- Modify: `src/engine/domain/pickActions.ts` (add the two builders; extend `clearAllActions`)
- Test: `src/engine/domain/pickActions.test.ts`

**Interfaces:**
- Consumes: `MetaSnapSel` (Task 6), the existing `ClickAction`, `snapshotSelectActions`.
- Produces:
  - `function metaSnapSelectActions(sel: MetaSnapSel, global: Extract<PickDescriptor, { kind: "snapshot" }>, current: { filter: string; metaSnap: MetaSnapSel | null }): ClickAction[]`
  - `function bandSelectActions(metaId: string, global: Extract<PickDescriptor, { kind: "snapshot" }>, current: { filter: string; metaSnap: MetaSnapSel | null }): ClickAction[]`
  - `const sameMetaSnap: (a: MetaSnapSel | null, b: MetaSnapSel | null) => boolean`
  - `clearAllActions` gains a `hasMetaSnap: boolean` input field and emits `{ kind: "metaSnap", sel: null }`.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/domain/pickActions.test.ts`:

```ts
import { metaSnapSelectActions, bandSelectActions, sameMetaSnap } from "./pickActions";
import type { MetaSnapSel } from "@/src/data/types";

const SEL: MetaSnapSel = { metaId: "DAG-A", ordinal: 745190, hash: "h1", globalOrdinal: 4200, ts: "t" };
const GLOBAL = {
  kind: "snapshot" as const,
  data: { ordinal: 4200, timestamp: "t", hash: "g" },
  title: "Global snapshot #4200",
};

describe("metaSnapSelectActions (a tile on the upper floor)", () => {
  it("commits ancestry first and the subject last", () => {
    const a = metaSnapSelectActions(SEL, GLOBAL, { filter: "all", metaSnap: null });
    expect(a.map((x) => x.kind)).toEqual(["filter", "snapshot", "metaSnap"]);
    expect(a[0]).toEqual({ kind: "filter", id: "DAG-A" });
    expect(a[1]).toEqual({ kind: "snapshot", pick: GLOBAL, follow: false });
    expect(a[2]).toEqual({ kind: "metaSnap", sel: SEL });
  });

  it("does not churn the filter when it is already committed", () => {
    const a = metaSnapSelectActions(SEL, GLOBAL, { filter: "DAG-A", metaSnap: null });
    expect(a.map((x) => x.kind)).toEqual(["snapshot", "metaSnap"]);
  });

  it("steps back to the tick when the same tile is picked again", () => {
    const a = metaSnapSelectActions(SEL, GLOBAL, { filter: "DAG-A", metaSnap: { ...SEL } });
    expect(a).toEqual([{ kind: "metaSnap", sel: null }]);
  });
});

describe("bandSelectActions (a band on the byte bar)", () => {
  it("selects the metagraph and the tick, and drops the finer tile", () => {
    const a = bandSelectActions("DAG-A", GLOBAL, { filter: "all", metaSnap: SEL });
    expect(a).toEqual([
      { kind: "filter", id: "DAG-A" },
      { kind: "metaSnap", sel: null },
      { kind: "snapshot", pick: GLOBAL, follow: false },
    ]);
  });

  it("leaves an unlisted band without a filter commit", () => {
    const a = bandSelectActions("unlisted", GLOBAL, { filter: "all", metaSnap: null });
    expect(a).toEqual([{ kind: "snapshot", pick: GLOBAL, follow: false }]);
  });
});

describe("sameMetaSnap", () => {
  it("matches on the metagraph and its own ordinal", () => {
    expect(sameMetaSnap(SEL, { ...SEL })).toBe(true);
    expect(sameMetaSnap(SEL, { ...SEL, ordinal: 1 })).toBe(false);
    expect(sameMetaSnap(SEL, null)).toBe(false);
    expect(sameMetaSnap(null, null)).toBe(true);
  });
});

describe("clearAllActions", () => {
  it("sweeps the metagraph-snapshot slot too", () => {
    const a = clearAllActions({
      hasInspect: false, hasSnap: false, hasMetaSnap: true, cohort: null,
      composition: null, country: null, layerId: null, filter: "all",
    });
    expect(a).toContainEqual({ kind: "metaSnap", sel: null });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/engine/domain/pickActions.test.ts`
Expected: FAIL — `No "metaSnapSelectActions" export is defined`.

- [ ] **Step 3: Write the implementation**

Add to `src/engine/domain/pickActions.ts`:

```ts
export const sameMetaSnap = (a: MetaSnapSel | null, b: MetaSnapSel | null): boolean =>
  a === b || (!!a && !!b && a.metaId === b.metaId && a.ordinal === b.ordinal);

/** A TILE on the ledger's upper floor (spec §5.3): the metagraph snapshot itself. Filter-first,
 *  then the global tick it anchored into, subject LAST — the same full-ancestry contract a node
 *  select follows, so deselecting the tile steps back to the tick rather than to the network.
 *  `follow: false` because pinning a tile pins its tick; the live heartbeat is the strip's job. */
export function metaSnapSelectActions(
  sel: MetaSnapSel,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: { filter: string; metaSnap: MetaSnapSel | null },
): ClickAction[] {
  if (sameMetaSnap(current.metaSnap, sel)) return [{ kind: "metaSnap", sel: null }];
  const out: ClickAction[] = [];
  if (current.filter !== sel.metaId) out.push({ kind: "filter", id: sel.metaId });
  out.push({ kind: "snapshot", pick: global, follow: false });
  out.push({ kind: "metaSnap", sel });
  return out;
}

/** A BAND on the byte bar (spec §5.3): an aggregate of that metagraph's snapshots in one tick, so
 *  it selects the PAIR — the metagraph and the tick — and drops any finer tile. The neutral
 *  unlisted band names no metagraph, so it commits only the tick. */
export function bandSelectActions(
  metaId: string,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: { filter: string; metaSnap: MetaSnapSel | null },
): ClickAction[] {
  const out: ClickAction[] = [];
  const listed = metaId !== "unlisted";
  if (listed && current.filter !== metaId) out.push({ kind: "filter", id: metaId });
  if (current.metaSnap) out.push({ kind: "metaSnap", sel: null });
  out.push({ kind: "snapshot", pick: global, follow: false });
  return out;
}
```

Extend `clearAllActions`'s input with `hasMetaSnap: boolean` and emit `{ kind: "metaSnap", sel: null }` when it is set (before the snapshot clear, finest-first like the existing sweeps). Update its existing call site in `components/Inspector.tsx` (`clearAll`) to pass `hasMetaSnap: presentOf("metaSnap")`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/engine/domain/pickActions.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/domain/pickActions.ts src/engine/domain/pickActions.test.ts components/Inspector.tsx
git commit -m "$(cat <<'EOF'
feat(ledger): tile and band click semantics in the decision table

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Per-tick snapshot lookup for tile identity

**Files:**
- Modify: `src/data/anchorLog.ts`
- Modify: `src/data/api.ts` (widen `MetaSnapRecord` + the poll's mapping, ~lines 16–33 and 283–286)
- Test: `src/data/anchorLog.test.ts`

**Interfaces:**
- Consumes: `MetaSnapRecord`, `metaSnaps` (the `id → records` map the poll fills).
- Produces:
  - `function snapsAtTick(metaSnaps: ReadonlyMap<string, MetaSnapRecord[]>, metaId: string, ts: string): MetaSnapRecord[]`
  - `MetaSnapRecord` gains `height: number; subHeight: number; blocks: number; epochProgress: number`

- [ ] **Step 1: Write the failing test**

Append to `src/data/anchorLog.test.ts`:

```ts
import { snapsAtTick } from "./anchorLog";

describe("snapsAtTick", () => {
  const rec = (ordinal: number, ts: string) => ({
    ordinal, hash: `h${ordinal}`, parent: `p${ordinal}`, ts, fee: 1, sizeInKB: 2,
    height: 8, subHeight: ordinal, blocks: 0, epochProgress: 100,
  });
  const map = new Map([["A", [rec(1, "t1"), rec(2, "t2"), rec(3, "t2")]]]);

  it("returns that metagraph's snapshots for one anchoring tick, oldest first", () => {
    expect(snapsAtTick(map, "A", "t2").map((r) => r.ordinal)).toEqual([2, 3]);
  });

  it("returns an empty list for an unknown metagraph or a tick it sat out", () => {
    expect(snapsAtTick(map, "B", "t2")).toEqual([]);
    expect(snapsAtTick(map, "A", "t9")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/data/anchorLog.test.ts`
Expected: FAIL — `No "snapsAtTick" export is defined`.

- [ ] **Step 3: Write the implementation**

In `src/data/anchorLog.ts`:

```ts
/** The metagraph snapshots one metagraph anchored into ONE global tick, oldest first.
 *  This is what makes a ledger tile identifiable without a fetch (spec §6.1): the 4s poll already
 *  stamps every metagraph snapshot with the timestamp of the global it anchored into, so the tile
 *  the upper floor draws can name its own snapshot. A tick older than the polled buffer yields an
 *  empty list — an ANONYMOUS tile: drawn, because it happened, but not pickable. */
export function snapsAtTick(
  metaSnaps: ReadonlyMap<string, MetaSnapRecord[]>,
  metaId: string,
  ts: string,
): MetaSnapRecord[] {
  const recs = metaSnaps.get(metaId);
  if (!recs) return [];
  return recs.filter((r) => r.ts === ts);
}
```

In `src/data/api.ts`, widen the record and the raw shape (these fields are already on the wire — spec §2 — and cost nothing):

```ts
export interface MetaSnapRecord {
  ordinal: number;
  hash: string;
  parent: string;
  ts: string;
  fee: number;
  sizeInKB: number;
  height: number;        // the metagraph's OWN block-DAG depth
  subHeight: number;     // orders snapshots that share a height
  blocks: number;        // rare on mainnet; an honest 0 beats omitting it
  epochProgress: number;
}
```

```ts
interface RawMetaSnapshot {
  ordinal: number;
  hash: string;
  lastSnapshotHash: string;
  timestamp: string;
  fee?: number;
  sizeInKB?: number;
  height?: number;
  subHeight?: number;
  blocks?: unknown[];
  epochProgress?: number;
}
```

and the mapping at ~line 283:

```ts
    this._recordMetaSnaps(m, list.map((s) => ({
      ordinal: s.ordinal, hash: s.hash, parent: s.lastSnapshotHash,
      ts: s.timestamp, fee: s.fee || 0, sizeInKB: s.sizeInKB || 0,
      height: s.height || 0, subHeight: s.subHeight || 0,
      blocks: Array.isArray(s.blocks) ? s.blocks.length : 0,
      epochProgress: s.epochProgress || 0,
    })));
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/data && npm test && npx tsc --noEmit`
Expected: PASS. (`roster.test.ts` / `anchorLog.test.ts` fixtures that construct `MetaSnapRecord` literals need the four new fields — add them.)

- [ ] **Step 5: Commit**

```bash
git add src/data/anchorLog.ts src/data/anchorLog.test.ts src/data/api.ts src/data/roster.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): per-tick snapshot lookup and the free per-snapshot facts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Per-anchor rows on the exact read

**Files:**
- Modify: `app/api/snapshot/[ordinal]/route.ts` (the `StateChannelSnap` type, `fetchExact`)
- Modify: `src/data/types.ts` (`ChannelSnapRow`, `SnapshotExact.rows`)
- Test: `app/api/snapshot/decodeChannel.test.ts`
- Create: `app/api/snapshot/decodeChannel.ts` (the pure decode helper both routes share)

**Interfaces:**
- Consumes: the raw L0 `value.stateChannelSnapshots` shape `{ address: [{ value: { fee, content, lastSnapshotHash }, proofs: [{ id, signature }] }] }`, where `content` is a **byte array of brotli-compressed JSON** (verified 2026-08-04).
- Produces:
  - `interface ChannelSnapRow { metaId: string; ordinal: number; decoded: boolean; fee: number; bytes: number; signers: string[]; blocks: number; hasState: boolean; stateBytes: number; stateProof: string | null }` (in `src/data/types.ts`)
  - `SnapshotExact.rows: ChannelSnapRow[]` (the summed `perMeta` **stays** — the byte bar reads it and must not sum rows per frame)
  - `async function decodeChannelContent(content: unknown): Promise<DecodedChannel | null>` and `interface DecodedChannel` (in `app/api/snapshot/decodeChannel.ts`)
  - `const SIGNER_LEN = 8`, `function shortSigner(id: string): string`

- [ ] **Step 1: Write the failing test**

Create `app/api/snapshot/decodeChannel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { brotliCompressSync } from "node:zlib";
import { decodeChannelContent, shortSigner, SIGNER_LEN } from "./decodeChannel";

const payload = {
  value: {
    ordinal: 745190,
    height: 8,
    subHeight: 73538,
    lastSnapshotHash: "338f5b63aa",
    epochProgress: 745071,
    blocks: [],
    dataApplication: {
      onChainState: Array.from(Buffer.from(JSON.stringify({ updates: [{ deviceId: "DAG3" }, { deviceId: "DAG4" }] }))),
      blocks: [Array.from(Buffer.from(JSON.stringify({ proofs: [{ id: "79c986a5deadbeef", signature: "3044" }] })))],
      calculatedStateProof: "a6ef9b0c",
    },
  },
  proofs: [{ id: "04917e4bcafebabe", signature: "3044" }, { id: "741b1977f00dcafe", signature: "3045" }],
};
const content = Array.from(brotliCompressSync(Buffer.from(JSON.stringify(payload))));

describe("decodeChannelContent", () => {
  it("brotli-decodes an anchored entry into its real facts", async () => {
    const d = (await decodeChannelContent(content))!;
    expect(d.ordinal).toBe(745190);
    expect(d.height).toBe(8);
    expect(d.subHeight).toBe(73538);
    expect(d.epochProgress).toBe(745071);
    expect(d.lastSnapshotHash).toBe("338f5b63aa");
    expect(d.blocks).toBe(0);
  });

  it("truncates signer ids — a full-length list is ~16x the payload on a busy tick", async () => {
    const d = (await decodeChannelContent(content))!;
    expect(d.signers).toEqual(["04917e4b", "741b1977"]);
    expect(shortSigner("04917e4bcafebabe")).toHaveLength(SIGNER_LEN);
  });

  it("reports the application state's shape without interpreting it", async () => {
    const d = (await decodeChannelContent(content))!;
    expect(d.hasState).toBe(true);
    expect(d.stateBytes).toBeGreaterThan(0);
    expect(d.stateProof).toBe("a6ef9b0c");
    expect(d.stateKeys).toEqual([{ key: "updates", count: 2 }]);
    expect(JSON.parse(d.state).updates).toHaveLength(2);
    expect(d.dataBlockSigners).toEqual(["79c986a5"]);
  });

  it("calls a genuinely empty state what it is", async () => {
    const empty = {
      value: { ordinal: 1, dataApplication: { onChainState: Array.from(Buffer.from('{"latestOrdinal":{},"latestUpdates":{}}')), blocks: [] } },
      proofs: [],
    };
    const d = (await decodeChannelContent(Array.from(brotliCompressSync(Buffer.from(JSON.stringify(empty))))))!;
    expect(d.hasState).toBe(false);
    expect(d.stateKeys).toEqual([{ key: "latestOrdinal", count: 0 }, { key: "latestUpdates", count: 0 }]);
  });

  it("returns null rather than throwing on anything it cannot read", async () => {
    expect(await decodeChannelContent(null)).toBeNull();
    expect(await decodeChannelContent([1, 2, 3])).toBeNull();
    expect(await decodeChannelContent("not an array")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run app/api/snapshot/decodeChannel.test.ts`
Expected: FAIL — `Failed to load ./decodeChannel`.

- [ ] **Step 3: Write the implementation**

Create `app/api/snapshot/decodeChannel.ts`:

```ts
// A global snapshot carries each anchored metagraph snapshot as `value.content`: a byte array of
// BROTLI-COMPRESSED JSON — the complete metagraph snapshot, which Global L0 never interprets
// (verified against mainnet 2026-08-04). Decoding it is what lets a metagraph snapshot become a
// subject with real facts instead of a fee and a size.
//
// Everything here is pure and server-side; both the per-ordinal route (summary rows) and the
// per-channel route (the full read) share it, so the two can never disagree.
import { brotliDecompress } from "node:zlib";
import { promisify } from "node:util";

const inflate = promisify(brotliDecompress);

/** Signer ids are truncated the way `hex()` already truncates them in the UI: a 138-anchor tick
 *  carries ~1600 validator keys, ~53 KB at full length against ~3.3 KB truncated. */
export const SIGNER_LEN = 8;
export const shortSigner = (id: string): string => id.slice(0, SIGNER_LEN);

export interface DecodedChannel {
  ordinal: number;
  height: number;
  subHeight: number;
  epochProgress: number;
  lastSnapshotHash: string;
  blocks: number;
  signers: string[];
  /** The application state's SHAPE — top-level keys and how many records sit under each. */
  stateKeys: { key: string; count: number }[];
  stateBytes: number;
  stateProof: string | null;
  /** True only when the state carries something; DED's `{"latestOrdinal":{},"latestUpdates":{}}`
   *  is 39 bytes of nothing and must not earn a "show deeper" invitation. */
  hasState: boolean;
  /** The decoded state as text — the raw layer renders it; the card never does (spec §7.3). */
  state: string;
  dataBlockSigners: string[];
}

const asBytes = (v: unknown): Buffer | null =>
  Array.isArray(v) && v.length > 0 ? Buffer.from(v as number[]) : null;

function shapeOf(state: unknown): { keys: { key: string; count: number }[]; has: boolean } {
  if (!state || typeof state !== "object") return { keys: [], has: false };
  const keys: { key: string; count: number }[] = [];
  let has = false;
  for (const [key, v] of Object.entries(state as Record<string, unknown>)) {
    const count = Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : v == null ? 0 : 1;
    if (count > 0) has = true;
    keys.push({ key, count });
  }
  return { keys, has };
}

/** `content` → the metagraph snapshot's real facts, or null if it can't be read (a channel using
 *  another encoding must degrade to bytes-only, never break the tick's read). */
export async function decodeChannelContent(content: unknown): Promise<DecodedChannel | null> {
  const bytes = asBytes(content);
  if (!bytes) return null;
  let root: Record<string, unknown>;
  try {
    root = JSON.parse((await inflate(bytes)).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const value = (root.value ?? {}) as Record<string, unknown>;
  const proofs = Array.isArray(root.proofs) ? (root.proofs as { id?: string }[]) : [];
  const app = (value.dataApplication ?? null) as Record<string, unknown> | null;

  const stateBuf = app ? asBytes(app.onChainState) : null;
  const stateText = stateBuf ? stateBuf.toString("utf8") : "";
  let parsed: unknown = null;
  try { parsed = stateText ? JSON.parse(stateText) : null; } catch { parsed = null; }
  const shape = shapeOf(parsed);

  const appBlocks = app && Array.isArray(app.blocks) ? (app.blocks as unknown[]) : [];
  const dataBlockSigners: string[] = [];
  for (const b of appBlocks) {
    const buf = asBytes(b);
    if (!buf) continue;
    try {
      const blk = JSON.parse(buf.toString("utf8")) as { proofs?: { id?: string }[] };
      for (const p of blk.proofs ?? []) if (p.id) dataBlockSigners.push(shortSigner(p.id));
    } catch { /* a block we can't read is one we don't claim */ }
  }

  return {
    ordinal: typeof value.ordinal === "number" ? value.ordinal : 0,
    height: typeof value.height === "number" ? value.height : 0,
    subHeight: typeof value.subHeight === "number" ? value.subHeight : 0,
    epochProgress: typeof value.epochProgress === "number" ? value.epochProgress : 0,
    lastSnapshotHash: typeof value.lastSnapshotHash === "string" ? value.lastSnapshotHash : "",
    blocks: Array.isArray(value.blocks) ? value.blocks.length : 0,
    signers: proofs.map((p) => shortSigner(p.id ?? "")).filter(Boolean),
    stateKeys: shape.keys,
    stateBytes: stateBuf ? stateBuf.length : 0,
    stateProof: app && typeof app.calculatedStateProof === "string" ? app.calculatedStateProof : null,
    hasState: shape.has,
    state: stateText,
    dataBlockSigners: [...new Set(dataBlockSigners)],
  };
}
```

In `src/data/types.ts`:

```ts
/** One anchored metagraph snapshot inside a global tick, from the exact read (spec §7.2 tier 2). */
export interface ChannelSnapRow {
  metaId: string;      // the state-channel address
  ordinal: number;     // the metagraph snapshot's own ordinal (0 when the payload can't be decoded)
  decoded: boolean;
  fee: number;
  bytes: number;
  signers: string[];   // truncated validator ids
  blocks: number;
  hasState: boolean;
  stateBytes: number;
  stateProof: string | null;
}
```

and add `rows: ChannelSnapRow[];` to `SnapshotExact` (keeping `perMeta` — the byte bar reads the sums directly).

In `app/api/snapshot/[ordinal]/route.ts`, widen the entry type and build the rows inside the existing `Object.entries(sc)` loop:

```ts
type StateChannelSnap = { value?: { fee?: number; content?: unknown[] } };
```

```ts
      const decoded = await decodeChannelContent(s?.value?.content);
      rows.push({
        metaId: addr,
        ordinal: decoded?.ordinal ?? 0,
        decoded: !!decoded,
        fee, bytes,
        signers: decoded?.signers ?? [],
        blocks: decoded?.blocks ?? 0,
        hasState: decoded?.hasState ?? false,
        stateBytes: decoded?.stateBytes ?? 0,
        stateProof: decoded?.stateProof ?? null,
      });
```

(declare `const rows: ChannelSnapRow[] = [];` before the loop, make the loop body `await`-able, and add `rows` to the returned object). The route's `unstable_cache` and `maxDuration = 30` are unchanged — the decode runs at most once per ordinal per day.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run app/api/snapshot/decodeChannel.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify against mainnet**

Run (the one dev server is already up on :3000):

```bash
curl -s "http://localhost:3000/api/snapshot/$(curl -s https://be-mainnet.constellationnetwork.io/global-snapshots/latest | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["ordinal"]-3)')" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["anchored"],len(d["rows"]));print(d["rows"][0])'
```
Expected: a non-zero row count, and the first row carrying a real `ordinal` with `decoded: true`.

- [ ] **Step 6: Commit**

```bash
git add app/api/snapshot src/data/types.ts
git commit -m "$(cat <<'EOF'
feat(api): brotli-decode each anchored snapshot into per-entry rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: The per-channel deep read

**Files:**
- Create: `app/api/snapshot/[ordinal]/channel/[address]/route.ts`
- Modify: `src/data/types.ts` (`ChannelSnapDeep`)
- Modify: `src/store/store.ts` (`metaSnapDeep` cache channel + `setMetaSnapDeep`)
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `decodeChannelContent`, `shortSigner` (Task 9).
- Produces:
  - `interface ChannelSnapDeep { globalOrdinal: number; metaId: string; ordinal: number; height: number; subHeight: number; epochProgress: number; lastSnapshotHash: string; fee: number; bytes: number; blocks: number; signers: string[]; stateKeys: { key: string; count: number }[]; stateBytes: number; stateProof: string | null; state: string; dataBlockSigners: string[] }`
  - `function metaSnapDeepKey(globalOrdinal: number, metaId: string): string`
  - `useStore.metaSnapDeep: Record<string, ChannelSnapDeep>`, `useStore.setMetaSnapDeep(d: ChannelSnapDeep): void`
  - Route: `GET /api/snapshot/[ordinal]/channel/[address]` → `ChannelSnapDeep` (200) | `{ available: false }` (404)

- [ ] **Step 1: Write the failing test**

Append to `src/store/store.test.ts`:

```ts
import { metaSnapDeepKey } from "@/src/data/types";

describe("the deep channel read cache", () => {
  it("keys a decode by the tick AND the metagraph, and keeps the first value", () => {
    const d = {
      globalOrdinal: 42, metaId: "DAG0", ordinal: 7, height: 8, subHeight: 9, epochProgress: 10,
      lastSnapshotHash: "h", fee: 1, bytes: 2, blocks: 0, signers: ["04917e4b"],
      stateKeys: [{ key: "updates", count: 3 }], stateBytes: 929, stateProof: "p",
      state: "{}", dataBlockSigners: [],
    };
    expect(metaSnapDeepKey(42, "DAG0")).toBe("42:DAG0");
    useStore.getState().setMetaSnapDeep(d);
    expect(useStore.getState().metaSnapDeep[metaSnapDeepKey(42, "DAG0")]).toEqual(d);
    useStore.getState().setMetaSnapDeep({ ...d, bytes: 999 });
    expect(useStore.getState().metaSnapDeep[metaSnapDeepKey(42, "DAG0")].bytes).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/store/store.test.ts`
Expected: FAIL — `No "metaSnapDeepKey" export is defined`.

- [ ] **Step 3: Write the implementation**

In `src/data/types.ts`:

```ts
/** The full decode of ONE anchored metagraph snapshot (spec §7.3). Fetched only on a deliberate
 *  gesture — it re-downloads the ~2.5 MB global to reach one entry. */
export interface ChannelSnapDeep {
  globalOrdinal: number;
  metaId: string;
  ordinal: number;
  height: number;
  subHeight: number;
  epochProgress: number;
  lastSnapshotHash: string;
  fee: number;
  bytes: number;
  blocks: number;
  signers: string[];
  stateKeys: { key: string; count: number }[];
  stateBytes: number;
  stateProof: string | null;
  state: string;
  dataBlockSigners: string[];
}

export const metaSnapDeepKey = (globalOrdinal: number, metaId: string): string => `${globalOrdinal}:${metaId}`;
```

In `src/store/store.ts` (beside `snapshotExact`, same immutable-first-write discipline and a small cap):

```ts
  metaSnapDeep: Record<string, ChannelSnapDeep>;
  setMetaSnapDeep: (d: ChannelSnapDeep) => void;
```

```ts
  metaSnapDeep: {},
  setMetaSnapDeep: (d) => set((s) => {
    const key = metaSnapDeepKey(d.globalOrdinal, d.metaId);
    if (s.metaSnapDeep[key]) return {}; // a decoded snapshot is immutable
    const next = { ...s.metaSnapDeep, [key]: d };
    const keys = Object.keys(next);
    if (keys.length > DEEP_MAX) delete next[keys[0]];
    return { metaSnapDeep: next };
  }),
```

with `const DEEP_MAX = 24;` beside `EXACT_MAX`.

Create `app/api/snapshot/[ordinal]/channel/[address]/route.ts`:

```ts
// The DEEPER read (spec §7.3/§7.4): one anchored metagraph snapshot, fully decoded — its own
// ordinal and height, its signing validators, and the shape AND payload of its application state.
//
// This re-downloads the ~2.5 MB global snapshot to reach a single entry. That cost is accepted
// deliberately: the read is cached immutably per (ordinal, address) pair and only ever runs on an
// explicit gesture on one card, never on a poll and never across the chain.
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { decodeChannelContent } from "../../../decodeChannel";
import type { ChannelSnapDeep } from "@/src/data/types";

export const maxDuration = 30;

const L0 = "https://l0-lb-mainnet.constellationnetwork.io";

async function fetchDeep(ordinal: number, address: string): Promise<ChannelSnapDeep> {
  const r = await fetch(`${L0}/global-snapshots/${ordinal}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`l0 ${r.status}`);
  const j = (await r.json()) as { value?: { stateChannelSnapshots?: Record<string, { value?: { fee?: number; content?: unknown[] } }[]> } };
  const sc = j?.value?.stateChannelSnapshots;
  if (!sc) throw new Error("no stateChannelSnapshots");
  const entries = sc[address];
  if (!entries || !entries.length) throw new Error("channel not in this snapshot");

  // A metagraph can anchor several snapshots into one tick; the deep read takes the NEWEST, which
  // is the one the card's tier-1 facts name.
  let best: ChannelSnapDeep | null = null;
  for (const e of entries) {
    const d = await decodeChannelContent(e?.value?.content);
    if (!d) continue;
    const row: ChannelSnapDeep = {
      globalOrdinal: ordinal,
      metaId: address,
      ordinal: d.ordinal,
      height: d.height,
      subHeight: d.subHeight,
      epochProgress: d.epochProgress,
      lastSnapshotHash: d.lastSnapshotHash,
      fee: e?.value?.fee ?? 0,
      bytes: Array.isArray(e?.value?.content) ? e.value!.content!.length : 0,
      blocks: d.blocks,
      signers: d.signers,
      stateKeys: d.stateKeys,
      stateBytes: d.stateBytes,
      stateProof: d.stateProof,
      state: d.state,
      dataBlockSigners: d.dataBlockSigners,
    };
    if (!best || row.ordinal > best.ordinal) best = row;
  }
  if (!best) throw new Error("nothing decodable in this channel");
  return best;
}

const cachedDeep = (ordinal: number, address: string) =>
  unstable_cache(() => fetchDeep(ordinal, address), ["snapshot-channel", String(ordinal), address], {
    revalidate: 86400,
  })();

export async function GET(_req: Request, ctx: { params: Promise<{ ordinal: string; address: string }> }) {
  const { ordinal: ordStr, address } = await ctx.params;
  const ordinal = Number(ordStr);
  if (!Number.isFinite(ordinal) || ordinal <= 0 || !address) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const data = await cachedDeep(ordinal, address);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    });
  } catch {
    // The L0 node prunes after ~30 min — an honest 404, not a fabricated body.
    return NextResponse.json({ available: false, ordinal, address }, { status: 404 });
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/store/store.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify against mainnet**

```bash
ORD=$(curl -s https://be-mainnet.constellationnetwork.io/global-snapshots/latest | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["ordinal"]-3)')
ADDR=$(curl -s "http://localhost:3000/api/snapshot/$ORD" | python3 -c 'import sys,json;print(json.load(sys.stdin)["rows"][0]["metaId"])')
curl -s "http://localhost:3000/api/snapshot/$ORD/channel/$ADDR" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["ordinal"],d["height"],len(d["signers"]),d["stateKeys"])'
```
Expected: a real ordinal/height, a non-empty signer list, and the state's key shape.

- [ ] **Step 6: Commit**

```bash
git add app/api/snapshot src/data/types.ts src/store/store.ts src/store/store.test.ts
git commit -m "$(cat <<'EOF'
feat(api): per-channel deep snapshot read, cached immutably per pair

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Boot backfill and the deep fetch bridge

**Files:**
- Modify: `components/RawSnapshotBridge.tsx`
- Test: `components/rawSnapshotBridge.test.ts` (create)

**Interfaces:**
- Consumes: `useStore.latestSnapshot`, `useStore.snap`, `useStore.metaSnap`, `setSnapshotExact`, `setMetaSnapDeep`, `metaSnapDeepKey`.
- Produces:
  - `const BACKFILL_N = 8`, `const BACKFILL_GAP_MS = 450`
  - `function backfillOrdinals(latest: number | null, have: Readonly<Record<number, unknown>>, n?: number): number[]` — exported pure helper, tested.

- [ ] **Step 1: Write the failing test**

Create `components/rawSnapshotBridge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { backfillOrdinals, BACKFILL_N, BACKFILL_GAP_MS } from "./RawSnapshotBridge";

describe("backfillOrdinals", () => {
  it("asks for the previous eight ticks, newest first", () => {
    expect(backfillOrdinals(100, {})).toEqual([99, 98, 97, 96, 95, 94, 93, 92]);
    expect(BACKFILL_N).toBe(8);
  });

  it("skips ticks already read", () => {
    expect(backfillOrdinals(100, { 99: {}, 97: {} }, 4)).toEqual([98, 96, 95]);
  });

  it("asks for nothing before the feed is live, or below ordinal 1", () => {
    expect(backfillOrdinals(null, {})).toEqual([]);
    expect(backfillOrdinals(3, {}, 8)).toEqual([2, 1]);
  });

  it("paces the backfill so a cold load never bursts the route", () => {
    expect(BACKFILL_GAP_MS).toBeGreaterThanOrEqual(400);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/rawSnapshotBridge.test.ts`
Expected: FAIL — `No "backfillOrdinals" export is defined`.

- [ ] **Step 3: Write the implementation**

In `components/RawSnapshotBridge.tsx`, keep the existing `ensure()` and add:

```tsx
// The byte bar needs a MEASURED width for every tick in the trail, and only the live tick is read
// as it happens. A cold page load therefore starts with a trail of unmeasured seams, so the bridge
// backfills the previous few ordinals ONCE, in the background, paced so it never bursts the route
// (each ordinal is immutable and cached for a day, so this is cheap after the first visitor).
export const BACKFILL_N = 8;
export const BACKFILL_GAP_MS = 450;

export function backfillOrdinals(
  latest: number | null,
  have: Readonly<Record<number, unknown>>,
  n: number = BACKFILL_N,
): number[] {
  if (latest == null) return [];
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    const ord = latest - i;
    if (ord < 1) break;
    if (!have[ord]) out.push(ord);
  }
  return out;
}
```

and inside the component:

```tsx
  const deepSel = useStore((s) => s.metaSnap);
  const backfilled = useRef(false);

  // One-shot, on the first live tick.
  useEffect(() => {
    if (backfilled.current || liveOrd == null) return;
    backfilled.current = true;
    const queue = backfillOrdinals(liveOrd, useStore.getState().snapshotExact);
    let i = 0;
    const timer = setInterval(() => {
      if (i >= queue.length) { clearInterval(timer); return; }
      ensure(queue[i++]);
    }, BACKFILL_GAP_MS);
    return () => clearInterval(timer);
  }, [liveOrd]);

  // The deeper read: only ever for the ONE selected metagraph snapshot, never a poll.
  useEffect(() => {
    if (!deepSel) return;
    const key = metaSnapDeepKey(deepSel.globalOrdinal, deepSel.metaId);
    const st = useStore.getState();
    if (st.metaSnapDeep[key] || deepInflight.has(key)) return;
    deepInflight.add(key);
    fetch(`/api/snapshot/${deepSel.globalOrdinal}/channel/${deepSel.metaId}`)
      .then((r) => (r.ok ? (r.json() as Promise<ChannelSnapDeep>) : null))
      .then((d) => { if (d && typeof d.ordinal === "number") st.setMetaSnapDeep(d); })
      .catch(() => {})
      .finally(() => deepInflight.delete(key));
  }, [deepSel]);
```

with `const deepInflight = new Set<string>();` beside the existing module-level `inflight`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run components/rawSnapshotBridge.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/RawSnapshotBridge.tsx components/rawSnapshotBridge.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): backfill the trail's exact reads at boot, fetch the deep channel on demand

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Currency activity for the gutter status line

**Files:**
- Create: `app/api/currency-activity/route.ts`
- Modify: `src/data/types.ts` (`CurrencyActivity`)
- Create: `src/data/currencyActivity.ts` (the pure classifier + copy)
- Test: `src/data/currencyActivity.test.ts`

**Interfaces:**
- Consumes: `METAGRAPHS` from `src/engine/config`, the explorer's `/currency/{id}/transactions?limit=1`.
- Produces:
  - `interface CurrencyActivity { metaId: string; state: "active" | "dormant" | "none"; lastTs: string | null }`
  - `function classifyActivity(lastTs: string | null, now: number): CurrencyActivity["state"]`
  - `function activityLine(a: CurrencyActivity | null, ticker: string, now: number): string`
  - Route: `GET /api/currency-activity` → `{ items: CurrencyActivity[] }` (200) | 503

- [ ] **Step 1: Write the failing test**

Create `src/data/currencyActivity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyActivity, activityLine } from "./currencyActivity";

const NOW = Date.parse("2026-08-04T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 86400000;

describe("classifyActivity", () => {
  it("separates a live token from a dormant one from no token at all", () => {
    expect(classifyActivity(ago(3600_000), NOW)).toBe("active");
    expect(classifyActivity(ago(6 * DAY), NOW)).toBe("active");
    expect(classifyActivity(ago(40 * DAY), NOW)).toBe("dormant");
    expect(classifyActivity(null, NOW)).toBe("none");
  });
});

describe("activityLine", () => {
  it("states the absolute age, never a window-relative one", () => {
    expect(activityLine({ metaId: "m", state: "dormant", lastTs: ago(330 * DAY) }, "PACA", NOW))
      .toBe("PACA · DORMANT 11 MONTHS");
    expect(activityLine({ metaId: "m", state: "active", lastTs: ago(2 * 3600_000) }, "DOR", NOW))
      .toBe("DOR · ACTIVE 2 HOURS AGO");
    expect(activityLine({ metaId: "m", state: "none", lastTs: null }, "DED", NOW))
      .toBe("DED · NO CURRENCY");
  });

  it("says so honestly while the read is missing", () => {
    expect(activityLine(null, "SWAP", NOW)).toBe("SWAP · NO SIGNAL");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/data/currencyActivity.test.ts`
Expected: FAIL — `Failed to load ./currencyActivity`.

- [ ] **Step 3: Write the implementation**

Create `src/data/currencyActivity.ts`:

```ts
// The currency gutter's status line (spec §6.7). The gutter must not read as "quiet" just because
// the visible 36-second window is quiet — currency activity is measured against an ABSOLUTE clock,
// so PACA's eleven dormant months and DED's absent token read as the different facts they are.
import type { CurrencyActivity } from "./types";

const DAY = 86400000;
const DORMANT_AFTER = 30 * DAY;

export function classifyActivity(lastTs: string | null, now: number): CurrencyActivity["state"] {
  if (!lastTs) return "none";
  const t = Date.parse(lastTs);
  if (!Number.isFinite(t)) return "none";
  return now - t > DORMANT_AFTER ? "dormant" : "active";
}

function coarseAge(ms: number): string {
  const mo = Math.round(ms / (30 * DAY));
  if (mo >= 1) return `${mo} MONTH${mo === 1 ? "" : "S"}`;
  const d = Math.round(ms / DAY);
  if (d >= 1) return `${d} DAY${d === 1 ? "" : "S"}`;
  const h = Math.max(1, Math.round(ms / 3600000));
  return `${h} HOUR${h === 1 ? "" : "S"}`;
}

export function activityLine(a: CurrencyActivity | null, ticker: string, now: number): string {
  if (!a) return `${ticker} · NO SIGNAL`;
  if (a.state === "none" || !a.lastTs) return `${ticker} · NO CURRENCY`;
  const age = coarseAge(Math.max(0, now - Date.parse(a.lastTs)));
  return a.state === "dormant" ? `${ticker} · DORMANT ${age}` : `${ticker} · ACTIVE ${age} AGO`;
}
```

In `src/data/types.ts`:

```ts
/** Whether a metagraph's own token is moving — the ledger's currency-gutter status (spec §6.7). */
export interface CurrencyActivity {
  metaId: string;
  state: "active" | "dormant" | "none";
  lastTs: string | null;
}
```

Create `app/api/currency-activity/route.ts` (following `app/api/geo/route.ts`'s shape: server-side fetch, `unstable_cache`, honest 503):

```ts
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { METAGRAPHS } from "@/src/engine/config";
import { classifyActivity } from "@/src/data/currencyActivity";
import type { CurrencyActivity } from "@/src/data/types";

export const maxDuration = 30;

const BE = "https://be-mainnet.constellationnetwork.io";

async function lastTxTs(id: string): Promise<string | null> {
  try {
    const r = await fetch(`${BE}/currency/${id}/transactions?limit=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { timestamp?: string }[] };
    return j?.data?.[0]?.timestamp ?? null;
  } catch {
    return null; // a metagraph with no currency answers nothing — that IS the reading
  }
}

async function fetchActivity(): Promise<CurrencyActivity[]> {
  const now = Date.now();
  const items = await Promise.all(
    METAGRAPHS.map(async (m): Promise<CurrencyActivity> => {
      const lastTs = await lastTxTs(m.id);
      return { metaId: m.id, lastTs, state: classifyActivity(lastTs, now) };
    }),
  );
  if (!items.length) throw new Error("empty");
  return items;
}

const cached = unstable_cache(fetchActivity, ["currency-activity"], { revalidate: 600 });

export async function GET() {
  try {
    return NextResponse.json({ items: await cached() });
  } catch {
    return NextResponse.json({ error: "currency activity unavailable" }, { status: 503 });
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/data/currencyActivity.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify against mainnet**

Run: `curl -s http://localhost:3000/api/currency-activity | python3 -m json.tool | head -30`
Expected: ten items; PACA `dormant`, DED `none`, DOR `active`.

- [ ] **Step 6: Commit**

```bash
git add app/api/currency-activity src/data/currencyActivity.ts src/data/currencyActivity.test.ts src/data/types.ts
git commit -m "$(cat <<'EOF'
feat(api): currency activity per metagraph, on an absolute clock

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Node rails in the scene

**Files:**
- Create: `src/engine/scene/objects/NodeRails.ts`
- Modify: `src/engine/domain/records.ts` (`MetaNodeRecord.ledgerHide`)
- Modify: `src/engine/scene/Globe.ts` (both ledger placement blocks, ~line 311 and ~line 484)
- Test: covered by `src/engine/domain/ledgerRails.test.ts` (Task 3) plus the scene test gates

**Interfaces:**
- Consumes: `railKindOf`, `visibleRails`, `railChipPos`, `railLayerId`, `railLit` (Task 3); `RAIL_GROUP_FLOOR`, `railX`, `railY`, `LANE_HALF_Z`, `LEDGER` (Task 1); `SceneColors`.
- Produces:
  - `class NodeRails { group: THREE.Group; pickables: THREE.Object3D[]; constructor(colors: SceneColors); setRails(group: RailGroup, kinds: RailKind[]): void; setHighlight(layerId: string | null, dimOthers: boolean): void; setAlpha(a: number): void; update(dt: number): void; dispose(): void }`
  - `Globe.railKinds(group: RailGroup): RailKind[]` — the rails a group actually has, tallied on the last data rebuild. `LedgerView` forwards it to `NodeRails.setRails` (Task 16) and the Engine reads it for rail framing (Task 17), so the furniture and the chips can never disagree about which rails exist.
  - `Globe.setSignerIds(ids: readonly string[] | null): void` — the signer glow behind spec §5.3's signer pairing, fed from the selected metagraph snapshot (Task 17). It joins the EXISTING group-tier channel; no new mechanism.
  - `Globe.railSlotOf(machineKey: string): number` is **not** needed — Globe computes slots while building records.

- [ ] **Step 1: Write the failing check**

There is no unit test for a Three adapter; the executable gates are the scene contract tests plus type-checking. Write the check first by running them against the not-yet-existing module:

Run: `npx vitest run src/engine/noFrameAllocations.test.ts src/engine/noHardcodedColors.test.ts src/engine/layerBoundaries.test.ts && npx tsc --noEmit`
Expected: PASS now (nothing added yet) — this is the baseline the new file must not break. Re-run it in step 3 after each edit.

- [ ] **Step 2: Give metagraph node records a ledger-hide flag**

In `src/engine/domain/records.ts`, add to `MetaNodeRecord`:

```ts
  /** A hybrid MACHINE produces one record per layer, but the ledger's rails show each machine
   *  ONCE (spec §4.4) — the non-primary record is hidden there, mirroring ValidatorRecord. */
  ledgerHide: boolean;
```

In `src/engine/scene/Globe.ts`'s metagraph node build (~line 484), replace the lane-site placement with rail placement. The rails are **per-floor shared furniture spanning Z** (spec §4.4) — every metagraph's machines are partitioned onto the SAME three rails — so the tally and the slot counter run **globally over all metagraphs**, not per metagraph, in a pre-pass before the placement loop. A per-metagraph counter would give each lane's first machine slot 0 and stack them all on top of each other.

Add the pre-pass just above the existing `for (const m of this.metaList)` build loop:

```ts
    // LEDGER PRE-PASS: one slot per MACHINE across the whole floor, in lane order then cluster
    // order. Because the rails are shared furniture (spec §4.4) these counters are global — a
    // per-metagraph counter would put every lane's first machine on slot 0.
    // event-time: runs on a data rebuild, never per frame.
    const railCounts = new Map<RailKind, number>();
    const railSlot = new Map<string, number>(); // machine key → slot within its own rail
    for (const m of this.metaList) {
      for (const n of m.nodes) {
        const kind = railKindOf(n.roles);
        if (!kind) continue;
        const key = `${m.id}|${n.ip || n.id}`;
        if (railSlot.has(key)) continue; // a hybrid machine is ONE machine, counted once
        railSlot.set(key, railCounts.get(kind) ?? 0);
        railCounts.set(kind, (railCounts.get(kind) ?? 0) + 1);
      }
    }
    const railVis = visibleRails(railCounts);
    this._railKinds.meta = railVis;
```

then, inside the per-node placement:

```ts
      // LEDGER: machines line up on RAILS along the front edge of the floor they belong to,
      // partitioned by make-up. A hybrid machine appears once, on the hybrid rail, from its l0
      // record; its dl1/cl1 twin is hidden.
      const kind = railKindOf(roles);
      const primaryLayer = kind === "hybrid" ? "l0" : layer;
      const ledgerHide = kind == null || layer !== primaryLayer;
      const railIdx = kind ? railVis.indexOf(kind) : -1;
      const slot = railSlot.get(`${m.id}|${node.ip || node.id}`) ?? 0;
      const ledgerPos = new THREE.Vector3(); // event-time: one per node record, on data rebuild
      if (railIdx >= 0) railChipPos("meta", railIdx, slot, ledgerPos);
      ledgerPos.applyMatrix4(_LEDGER_M).multiplyScalar(LEDGER.viewScale);
```

Apply the identical treatment to the validator block (~line 311) with `group: "dag"` and its own pre-pass over the validator records (keyed by `ip || id` — one cluster, so no metagraph prefix), writing `this._railKinds.dag`. The existing `ledgerHide` semantics stay, now derived from `railKindOf(roles)`.

Both rebuilds already run only on a data change — mark the `new THREE.Vector3()` lines `event-time`.

- [ ] **Step 3: Write the rails adapter**

Create `src/engine/scene/objects/NodeRails.ts`:

```ts
// The ledger's NODE RAILS (redesign 2026-08-04): hairline guides with a label, one per non-empty
// make-up rail, along the front edge of each snapshot floor. The CHIPS themselves are the shared
// node InstancedMeshes that Globe places — this adapter owns only the rail furniture and the pick
// proxies, so the machines on a rail stay the same objects the other views render.
import * as THREE from "three";
import type { SceneColors } from "../../sceneColors";
import { RAIL_GROUP_FLOOR, railX, railY, LANE_HALF_Z, type RailGroup } from "../../domain/ledgerLayout";
import { railLayerId, railLit, RAIL_ORDER, type RailKind } from "../../domain/ledgerRails";

const RAIL_REST_OP = 0.16;
const RAIL_LIT_OP = 0.5;
const RAIL_DIM_OP = 0.05;

interface Rail {
  kind: RailKind;
  group: RailGroup;
  line: THREE.LineSegments;
  mat: THREE.LineBasicMaterial;
  proxy: THREE.Mesh;
  visible: boolean;
  target: number;
}

export class NodeRails {
  group = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  private _rails: Rail[] = [];
  private _alpha = 0;
  private _hilite: string | null = null;
  private _dimOthers = false;

  constructor(colors: SceneColors) {
    // One rail object per (group, kind) up front — six in total, so nothing allocates later.
    for (const group of ["meta", "dag"] as RailGroup[]) {
      for (const kind of RAIL_ORDER) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(
          [0, 0, -LANE_HALF_Z, 0, 0, LANE_HALF_Z], 3,
        ));
        const mat = new THREE.LineBasicMaterial({ color: colors.primary, transparent: true, opacity: 0 });
        const line = new THREE.LineSegments(geo, mat);
        const proxy = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 2 * LANE_HALF_Z),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        proxy.rotation.x = -Math.PI / 2;
        proxy.userData.pick = { kind: "layer", layerId: railLayerId(group, kind) };
        line.visible = false;
        proxy.visible = false;
        this.group.add(line, proxy);
        this._rails.push({ kind, group, line, mat, proxy, visible: false, target: 0 });
      }
    }
  }

  /** Place the rails a group actually has. Called on a data rebuild only. */
  setRails(group: RailGroup, kinds: RailKind[]): void {
    for (const r of this._rails) {
      if (r.group !== group) continue;
      const idx = kinds.indexOf(r.kind);
      r.visible = idx >= 0;
      r.line.visible = r.visible;
      r.proxy.visible = r.visible;
      if (idx < 0) continue;
      const x = railX(idx);
      const y = railY(group, 0) - 0.02;
      r.line.position.set(x, y, 0);
      r.proxy.position.set(x, y, 0);
    }
    this.pickables.length = 0;
    for (const r of this._rails) if (r.visible) this.pickables.push(r.proxy);
  }

  setHighlight(layerId: string | null, dimOthers: boolean): void {
    this._hilite = layerId;
    this._dimOthers = dimOthers;
  }

  setAlpha(a: number): void {
    this._alpha = a;
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 6);
    for (const r of this._rails) {
      if (!r.visible) continue;
      const lit = this._hilite ? railLit(this._hilite, r.group, r.kind) : false;
      const base = lit ? RAIL_LIT_OP : this._dimOthers ? RAIL_DIM_OP : RAIL_REST_OP;
      r.target = base * this._alpha;
      r.mat.opacity += (r.target - r.mat.opacity) * k;
    }
  }

  dispose(): void {
    for (const r of this._rails) {
      r.line.geometry.dispose();
      r.mat.dispose();
      r.proxy.geometry.dispose();
      (r.proxy.material as THREE.Material).dispose();
    }
    this._rails.length = 0;
    this.pickables.length = 0;
  }
}
```

- [ ] **Step 4: Expose the rail tally and the signer glow on Globe**

Two accessors, both consumed by later tasks. In `src/engine/scene/Globe.ts`, beside the other ledger fields:

```ts
  // Which rails each group actually has, from the last data rebuild — LedgerView builds its rail
  // furniture from this and the Engine frames a rail by its visible index, so the furniture and the
  // chips can never disagree about which rails exist.
  private _railKinds: Record<RailGroup, RailKind[]> = { meta: [], dag: [] };
  // The signers of the selected metagraph snapshot (spec §5.3) — a COMMITTED group, so it joins the
  // existing group-tier channel at the end of the precedence chain.
  private _signerIds: Set<string> | null = null;
```

and the two methods, next to `setSelectedGroup`:

```ts
  /** The rails a group has, in visible order (index = the rail's X step). */
  railKinds(group: RailGroup): RailKind[] {
    return this._railKinds[group];
  }

  // The selected metagraph snapshot's SIGNERS. `proofs[].id` are node ids, so the chips that sealed
  // the snapshot light on the ml0 rail and hovering one pairs back to the card (spec §5.3) — the
  // same group-tier glow a committed cohort or composition group gets, no new mechanism.
  setSignerIds(ids: readonly string[] | null): void {
    this._signerIds = ids?.length ? new Set(ids) : null; // event-time
  }
```

Then extend the precedence chain in `_frameCtx` — one term, at the end (a live hover still wins, and the three committed kinds are view-scoped so at most one is ever set):

```ts
    c.hoverCohort = this._hoverCohort ?? this._selCohortIds ?? this._selGroupIds ?? this._signerIds;
```

Nothing else changes: `NodeFabric`'s glow writers already read `c.hoverCohort` through `dimModel`'s `GROUP_FOCUS` tier, so a signer chip lights at group strength and a single selected node still pops above it.

- [ ] **Step 5: Run the gates and verify they pass**

Run: `npm test && npx tsc --noEmit`
Expected: PASS — in particular `noFrameAllocations` (nothing is allocated in `update`), `noHardcodedColors` (the rail colour is `colors.primary`) and `layerBoundaries` (no store/react import).

- [ ] **Step 6: Commit**

```bash
git add src/engine/scene/objects/NodeRails.ts src/engine/scene/Globe.ts src/engine/domain/records.ts
git commit -m "$(cat <<'EOF'
feat(ledger): node rails on the floors' front edges, one machine per rail

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: The byte bar in the scene

**Files:**
- Create: `src/engine/scene/objects/ByteBar.ts`
- Test: gated by `npm test` (`noFrameAllocations`, `noHardcodedColors`, `layerBoundaries`) + `npx tsc --noEmit`

**Interfaces:**
- Consumes: `BarSpec`, `Band`, `UNLISTED_KEY`, `makeBarSpec` (Task 2); `BAR_H`, `BAR_D`, `BAR_MIN_W`, `FLOOR_Y` (Task 1); `SLOT_SP`, `SLOT_N`, `slotFade` (`ledgerModel`); `SceneColors`.
- Produces:
```ts
export class ByteBar {
  group: THREE.Group;
  pickables: THREE.Object3D[];
  constructor(colors: SceneColors, sceneColors: Record<string, number>);
  setSceneColors(map: Record<string, number>): void;
  /** event-time: called when a tick arrives or its exact read lands */
  setBar(slot: number, ordinal: number, spec: BarSpec | null, pick: PickDescriptor): void;
  setAlpha(a: number): void;
  setFilter(filter: string): void;
  setSelected(slot: number): void;
  update(dt: number): void;
  dispose(): void;
}
```

- [ ] **Step 1: Establish the baseline the new file must not break**

Run: `npm test && npx tsc --noEmit`
Expected: PASS — this is the gate the adapter is written against (there is no unit test for a Three adapter; the executable rules are the scene tests).

- [ ] **Step 2: Write the implementation**

Create `src/engine/scene/objects/ByteBar.ts`:

```ts
// The global snapshot layer's BYTE BAR (redesign 2026-08-04, spec §4.2): one bar per tick, fixed
// height and depth, WIDTH alone encoding the bytes that tick carried — divided into bands
// proportional to each metagraph's share, in the same order as the lanes above so the ribbons
// between them never cross.
//
// Every band is its own Mesh so it can be picked (a band selects that metagraph + that tick). The
// whole pool is allocated once at construction — SLOT_N x (METAGRAPHS.length + 1) meshes sharing a
// unit box geometry — and each slot's meshes are positioned/scaled or zero-scaled on a tick, never
// per frame.
import * as THREE from "three";
import type { SceneColors } from "../../sceneColors";
import type { PickDescriptor } from "@/src/data/types";
import { METAGRAPHS } from "../../config";
import { BAR_H, BAR_D, BAR_MIN_W, FLOOR_Y } from "../../domain/ledgerLayout";
import { UNLISTED_KEY, type BarSpec } from "../../domain/ledgerBands";
import { SLOT_SP, SLOT_N, slotFade } from "../../domain/ledgerModel";

const BANDS_PER_SLOT = METAGRAPHS.length + 1;
const REST_OP = 0.5;
const HOT_OP = 0.95;
const DIM_OP = 0.16;
/** An unmeasured tick is drawn as a dashed hairline outline at minimum width — honest about the
 *  read not having landed, never a width inferred from anchor count or fee (spec §6.2). */
const SEAM_OP = 0.3;

interface Slot {
  ordinal: number;
  bands: THREE.Mesh[];
  mats: THREE.MeshBasicMaterial[];
  outline: THREE.LineSegments;
  outMat: THREE.LineBasicMaterial;
  measured: boolean;
  hot: boolean;
  keys: string[];
  used: number;
}

export class ByteBar {
  group = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  private _slots: Slot[] = [];
  private _geo = new THREE.BoxGeometry(1, BAR_H, BAR_D);
  private _outGeo: THREE.BufferGeometry;
  private _sceneColors: Record<string, number>;
  private _neutral: number;
  private _alpha = 0;
  private _filter = "all";
  private _selected = -1;

  constructor(colors: SceneColors, sceneColors: Record<string, number>) {
    this._sceneColors = sceneColors;
    this._neutral = colors.primary;
    this._outGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(BAR_MIN_W, BAR_H, BAR_D));

    for (let s = 0; s < SLOT_N; s++) {
      const bands: THREE.Mesh[] = [];
      const mats: THREE.MeshBasicMaterial[] = [];
      for (let b = 0; b < BANDS_PER_SLOT; b++) {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(this._geo, mat);
        mesh.scale.set(0, 0, 0);
        mesh.visible = false;
        this.group.add(mesh);
        bands.push(mesh);
        mats.push(mat);
      }
      const outMat = new THREE.LineBasicMaterial({ color: this._neutral, transparent: true, opacity: 0 });
      const outline = new THREE.LineSegments(this._outGeo, outMat);
      outline.visible = false;
      this.group.add(outline);
      this._slots.push({
        ordinal: -1, bands, mats, outline, outMat,
        measured: false, hot: false, keys: [], used: 0,
      });
    }
  }

  setSceneColors(map: Record<string, number>): void {
    this._sceneColors = map;
  }

  /** Lay out one tick's bar. Event-time only. */
  setBar(slot: number, ordinal: number, spec: BarSpec | null, pick: PickDescriptor): void {
    const s = this._slots[slot];
    if (!s) return;
    s.ordinal = ordinal;
    s.keys.length = 0;
    const x = -slot * SLOT_SP;
    const y = FLOOR_Y.gl0;

    if (!spec || !spec.measured) {
      // Unmeasured: the seam outline stands in for the bar until the exact read lands.
      for (let i = 0; i < s.used; i++) { s.bands[i].visible = false; s.bands[i].scale.set(0, 0, 0); }
      s.used = 0;
      s.measured = false;
      s.outline.visible = true;
      s.outline.position.set(x, y, BAR_MIN_W / 2);
      this._syncPickables();
      return;
    }

    s.measured = true;
    s.outline.visible = false;
    const n = spec.bandCount;
    for (let i = 0; i < BANDS_PER_SLOT; i++) {
      const mesh = s.bands[i];
      if (i >= n) { mesh.visible = false; mesh.scale.set(0, 0, 0); continue; }
      const band = spec.bands[i];
      const w = Math.max(0.001, band.z1 - band.z0);
      mesh.visible = true;
      // The bar runs along Z (the lane/width field); X is time, so the box's own X is its depth.
      mesh.scale.set(BAR_D, 1, w);
      mesh.position.set(x, y, band.z0 + w / 2);
      s.mats[i].color.setHex(
        band.key === UNLISTED_KEY ? this._neutral : (this._sceneColors[band.key] ?? this._neutral),
      );
      mesh.userData.pick = pick;
      mesh.userData.bandKey = band.key;
      s.keys.push(band.key);
    }
    s.used = n;
    this._syncPickables();
  }

  setAlpha(a: number): void { this._alpha = a; }
  setFilter(filter: string): void { this._filter = filter; }
  setSelected(slot: number): void { this._selected = slot; }

  update(dt: number): void {
    const k = Math.min(1, dt * 5);
    for (let si = 0; si < this._slots.length; si++) {
      const s = this._slots[si];
      const fade = slotFade(si);
      const hot = si === this._selected || si === 0;
      if (!s.measured) {
        const t = SEAM_OP * fade * this._alpha;
        s.outMat.opacity += (t - s.outMat.opacity) * k;
        continue;
      }
      for (let i = 0; i < s.used; i++) {
        const key = s.keys[i];
        // A filter never removes a band — the bar keeps its full composition and the committed
        // metagraph's share simply lights (spec §5.2).
        const off = this._filter !== "all" && key !== this._filter;
        const base = off ? DIM_OP : hot ? HOT_OP : REST_OP;
        const t = base * fade * this._alpha;
        s.mats[i].opacity += (t - s.mats[i].opacity) * k;
      }
    }
  }

  private _syncPickables(): void {
    this.pickables.length = 0;
    for (const s of this._slots) {
      for (let i = 0; i < s.used; i++) this.pickables.push(s.bands[i]);
    }
  }

  dispose(): void {
    for (const s of this._slots) {
      for (const m of s.mats) m.dispose();
      s.outMat.dispose();
    }
    this._geo.dispose();
    this._outGeo.dispose();
    this._slots.length = 0;
    this.pickables.length = 0;
  }
}
```

- [ ] **Step 3: Run the gates and verify they pass**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. In particular `noFrameAllocations` — `update()` and `_syncPickables()` allocate nothing (`.setHex`/`.set`/`.copy` only), and `setBar` is event-time.

- [ ] **Step 4: Commit**

```bash
git add src/engine/scene/objects/ByteBar.ts
git commit -m "$(cat <<'EOF'
feat(ledger): the byte bar — width is bytes, bands are shares, seams are honest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: The ribbons

**Files:**
- Create: `src/engine/scene/objects/Ribbons.ts`
- Test: gated by `npm test` + `npx tsc --noEmit`

**Interfaces:**
- Consumes: `ribbonQuad`, `RibbonQuad`, `RIBBON_LANE_HALF`, `UNLISTED_KEY`, `BarSpec` (Task 2); `FLOOR_Y` (Task 1); `SLOT_SP` (`ledgerModel`); `SceneColors`.
- Produces:
```ts
export const RIBBON_ROWS = 2;             // the lead row and the hot row only (spec §4.3)
export class Ribbons {
  group: THREE.Group;
  constructor(colors: SceneColors, sceneColors: Record<string, number>);
  setSceneColors(map: Record<string, number>): void;
  /** event-time: rebuild one row's ribbons */
  setRow(row: 0 | 1, slot: number, spec: BarSpec | null, laneZ: (key: string) => number | null): void;
  clearRow(row: 0 | 1): void;
  /** the point a travelling anchor pulse is at, t in [0,1] along ribbon `i` of `row` */
  centreLine(row: 0 | 1, i: number, t: number, out: THREE.Vector3): THREE.Vector3;
  ribbonCount(row: 0 | 1): number;
  setAlpha(a: number): void;
  setFilter(filter: string): void;
  update(dt: number): void;
  dispose(): void;
}
```

- [ ] **Step 1: Establish the baseline**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Write the implementation**

Create `src/engine/scene/objects/Ribbons.ts`:

```ts
// The RIBBONS (spec §4.3): one tapering sheet per anchoring lane, leaving the lane's tiles on the
// metagraph floor and landing on that metagraph's own band in the byte bar below. The lane counts
// snapshots, the band measures bytes, and the ribbon is the relationship between the two — which is
// what replaced the old cubic anchor links.
//
// Drawn on the LEAD row and the HOT row only, so the trail stays calm; older ticks keep a hairline
// strut drawn by the view. One Mesh, one preallocated geometry, rewritten event-time.
import * as THREE from "three";
import type { SceneColors } from "../../sceneColors";
import { METAGRAPHS } from "../../config";
import { FLOOR_Y } from "../../domain/ledgerLayout";
import { SLOT_SP } from "../../domain/ledgerModel";
import { ribbonQuad, RIBBON_LANE_HALF, UNLISTED_KEY, type BarSpec, type RibbonQuad } from "../../domain/ledgerBands";

export const RIBBON_ROWS = 2;
const PER_ROW = METAGRAPHS.length + 1;
const VERTS_PER_RIBBON = 6; // two triangles
const REST_OP = 0.5;
const DIM_OP = 0.12;

interface RowState {
  slot: number;
  count: number;
  keys: string[];
  quads: RibbonQuad[];
}

export class Ribbons {
  group = new THREE.Group();
  private _geo = new THREE.BufferGeometry();
  private _pos: THREE.Float32BufferAttribute;
  private _col: THREE.Float32BufferAttribute;
  private _mat: THREE.MeshBasicMaterial;
  private _mesh: THREE.Mesh;
  private _rows: RowState[] = [];
  private _sceneColors: Record<string, number>;
  private _neutral: number;
  private _alpha = 0;
  private _filter = "all";
  private _c = new THREE.Color();

  constructor(colors: SceneColors, sceneColors: Record<string, number>) {
    this._sceneColors = sceneColors;
    this._neutral = colors.primary;
    const verts = RIBBON_ROWS * PER_ROW * VERTS_PER_RIBBON;
    this._pos = new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3);
    this._col = new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3);
    this._pos.setUsage(THREE.DynamicDrawUsage);
    this._col.setUsage(THREE.DynamicDrawUsage);
    this._geo.setAttribute("position", this._pos);
    this._geo.setAttribute("color", this._col);
    this._geo.setDrawRange(0, 0);
    this._mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this._mesh = new THREE.Mesh(this._geo, this._mat);
    this._mesh.frustumCulled = false;
    this.group.add(this._mesh);

    for (let r = 0; r < RIBBON_ROWS; r++) {
      const quads: RibbonQuad[] = [];
      for (let i = 0; i < PER_ROW; i++) quads.push({ topZ0: 0, topZ1: 0, botZ0: 0, botZ1: 0 });
      this._rows.push({ slot: -1, count: 0, keys: [], quads });
    }
  }

  setSceneColors(map: Record<string, number>): void { this._sceneColors = map; }

  /** `laneZ` returns the lane centre for a metagraph key, or null for one with no lane
   *  (an unlisted anchor's ribbon starts in mid-air — spec §6.6). */
  setRow(row: 0 | 1, slot: number, spec: BarSpec | null, laneZ: (key: string) => number | null): void {
    const st = this._rows[row];
    st.slot = slot;
    st.keys.length = 0;
    st.count = 0;
    if (!spec || !spec.measured) { this._writeGeometry(); return; }

    for (let i = 0; i < spec.bandCount; i++) {
      const band = spec.bands[i];
      if (band.bytes <= 0) continue;
      const z = band.key === UNLISTED_KEY ? null : laneZ(band.key);
      // An unlisted anchor has no lane, so its ribbon starts above the band it lands on.
      const centre = z ?? (band.z0 + band.z1) / 2;
      ribbonQuad(centre, z == null ? RIBBON_LANE_HALF * 0.4 : RIBBON_LANE_HALF, band, st.quads[st.count]);
      st.keys.push(band.key);
      st.count++;
    }
    this._writeGeometry();
  }

  clearRow(row: 0 | 1): void {
    this._rows[row].count = 0;
    this._rows[row].keys.length = 0;
    this._writeGeometry();
  }

  ribbonCount(row: 0 | 1): number { return this._rows[row].count; }

  centreLine(row: 0 | 1, i: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const st = this._rows[row];
    const q = st.quads[Math.min(i, st.count - 1)];
    const x = -st.slot * SLOT_SP;
    const topZ = (q.topZ0 + q.topZ1) / 2;
    const botZ = (q.botZ0 + q.botZ1) / 2;
    return out.set(x, FLOOR_Y.msnap + (FLOOR_Y.gl0 - FLOOR_Y.msnap) * t, topZ + (botZ - topZ) * t);
  }

  setAlpha(a: number): void { this._alpha = a; }
  setFilter(filter: string): void { this._filter = filter; }

  update(dt: number): void {
    const k = Math.min(1, dt * 5);
    const target = REST_OP * this._alpha;
    this._mat.opacity += (target - this._mat.opacity) * k;
  }

  /** event-time: the whole sheet is rewritten when a row changes. */
  private _writeGeometry(): void {
    const p = this._pos.array as Float32Array;
    const c = this._col.array as Float32Array;
    let v = 0;
    for (let r = 0; r < RIBBON_ROWS; r++) {
      const st = this._rows[r];
      const x = -st.slot * SLOT_SP;
      const yTop = FLOOR_Y.msnap;
      const yBot = FLOOR_Y.gl0;
      for (let i = 0; i < st.count; i++) {
        const q = st.quads[i];
        const key = st.keys[i];
        const hex = key === UNLISTED_KEY ? this._neutral : (this._sceneColors[key] ?? this._neutral);
        this._c.setHex(hex);
        const off = this._filter !== "all" && key !== this._filter;
        const s = off ? DIM_OP / REST_OP : 1;
        const push = (z: number, y: number) => {
          p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
          c[v * 3] = this._c.r * s; c[v * 3 + 1] = this._c.g * s; c[v * 3 + 2] = this._c.b * s;
          v++;
        };
        push(q.topZ0, yTop); push(q.topZ1, yTop); push(q.botZ1, yBot);
        push(q.topZ0, yTop); push(q.botZ1, yBot); push(q.botZ0, yBot);
      }
    }
    this._geo.setDrawRange(0, v);
    this._pos.needsUpdate = true;
    this._col.needsUpdate = true;
  }

  dispose(): void {
    this._geo.dispose();
    this._mat.dispose();
    this._rows.length = 0;
  }
}
```

- [ ] **Step 3: Run the gates and verify they pass**

Run: `npm test && npx tsc --noEmit`
Expected: PASS — `update()` allocates nothing; `_writeGeometry` is reached only from the event-time `setRow`/`clearRow`, and its `push` closure captures no new objects per vertex.

- [ ] **Step 4: Commit**

```bash
git add src/engine/scene/objects/Ribbons.ts
git commit -m "$(cat <<'EOF'
feat(ledger): tapering ribbons from lane to band, lead and hot rows only

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: The two-floor chamber

**Files:**
- Modify: `src/engine/scene/views/LedgerView.ts` (the composition rewrite)
- Modify: `src/engine/domain/ledgerLayout.ts` (rewrite `LAYER_GEOM`; delete `HYP_SPLIT`, `DIAL_R`)
- Modify: `src/engine/domain/ledgerLayout.test.ts`
- Modify: `src/engine/domain/ledgerModel.ts` (delete `curvePoint`) + `ledgerModel.test.ts`
- Modify: `src/data/ledgerLayers.ts` (the floors-and-rails copy)

**Interfaces:**
- Consumes: `NodeRails` (Task 13), `ByteBar` (Task 14), `Ribbons` (Task 15), `makeBarSpec`/`fillBarSpec` (Task 2), `LedgerModel` with `tickTs`/`leadForming` (Task 4), `FLOOR_IDS`/`FLOOR_Y`/`BAR_*`/`laneSpan` (Task 1), `RailGroup`/`RailKind` (Tasks 1 + 3).
- Produces (the view's outward API, extended):
```ts
export class LedgerView implements SceneView {
  group: THREE.Group;
  pickables: THREE.Object3D[];
  constructor(scene: THREE.Scene, colors: SceneColors, sceneColors: Record<string, number>, stage: StageLights);
  setSceneColors(map: Record<string, number>): void;
  setViewAlpha(a: number): void;
  setHighlight(id: string | null, dimOthers?: boolean): void;
  setData(snaps: GlobalSnapshot[], getAnchor: (ts: string) => Anchor | null): void;
  /** NEW — the byte bar's feed; called whenever an exact read lands */
  setExact(byOrdinal: Readonly<Record<number, SnapshotExact>>): void;
  /** NEW — the currency gutter's status line */
  setCurrencyActivity(items: CurrencyActivity[] | null): void;
  /** NEW — Engine-supplied: resolves a clicked tile to a real metagraph snapshot, or null */
  setTileResolver(fn: (metaId: string, ts: string, k: number) => MetaSnapSel | null): void;
  setSelected(ordinal: number | null): void;
  setFilter(filter: string): void;
  /** NEW — the rails a group actually has, forwarded from `Globe.railKinds` (Task 13) so the
   *  furniture and the chips standing on it can never disagree about which rails exist. */
  setRails(group: RailGroup, kinds: RailKind[]): void;
  update(dt: number): void;
  dispose(): void;
}
export const LAYER_GEOM: { id: LedgerLayerId; y: number; laneZ: number; isRail: boolean }[];
```

- [ ] **Step 1: Write the failing test**

In `src/engine/domain/ledgerLayout.test.ts`, replace the `HYP_SPLIT` and `DIAL_R` cases with:

```ts
import { LAYER_GEOM, FLOOR_Y, RAIL_GROUP_FLOOR, railY } from "./ledgerLayout";

describe("LAYER_GEOM after the two-floor redesign", () => {
  it("keeps every focus rung — four of them now resolve to rails, not planes", () => {
    expect(LAYER_GEOM.map((l) => l.id).sort()).toEqual(["gl0", "hypl0", "hypl1", "ml0", "ml1", "msnap"]);
    const rails = LAYER_GEOM.filter((l) => l.isRail).map((l) => l.id).sort();
    expect(rails).toEqual(["hypl0", "hypl1", "ml0", "ml1"]);
  });

  it("puts the two snapshot floors at their own heights and the rails above the floor they serve", () => {
    expect(LAYER_GEOM.find((l) => l.id === "msnap")!.y).toBe(FLOOR_Y.msnap);
    expect(LAYER_GEOM.find((l) => l.id === "gl0")!.y).toBe(FLOOR_Y.gl0);
    expect(LAYER_GEOM.find((l) => l.id === "ml0")!.y).toBe(railY("meta", 0));
    expect(LAYER_GEOM.find((l) => l.id === "hypl0")!.y).toBe(railY("dag", 0));
    expect(RAIL_GROUP_FLOOR.meta).toBe("msnap");
    expect(RAIL_GROUP_FLOOR.dag).toBe("gl0");
  });

  it("no longer centres anything laterally — every rung sits on the shared lane field", () => {
    for (const l of LAYER_GEOM) expect(l.laneZ).toBe(0);
  });
});
```

and delete the `HYP_SPLIT` / `DIAL_R` assertions. In `ledgerModel.test.ts`, delete the `curvePoint` cases.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/engine/domain/ledgerLayout.test.ts`
Expected: FAIL — `isRail` is not a property of the `LAYER_GEOM` entries.

- [ ] **Step 3: Rewrite the layout table and retire the dead geometry**

In `src/engine/domain/ledgerLayout.ts`, replace `LAYER_GEOM` and delete `HYP_SPLIT` + `DIAL_R`:

```ts
/** Every ledger focus rung still resolves to geometry — but only the two SNAPSHOT layers are
 *  floors now. The four node layers are carried by rails on those floors' front edges, so their
 *  `y` is a rail height and `isRail` tells the camera which framing to use. */
export const LAYER_GEOM: { id: LedgerLayerId; y: number; laneZ: number; isRail: boolean }[] = [
  { id: "ml1", y: railY("meta", 0), laneZ: 0, isRail: true },
  { id: "ml0", y: railY("meta", 0), laneZ: 0, isRail: true },
  { id: "msnap", y: FLOOR_Y.msnap, laneZ: 0, isRail: false },
  { id: "hypl0", y: railY("dag", 0), laneZ: 0, isRail: true },
  { id: "hypl1", y: railY("dag", 0), laneZ: 0, isRail: true },
  { id: "gl0", y: FLOOR_Y.gl0, laneZ: 0, isRail: false },
];
```

Delete `curvePoint` (and its `_cp` scratch, if any) from `src/engine/domain/ledgerModel.ts`, plus the now-unused `LINK_SEG` import site in the view.

- [ ] **Step 4: Rewrite the layer copy**

Replace `src/data/ledgerLayers.ts`'s table (keeping its interface and `ledgerLayerById`):

```ts
export const LEDGER_LAYERS: LedgerLayerCopy[] = [
  { id: "ml1", level: "rail", name: "Metagraph L1",
    desc: "The machines that take in transactions and data updates for a metagraph and hand them to its L0." },
  { id: "ml0", level: "rail", name: "Metagraph L0",
    desc: "The machines that reach consensus for a metagraph and produce its snapshots." },
  { id: "msnap", level: "2", name: "Metagraph snapshots",
    desc: "Each metagraph seals its own state on its own cadence, in its own lane. These are the snapshots waiting to be anchored." },
  { id: "hypl1", level: "rail", name: "Hypergraph L1",
    desc: "The DAG's own transaction layer — the machines that accept $DAG transfers." },
  { id: "hypl0", level: "rail", name: "Hypergraph L0",
    desc: "The DAG's validators, reaching global consensus and producing the base ledger." },
  { id: "gl0", level: "1", name: "Global snapshots",
    desc: "The base ledger. Every few seconds one global snapshot anchors the state every metagraph handed up, and its width here is the bytes it carried." },
];
```

(Vocabulary rule: the stack ANCHORS STATE — "settlement" stays reserved for the DAG a snapshot actually pays.)

- [ ] **Step 5: Recompose the view**

In `src/engine/scene/views/LedgerView.ts`:

1. **Delete** `_makeDial`, `buildDialGeometry`, `_gL0Ring`/`_dagL1Ring` and their glow state; `_buildLinks`, `_buildCurves`, `_addCurve`, `_clearCurves` and the `LINK_CURVES`/`LINK_SEG` constants; `_buildCenter`, `_reconcileTrail` and the centred block + plain trail; the `DIAL_*` constants.
2. **Rebuild `_buildFloors`** to iterate `FLOOR_IDS` instead of seven hand-written rows, keeping the existing `frame(w, d, y, z, id)` helper verbatim (fill `Mesh` with `userData.pick = { kind: "layer", layerId: id }` pushed to `pickables`, `LineSegments` edges, both registered in `_fades`, label via `LEDGER_LAYERS.find`).
3. **Compose the three adapters** in the constructor and add them to `group`:

```ts
    this._rails = new NodeRails(colors);
    this._bar = new ByteBar(colors, sceneColors);
    this._ribbons = new Ribbons(colors, sceneColors);
    this.group.add(this._rails.group, this._bar.group, this._ribbons.group);
```

   and declare the lane-span state the filter rearrangement (item 10) writes and the tile layout
   reads — all construction-time `Map`s, keyed by metagraph id, never reallocated per frame:

```ts
  private _committedLane: number | null = null;
  private readonly _laneZ = new Map<string, number>();      // lane centre in local Z
  private readonly _laneHZ = new Map<string, number>();     // half the Z the lane may fill
  private readonly _laneHidden = new Map<string, boolean>();
```

   Seed them once from `laneSpan(i, n, null)` when the lane order is first known, so the "all"
   layout is the same code path as a committed one.

4. **`setData`** keeps calling `this._model.setData(...)`, then for each visible slot builds its bar spec and rows:

```ts
    // event-time: one spec per slot, reused across ticks
    for (let s = 0; s < SLOT_N; s++) {
      const t = this._model.trail[s];
      if (!t) { this._bar.setBar(s, -1, null, this._noPick); continue; }
      const ex = this._exact[t.ordinal] ?? null;
      const anchored = ex?.anchored ?? 0;
      fillBarSpec(this._specs[s], ex ? this._bytesByKey(ex) : null, this._laneOrder, anchored);
      this._bar.setBar(s, t.ordinal, this._specs[s], this._pickFor(t));
    }
    this._ribbons.setRow(0, 0, this._specs[0], this._laneZOf);
    const hot = this._model.selectedSlot;
    if (hot > 0) this._ribbons.setRow(1, hot, this._specs[hot], this._laneZOf);
    else this._ribbons.clearRow(1);
```

where `_specs` is a construction-time array of `makeBarSpec()` (one per slot), `_laneOrder` is the metagraph id order matching the lanes, `_laneZOf` is a bound `(key) => this._laneZ.get(key) ?? null`, and `_bytesByKey(ex)` reuses one construction-time `Map` filled from `ex.perMeta` (the summed field — never a per-frame sum over `rows`).

5. **`setExact(byOrdinal)`** stores the record and re-runs the same loop (a landed read turns a seam into a measured bar).
6. **`setTileResolver(fn)`** stores the resolver; `_anchorMetaBlock` now sets each tile's `userData.pick` from `fn(metaId, tickTs, k)` — a tile whose snapshot the polled buffer doesn't know stays drawn but is left OUT of `pickables` (the anonymous tile, spec §6.1).
7. **The lead row's `forming…`** label follows `this._model.leadForming`.
8. **`setViewAlpha`** additionally forwards to `this._rails.setAlpha(a)`, `this._bar.setAlpha(a)`, `this._ribbons.setAlpha(a)` — and still never writes `group.visible`.
9. **`setFilter` / `setHighlight` / `setRails`** — three different reaches, and they must not be
   collapsed into "forward to the three adapters":

```ts
  setFilter(filter: string) {
    this._filter = filter;                 // event-time
    const idx = filter === "all" || filter === "dag"
      ? null
      : this._laneOrder.indexOf(filter);
    this._committedLane = idx >= 0 ? idx : null;
    this._relayoutLanes();                 // spec §5.2 — the committed lane takes the floor
    this._bar.setFilter(filter);           // bands: dim, never remove (spec §5.2)
    this._ribbons.setFilter(filter);
  }

  setHighlight(id: string | null, dimOthers = false) {
    this._hi = id;                         // the LAYER rung, not a network
    this._rails.setHighlight(id, dimOthers);
    this._applyFloorAlpha();
  }

  setRails(group: RailGroup, kinds: RailKind[]) {
    this._rails.setRails(group, kinds);    // event-time: a data rebuild, not a frame
  }
```

   `ByteBar` and `Ribbons` have no `setHighlight`; `NodeRails` has no `setFilter` — the rail's
   membership dim rides the chips' own group-tier glow on `Globe` (Task 13), not a second channel
   here. **INVARIANT: hover previews the highlight, never the rearrangement.** `setFilter` is the
   only entry point that may call `_relayoutLanes()`; the hover channels (`hoverFilter` →
   `globe.setHoverFilter`, `setHighlight`, `setSelected`) change brightness only. A hover that
   relaid out the floor would make the lanes jump under the pointer as it crossed rows.

10. **`_relayoutLanes()`** (event-time, on a filter change only) walks the lane order and stores
   each lane's span, which `_anchorMetaBlock` then lays tiles inside:

```ts
  private _relayoutLanes() {
    const n = this._laneOrder.length;
    for (let i = 0; i < n; i++) {
      const s = laneSpan(i, n, this._committedLane);
      const key = this._laneOrder[i];
      this._laneZ.set(key, s.cz);          // the ribbons' lane target follows the tiles
      this._laneHZ.set(key, s.hz);
      this._laneHidden.set(key, s.hidden);
    }
    this._rebuildAllSlots();               // re-lay the tiles at the new spans
  }
```

   `_anchorMetaBlock` skips a lane whose `_laneHidden` is true (its tiles are zero-scaled, not
   merely dimmed — "other lanes' tiles leave") and grids that tick's tiles across `2 * hz` instead
   of the fixed per-lane width, so a committed lane's tiles grow into the whole floor.

11. **`update(dt)`** calls each adapter's `update(dt)` after `_applyFloorAlpha()`; **`dispose()`**
   disposes all three.
12. **`pickables`** is rebuilt as `[...floorFills, ...this._rails.pickables, ...this._bar.pickables, ...tilePickables]`.
13. The anchor pulses keep their InstancedMesh but ride `this._ribbons.centreLine(row, i, t, _p)` instead of `curvePoint`.

- [ ] **Step 6: Run everything and verify it passes**

Run: `npm test && npx tsc --noEmit`
Expected: PASS — including `sceneViewContract` (`setViewAlpha` present, no `Mode` string comparison), `noFrameAllocations`, `domainExportCoverage` (the deleted `HYP_SPLIT`/`DIAL_R`/`curvePoint` exports must be gone from BOTH the module and its test).

- [ ] **Step 7: Verify in the running app**

Using the chrome-devtools MCP against the one dev server: navigate to `http://localhost:3000/?slowmo=0.4`, click the Layers view icon, wait for the choreography, and screenshot. Expected: two glass floors; lanes of tiles above; one banded bar per tick below; ribbons on the lead row only; rails with chips along the floors' front edges; no dials, no cubic links, no centred block.

Then open the filter strip, HOVER a network chip and screenshot: the other lanes dim but stay where they are (the hover invariant). Click that chip and screenshot: its lane now occupies the whole floor with the other lanes' tiles gone, while the byte bar still shows every band with the non-member ones dimmed (spec §5.2 — "a filter never removes a band").

- [ ] **Step 8: Commit**

```bash
git add src/engine/scene/views/LedgerView.ts src/engine/domain/ledgerLayout.ts src/engine/domain/ledgerLayout.test.ts src/engine/domain/ledgerModel.ts src/engine/domain/ledgerModel.test.ts src/data/ledgerLayers.ts
git commit -m "$(cat <<'EOF'
feat(ledger): two snapshot floors, rails on their edges — dials and cubic links retired

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Engine wiring

**Files:**
- Modify: `src/engine/Engine.ts` (`_focusLayer`, `_handleClick`, `setMode`, the store subscription, `_refreshLedger`)
- Test: `src/engine/domain/pickActions.test.ts` (the tile/band cases already exist from Task 7); the wiring itself is gated by `sceneViewContract` + `tsc`

**Interfaces:**
- Consumes: `ledgerFloorFraming`/`ledgerRailFraming` (Task 5); `metaSnapSelectActions`/`bandSelectActions` (Task 7); `snapsAtTick` (Task 8); `LedgerView.setExact`/`setTileResolver`/`setCurrencyActivity`/`setRails` (Task 16); `Globe.railKinds`/`Globe.setSignerIds` (Task 13); `LAYER_GEOM` with `isRail` (Task 16); `railX`, `railLit` (Task 3); `RailGroup` (Task 1); `metaSnapDeepKey` (Task 10).
- Produces: no new exports — Engine remains the single store bridge.

- [ ] **Step 1: Resolve the focus rungs against rails or floors**

Replace `_focusLayer(layerId)`'s body:

```ts
  private _focusLayer(layerId: string): boolean {
    const l = LAYER_GEOM.find((g) => g.id === layerId);
    if (!l) return false;
    const y = l.y * LEDGER.viewScale;
    if (l.isRail) {
      // A node layer is carried by rails, so the camera frames the rails rather than a plane.
      const group: RailGroup = layerId === "ml0" || layerId === "ml1" ? "meta" : "dag";
      const kinds = this.globe.railKinds(group);
      const idx = kinds.findIndex((k) => railLit(layerId, group, k));
      ledgerRailFraming(railX(Math.max(0, idx)) * LEDGER.viewScale, y, this._framingOut);
    } else {
      ledgerFloorFraming(y, this._framingOut);
    }
    this._tweenTo(this._framingOut.pos, this._framingOut.target);
    return true;
  }
```

The rail tally is READ from `Globe` (`railKinds`, Task 13) rather than mirrored in a private Engine
field: Globe computes it while building the records the chips stand on, so the camera can never
frame a rail the chips didn't populate. The old lateral lane-centring block goes: every rung now
sits on the shared lane field (`laneZ` is 0 for all six).

- [ ] **Step 2: Give the ledger view its tile resolver and its exact feed**

In `_refreshLedger()`:

```ts
    const net = getNetwork();
    this.ledger.setData(net?.globalSnapshots ?? [], (ts) => getAnchor(ts));
    this.ledger.setExact(useStore.getState().snapshotExact);
```

and once, at construction:

```ts
    // A tile's identity comes from the POLLED feed (spec §6.1) — the Engine is the store bridge, so
    // the lookup lives here and the model stays pure. A tile the buffer can't name is anonymous:
    // drawn, but not pickable.
    this.ledger.setTileResolver((metaId, ts, k) => {
      const net = getNetwork();
      if (!net) return null;
      const snaps = snapsAtTick(net.metaSnaps, metaId, ts);
      const s = snaps[k];
      if (!s) return null;
      const g = net.globalSnapshots.find((gs) => gs.timestamp === ts);
      if (!g) return null;
      return { metaId, ordinal: s.ordinal, hash: s.hash, globalOrdinal: g.ordinal, ts };
    });
```

Add a store-subscription effect so a landing exact read re-measures the bar:

```ts
      if (st.snapshotExact !== prev.snapshotExact && this.mode === "ledger") {
        this.ledger.setExact(st.snapshotExact);
      }
```

- [ ] **Step 3: Handle the two new pick kinds**

In `_handleClick`, before the generic dispatch:

```ts
      const md = hit.object.userData.metaSnap as MetaSnapSel | undefined;
      if (md) {
        applyClickActions(metaSnapSelectActions(md, globalPick, {
          filter: this.filter, metaSnap: useStore.getState().metaSnap,
        }));
        return;
      }
      const bandKey = hit.object.userData.bandKey as string | undefined;
      if (bandKey) {
        applyClickActions(bandSelectActions(bandKey, hit.object.userData.pick, {
          filter: this.filter, metaSnap: useStore.getState().metaSnap,
        }));
        return;
      }
```

(The view writes `userData.metaSnap` on a resolved tile and `userData.bandKey` on a band; `globalPick` is the tile's own `userData.pick`, the snapshot descriptor for its tick.)

- [ ] **Step 4: Scope the selection to the view**

In `setMode`, beside the existing layer/snap clears:

```ts
    if (mode !== "ledger" && st0.metaSnap != null) st0.setMetaSnap(null);
```

and in the filter-switch subscription effect, drop `metaSnap` with the other network-scoped selections (a metagraph snapshot belongs to exactly one network, so a switch can only orphan it):

```ts
        if (st.metaSnap) st.setMetaSnap(null);
```

- [ ] **Step 5: Hand the rail tally down and light a snapshot's signers**

Two one-way pushes, both event-time. First, right after `_applyMetagraphs` rebuilds the records
(the same place the rail slots were computed), tell the chamber which rails to draw:

```ts
    for (const g of ["meta", "dag"] as RailGroup[]) this.ledger.setRails(g, this.globe.railKinds(g));
```

Second, spec §5.3's signer pairing: *"a selected metagraph snapshot lights the chips that signed
it on the `ml0` rail, and hovering one of those chips pairs back to the card."* The lighting half is
a store effect feeding the EXISTING group-tier channel (`Globe.setSignerIds`, Task 13) — no new
mechanism, and the pairing half is already free because the chips write `hoverNodeId` like every
other node. Add to the store subscription:

```ts
      // A metagraph snapshot's signers are node IDS from the deep read; the shallow row carries
      // them too, so a selection lights up before the deep fetch lands and simply sharpens after.
      if (st.metaSnap !== prev.metaSnap || st.metaSnapDeep !== prev.metaSnapDeep) {
        const sel = st.metaSnap;
        if (!sel) this.globe.setSignerIds(null);
        else {
          const deep = st.metaSnapDeep[metaSnapDeepKey(sel.globalOrdinal, sel.metaId)];
          const ex = st.snapshotExact[sel.globalOrdinal];
          const row = ex?.rows?.find((r) => r.metaId === sel.metaId && r.ordinal === sel.ordinal);
          this.globe.setSignerIds(deep?.signers ?? row?.signers ?? null);
        }
      }
```

`setMode`'s clear (step 4) nulls `metaSnap` on the way out of ledger, so this effect fires again and
the glow leaves with the card — a signer glow can never outlive its subject.

- [ ] **Step 6: Warn when the baked byte scale drifts**

```ts
  /** The byte bar's width reference is a BAKED p99 (spec §6.3). If the network's real traffic moves,
   *  the constant goes stale silently — so track the session's own p99 and warn in dev, the same
   *  idiom as the config.COLORS ↔ CSS-token drift check. */
  private _kbSamples: number[] = [];
  private _warnedScale = false;
  private _noteTickKb(kb: number): void {
    if (process.env.NODE_ENV === "production" || this._warnedScale) return;
    this._kbSamples.push(kb);
    if (this._kbSamples.length < 200) return;
    const sorted = [...this._kbSamples].sort((a, b) => a - b); // event-time: once per session
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    if (p99 > BYTE_SCALE_KB * 1.6 || p99 < BYTE_SCALE_KB * 0.5) {
      this._warnedScale = true;
      console.warn(
        `[ledger] observed p99 ${p99.toFixed(0)} KB/tick vs baked BYTE_SCALE_KB ${BYTE_SCALE_KB} — ` +
        `re-run scripts/bake-ledger-scale.ts`,
      );
    }
    this._kbSamples.length = 0;
  }
```

called from the `snapshotExact` effect with each newly-measured tick's `totalSizeKB`.

- [ ] **Step 7: Forward currency activity**

Fetch once on mount beside the existing `/api/metagraphs` pull and forward:

```ts
    fetch("/api/currency-activity")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => this.ledger.setCurrencyActivity(j?.items ?? null))
      .catch(() => this.ledger.setCurrencyActivity(null));
```

- [ ] **Step 8: Run everything and verify it passes**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, `sceneViewContract` included (no `mode === "..."` added to scene modules; any `getWorldPosition`/`getMatrixAt` still absent from the new framing paths — both framings take layout numbers).

- [ ] **Step 9: Verify in the running app**

chrome-devtools MCP: in the Snapshots view click a tile (the metagraph snapshot card appears in the right rail, its network commits, the tick pins, and the chips that signed it glow on the `ml0` rail), hover one of those glowing chips (the card's matching signer row washes — the `hoverNodeId` pairing), click a band (that metagraph + that tick select, and the metaSnap card + signer glow clear), then switch to Hypergraph and back — the metaSnap card must be gone on the way out.

- [ ] **Step 10: Commit**

```bash
git add src/engine/Engine.ts
git commit -m "$(cat <<'EOF'
feat(ledger): wire tiles, bands, rail framings, signer glow and the byte-scale drift warning

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: The explorer's floors-and-rails vocabulary

**Files:**
- Modify: `components/LedgerPanel.tsx`
- Modify: `src/data/ledgerLayers.ts` (already rewritten in Task 16 — consumed here)
- Test: `components/selectionBoundary.test.ts` + `components/railLadderBoundary.test.ts` (both must keep passing untouched)

**Interfaces:**
- Consumes: `LEDGER_LAYERS` (Task 16), `layerToggleActions`/`filterToggleActions`/`nodeSelectActions` (unchanged), `store.selNodes`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

The panel's contract is the two boundary tests plus the ladder. Add one case to `components/railLadderBoundary.test.ts` asserting the explorer still offers every node layer:

```ts
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers";

it("the ledger explorer still browses every node layer, now as rails", () => {
  const rails = LEDGER_LAYERS.filter((l) => l.level === "rail").map((l) => l.id).sort();
  expect(rails).toEqual(["hypl0", "hypl1", "ml0", "ml1"]);
  const floors = LEDGER_LAYERS.filter((l) => l.level !== "rail").map((l) => l.id).sort();
  expect(floors).toEqual(["gl0", "msnap"]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/railLadderBoundary.test.ts`
Expected: FAIL until Task 16's copy table is in place; if Task 16 already landed, it passes and this step is a confirmation of the contract before the panel changes.

- [ ] **Step 3: Update the panel**

In `components/LedgerPanel.tsx`:
- Group the disclosure rows under two headings that match the scene — **Floors** (`msnap`, `gl0`) and **Rails** (`ml1`, `ml0`, `hypl0`, `hypl1`) — instead of one flat list of seven.
- Keep every existing behaviour verbatim: a node-layer row is a commit+expand disclosure (`layerToggleActions`), it opens onto the committed filter's cluster/node rows plus one LANE row per other network serving that layer (`filterToggleActions`), hover previews via `hoverFilter`/`hoverCohort`, node rows run `nodeSelectActions` with the layer as `ledgerLayerId` ancestry.
- The two FLOOR rows become disclosures too, opening onto that floor's **tick rows** — one row per visible tick showing ordinal + anchored count (for `msnap`) or ordinal + KB carried (for `gl0`), each running `snapshotSelectActions` so a row and a scene click stay identical.
- Rows carry name + count only; the sentence stays on the layer card (the explanatory-copy split).
- The card title stays **"Settlement layers"** → rename to **"Anchoring layers"** (§ the vocabulary rule: the stack anchors state).

- [ ] **Step 4: Run everything and verify it passes**

Run: `npm test && npx tsc --noEmit`
Expected: PASS — `selectionBoundary` in particular (no direct selection setter in the panel).

- [ ] **Step 5: Verify in the running app**

chrome-devtools MCP: open the Snapshots view, expand a floor row and a rail row, click a tick row (pins that snapshot), click a lane row (commits that filter).

- [ ] **Step 6: Commit**

```bash
git add components/LedgerPanel.tsx components/railLadderBoundary.test.ts
git commit -m "$(cat <<'EOF'
refine(ledger): the explorer browses floors and rails, matching the chamber

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: The metagraph snapshot card

**Files:**
- Create: `components/inspector/MetaSnapPane.tsx`
- Modify: `components/railCards.ts` (the `metaSnap` slot + its ghost hint)
- Modify: `components/icons.tsx` (the kind mark)
- Modify: `components/Inspector.tsx` (`detailPane`, `SLOT_LABEL`, `selectionKey`, `clearAll`)
- Test: `components/railCards.test.ts`

**Interfaces:**
- Consumes: `store.metaSnap` (Task 6), `store.metaSnapDeep` + `metaSnapDeepKey` (Task 10), `SnapshotExact.rows` (Task 9), `snapsAtTick` (Task 8), `CardHead`, `useMinHold`, `RoleChips`; and for spec §5.3's signer pairing: `subjectPairing` (`components/useSubjectPairing.ts`) over the `store.hoverNodeId` channel + `setHoverNodeId`, `hoverKeyOf` (`src/data/hoverSubject.ts`), `store.selNodes` (the `NodeRow[]` the signer ids resolve against), `shortHash` (`src/data/network.ts`), `identityHudHex`.
- Produces:
```ts
export const METASNAP_ICON: LucideIcon;   // components/icons.tsx — Boxes (Box and Layers2 are taken)
export function MetaSnapPane(): ReactNode; // components/inspector/MetaSnapPane.tsx
```
and `RailCardKind` gains `"metaSnap"`; `detailsCards` returns the slot **between** `context` and `node`.

- [ ] **Step 1: Write the failing test**

Append to `components/railCards.test.ts`:

```ts
describe("the metagraph snapshot slot", () => {
  const base = {
    mode: "ledger" as const, filter: "all", inspect: null, snap: null, layer: null,
    metaSnap: null, selNodesCount: 0, filterLabel: "All networks",
    country: null, cohort: null, composition: null,
  };

  it("sits between the network and the node slots", () => {
    const ids = detailsCards(base).map((c) => c.id);
    expect(ids.indexOf("metaSnap")).toBeGreaterThan(ids.indexOf("context"));
    expect(ids.indexOf("metaSnap")).toBeLessThan(ids.indexOf("node"));
  });

  it("is ledger-scoped, and its hint names the route rather than the verb", () => {
    const inLedger = detailsCards(base).find((c) => c.id === "metaSnap")!;
    expect(inLedger.hint).toBe("Click a tile under a lane.");
    const inGeo = detailsCards({ ...base, mode: "geo" }).find((c) => c.id === "metaSnap")!;
    expect(inGeo.hint).toBeNull();
  });

  it("is present once a tile is selected", () => {
    const sel = { metaId: "DAG0", ordinal: 745190, hash: "abc", globalOrdinal: 42, ts: "t" };
    const c = detailsCards({ ...base, metaSnap: sel }).find((x) => x.id === "metaSnap")!;
    expect(c.present).toBe(true);
    expect(c.subjectKey).toBe("DAG0:745190");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/railCards.test.ts`
Expected: FAIL — no `metaSnap` card in the manifest.

- [ ] **Step 3: Add the slot**

In `components/icons.tsx`:

```tsx
import { Boxes } from "lucide-react";
/** A metagraph snapshot — one of the many sealed states a single global tick carries. */
export const METASNAP_ICON = Boxes;
```

and a `case "metaSnap": return METASNAP_ICON;` in `iconForPick`.

In `components/railCards.ts`: add `"metaSnap"` to `RailCardKind`, `metaSnap: MetaSnapSel | null` to `RailManifestState`, and the card between `context` and `node`:

```ts
    {
      id: "metaSnap",
      kind: "metaSnap",
      icon: iconForPick("metaSnap"),
      subjectKey: s.metaSnap ? `${s.metaSnap.metaId}:${s.metaSnap.ordinal}` : null,
      present: !!s.metaSnap,
      // A tile is reached from its lane, so the hint names that route — the slot label already
      // says what the subject is.
      hint: s.mode === "ledger" ? "Click a tile under a lane." : null,
    },
```

`metaSnap` takes no `LADDER_SLOT` entry — like the global snapshot card it is a slot without a rung (spec §7.1), so `railLadderBoundary.test.ts` is unaffected.

- [ ] **Step 4: Write the pane**

Create `components/inspector/MetaSnapPane.tsx`:

```tsx
"use client";
// The METAGRAPH SNAPSHOT card (spec §7). Three tiers of fact, each honest about where it came from:
// tier 1 is free from the 4-second poll; tier 2 arrives with the tick's exact read; tier 3 is the
// application state, disclosed as a SHAPE here and as a payload in the raw layer.
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CardHead, RIGHT_CARD } from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { Row, IdentityDot } from "@/components/inspector/parts";
import { useStore } from "@/src/store/store";
import { metaSnapDeepKey } from "@/src/data/types";
import type { NodeRow } from "@/src/data/types";
import { metagraphById } from "@/src/data/network";
import { snapsAtTick } from "@/src/data/anchorLog";
import { getNetwork } from "@/src/data/network";
import { hex, fmtDag } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { useMinHold } from "@/components/useMinHold";
import { subjectPairing } from "@/components/useSubjectPairing";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { shortHash } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { applyClickActions } from "@/src/store/applyClickActions";
import { METASNAP_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { cn } from "@/lib/utils";

export function MetaSnapPane() {
  const sel = useStore((s) => s.metaSnap);
  const exact = useStore((s) => (sel ? s.snapshotExact[sel.globalOrdinal] : undefined));
  const deep = useStore((s) => (sel ? s.metaSnapDeep[metaSnapDeepKey(sel.globalOrdinal, sel.metaId)] : undefined));
  const setSection = useStore((s) => s.setSection);
  // Spec §5.3's pairing runs on the EXISTING node-hover channel — a hover, never a selection, so
  // this card stays outside the one-selection-write-path rule.
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const selNodes = useStore((s) => s.selNodes);

  // Tier 1 — the polled record this tile was named from.
  const polled = useMemo(() => {
    if (!sel) return null;
    const net = getNetwork();
    if (!net) return null;
    return snapsAtTick(net.metaSnaps, sel.metaId, sel.ts).find((s) => s.ordinal === sel.ordinal) ?? null;
  }, [sel]);

  // Tier 2 — this snapshot's own row inside the tick's exact read.
  const row = useMemo(
    () => (sel && exact ? exact.rows.find((r) => r.metaId === sel.metaId && r.ordinal === sel.ordinal) ?? null : null),
    [sel, exact],
  );
  const reading = useMinHold(!!sel && !row);

  // The signers, deep read first (it re-reads the same proofs straight off the channel, so it wins
  // when it lands) — but the tick's exact read already carries them, so the rows never wait on it.
  const signers = deep?.signers ?? row?.signers ?? null;
  // A signer is a node ID, while a chip on the ml0 rail pairs on its MACHINE (hoverKeyOf → the
  // metagraph node's ip), so resolve id → row once per render.
  const byNodeId = useMemo(() => {
    const m = new Map<string, NodeRow>();
    for (const n of selNodes) if (n.id) m.set(n.id, n);
    return m;
  }, [selNodes]);

  if (!sel) return null;
  const meta = metagraphById(sel.metaId);
  const ticker = meta?.symbol ?? "—";

  return (
    <Card asChild className={RIGHT_CARD} style={{ "--mg": meta?.color } as React.CSSProperties}>
      <aside>
        <CardHead
          eyebrow="METAGRAPH SNAPSHOT"
          mark={<METASNAP_ICON className={KIND_MARK_CLASS} />}
          title={`#${sel.ordinal}`}
          titleKey={`${sel.metaId}:${sel.ordinal}`}
          aside={<span className="text-micro text-muted-foreground">{relativeAge(sel.ts)}</span>}
          onClose={() => applyClickActions([{ kind: "metaSnap", sel: null }])}
        >
          <Row label="NETWORK"><IdentityDot hue={meta?.color} /> {ticker}</Row>
          <Row label="HASH" mono title={sel.hash}>{hex(sel.hash)}</Row>
          {polled && <Row label="PARENT" mono title={polled.parent}>{hex(polled.parent)}</Row>}
          {polled && <Row label="HEIGHT">{polled.height} · {polled.subHeight}</Row>}
          {polled && <Row label="BLOCKS">{polled.blocks}</Row>}
          <Row label="ANCHORED INTO">#{sel.globalOrdinal}</Row>

          {row ? (
            <>
              <Row label="FEE">{fmtDag(row.fee)}</Row>
              <Row label="SIZE">{(row.bytes / 1024).toFixed(1)} KB</Row>
              <Row label="SIGNED BY">{signers?.length ?? 0} validators</Row>
              {signers && (
                <SignerRows
                  ids={signers}
                  byNodeId={byNodeId}
                  hue={identityHudHex(sel.metaId)}
                  hoverNodeId={hoverNodeId}
                  setHoverNodeId={setHoverNodeId}
                />
              )}
            </>
          ) : reading ? (
            <Row label="EXACT READ">reading…</Row>
          ) : (
            // The L0 node prunes after ~30 minutes; an old tick keeps its polled facts and says so.
            <Row label="EXACT READ">unavailable — tick pruned</Row>
          )}

          {/* Tier 3 is STATE-AWARE: a metagraph whose state is genuinely empty gets no invitation. */}
          {row?.hasState && (
            <>
              <Row label="STATE">{(row.stateBytes / 1024).toFixed(1)} KB
                {deep ? ` · ${deep.stateKeys.map((k) => `${k.key} ${k.count}`).join(" · ")}` : ""}
              </Row>
              {row.stateProof && <Row label="STATE PROOF" mono title={row.stateProof}>{hex(row.stateProof)}</Row>}
              {deep && deep.dataBlockSigners.length > 0 && (
                <Row label="DATA BLOCKS">{deep.dataBlockSigners.length} signers</Row>
              )}
              <Button variant="link" size="xs" onClick={() => setSection("raw")}>
                Show the application state
              </Button>
            </>
          )}
        </CardHead>
      </aside>
    </Card>
  );
}

// One row per signer, each PAIRED to its chip on the ml0 rail (spec §5.3): hovering the row writes
// `hoverNodeId` and the chip glows; hovering the chip in the scene writes the same channel and the
// row washes. No new mechanism — the identical coupling an explorer node row already has.
// A metagraph seals its snapshots with its L0 cluster, so this is a handful of machines: the list
// renders whole, with no truncation and no "show more".
function SignerRows({
  ids,
  byNodeId,
  hue,
  hoverNodeId,
  setHoverNodeId,
}: {
  ids: readonly string[];
  byNodeId: Map<string, NodeRow>;
  hue: string;
  hoverNodeId: string | null;
  setHoverNodeId: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-px">
      {ids.map((id) => {
        const node = byNodeId.get(id) ?? null;
        // With another network committed, `selNodes` doesn't carry THIS metagraph's nodes — so the
        // row degrades to a bare id rather than pairing on a key it can't light. The scene-side
        // glow is unaffected: Globe matches signer ids against its own records (Task 13).
        const key = node ? hoverKeyOf(node.pick) : null;
        const pair = subjectPairing(hoverNodeId, key, setHoverNodeId, hue);
        return (
          <div
            key={id}
            className={cn(
              "nb-row flex items-baseline gap-1.5 -mx-2 px-2 py-0.5 rounded-sm text-label text-foreground-dim",
              pair.paired && pair.className,
            )}
            style={pair.style}
            title={id}
            onMouseEnter={pair.onMouseEnter}
            onMouseLeave={pair.onMouseLeave}
          >
            <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{node?.city ?? "—"}</span>
            <span className="flex-none font-mono tabular-nums text-micro text-muted-foreground">{shortHash(id)}</span>
          </div>
        );
      })}
    </div>
  );
}
```

In `components/Inspector.tsx`: import the pane, add `metaSnap: <MetaSnapPane />` to `detailPane`, `metaSnap: "Metagraph snapshot"` to `SLOT_LABEL`, `metaSnap` to the `detailsCards({...})` state, `metaSnap ? \`${metaSnap.metaId}:${metaSnap.ordinal}\` : ""` to the `selectionKey` join array (lines 403–412), and `hasMetaSnap: presentOf("metaSnap")` to the `clearAll` input (already threaded in Task 7).

- [ ] **Step 5: Run everything and verify it passes**

Run: `npm test && npx tsc --noEmit`
Expected: PASS — `selectionBoundary` in particular (the close routes through `applyClickActions`).

- [ ] **Step 6: Verify in the running app**

chrome-devtools MCP: click a tile in the Snapshots view. The card should show ordinal/hash/parent/height/blocks/anchored-into immediately, then fill in fee/size/signers when the exact read lands. On a DED tile there must be no "Show the application state" button.

Then check spec §5.3's pairing BOTH ways, under the `all` filter (so `selNodes` carries every network): the signer chips on the `ml0` rail glow as soon as the tile is selected; hovering a glowing chip in the scene washes its row in the card; hovering a signer row glows that one chip. Clicking a byte-bar band clears the card and the glow together (`metaSnap` → null, so the Engine nulls the signer set).

- [ ] **Step 7: Commit**

```bash
git add components/inspector/MetaSnapPane.tsx components/railCards.ts components/railCards.test.ts components/icons.tsx components/Inspector.tsx
git commit -m "$(cat <<'EOF'
feat(ledger): a metagraph snapshot is a subject with its own card

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: The application state in the raw layer

**Files:**
- Create: `components/datasection/ChannelStatePanel.tsx`
- Modify: `components/DataSection.tsx` (dispatch)
- Modify: `components/datasection/AnchorLogTable.tsx` (row → `metaSnap` selection)
- Test: `components/selectionBoundary.test.ts` (must keep passing)

**Interfaces:**
- Consumes: `store.metaSnap`, `store.metaSnapDeep`, `metaSnapDeepKey`, `metaSnapSelectActions`.
- Produces: `export function ChannelStatePanel(): ReactNode`.

- [ ] **Step 1: Write the failing test**

Append to `components/selectionBoundary.test.ts`'s allow-list assertion nothing new (the rule is that no component writes a setter directly) and add:

```ts
it("the channel state panel reads the store and never writes a selection", () => {
  const src = readFileSync("components/datasection/ChannelStatePanel.tsx", "utf8");
  expect(src).not.toMatch(/set(Inspect|Snap|MetaSnap|Layer|Filter|Country|Cohort|Composition)\(/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/selectionBoundary.test.ts`
Expected: FAIL — `ENOENT` on the not-yet-created file.

- [ ] **Step 3: Write the panel**

Create `components/datasection/ChannelStatePanel.tsx`:

```tsx
"use client";
// The raw layer's half of the two-step disclosure (spec §7.3): the CARD states the shape of a
// metagraph's application state, and this renders the payload — one level down, on a second
// deliberate gesture, because one anchoring channel publishes personal records and a payload should
// never appear just because a tile was clicked.
import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore } from "@/src/store/store";
import { metaSnapDeepKey } from "@/src/data/types";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";

export function ChannelStatePanel() {
  const sel = useStore((s) => s.metaSnap);
  const deep = useStore((s) => (sel ? s.metaSnapDeep[metaSnapDeepKey(sel.globalOrdinal, sel.metaId)] : undefined));

  const pretty = useMemo(() => {
    if (!deep?.state) return null;
    try { return JSON.stringify(JSON.parse(deep.state), null, 2); } catch { return deep.state; }
  }, [deep]);

  if (!sel) {
    return <p className="text-label text-muted-foreground">Select a metagraph snapshot to read its application state.</p>;
  }
  if (!deep) {
    return <p className="text-label text-muted-foreground">reading…</p>;
  }

  const ticker = metagraphById(sel.metaId)?.symbol ?? sel.metaId;

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow><TableHead>KEY</TableHead><TableHead>RECORDS</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {deep.stateKeys.map((k) => (
            <TableRow key={k.key}><TableCell>{k.key}</TableCell><TableCell>{k.count}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-micro tracking-caps text-muted-foreground">
        {ticker} #{deep.ordinal} · {(deep.stateBytes / 1024).toFixed(1)} KB
        {deep.stateProof ? ` · proof ${hex(deep.stateProof)}` : ""}
      </p>
      <ScrollArea className="max-h-[45vh]">
        <pre className="text-body font-mono whitespace-pre">{pretty}</pre>
      </ScrollArea>
    </div>
  );
}
```

In `components/DataSection.tsx`'s ledger branch, render `ChannelStatePanel` beside `AnchorLogTable` when `store.metaSnap` is set. In `AnchorLogTable.tsx`, make a row click run `metaSnapSelectActions` (naming that row's metagraph snapshot) in addition to the existing `snapshotSelectActions` behaviour — the row and a tile click then mean the same thing.

- [ ] **Step 4: Run everything and verify it passes**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify in the running app**

chrome-devtools MCP: select a DOR tile, click "Show the application state", confirm the raw layer opens with the key table and the decoded payload; press Escape to return.

- [ ] **Step 6: Commit**

```bash
git add components/datasection/ChannelStatePanel.tsx components/DataSection.tsx components/datasection/AnchorLogTable.tsx components/selectionBoundary.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): the raw layer renders a channel's application state

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Calibrate the byte scale, then verify the whole branch

**Files:**
- Create: `scripts/bake-ledger-scale.ts`
- Modify: `src/engine/domain/ledgerLayout.ts` (`BYTE_SCALE_KB` gets its measured value + a provenance comment)
- Modify: `CLAUDE.md` (the Snapshots view section)

**Interfaces:**
- Consumes: `METAGRAPHS` from `src/engine/config`.
- Produces: a printed p99 and the updated constant. No runtime exports.

- [ ] **Step 1: Write the script**

Create `scripts/bake-ledger-scale.ts`:

```ts
// Calibrates the byte bar's width reference (spec §6.3). KB-per-tick is heavy-tailed — max/p95 was
// 88x in a 533-tick sample — so the bar scales to a FIXED p99 and clips the rare monster with an
// honest overflow multiplier, rather than rescaling the past every time one arrives.
//
// Run manually whenever the metagraph set or mainnet traffic changes:
//   npx tsx scripts/bake-ledger-scale.ts
import { METAGRAPHS } from "../src/engine/config";

const BE = "https://be-mainnet.constellationnetwork.io";
const LIMIT = 300;

async function snapsFor(id: string): Promise<{ timestamp: string; sizeInKB: number }[]> {
  try {
    const r = await fetch(`${BE}/currency/${id}/snapshots?limit=${LIMIT}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { data?: { timestamp?: string; sizeInKB?: number }[] };
    return (j.data ?? []).map((s) => ({ timestamp: s.timestamp ?? "", sizeInKB: s.sizeInKB ?? 0 }));
  } catch {
    return [];
  }
}

async function main() {
  const byTick = new Map<string, number>();
  for (const m of METAGRAPHS) {
    for (const s of await snapsFor(m.id)) {
      if (!s.timestamp) continue;
      byTick.set(s.timestamp, (byTick.get(s.timestamp) ?? 0) + s.sizeInKB);
    }
  }
  const ticks = [...byTick.values()].sort((a, b) => a - b);
  if (ticks.length < 500) {
    console.warn(`only ${ticks.length} ticks sampled — raise LIMIT for a trustworthy p99`);
  }
  const at = (q: number) => ticks[Math.min(ticks.length - 1, Math.floor(ticks.length * q))];
  // The listed directory is not the whole story: a few anchors come from metagraphs that aren't
  // publicly listed, so the measured p99 is inflated by their observed byte share.
  const UNLISTED_SHARE = 1.08;
  const p99 = at(0.99) * UNLISTED_SHARE;
  console.log(`ticks=${ticks.length} p50=${at(0.5).toFixed(1)} p95=${at(0.95).toFixed(1)} ` +
              `p99=${at(0.99).toFixed(1)} max=${ticks[ticks.length - 1].toFixed(1)}`);
  console.log(`\nBYTE_SCALE_KB = ${Math.round(p99)}   // p99 of anchored KB/tick, +unlisted share`);
}

main();
```

- [ ] **Step 2: Run it and set the constant**

Run: `npx tsx scripts/bake-ledger-scale.ts`
Expected: a p50 near 5 KB, a p95 near 10, and a p99 in the tens. Set `BYTE_SCALE_KB` in `src/engine/domain/ledgerLayout.ts` to the printed value with the provenance comment:

```ts
/** p99 of anchored KB per global tick, measured by scripts/bake-ledger-scale.ts on 2026-08-05
 *  over N ticks and inflated by the observed unlisted byte share. Ticks past this clip at the
 *  floor edge and carry an overflow multiplier on their label. */
export const BYTE_SCALE_KB = <measured>;
```

- [ ] **Step 3: Update the project memory**

In `CLAUDE.md`, rewrite the *The Snapshots (ledger) 3D view* section for the two-floor chamber (floors, node rails, the byte bar and its bands, ribbons, the two gutters), update the *Layout system* right-rail slot list with the metagraph snapshot card, note the new routes under *Data — server-side routes*, and move the retirements (dials, cubic links, centred block, five floor planes, `HYP_SPLIT`) into the retired list. Keep the anchors-state vocabulary rule as written.

- [ ] **Step 4: Full verification pass**

Stop the dev server, then:

```bash
npx tsc --noEmit && npm test && npm run build
```
Expected: types clean, all tests green, and the build route table still showing `/api/metagraphs` as `○` with `10m`; the two new snapshot routes and `/api/currency-activity` appear as expected (`ƒ` for the per-ordinal reads, `○` with `10m` for currency activity).

Restart the one dev server and run a screenshot suite with the chrome-devtools MCP: the Snapshots view at rest under `all`; with a metagraph committed; with a tile selected (card populated); with a band selected; the raw layer showing the application state; the same view at tablet (900px) and phone (390px) widths; and once with reduced motion emulated. Confirm the honest states appear where they should — an unmeasured seam on a cold load before the backfill lands, an anonymous tile on a tick older than the polled buffer, `forming…` on the lead row.

- [ ] **Step 5: Commit**

```bash
git add scripts/bake-ledger-scale.ts src/engine/domain/ledgerLayout.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(ledger): calibrate the byte-scale reference and record the redesign in project memory

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```
