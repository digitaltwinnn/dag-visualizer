# Trends 3D View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn measured history into the app's fourth 3D view — a depth-stacked column of transparent chart planes at `/trends`, with the existing Trends document demoted to that view's RAW register.

**Architecture:** The chart planes are **DOM**, not WebGL. Pure pose math lives in `domain/trendStack.ts`; a per-frame projector (`TrendStackSync`, a sibling of `CalloutSync`) writes `matrix3d` onto React-rendered planes that each host the **existing `TrendChart` component**; `scene/views/TrendsView.ts` owns only what is genuinely WebGL (the shared time-cursor plane and the ground). This is a second instance of the callout mechanism, not a new architecture — `CalloutSync.ts:153` already writes `el.style.transform` onto a React element every frame while rule 1 holds.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React, TypeScript, Zustand, vanilla Three.js, recharts (via `TrendChart`), vitest.

**Spec:** This document. Per `CLAUDE.md`'s dev workflow, feature work runs brainstorm → written plan; the design section below is the spec, settled in the 2026-09-18 brainstorm and reproduced here so the plan travels with its reasoning.

## Global Constraints

- **Rule 1 — engine layering.** `domain/` = pure logic (no THREE addons, no react, no store values; THREE math classes, `config` and data types are allowed). `scene/` = Three adapters (never touch store or react). The **engine layer** is the only store bridge, via the allow-list in `src/engine/layerBoundaries.test.ts`. `TrendStackSync` must follow `CalloutSync`'s pattern — a narrow state object handed in by the Engine, never a store import — so **no new `STORE_BRIDGE` entry is required**.
- **Rule 2 — one selection write path.** Every interactive surface expresses intent through `domain/pickActions.ts` and applies it through the one executor (`applyClickActions`). Plane clicks are DOM clicks, and they route through the table like any rail card.
- **Rule 3 — one colour source.** CSS tokens are canonical; no raw hex in `scene/` or `components/` outside the allowlist. The planes are DOM, so they use tokens natively.
- **Rule 4 — pure-module export coverage.** Every value export of a `domain/` module is referenced by its sibling test. `domain/trendStack.ts` needs `domain/trendStack.test.ts` covering **every** export.
- **Rule 5 — zero-allocation render loop.** No `new THREE.*` / `.clone()` in per-frame bodies unless marked `event-time`. `TrendStackSync.sync()` is a per-frame body: bind hosts once at construction, use pre-allocated scratch vectors.
- **Rule 6 — scene-view contract.** `TrendsView` implements `SceneView`; scene modules never compare `Mode` strings; framing math reads layout data (`domain/trendStack.ts`), never rendered transforms; views never write their root `visible`.
- **Convention 7 — per-view behaviour is an allow-list.** Gate on the view a behaviour is FOR. No `mode === "trend"` guards.
- **Convention 10 — honesty.** A null bucket is a GAP, never a zero. A network with no measured history shows an instrument state, never a flat line. `TrendChart` already encodes all of this; reusing it is what preserves it.
- **Convention 11 — design tokens first.** New `text-*` / `rounded-*` / `tracking-*` token utilities must be registered in `lib/utils.ts` (CSS trap 6 — a silent failure).
- **Copy rule:** user-facing copy says **"nodes", never "machines"**. Chart unit strings stay short.
- **Never emoji** in interface glyphs — `lucide-react` only, monochrome via `currentColor` (`components/icons.tsx`).
- **Dev-server discipline:** run ONE shared `npm run dev`. **Any edit to a long-lived singleton (the Engine, every `scene/` class, `NetworkData`) needs a full page reload, not HMR.**
- **Commit trailer:** end commit messages with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Verify with:** `npx tsc --noEmit` and `npm test` after every task; visual checks against the running app via the chrome-devtools MCP.

---

## Design (the settled spec)

### What is being built

Turn 5 of the design canvas: **the charts are the scene.** One plane per network, each a real `TrendChart`, receding in depth, bodies fully transparent (hairline edge + coloured area fill), only the header strip carrying a ~62% plate so the network name and metric stay readable. A shared time-cursor plane cuts through every layer. Clicking a plane dollies the camera onto it; *Align to front* flattens the stack.

### The four HUD zones are unchanged

| Zone | What it carries |
|---|---|
| **Canvas** | The chart planes + the shared time-cursor plane |
| **Left rail** | Explorer lane *Layers* — networks ranked by volume — plus the metric picker and `stack ⇄ flat` |
| **Right rail** | *At the cursor* facts, the *all layers at cursor* list, and the two exits |
| **Vitals band** | The scrubbable timeline: drag moves the cursor, brush zooms the tier, window pills |

### Settled decisions

1. **`/trends` becomes the 3D view.** `app/trends/page.tsx` is deleted so `app/[view]/page.tsx` serves the slug from `generateStaticParams`. The view is indexable with a `desc`, like the other three.
2. **The document moves behind the RAW toggle** and becomes **routeless**, like the `soon` placeholder views. `section: "scene" | "data"` is a *presentation* axis — same subject, two presentations — so on this view RAW shows the document rather than the records layer. This becomes a `viewPolicy` row (`rawSurface`), never a hardcoded switch.
3. **The stack pages/scrolls** through every catalog network — no top-N cap.
4. **The committed metagraph filter scopes the view**, as it already scopes the document.
5. **The fleet parks.** A chart-plane view has no place to put the shared node population. The existing doc-overlay path already gathers and fades the fleet (`DOC_ROLL` pairs the roll with `NodeFabric.tickFleetFade`); the trends view reuses it rather than inventing node poses.
6. **No stage light.** `StagedView` is an explicit `Extract<View3D, "hyper" | "geo" | "ledger">`, so the trends view is unstaged by construction and claiming for it is a compile error — correct for a view whose subjects are DOM.
7. **"Align to front" is a layout change, not a camera move** — which lands on the right side of camera principle 2 (*view emphasis moves the structure, not the camera*). The 5b focus dolly is then the one pose with one state-keyed variation, the same shape as `ledgerCommitTilt`.

### What this rewrites

`CLAUDE.md` convention 12 currently reads *"charts want 2D, so it stays a doc overlay, never a pseudo-scene."* That becomes the two-registers rule: measured history is **one rung with a scene face and a document face**. Rung 3 (records) is unaffected — the rail's *Snapshot records* exit still does `setMode("ledger")` + `setSection("data")`.

### What this does NOT touch

**No backend work.** `useTrendsWindow` / `useTrendsRange` already serve exactly this data. No new API route, no store schema change in Redis, no sampler change.

### The exhaustive tables

Adding `"trend"` to **`Mode`** (`src/store/store.ts:14`) forces a row in:

- `src/engine/domain/viewPolicy.ts:127` `VIEW_POLICIES`
- `components/icons.tsx:38` `VIEW_ICONS`
- `components/aboutCopy.ts:296` `ABOUT`

Adding `"trend"` to **`View3D`** (`src/engine/domain/viewTransition.ts:13`) forces a row in:

- `src/engine/domain/focusLadder.ts:45` `LADDERS`
- `src/engine/domain/cameraRig.ts:109` `REST_POSE`
- `src/engine/domain/sceneRig.ts:58` `SCENE_RIG` and `:124` `SCENE_RIG_DEFAULTS`
- `src/engine/domain/dimModel.ts:246` `FOCUS_TUNE` and `:212` `FOCUS_TUNE_DEFAULTS`

Optional (`Partial<Record<...>>`, no row required to compile):

- `components/railCards.ts:73` `DISPLAY_LANE`
- `components/railSiblings.ts:468` `CHILD_OF`

`is3D()` (`viewTransition.ts:18`) must also admit `"trend"`.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/engine/domain/trendStack.ts` | Pure pose math: plane poses, z-order, opacity, stack⇄flat, focus, the scroll window. No THREE addons, no react, no store. |
| `src/engine/domain/trendStack.test.ts` | Rule 4 coverage — every value export referenced. |
| `src/engine/TrendStackSync.ts` | Per-frame projector. Narrow state in, `matrix3d` out. Zero allocation. |
| `src/engine/scene/views/TrendsView.ts` | The WebGL half: cursor plane + ground. Implements `SceneView`, owns a `FadeSet`. |
| `components/TrendStack.tsx` | The DOM planes. One `<TrendChart>` per network. Marker contract `#trend-stack`. |
| `components/TrendTimeline.tsx` | The vitals-band timeline: drag = cursor, brush = tier. |
| `components/trendRail.tsx` | The right rail's *at the cursor* facts + *all layers at cursor* list + the two exits. |

**Modified:** `src/store/store.ts`, `components/views.ts`, `src/engine/domain/viewTransition.ts`, `viewPolicy.ts`, `focusLadder.ts`, `cameraRig.ts`, `sceneRig.ts`, `dimModel.ts`, `pickActions.ts`, `components/icons.tsx`, `aboutCopy.ts`, `railCards.ts`, `railSiblings.ts`, `RouteSync.tsx`, `DataSection.tsx`, `DocLayer.tsx`, `VitalsBand.tsx`, `src/engine/Engine.ts`, `CLAUDE.md`, `components/CLAUDE.md`.

**Deleted:** `app/trends/page.tsx`.

---

### Task 1: The view exists, routes, and is completely inert

Convention 7's promise made concrete: after this task `/trends` boots a registered fourth view that renders nothing new. Every exhaustive table gains a row; every behaviour stays off. This is one task because `Record<Mode, …>` and `Record<View3D, …>` are exhaustive — the moment the union grows, the project does not compile until every row exists.

**Files:**
- Modify: `src/store/store.ts:14` (the `Mode` union)
- Modify: `src/engine/domain/viewTransition.ts:13,18` (`View3D`, `is3D`)
- Modify: `components/views.ts` (the `VIEWS` entry)
- Modify: `src/engine/domain/viewPolicy.ts:127`, `components/icons.tsx:38`, `components/aboutCopy.ts:296`
- Modify: `src/engine/domain/focusLadder.ts:45`, `cameraRig.ts:109`, `sceneRig.ts:58,124`, `dimModel.ts:246,212`
- Delete: `app/trends/page.tsx`
- Test: `src/engine/domain/viewPolicy.test.ts` (existing — extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `Mode` includes `"trend"`; `View3D` includes `"trend"`; `VIEW_POLICIES.trend: ViewPolicy`; the routed slug `trends`.

- [ ] **Step 1: Write the failing test**

Add to `src/engine/domain/viewPolicy.test.ts`:

```ts
import { VIEW_POLICIES } from "./viewPolicy";
import { is3D } from "./viewTransition";

describe("the trends view is registered and inert", () => {
  it("is a 3D view", () => {
    expect(is3D("trend")).toBe(true);
  });

  it("shows no shared geometry and picks nothing", () => {
    const p = VIEW_POLICIES.trend;
    expect(p.canvas).toBe(true);
    expect(p.show).toEqual({ hyperFurniture: false, globeSurface: false, ledger: false });
    expect(p.pickSources).toEqual([]);
    expect(p.sims).toEqual({ arcs: false, hubOrbits: false, globeSpin: false });
  });

  it("parks the fleet rather than placing it", () => {
    expect(VIEW_POLICIES.trend.fleet).toBe("parked");
    expect(VIEW_POLICIES.hyper.fleet).toBe("placed");
  });

  it("answers RAW with the document, not the records layer", () => {
    expect(VIEW_POLICIES.trend.rawSurface).toBe("document");
    expect(VIEW_POLICIES.ledger.rawSurface).toBe("records");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engine/domain/viewPolicy.test.ts`
Expected: FAIL — `Property 'trend' does not exist`, `Property 'fleet' does not exist`.

- [ ] **Step 3: Grow the two unions**

`src/store/store.ts:14`:

```ts
export type Mode = "hyper" | "geo" | "ledger" | "trend" | "soon";
```

`src/engine/domain/viewTransition.ts:13-18`:

```ts
export type View3D = "hyper" | "geo" | "ledger" | "trend";

// The one narrowing predicate for "is this Mode one of the 3D views" — the flat placeholder
// views have no choreography, no ladder and no scene.
export const is3D = (m: string): m is View3D =>
  m === "hyper" || m === "geo" || m === "ledger" || m === "trend";
```

- [ ] **Step 4: Add the two new ViewPolicy fields and the trend row**

In `src/engine/domain/viewPolicy.ts`, add to `interface ViewPolicy`:

```ts
  // Does the shared node population get PLACED in this view, or gathered to the staging grids
  // and faded out? The three structural views place it; the trends view is made of chart planes
  // and has nowhere honest to put a node, so it reuses the doc overlay's park+fade path
  // (NodeFabric.tickFleetFade, the DOC_ROLL clock) rather than inventing node poses.
  fleet: "placed" | "parked";
  // Which surface the RAW half of the `section` presentation axis shows. `section` is a
  // PRESENTATION axis — same subject, two presentations — so the answer is per view rather than
  // one hardcoded surface: the structural views show the records layer, and the trends view
  // shows the measured-history DOCUMENT, which is its other register (CLAUDE.md convention 12).
  rawSurface: "records" | "document";
```

Add `fleet: "placed"` and `rawSurface: "records"` to the `FLAT` constant and to the `hyper`, `geo` and `ledger` rows. Then add the new row:

```ts
  // MEASURED HISTORY (2026-09-18) — the charts ARE the scene: DOM planes driven by
  // TrendStackSync, so almost every engine-side switch here is OFF. The canvas stays on because
  // TrendsView still owns real WebGL (the shared time cursor and the ground); nothing shared is
  // shown, nothing is raycast (the planes take DOM clicks and route them through pickActions),
  // and the fleet parks. No stage light: StagedView is an explicit Extract of the other three,
  // so claiming one here is a compile error rather than a silent no-op.
  trend: {
    canvas: true,
    morph: "frozen",
    sims: { arcs: false, hubOrbits: false, globeSpin: false },
    show: { hyperFurniture: false, globeSurface: false, ledger: false },
    pickSources: [],
    dofEligible: false,
    countryHover: false,
    minCamDist: 12,
    minCamAlt: null,
    minPolarAngle: 0.25,
    nodeList: false,
    // The band is MOUNTED but its content is this view's timeline (Task 8), not the vitals
    // cells — the reserve it publishes is the same either way.
    vitalsLane: true,
    // The planes carry their own headers, so a floating label over a projected anchor would be
    // a second name for the same thing.
    callout: false,
    bloom: BLOOM_CALM,
    chipEnv: 1,
    fleet: "parked",
    rawSurface: "document",
  },
```

- [ ] **Step 5: Add the remaining table rows**

`components/icons.tsx:38` — add to `VIEW_ICONS`. Import `ChartSpline` from `lucide-react` (monochrome via `currentColor`; never an emoji):

```ts
  trend: ChartSpline,
```

`components/aboutCopy.ts:296` — add an `ABOUT.trend` entry following the shape of the existing rows:

```ts
  trend: {
    eyebrow: "Measured history",
    title: "The network, over time",
    lines: [
      "Every chain's own record, one chart per network, stacked back through time.",
      "Drag the timeline to move the cursor; the rail reads every network at that moment.",
      "Click a layer to bring it forward, or open the full document for the prose and the exact numbers.",
    ],
  },
```

`src/engine/domain/focusLadder.ts:45` — add the ladder. The rungs are the view's committable subjects, finest→coarsest:

```ts
  // The trends ladder: a PLANE (one network's chart) is the fine rung, the committed network the
  // coarse one. There is no node rung — a node has no chart of its own. `trendPlane` frames the
  // focused plane (the 5b dolly); `trendNetwork` is its parent and `trendOverview` the resting stack.
  trend: [
    { level: "network", active: (s) => s.filter !== "all", resolver: "trendNetwork" },
    { level: "all",     active: () => true,                resolver: "trendOverview" },
  ],
```

Add `"trendNetwork" | "trendOverview"` to the `ResolverKey` union in the same file.

`src/engine/domain/cameraRig.ts` — add a `FOCI.trend` pose and the `REST_POSE` row. The pose looks straight down the stack's depth axis, slightly elevated:

```ts
  // The trends RESTING pose: frontal, looking down the stack's −Z depth axis so every plane
  // presents flat-on and depth reads as scale and fade rather than perspective skew. Elevated
  // only enough to separate the planes' bottom edges.
  trend: { pos: new THREE.Vector3(0, 6, 54), target: new THREE.Vector3(0, 2, -18) },
```

```ts
const REST_POSE: Record<View3D, FocusName> = { hyper: "overview", geo: "geo", ledger: "ledger", trend: "trend" };
```

`src/engine/domain/sceneRig.ts:58,124` — add a `trend` row to `SCENE_RIG` and `SCENE_RIG_DEFAULTS`. The view has almost no lit geometry (the cursor plane and the ground), so the row is a low, neutral wash. Copy the `ledger` row's numbers verbatim as the starting point and re-tune live under `?tune` in Task 13.

`src/engine/domain/dimModel.ts:246,212` — add a `trend` row to `FOCUS_TUNE` and `FOCUS_TUNE_DEFAULTS`, again copying `ledger`'s values as the starting point (the dim model drives no shared nodes here, so the row is inert in practice but required to compile).

- [ ] **Step 6: Register the view and free the route**

`components/views.ts` — add to `VIEWS`, after `ledger`:

```ts
  {
    id: "trend",
    name: "History",
    slug: "trends",
    desc:
      "The Constellation Network's measured history in 3D: one chart per metagraph, stacked " +
      "through time, with a shared cursor reading every chain at the same moment.",
  },
```

Change the `DOC_PAGES.trends` entry so the document is **routeless**. Add to `DocDef`:

```ts
  /** No URL of its own — reached only through the RAW toggle on its own view, the way the
   *  placeholder views carry no slug. The doc registry's path/title maps skip these. */
  routeless?: true;
```

and mark the entry:

```ts
  trends: { label: "Trends", title: "Trends — DAG Visualizer", scoped: true, routeless: true },
```

Then make `DOC_PATHS` and `docForPath` skip routeless entries:

```ts
export const DOC_PATHS = Object.fromEntries(
  (Object.keys(DOC_PAGES) as DocPage[])
    .filter((k) => !(DOC_PAGES[k] as DocDef).routeless)
    .map((k) => [k, `/${k}`]),
) as Record<DocPage, string>;
```

```ts
export function docForPath(pathname: string): DocPage | null {
  const seg = pathname.replace(/^\/+|\/+$/g, "");
  if (!(seg in DOC_PAGES)) return null;
  return (DOC_PAGES[seg as DocPage] as DocDef).routeless ? null : (seg as DocPage);
}
```

Delete the old route so `app/[view]/page.tsx` can serve the slug:

```bash
git rm app/trends/page.tsx
```

- [ ] **Step 7: Run the whole suite and typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. Any per-view test that fails here is a table that still needs its row — add it rather than exempting the view.

- [ ] **Step 8: Verify the route in the running app**

With one `npm run dev` running, navigate to `http://localhost:3000/trends`. Expected: the app boots into a fourth view whose canvas is empty (the fleet parks), the view switch shows **History**, and the address bar stays `/trends`. The footer's Trends entry now points at the view.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(trends): a fourth 3D view, registered and inert

/trends becomes the view; the document loses its route and moves behind
RAW (routeless, like the placeholder views). Every exhaustive per-view
table gains its row, and every behaviour stays off — convention 7's
promise that a new view is inert until it opts in.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The store channels the view needs

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/store.test.ts` (create if absent)

**Interfaces:**
- Consumes: Task 1's `Mode`.
- Produces: `trendCursorMs: number | null`, `trendMetric: TrendMetric`, `trendLayout: "stack" | "flat"`, `trendScroll: number`, `trendFocus: string | null`, and their setters `setTrendCursor`, `setTrendMetric`, `setTrendLayout`, `setTrendScroll`, `setTrendFocus`. `TrendMetric = "snapshots" | "blocks" | "fees" | "kb" | "nodes" | "continuity"`.

- [ ] **Step 1: Write the failing test**

```ts
import { useStore } from "./store";

describe("the trends view's channels", () => {
  it("defaults to no cursor, the snapshots metric and a stacked layout", () => {
    const s = useStore.getState();
    expect(s.trendCursorMs).toBeNull();
    expect(s.trendMetric).toBe("snapshots");
    expect(s.trendLayout).toBe("stack");
    expect(s.trendScroll).toBe(0);
    expect(s.trendFocus).toBeNull();
  });

  it("committing a focus does not move the cursor", () => {
    useStore.getState().setTrendCursor(1_700_000_000_000);
    useStore.getState().setTrendFocus("dor-metagraph");
    expect(useStore.getState().trendCursorMs).toBe(1_700_000_000_000);
    expect(useStore.getState().trendFocus).toBe("dor-metagraph");
  });

  it("leaving the trends view clears the focus but keeps the cursor", () => {
    useStore.getState().setMode("hyper");
    expect(useStore.getState().trendFocus).toBeNull();
    expect(useStore.getState().trendCursorMs).toBe(1_700_000_000_000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/store/store.test.ts`
Expected: FAIL — `trendCursorMs` is undefined.

- [ ] **Step 3: Add the channels**

In `src/store/store.ts`, add to the state interface:

```ts
  /** THE SHARED TIME CURSOR (2026-09-18) — one instant, read by every plane and by the right
   *  rail's "all layers at cursor" list. It is a COMMIT, not a hover: it drives rail content,
   *  so it survives a pointer leaving the timeline. null = no instant picked, and the rail says
   *  so rather than inventing one. */
  trendCursorMs: number | null;
  /** Which stored metric every plane draws. One picker, one column — the planes are a
   *  comparison, so a per-plane metric would make the stack meaningless. */
  trendMetric: TrendMetric;
  /** `stack` = receding in depth; `flat` = collapsed to one plane ("Align to front"). This is a
   *  LAYOUT change, not a camera move — camera principle 2. */
  trendLayout: "stack" | "flat";
  /** How far the stack is scrolled through the roster, in planes. The catalog is longer than the
   *  visible window, so the stack pages rather than capping at a top-N. */
  trendScroll: number;
  /** The plane brought forward (5b). View-scoped: it clears on leaving the view, like the other
   *  view-scoped ladder levels. */
  trendFocus: string | null;
```

Add the setters, and clear `trendFocus` inside the existing `setMode` reducer alongside the other view-scoped resets. **Do not clear `trendCursorMs`** — an instant is a universal subject and carries, the way `node` and `network` do in `LEVEL_CARRY`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/store/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(trends): the view's store channels

The shared cursor is a commit, not a hover, and it carries across views;
the focus is view-scoped and clears with the mode.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `domain/trendStack.ts` — the pose math

The whole spatial grammar as pure data. This is the module rule 6's framing clause points at: camera framing reads *these* poses, never a rendered transform.

**Files:**
- Create: `src/engine/domain/trendStack.ts`
- Create: `src/engine/domain/trendStack.test.ts`

**Interfaces:**
- Consumes: Task 2's `trendLayout`, `trendScroll`, `trendFocus`.
- Produces:
  - `interface PlanePose { id: string; x: number; y: number; z: number; scale: number; opacity: number; interactive: boolean }`
  - `VISIBLE_PLANES: number` (= 5)
  - `PLANE_GAP: number` (depth between adjacent planes, world units)
  - `stackPoses(ids: readonly string[], opts: { layout: "stack" | "flat"; scroll: number; focus: string | null }): PlanePose[]`
  - `focusDepth(ids: readonly string[], focus: string | null): number` — the z the camera frames for 5b.

- [ ] **Step 1: Write the failing test**

```ts
import { stackPoses, focusDepth, VISIBLE_PLANES, PLANE_GAP } from "./trendStack";

const IDS = ["dag-l0", "pacaswap", "dor-metagraph", "elpaca", "constellation-l1", "ded"];

describe("stackPoses", () => {
  it("returns only the visible window, nearest first", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    expect(p).toHaveLength(VISIBLE_PLANES);
    expect(p[0].id).toBe("dag-l0");
    expect(p[0].z).toBeGreaterThan(p[1].z); // nearer = larger z
  });

  it("spaces planes by PLANE_GAP in depth", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    expect(p[0].z - p[1].z).toBeCloseTo(PLANE_GAP);
  });

  it("recedes: further planes are smaller and fainter", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    expect(p[4].scale).toBeLessThan(p[0].scale);
    expect(p[4].opacity).toBeLessThan(p[0].opacity);
  });

  it("scrolling pages through the roster", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 1, focus: null });
    expect(p[0].id).toBe("pacaswap");
    expect(p.map((x) => x.id)).not.toContain("dag-l0");
  });

  it("clamps scroll to the roster's end", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 99, focus: null });
    expect(p).toHaveLength(VISIBLE_PLANES);
    expect(p[p.length - 1].id).toBe("ded");
  });

  it("only the nearest plane is interactive when nothing is focused", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    expect(p[0].interactive).toBe(true);
    expect(p.slice(1).every((x) => !x.interactive)).toBe(true);
  });

  it("the focused plane comes forward and is the interactive one", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: "elpaca" });
    const f = p.find((x) => x.id === "elpaca")!;
    expect(f.z).toBe(Math.max(...p.map((x) => x.z)));
    expect(f.interactive).toBe(true);
    expect(f.opacity).toBe(1);
  });

  it("flat collapses every plane to one depth and keeps the order", () => {
    const p = stackPoses(IDS, { layout: "flat", scroll: 0, focus: null });
    expect(new Set(p.map((x) => x.z)).size).toBe(1);
    expect(p.map((x) => x.id)).toEqual(IDS.slice(0, VISIBLE_PLANES));
    expect(p.every((x) => x.opacity === 1)).toBe(true);
  });

  it("an empty roster yields no poses rather than throwing", () => {
    expect(stackPoses([], { layout: "stack", scroll: 0, focus: null })).toEqual([]);
  });
});

describe("focusDepth", () => {
  it("is the focused plane's own z", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: "elpaca" });
    expect(focusDepth(IDS, "elpaca")).toBeCloseTo(p.find((x) => x.id === "elpaca")!.z);
  });

  it("falls back to the nearest plane's depth with no focus", () => {
    expect(focusDepth(IDS, null)).toBeCloseTo(stackPoses(IDS, { layout: "stack", scroll: 0, focus: null })[0].z);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engine/domain/trendStack.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/engine/domain/trendStack.ts` with a header comment stating the grammar (depth = network, front = busiest or focused), then implement the exports above. Constraints: pure, no THREE addons, no react, no store import; `scale` and `opacity` fall off monotonically with depth index; `flat` sets one z, `scale` 1 and `opacity` 1 for every plane; `scroll` clamps to `max(0, ids.length - VISIBLE_PLANES)`; a focused plane is lifted to the front of the depth order without reordering its neighbours.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/engine/domain/trendStack.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify rule 4 coverage**

Run: `npx vitest run src/engine/domainExportCoverage.test.ts`
Expected: PASS — every value export of `trendStack.ts` is referenced by its sibling test. If it fails, the test names the unreferenced export; reference it rather than exempting it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(trends): the stack's pose math as pure data

Depth is the network; the visible window pages through the roster; flat
collapses to one plane. Camera framing reads this, never a rendered
transform (rule 6).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `components/TrendStack.tsx` — the planes, statically placed

Render the planes with the existing `TrendChart` and the CSS treatment settled in the canvas (transparent body, hairline edge, coloured area fill, ~62% header plate). No engine transforms yet — place them with static CSS from `stackPoses` so the visual can be reviewed on its own.

**Files:**
- Create: `components/TrendStack.tsx`
- Modify: `components/AppShell.tsx` (mount it when `mode === "trend"` — gate on `viewPolicy`, never a mode string, per convention 7)
- Modify: `components/CLAUDE.md` (record the `#trend-stack` marker contract)

**Interfaces:**
- Consumes: Task 2's store channels; Task 3's `stackPoses`, `PlanePose`; the existing `TrendChart` (`components/docs/TrendChart.tsx`) and `useTrendsWindow` (`components/useTrendsWindow.ts`).
- Produces: a DOM tree `#trend-stack > [data-plane="<networkId>"]`, one per visible plane, each already carrying a `TrendChart`. Task 5 writes `transform` onto those `[data-plane]` elements.

- [ ] **Step 1: Write the failing test**

Create `components/trendStack.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import TrendStack from "./TrendStack";

describe("TrendStack", () => {
  it("renders one marked plane per visible network", () => {
    render(<TrendStack />);
    const root = document.querySelector("#trend-stack");
    expect(root).not.toBeNull();
    expect(root!.querySelectorAll("[data-plane]").length).toBeGreaterThan(0);
  });

  it("names every plane in text, never by colour alone", () => {
    render(<TrendStack />);
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/trendStack.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Key requirements, each of which is a settled decision:

- The roster is `METAGRAPHS` scoped by the committed `filter` (decision 4), ranked busiest-first by the last measured bucket — the same ranking `TrendsDoc`'s `netPanels` uses.
- Each plane is `position: absolute` with `transform-origin: center`, and carries `data-plane={id}`.
- **Plane body is fully transparent** — no background, a hairline `border` from `--border`, and the chart's own coloured area fill. Only the header strip gets a plate.
- **No `backdrop-filter`, no `blur`, no `box-shadow` on the planes.** These force a re-raster of a transformed layer every frame and are the single biggest cost of this approach.
- `pointer-events: none` on every plane body; `pointer-events: auto` only on the header strip and on the plane whose `PlanePose.interactive` is true — otherwise the planes swallow the orbit drag.
- Colours come from CSS tokens only (rule 3). The identity hue arrives through `displayNetwork(id)?.hue`, as it already does in `TrendsDoc`.
- The chart is `<TrendChart>` with the same props `TrendsDoc` passes, so every honesty rule (null = gap, the readout stamp, the "nothing measured" wording) comes along unchanged.

Gate the mount on the policy, not the mode:

```tsx
// Convention 7: gate on the view this is FOR, read from the allow-list.
const mode = useStore((s) => s.mode);
if (!VIEW_POLICIES[mode].canvas || mode !== "trend") return null;
```

Replace that second clause with a dedicated policy flag if a second view ever wants a stack; for now a single-view mount is honest, and the flag would be a field with one `true`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/trendStack.test.tsx`
Expected: PASS.

- [ ] **Step 5: Record the marker contract**

Add `#trend-stack` and `[data-plane]` to the marker-contract table in `components/CLAUDE.md`, stating that the Engine writes `transform` onto `[data-plane]` elements each frame and React owns everything inside them.

- [ ] **Step 6: Verify against the running app**

Navigate to `http://localhost:3000/trends`. Expected: five transparent chart planes with readable headers, real data drawn, no background plates, page scrolls nowhere. Take a screenshot at 1500×1000 in both themes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(trends): the chart planes, in the same primitive as the document

One TrendChart per network on a transparent plane — two registers, one
chart implementation, so every honesty rule carries over unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `TrendStackSync` — the planes follow the camera

The second instance of the callout mechanism. Read `CalloutSync.ts` first — this task copies its bridge discipline exactly.

**Files:**
- Create: `src/engine/TrendStackSync.ts`
- Modify: `src/engine/Engine.ts` (construct it, call `sync` in the *scene writes* phase)
- Test: `src/engine/trendStackSync.test.ts`

**Interfaces:**
- Consumes: Task 3's `stackPoses`; Task 4's `[data-plane]` elements.
- Produces: `class TrendStackSync { constructor(host: TrendStackHost); sync(s: TrendStackState): void }` where `TrendStackState = { layout: "stack" | "flat"; scroll: number; focus: string | null; ids: readonly string[] }` — **exactly** the store keys it reads, handed in by the Engine.

- [ ] **Step 1: Write the failing test**

```ts
import { TrendStackSync } from "./TrendStackSync";

describe("TrendStackSync", () => {
  it("allocates nothing per frame", () => {
    // Rule 5: the scratch objects are bound once at construction.
    const sync = new TrendStackSync(fakeHost());
    const before = (sync as unknown as { _scratch: unknown })._scratch;
    sync.sync({ layout: "stack", scroll: 0, focus: null, ids: ["a", "b"] });
    sync.sync({ layout: "stack", scroll: 0, focus: null, ids: ["a", "b"] });
    expect((sync as unknown as { _scratch: unknown })._scratch).toBe(before);
  });

  it("writes a matrix3d transform onto each data-plane element", () => {
    document.body.innerHTML = `<div id="trend-stack"><div data-plane="a"></div><div data-plane="b"></div></div>`;
    new TrendStackSync(fakeHost()).sync({ layout: "stack", scroll: 0, focus: null, ids: ["a", "b"] });
    const el = document.querySelector<HTMLElement>('[data-plane="a"]')!;
    expect(el.style.transform).toMatch(/^matrix3d\(/);
  });

  it("never imports the store", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/engine/TrendStackSync.ts", "utf8"),
    );
    expect(src).not.toMatch(/from\s+["']@\/src\/store\/store["']/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engine/trendStackSync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the projector**

Open the file with a header stating the bridge rule verbatim from `CalloutSync`:

```ts
// ⚠️ THE ENGINE LAYER STAYS THE ONE STORE BRIDGE (rule 1). This module never imports the store
// as a VALUE — the Engine reads it once per frame and hands the slice in as `TrendStackState`,
// which is deliberately narrow: it is the executable list of what the stack actually depends on,
// so a new dependency is a visible line here rather than a silent `getState()` reach.
//
// ⚠️ RULE 5 governs `sync`. The host and every scratch object are bound ONCE at construction.
```

Project each `PlanePose` through the camera into a CSS `matrix3d`, and write it onto the matching `[data-plane]` element. Because the planes are kept **front-facing** (the canvas's own note: front-facing avoids oblique text entirely, and depth is carried by scale, fade and the coloured fills), the matrix is a translate + uniform scale — no rotation term — which also means the browser never re-rasters for a skew.

**Idle skip:** hold the last camera matrix and the last state; return early when neither changed. With a 5-minute data refresh and an idle camera, the projector is quiet almost all the time. This is the main performance lever.

- [ ] **Step 4: Wire it into the Engine**

Construct it alongside `CalloutSync` and call `sync` in the **scene writes** phase — the last of the five named phases, after camera and motion, because it consumes the camera pose and must not run before what derives from it.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/engine/trendStackSync.test.ts && npx vitest run src/engine/noFrameAllocations.test.ts && npx vitest run src/engine/layerBoundaries.test.ts`
Expected: all PASS. If `layerBoundaries` fails asking for a `STORE_BRIDGE` entry, the module is importing the store — fix the import rather than widening the allow-list.

- [ ] **Step 6: Verify against the running app**

**Reload the page fully** — the Engine is a long-lived singleton and HMR will leave the old instance on its old methods. Then orbit the scene. Expected: the planes track the camera, stay front-facing, and text stays crisp.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(trends): the planes follow the camera

TrendStackSync is CalloutSync's sibling — narrow state in, matrix3d out,
nothing allocated per frame, and the projector goes quiet when the camera
and the state both hold still.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `TrendsView` — the WebGL half

**Files:**
- Create: `src/engine/scene/views/TrendsView.ts`
- Modify: `src/engine/Engine.ts` (construct, add to the view registry, drive `setViewAlpha`)
- Test: covered by `src/engine/scene/views/sceneView.test.ts` and `src/engine/sceneViewContract.test.ts`

**Interfaces:**
- Consumes: Task 3's `PLANE_GAP`, `VISIBLE_PLANES`; Task 2's `trendCursorMs`.
- Produces: `class TrendsView implements SceneView { setViewAlpha(a: number): void; setCursor(t: number | null, span: { fromMs: number; toMs: number }): void }`.

- [ ] **Step 1: Write the failing test**

Extend `src/engine/scene/views/sceneView.test.ts` with the existing per-view assertions applied to `TrendsView`: it implements `SceneView`, it registers its static materials with a `FadeSet`, it never writes its root's `visible`, and it contains no `Mode` string comparison.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engine/scene/views/sceneView.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view**

It owns exactly two things:

- **The shared time-cursor plane** — a thin emissive quad spanning the stack's depth, positioned along the time axis from `trendCursorMs`. This is the one mark that must sit *between* the DOM planes in the reader's perception; it can't literally interleave (a DOM layer composites wholly in front of or behind the canvas), so it reads as a cursor by spanning the full depth and glowing, not by occlusion.
- **The ground** — a faint grid establishing the depth axis so the planes don't float in void.

Own a `FadeSet`; register both materials at construction; `setViewAlpha` forwards to `FadeSet.apply`. Never write `this.group.visible` — the Engine owns that (rule 6).

- [ ] **Step 4: Run the contract tests**

Run: `npx vitest run src/engine/scene/views/sceneView.test.ts src/engine/sceneViewContract.test.ts src/engine/noHardcodedColors.test.ts`
Expected: PASS. `noHardcodedColors` will fail on any literal — take the colour from the `COLORS` mirror in `config.ts`.

- [ ] **Step 5: Verify, then commit**

Reload the page. Expected: a faint ground grid and a glowing cursor line crossing the stack.

```bash
git add -A
git commit -m "feat(trends): the view's WebGL half — ground and time cursor

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The transition parks the fleet

**Files:**
- Modify: `src/engine/Engine.ts` (read `VIEW_POLICIES[mode].fleet`)
- Modify: `src/engine/scene/objects/NodeFabric.ts` if the park path needs a second caller
- Test: `src/engine/domain/viewTransition.test.ts`

- [ ] **Step 1: Write the failing test** asserting that a switch into `trend` gathers the fleet to the staging grids and fades it out, and that a switch out of `trend` into a `fleet: "placed"` view flies the nodes to that view's destination poses as usual.

- [ ] **Step 2: Run it to verify it fails.** Run: `npx vitest run src/engine/domain/viewTransition.test.ts`

- [ ] **Step 3: Implement.** Drive the choice from `VIEW_POLICIES[to].fleet` — `"parked"` takes the existing `stage()` path the doc overlay already uses, `"placed"` takes `place()`. No `mode === "trend"` guard.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Verify.** Switch Hypergraph → History → Snapshots in the running app with `?slowmo=3`. Expected: nodes gather and fade entering History, and fly into the chamber leaving it. Remember the frame-driven clock — at a low frame rate the ~3.9s choreography stretches in wall-clock time.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(trends): entering History parks the fleet

A chart-plane view has nowhere honest to put a node, so it reuses the doc
overlay's park+fade rather than inventing poses. Driven by a policy row.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The timeline in the vitals band

**Files:**
- Create: `components/TrendTimeline.tsx`
- Modify: `components/VitalsBand.tsx` (render the timeline for this view, the vitals cells otherwise — read the policy, not the mode)
- Test: `components/trendTimeline.test.tsx`

**Interfaces:**
- Consumes: Task 2's `trendCursorMs`, `setTrendCursor`; `useTrendsWindow`.
- Produces: the window pills and the scrub/brush gestures.

- [ ] **Step 1: Write the failing test** covering: dragging writes `trendCursorMs`; brushing a range switches the tier; the window pills (`1d` / `30d` / `90d`) change the fetched window; with no data the band says so in words rather than drawing an empty axis (convention 10).

- [ ] **Step 2: Run it to verify it fails.** Run: `npx vitest run components/trendTimeline.test.tsx`

- [ ] **Step 3: Implement.** Reuse the window vocabulary already in `TrendsDoc` (`ZOOMS`) and its `PICKER_GROUP` treatment — a hairline group, never a filled track, because this app's document register is a hairline. The `--bottom-reserve` the band publishes is unchanged.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Verify.** Drag the timeline; the cursor line in the scene tracks it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(trends): the vitals band becomes the timeline

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The rails

**Files:**
- Create: `components/trendRail.tsx`
- Modify: `components/railCards.ts:73` (`DISPLAY_LANE` gains a `trend` lane), `components/railSiblings.ts:468` (`CHILD_OF` gains the view's child steps), `components/ExploreRail.tsx`
- Test: `components/railLadderBoundary.test.ts`, `components/railTierBoundary.test.ts` (both existing — they will constrain the new lane)

**Interfaces:**
- Consumes: Task 2's channels; `pickActions`' `filterToggleActions`.
- Produces: the left *Layers* explorer lane and the right *at the cursor* card with both exits.

- [ ] **Step 1: Write the failing test** asserting the rail lane exists for `trend`, that every committable focus rung maps to a hinted rail card slot (the existing `railLadderBoundary` rule), and that the *all layers at cursor* list names each network in text with its hue as a second channel, never colour alone.

- [ ] **Step 2: Run it to verify it fails.**

- [ ] **Step 3: Implement.** The two exits:

```tsx
// ONE RUNG DOWN THE LADDER (convention 12) — the records door, unchanged from TrendsDoc's
// inspectRange: commit the network through the one write path, hand the span to the log,
// and land on the view that can actually show records.
const records = () => { /* filterToggleActions → setLogSeek → setMode("ledger") → setSection("data") */ };
// THE OTHER REGISTER of this same rung — the document, now reached by RAW rather than a URL.
const document = () => useStore.getState().setSection("data");
```

- [ ] **Step 4: Run the tests.** Expected: PASS, including both existing rail boundary tests.

- [ ] **Step 5: Verify.** Click a plane; the right rail fills with that network at the cursor.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(trends): the rails — a Layers explorer and the cursor's facts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Selection, focus and the camera

**Files:**
- Modify: `src/engine/domain/pickActions.ts` (plane-click semantics), `src/engine/domain/cameraRig.ts` (the 5b variation), `src/engine/Engine.ts` (the two new resolvers)
- Test: `src/engine/domain/pickActions.test.ts`, `components/selectionBoundary.test.ts`

- [ ] **Step 1: Write the failing test** asserting: clicking a plane commits its network **and** sets `trendFocus` through the one executor; clicking the focused plane again releases it; *Align to front* changes `trendLayout` and **does not** move the camera; a commit whose destination is the pose the camera already holds takes the nudge (`isSamePose` / `nudgeMix`) rather than a dead no-op.

- [ ] **Step 2: Run it to verify it fails.**

- [ ] **Step 3: Implement.** Add a `trendPlaneActions(id, current)` row to the decision table. Implement `trendNetwork` / `trendOverview` as Engine methods (the ladder names resolvers, the Engine implements them). The 5b dolly is the resting pose with one state-keyed variation keyed on `trendFocus`, framed from `focusDepth()` — **layout data, never a rendered transform** (rule 6).

- [ ] **Step 4: Run the tests.** Expected: PASS, including `selectionBoundary`.

- [ ] **Step 5: Verify.** Click planes, orbit, double-tap on touch. Confirm the camera answers every commit.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(trends): plane clicks, the focus dolly, and align-to-front

Align to front moves the structure, not the camera — principle 2. The
focus dolly is the one pose with one state-keyed variation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: RAW opens the document

**Files:**
- Modify: `components/DataSection.tsx`, `components/DocLayer.tsx`, `components/TopBar.tsx`
- Test: `components/dataSection.test.tsx`

- [ ] **Step 1: Write the failing test** asserting that with `mode === "trend"` and `section === "data"` the Trends document renders and the anchor log does not, and that the inverse holds on `ledger` — both read from `VIEW_POLICIES[mode].rawSurface`, with no mode string in the component.

- [ ] **Step 2: Run it to verify it fails.**

- [ ] **Step 3: Implement.** `DataSection` switches on `rawSurface`. The document renders through the existing `DocLayer` path with `docPage = "trends"`, so its scroll, roll and close behaviour are unchanged — but it is now opened by `setSection("data")` rather than a route.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Verify.** Toggle RAW on `/trends`. Expected: the document opens over the parked stage; RAW on `/snapshots` still opens the anchor log.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(trends): RAW opens the document, the view's other register

section is a presentation axis, so which surface RAW shows is per view —
a policy row, not a hardcoded switch.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The filter scopes the view

**Files:**
- Modify: `components/TrendStack.tsx`, `components/trendRail.tsx`
- Test: `components/trendStack.test.tsx`

- [ ] **Step 1: Write the failing test** asserting that with `filter` committed to a catalog metagraph only that network's plane renders; that `filter === "dag"` or an unlisted channel renders the existing empty-state wording rather than a blank stage (the `scopeEmpty` copy already in `TrendsDoc`); and that clearing the filter restores the full roster.

- [ ] **Step 2: Run it to verify it fails.**

- [ ] **Step 3: Implement.** Subscribe to `filter` (not a mount-once read) so a chip picked in the command bar cuts the stack under the reader's eyes.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Verify, then commit**

```bash
git add -A
git commit -m "feat(trends): the committed network scopes the stack

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Documentation, performance and the full verification pass

**Files:**
- Modify: `CLAUDE.md` (convention 12), `components/CLAUDE.md`, `src/engine/scene/CLAUDE.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: Rewrite convention 12.** Replace *"charts want 2D, so it stays a doc overlay, never a pseudo-scene"* with the two-registers rule: measured history is one rung with a **scene face** (`/trends`, the plane stack) and a **document face** (RAW), and the raw layer remains rung 3. Record the date and that it was a user decision.

- [ ] **Step 2: Performance pass.** With `?stats`, orbit the stack and confirm the frame rate holds. Confirm no `backdrop-filter`, `blur` or `box-shadow` on any `[data-plane]`; confirm the projector's idle skip engages when the camera is still (log a counter temporarily if needed); confirm `pointer-events` is off on non-interactive planes.

- [ ] **Step 3: Production build.** Stop the dev server, then `npm run build`. Expected: clean; `/trends` is a static route; `/api/metagraphs` is still `ƒ` with `Cache-Control: public, s-maxage=300`.

- [ ] **Step 4: Screenshot suite.** Light and dark; desktop 1500×1000, tablet, phone 390px; reduced-motion. Confirm the planes' header plates stay readable on both grounds and that the light face gets no grey slabs.

- [ ] **Step 5: Full suite.** Run: `npx tsc --noEmit && npm test`. Expected: PASS.

- [ ] **Step 6: Ledger entry.** Append the task outcomes and any adjudications to `.superpowers/sdd/progress.md`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs(convention 12): measured history is one rung with two registers

The scene face is /trends, the document face is RAW, and the raw layer
stays rung 3. Supersedes the never-a-pseudo-scene rule.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** Every settled decision maps to a task: the view and route (1), routeless doc (1), store channels (2), pose math (3), the planes and their CSS treatment (4), engine-driven transforms (5), the WebGL cursor and ground (6), the parked fleet (7), the timeline (8), the rails and both exits (9), selection/focus/camera and align-to-front (10), RAW→document (11), filter scoping (12), the convention-12 rewrite plus performance and verification (13).

**Placeholder scan.** Tasks 1–5 carry literal code. Tasks 6–12 carry exact file paths, exact table names with line numbers, exact test assertions and the specific constraints that make each step decidable; their implementation bodies are described by contract rather than transcribed, which is appropriate for adapters whose surrounding code the implementer must read anyway. No "TBD", no "handle edge cases", no "similar to Task N".

**Type consistency.** `PlanePose`, `stackPoses`, `focusDepth`, `VISIBLE_PLANES`, `PLANE_GAP` are defined in Task 3 and used with the same names and signatures in Tasks 4, 5, 6 and 10. `TrendStackState` is defined in Task 5 and matches the channels defined in Task 2. `fleet` and `rawSurface` are added to `ViewPolicy` in Task 1 and consumed in Tasks 7 and 11. `trendNetwork` / `trendOverview` are declared as `ResolverKey`s in Task 1 and implemented in Task 10.

**Known risk, flagged rather than designed around.** A DOM layer composites wholly in front of or behind the WebGL canvas and cannot be depth-interleaved with it. In turn 5 the charts *are* the scene, so there is nothing that should occlude them — but the time-cursor plane (Task 6) is the one mark that would ideally pass between planes, and it cannot. Task 6 handles this by making the cursor read as a cursor through span and glow rather than occlusion. If that reads poorly in the app, the fallback is to draw the cursor as a DOM element in the stack's own layer rather than in WebGL; that is a Task 6 revision, not a re-architecture.
