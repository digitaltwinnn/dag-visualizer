# Engine Refactor (Typed Domain Core + Scene Adapters) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the vanilla `js/*` Three modules to TypeScript under `src/engine/`, split into a pure domain layer + scene adapters with a per-view `ViewPolicy`, fixing the ledger arc-flash bug and the known render-loop allocations — with pixel-identical visuals.

**Architecture:** Single scene / single canvas / one composer stays. `src/engine/domain/` = pure logic (three math types allowed, no renderer/meshes/store); `src/engine/scene/` = Three adapters that read domain state each frame and write GPU state; `Engine.ts` remains the only store bridge. Spec: `docs/superpowers/specs/2026-07-05-engine-domain-ts-refactor-design.md`.

**Tech Stack:** Next.js App Router, TypeScript, three@0.161 typed by the existing `@types/three@0.161` devDependency (the official type library, version-pinned — do not add or change type packages), Zustand, Vitest.

## Global Constraints

- **Pixel parity.** Every task ends with the app looking identical. Port math/comments verbatim; refactor structure, not behaviour.
- **Layer rules:** `domain/` imports only three math classes (`Vector3`, `Quaternion`, `Matrix4`, `Color`, `MathUtils`, `Object3D` is NOT math — excluded), `config`, and `src/data` types. `scene/` imports domain + three. Only `Engine.ts` imports the Zustand store. Enforced by `src/engine/layerBoundaries.test.ts` (Task 14).
- **Zero-allocation contract** (scene adapters): scratch objects are construction-time fields; every instanced slot is written or zero-scaled every frame; no allocation in `update()`/`sync()` paths (event-driven allocation OK, commented).
- **Migration mechanics:** each port creates the TS module, then replaces the old `js/<name>.js` file's body with a one-line re-export shim (`export * from "../src/engine/...";`) so untouched `js/` modules keep working; update all **TS** importers to the new path in the same task; a shim is deleted in the task that removes its last importer.
- **Verification per task:** `npx tsc --noEmit` clean, `npm test` green, plus the task's visual check. ONE shared `next dev` (background, reuse it); **never** run `next build` while dev runs (Task 15 only, dev stopped).
- **Visual checks:** prefer the chrome-devtools MCP (navigate `http://localhost:3000`, click the view-switch icons — `Orbit`=hyper, `Globe`=geo, `Layers`=ledger — screenshot). Fallback: the headless one-shot from CLAUDE.md with store seeding (`mode: "geo"` / `"ledger"` temporarily in `src/store/store.ts`, revert after).
- **Preserve verbatim:** the hover coupling (`hoverFilter`/`hoverNodeId`/`hoverSnapOrd`), pick descriptors (`userData.picks`), the identity-hue bridge (`sceneColors` maps fed by Engine), `FOCI` camera framings.
- **Commits:** conventional prefix (`refactor(engine): …`), trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests are **colocated** (`foo.test.ts` beside `foo.ts`) — repo convention; do not create a `tests/` dir.

---

### Task 1: Phase 0 — reproduce + fix the ledger arc-flash bug

**Files:**
- Modify: `js/globe.js:986` (one condition)
- Baseline screenshots to scratchpad (not committed)

**Interfaces:**
- Produces: the bug's root-cause note (commit message) + baseline screenshots of hyper/geo/mid-morph/ledger used for parity checks by every later task.

- [ ] **Step 1: Capture baselines.** With the dev server running, screenshot: hyper (default boot), geo (click `Globe` icon, wait ~4s for morph), ledger entered FROM geo (click `Layers` while in geo), plus hyper with a metagraph filter committed (open FILTER, pick DOR). Save to the scratchpad as `base-hyper.png`, `base-geo.png`, `base-ledger.png`, `base-hyper-dor.png`.

- [ ] **Step 2: Reproduce the flash.** In geo, wait ~10s (arc agents active), switch to ledger. Watch ~20s (or take 5 screenshots 3s apart). Expected: occasional bright dots flashing on the lane node clusters — reddish ones are DOR (`0xff5a3c`) / orange UP nodes. Root cause (verified by reading, confirm by observation): `js/globe.js:986` gates the arc simulation on `m > 0.5`; ledger freezes `morph≈1` when entered from geo (`Engine.ts:727`), so agents keep hopping and set `node._flash = 0.7` (`globe.js:993`), which feeds emissive at `fl = flRaw * m` (`globe.js:1045`) on the same reused instances the ledger displays.

- [ ] **Step 3: Minimal fix.** In `js/globe.js` change the arc-block gate:

```js
// Arcs are a GEO-view visual: never step the simulation in the Snapshots view — morph is
// frozen there (possibly at 1, arriving from geo), so `m > 0.5` alone would keep the agents
// hopping and their arrival flashes would light the reused lane dots (the "red dots" bug).
if (this.arcMat && this.arcAgents && !this.ledger && m > 0.5) {
```

- [ ] **Step 4: Verify.** Repeat Step 2's observation: no flashes in ledger. Check geo still shows travelling packets + arrival flashes. Run `npx tsc --noEmit` and `npm test` (both unaffected — confirm green).

- [ ] **Step 5: Commit** — `fix(globe): stop the arc simulation in the ledger view (flashing reused node dots)` + root-cause paragraph in the body.

---

### Task 2: Port geoMath + geoStats to `domain/` (first pure modules + tests)

**Files:**
- Create: `src/engine/domain/geoMath.ts`, `src/engine/domain/geoStats.ts`, `src/engine/domain/geoStats.test.ts`
- Modify: `js/geoMath.js`, `js/geoStats.js` (→ shims), any TS importers (grep first)

**Interfaces:**
- Produces: `R: number`, `LAND_H: number`, `latLonToVec3(lat: number, lon: number, radius?: number): THREE.Vector3`; `countryStats(nodes, metaNodes, filter): CountryStat[]`, `listNodes(nodes, metaNodes, filter): NodeRow[]` (types from `@/src/data/types`). Node/metaNode params typed as minimal structural interfaces (`GeoStatNode`) — NOT the full records (defined later in Task 8).

- [ ] **Step 1:** `grep -rn "geoMath\|geoStats" --include="*.ts*" --include="*.js" app components src js lib` — note every importer.
- [ ] **Step 2:** Translate both files verbatim to the new paths. In `geoStats.ts` declare the minimal structural input types (fields the functions actually read: `pick`, `noGeo`, `geoPrimary`, `metaId`, `ready`, `layer`, `roles`, `nodeId`). Export them.
- [ ] **Step 3:** Write `geoStats.test.ts` — real behaviour, no mocks: build 4–5 literal node records (two co-located in one country, one unlocatable, one metagraph node), assert `countryStats` shares/order and `listNodes` filtering for `"all"`, `"dag"`, and a metagraph id, plus the country sort. Run: `npx vitest run src/engine/domain/geoStats.test.ts` — expect FAIL only if signatures drifted; fix until PASS.
- [ ] **Step 4:** Replace `js/geoMath.js` body with `export * from "../src/engine/domain/geoMath";` (same for geoStats). Update TS importers found in Step 1 to `@/src/engine/domain/...`.
- [ ] **Step 5:** `npx tsc --noEmit && npm test`; visual spot-check geo view (country explorer rows populate). Commit `refactor(engine): geoMath + geoStats become typed domain modules`.

---

### Task 3: Port config to `src/engine/config.ts`

**Files:**
- Create: `src/engine/config.ts`
- Modify: `js/config.js` (→ shim), TS importers of `js/config.js` (`src/data/network.ts`, `src/palette/identity.ts`, `src/engine/Engine.ts`, others per grep)

**Interfaces:**
- Produces: everything `js/config.js` exports today, typed: `API_BASE`, `L0_CLUSTER`, `L1_CLUSTER`, `COLORS`, `DEFAULT_META_COLOR`, `METAGRAPHS: MetaConfig[]` (`interface MetaConfig { name: string; ticker: string; color: number; id: string; blurb: string }`), `metaAnchor(i: number, n: number): { x; y; z; a; radius; incl }` (all number), `LEDGER`, `ledgerSite(i, n): { x: number; z: number }`, `clusterRadius(count: number): number`, `ledgerSpread(k: number, cnt: number, radius: number): { x: number; z: number }`, `VIS`.

- [ ] **Step 1:** Translate verbatim (constants keep every comment). `as const` NOT used on `LEDGER`/`VIS`/`COLORS` — they're mutated nowhere but widening keeps call sites unchanged; plain typed objects.
- [ ] **Step 2:** Shim `js/config.js` → `export * from "../src/engine/config";`. Update TS importers.
- [ ] **Step 3:** `npx tsc --noEmit && npm test`; app boots (hubs orbit, filter picker lists 10 metagraphs). Commit.

---

### Task 4: Port the data layer — `api.ts` + `geoResolve.ts`

**Files:**
- Create: `src/data/api.ts`, `src/data/geoResolve.ts`
- Modify: `js/api.js`, `js/geo.js` (→ shims), TS importers (`src/data/network.ts` and `components/inspector/cards.tsx` import from `js/api.js`; grep to confirm the full set)

**Interfaces:**
- Produces (in `api.ts`): `class NetworkData` with a **typed event map** and every existing member; `shortHash(h?: string): string`. Event typing:

```ts
export interface NetworkEvents {
  global: { reset: boolean; snapshots?: GlobalSnapshot[]; snapshot?: GlobalSnapshot; latest: GlobalSnapshot | null };
  status: { live: boolean; lastGoodAt: number | null };
  cluster: { l0: ClusterNode[]; l1: ClusterNode[]; dag: DagCore };
  anchor: { metaId: string; timestamps: string[] };
}
on<K extends keyof NetworkEvents>(evt: K, fn: (p: NetworkEvents[K]) => void): this;
off<K extends keyof NetworkEvents>(evt: K, fn: (p: NetworkEvents[K]) => void): this;
```

  Move `ClusterNode`, `DagCore`, `RouteNode`, `RouteMetagraph`, `GeoMap` from `src/engine/boundary.ts` into `src/data/types.ts` (keep names/shapes identical; boundary.ts re-imports them from there until Task 14 deletes it). `Anchor` already lives in `src/data/types.ts` — the `anchorIndex` map value uses it.
- Produces (in `geoResolve.ts`): `loadGeoCache(): Promise<GeoMap>`, `resolveMissing(map: GeoMap, ips: string[], onResolved: (m: GeoMap) => void): void`.

- [ ] **Step 1:** Translate `api.js` verbatim (all comments — the self-healing catch-up block especially). Type `getActivity(filter?: string): Activity | null` with an exported `Activity` interface matching the returned object literal.
- [ ] **Step 2:** Translate `geo.js` → `geoResolve.ts`.
- [ ] **Step 3:** Shims at both old paths; update TS importers; move the boundary types (Step described above).
- [ ] **Step 4:** `npx tsc --noEmit && npm test`; visual: boot shows live data (LiveStrip bars appear, status ECG beats). Commit.

---

### Task 5: Port Background + SceneContext

**Files:**
- Create: `src/engine/scene/Background.ts`, `src/engine/scene/SceneContext.ts`
- Modify: `js/background.js`, `js/scene.js` (→ shims), `src/engine/Engine.ts` (import + drop the `makeScene` assertion), `src/engine/boundary.ts` (delete `SceneCtx`/`Background`/`DofPass` — now real)

**Interfaces:**
- Produces: `createBackground(scene: THREE.Scene): Background` (`interface Background { mesh: THREE.Mesh; update(dt: number, morph: number): void }`) and `createScene(canvas: HTMLCanvasElement): SceneCtx` where `SceneCtx` keeps boundary.ts's exact shape (scene, camera, renderer, controls, composer, dof, background, resize) but is now **defined in `SceneContext.ts`** with the `DofPass` uniform refinement.

- [ ] **Step 1:** Translate both verbatim (shaders as template strings unchanged). `three/addons/*` imports keep working — three's types cover them.
- [ ] **Step 2:** Engine: `import { createScene, type SceneCtx } from "./scene/SceneContext";` — delete the `makeScene` cast. boundary.ts drops the now-real types (re-export from SceneContext for any remaining reference).
- [ ] **Step 3:** `npx tsc --noEmit && npm test`; visual: starfield in geo, flat backdrop in hyper, bloom present. Commit.

---

### Task 6: Port layers → `scene/HyperFurniture.ts`

**Files:**
- Create: `src/engine/scene/HyperFurniture.ts`
- Modify: `js/layers.js` (→ shim), `js/globe.js` (imports Layers? no — receives the instance; only import path of config already shimmed), `src/engine/Engine.ts` (drop `LayersCtor` cast), `src/engine/boundary.ts` (delete `LayersApi`/`MetaHub`)

**Interfaces:**
- Produces: `class HyperFurniture` implementing boundary.ts's `LayersApi` verbatim (root, coreGroup, metas, focusId, pickables, sceneColors, update, setMetaActive, pulseMeta, flashCore, setLedger). Export `type MetaHubRec` for the `metas` entries (group, cfg, orbit, radius, incl, spin, hub, tether, pulse, pulseMesh, active, anchor — type from reading the class). Keep the class name in the Engine field `layers`.

- [ ] **Step 1:** Translate verbatim; module-scope `_pos` scratch stays (its comment too).
- [ ] **Step 2:** Shim + Engine import swap; boundary cleanup.
- [ ] **Step 3:** `npx tsc --noEmit && npm test`; visual: hubs orbit in hyper, focus a metagraph (orbit freezes, DoF), ledger hides hubs. Commit.

---

### Task 7: Port globeSurface → `scene/GlobeSurface.ts`

**Files:**
- Create: `src/engine/scene/GlobeSurface.ts`
- Modify: `js/globeSurface.js` (→ shim), `js/globe.js` import stays via shim

**Interfaces:**
- Produces: `buildGlobeSurface(host: GlobeSurfaceHost): void` — define `interface GlobeSurfaceHost` for exactly the handles it sets back (`group`, `geoFades`, `sphereMesh`, `atmoUniforms`, `landWallUniforms`, `landFillMesh`) so Task 11's Globe class implements it.

- [ ] **Step 1:** Translate verbatim (earcut/unwrap/pole-cap comments preserved; `topojson-client` has no types — add a 3-line `declare module "topojson-client"` in `src/types/topojson-client.d.ts` typing `feature()` loosely as `(topology: unknown, object: unknown) => { features: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }> }`).
- [ ] **Step 2:** Shim; `npx tsc --noEmit && npm test`; visual: geo continents/atmosphere/graticule identical to `base-geo.png`. Commit.

---

### Task 8: Domain — records, layout math, morph scalars (+ tests)

**Files:**
- Create: `src/engine/domain/records.ts`, `src/engine/domain/nodeLayout.ts`, `src/engine/domain/nodeLayout.test.ts`, `src/engine/domain/morph.ts`, `src/engine/domain/morph.test.ts`

**Interfaces:**
- Produces (`records.ts`) — the plain-data node records currently built inline in globe.js (fields verbatim from `js/globe.js:243-258` and `:549-571`):

```ts
export interface ValidatorRecord {
  index: number; layer: "l0" | "cl1"; roles: string[]; nodeId?: string;
  geoPrimary: boolean; ready: boolean; base: THREE.Color;
  ledgerPos: THREE.Vector3; ledgerHide: boolean;
  hyperPos: THREE.Vector3; hyperDir: THREE.Vector3; hyperRadius: number;
  geoDir: THREE.Vector3 | null; trueDir: THREE.Vector3 | null; geoRadius: number; noGeo: boolean;
  hyperSize: number; geoSize: number; azimuth: number; twinkle: number;
  spinAxis: THREE.Vector3; spinSpeed: number; spinPhase: number;
  pick: PickDescriptor; _flash?: number;
}
export interface MetaNodeRecord { /* same treatment for js/globe.js:549-571 fields:
  metaId, layer, color, index, hubGroup (THREE.Group | null — scene ref allowed as opaque
  position source, typed as { position: THREE.Vector3 } to stay renderer-free), offset,
  hyperPos, geoDir, trueDir, geoDir-derived geoPos, geoRadius, ledgerPos, geoPrimary,
  ready, noGeo, hyperSize, geoSize, spinAxis, spinSpeed, spinPhase, twinkle,
  dim, dimTarget, nodeId, pick, _flash? */ }
```

- Produces (`nodeLayout.ts`): `GOLDEN_ANGLE`, `lerp`, `smooth(m)`, `discFall(facing)`, `fibShellPos(i: number, n: number, rad: number, flatten: number): THREE.Vector3` (extracted from `js/globe.js:225-230`), `spreadCoLocated(dirs: THREE.Vector3[], opts?): Cluster[]` (verbatim from `js/globe.js:52-84`, `interface Cluster { center: THREE.Vector3; count: number; spread: number }` + members/sum internal), `nodeRoles(node, fallback)`.
- Produces (`morph.ts`): `discWeight(m)` (= `smooth(clamp((m-0.82)/0.16))`), `surfFade(m)` (= `smooth(clamp((m-0.35)/0.45))`), `extrasFade(m)` (= `smooth(clamp((m-0.6)/0.4))`), `hubFade(m)` (= `clamp(1-m/0.3)`), `coreGrow(m)`, `coreReveal(m)` — each a one-liner lifted from globe.js/layers.js with its comment.

- [ ] **Step 1: Write the failing tests first.** `nodeLayout.test.ts`: `spreadCoLocated` is deterministic (same input → identical vectors), singletons keep spread 0, a 7-node co-located group spreads within `maxDeg`, cluster count for two distant groups is 2; `fibShellPos(0, 10, 8, 1)` matches the inline formula value; `discFall(1)===1`, `discFall(0)===0`. `morph.test.ts`: endpoint values (`discWeight(0)===0`, `discWeight(1)===1`, `surfFade(0.35)===0`, `hubFade(0.3)===0` etc.).
- [ ] **Step 2:** Run `npx vitest run src/engine/domain` — expect FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules (math verbatim from the js sources).
- [ ] **Step 4:** `npx vitest run src/engine/domain` PASS; `npx tsc --noEmit`. (js/globe.js is NOT switched over yet — Task 11 consumes these.) Commit.

---

### Task 9: Domain — dim model (+ tests)

**Files:**
- Create: `src/engine/domain/dimModel.ts`, `src/engine/domain/dimModel.test.ts`

**Interfaces:**
- Produces — the pure resolution currently duplicated across the two per-frame loops (`js/globe.js:1014-1068` and `:1076-1110`):

```ts
export interface DimState { l0: number; l1: number }          // eased levels
export interface DimContext {
  morph: number; hoverFilterActive: boolean; ledger: boolean;
  countryFilter: string | null; countryMix: number;
  hoverNodeId: string | null; selectedNodeId: string | null; filter: string;
}
export const dimScale = (c: DimContext): number =>
  c.hoverFilterActive ? 0.85 : 0.32 + 0.68 * c.morph;         // js/globe.js:830-833 verbatim
export const dimTargetsFor = (sel: string, metaIds: string[]) =>
  ({ dag: sel === "all" || sel === "dag" ? 0 : 1,
     meta: new Map(metaIds.map(id => [id, sel === "all" || sel === id ? 0 : 1])) });
export function validatorDim(c: DimContext, s: DimState, layer: "l0" | "cl1", geoCc: string | null): number;
export function metaNodeDim(c: DimContext, recDim: number, geoCc: string | null): number;   // incl. the ledger 0.82 override
export function nodeEmissive(c: DimContext, d: number, clock: number, twinkle: number, flash: number,
  isFocus: boolean, dimOthersOnFocus: boolean, baseLo: number, baseHi: number): number;
```

  Each function's body is the corresponding expression lifted verbatim (comments included) — e.g. `validatorDim` = layer dim × dimScale, raised by `countryMix` outside the drilled country.

- [ ] **Step 1:** Write `dimModel.test.ts` first: table-driven cases — hyper vs geo ramp (`dimScale({morph:0,…}) === 0.32`), hover-preview forces 0.85, country outside raises to `countryMix`, ledger metaNode override 0.82, focus dims others only when `filter` is `all`/`dag`, emissive floor 0.02. Run → FAIL.
- [ ] **Step 2:** Implement; PASS; `npx tsc --noEmit`. Commit.

---

### Task 10: Domain — arc simulation with flash events (+ tests)

**Files:**
- Create: `src/engine/domain/arcSim.ts`, `src/engine/domain/arcSim.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ArcEndpoint { dir: THREE.Vector3; node: { color?: THREE.Color; base?: THREE.Color; index: number } }
export interface ArcAgent { from: ArcEndpoint; to: ArcEndpoint; curve: THREE.Vector3[]; vstart: number;
  t: number; speed: number; state: "travel" | "pause"; pause: number }
export class ArcSim {
  agents: ArcAgent[]; pool: ArcEndpoint[];
  readonly flashHits: Int32Array;      // pre-sized ring buffer of arrived node indices…
  flashCount: number;                  // …valid entries this step (reset each step)
  rebuild(pts: ArcEndpoint[], maxAgents?: number): void;  // js/globe.js:378-397 agent seeding
  step(dt: number, enabled: boolean): { retargeted: boolean };  // js/globe.js:987-1009 minus the buffer writes
  sampleCurve(curve: THREE.Vector3[], t: number, out: THREE.Vector3): THREE.Vector3;
}
export function arcCurve(a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3[]): void; // fills a pre-alloc'd
  // ARC_SAMPLES array (replaces the allocating _arcCurve — the Task-15 allocation fix lands here by design)
```

  `step(dt, false)` must return immediately with `flashCount === 0` — **the structural fix for the Task 1 bug**. Arrival pushes the target's `index` into `flashHits` instead of mutating `node._flash`; the scene adapter applies decay.

- [ ] **Step 1:** Write `arcSim.test.ts` first: agents hop (travel→pause→retarget with a seeded `Math.random` stub via `vi.spyOn(Math, "random")`), arrival registers exactly one flash hit with the target index, **`step(dt, enabled: false)` produces zero flash hits and leaves agents untouched** (regression for the red-dots bug), `rebuild` with <2 points yields no agents, curve endpoints match `arcCurve`'s bezier at t=0/1. Run → FAIL.
- [ ] **Step 2:** Implement (constants `ARC_TAIL`, `ARC_TAIL_FRAC`, `ARC_SAMPLES` move here). PASS; `npx tsc --noEmit`. Commit.

---

### Task 11: Scene — split globe.js into Globe (coordinator) + NodeFabric + Arcs + Heatmap

**Files:**
- Create: `src/engine/scene/Globe.ts`, `src/engine/scene/NodeFabric.ts`, `src/engine/scene/Arcs.ts`, `src/engine/scene/Heatmap.ts`
- Modify: `src/engine/Engine.ts` (drop `GlobeCtor` cast, import `Globe`), `src/engine/boundary.ts` (delete `GlobeApi`)
- Delete: `js/globe.js`, shims `js/geoMath.js`, `js/geoStats.js`, `js/globeSurface.js` (their last importer dies here)

**Interfaces:**
- Consumes: Tasks 2, 8, 9, 10 domain modules; `buildGlobeSurface` (Task 7).
- Produces: `class Globe` — the **same public surface as boundary.ts's `GlobeApi`** (every method, exact signatures) so Engine call sites only change their import. Internally:
  - `NodeFabric` — owns BOTH instanced pairs (validator sphere/disc + metagraph sphere/disc), `_makeNodeMaterial`, the per-frame matrix/emissive/colour writes (the loops from `setMorph` + `update`), consuming `ValidatorRecord[]`/`MetaNodeRecord[]` + `DimContext`/`DimState` + morph scalars. Public: `buildValidators(records, total)`, `buildMetaNodes(records)`, `writeFrame(ctx: FrameCtx)` (one struct: morph scalars, dim ctx/state, clock, camN, ledger flags, flash decay), `pickablesFor(w: number, ledger: boolean): THREE.Object3D[]` (returns a **reused** array — allocation fix), `dispose()`.
  - `Arcs` — owns the LineSegments + shader material + buffers; `rebuildFrom(sim: ArcSim)`, `writeFrame(sim, uM)` (positions each frame, colours when `retargeted`), applies `flashHits` → `records[i]._flash = 0.7`.
  - `Heatmap` — `rebuild(clusters: Cluster[])` + `fade(mix: number)` (the traverse closure becomes a stored callback — allocation fix).
  - `Globe` — keeps: records + filter/country/hover state, `_relayoutGeo` (calls `spreadCoLocated`, feeds Heatmap + ArcSim), spin/aim logic (`_aimAt`, `focusDensest`, `focusNode`), `setMorph`/`update` orchestration calling the adapters, `geoStats` wrappers, `buildGlobeSurface(this)` handles.

- [ ] **Step 1:** Create the four files, translating `js/globe.js` piecewise (map: lines 15-84 → domain imports; 87-150 ctor → Globe; 152-309 → NodeFabric build; 311-350 → Heatmap; 352-478 → Arcs+ArcSim wiring; 485-642 → Globe.setMetagraphs (records) + NodeFabric.buildMetaNodes; 644-833 → Globe (filter/dim targets via `dimTargetsFor`, focus, stats); 835-945 setMorph → Globe orchestration + NodeFabric.writeFrame; 947-1188 update → Globe orchestration + ArcSim.step + NodeFabric.writeFrame). All scratch objects become module-scope or class fields in their new homes. **The Task 1 gate becomes** `this.arcSim.step(dt, !this.ledger && m > 0.5)` (ViewPolicy replaces the morph clause in Task 14).
- [ ] **Step 2:** Engine: `import { Globe } from "./scene/Globe";` — new instance construction identical; boundary.ts `GlobeApi` deleted.
- [ ] **Step 3:** Delete `js/globe.js` + the three dead shims. `grep -rn "js/globe\|js/geoMath\|js/geoStats\|js/globeSurface" --include="*.*" app components src js lib` → zero hits.
- [ ] **Step 4:** `npx tsc --noEmit && npm test`.
- [ ] **Step 5: Visual parity, thorough** — compare against Task 1 baselines: hyper (shells, tumble), commit DOR filter in hyper (camera fly, DoF, dim), geo (morph flight, discs, heatmap rings, travelling packets + arrival flashes, country drill via a GeoExplore row), ledger from geo (lanes, dots, **no flashes**), hover a filter row (strong preview dim), hover an explorer node row (shell glow). Fix any drift before committing.
- [ ] **Step 6:** Commit `refactor(engine): globe.js becomes Globe/NodeFabric/Arcs/Heatmap over the typed domain`.

---

### Task 12: Domain — ledger model (+ tests)

**Files:**
- Create: `src/engine/domain/ledgerModel.ts`, `src/engine/domain/ledgerModel.test.ts`

**Interfaces:**
- Consumes: `config.ts` (`LEDGER`, `ledgerSite`, `clusterRadius`, `METAGRAPHS`), `Anchor` from `src/data/types`.
- Produces (state machine lifted from `js/ledger.js`, no meshes):

```ts
export const SLOT_SP = 3.6; export const SLOT_N = 9; export const BLOCK_SIZE = 0.34;
export const slotFade: (slot: number) => number;                      // js/ledger.js:53
export function curvePoint(t: number, sx: number, sz: number, gx: number, out: THREE.Vector3): THREE.Vector3; // :66-74
export interface TileSpec { ox: number; oz: number; size: number; link: boolean }
export function anchorTiles(count: number): TileSpec[];               // :217-233 verbatim
export interface LaneBlock { x: number; slot: number; fade: number; size: number; filled: boolean;
  ox: number; oz: number; link: boolean }
export interface LaneState { id: string; z: number; blocks: LaneBlock[] }
export class LedgerModel {
  trail: { ordinal: number; slot: number }[];  lanes: Map<string, LaneState>;
  tickOrdinal: number | null;  selectedOrd: number | null;  selectedSlot: number;
  setData(snaps: GlobalSnapshot[], getAnchor: (ts: string) => Anchor | null): TickChange[]; // advance slots,
    // seed history on first data (js/ledger.js _seedHistory), flush per-tick meta counts; returns which
    // metagraphs anchored (for the scene layer to spawn pulses/rings)
  setSelected(ordinal: number | null): void;   // + _recomputeSelectedSlot (:572-577)
  isRowHot(laneOff: boolean, slot: number): boolean; // the binary colour rule (:640)
}
```

- [ ] **Step 1:** Write `ledgerModel.test.ts` first: `anchorTiles(1)` = single centred linking tile; `anchorTiles(12)` grid — uniform pitch, inset (no tile beyond ±SLOT_SP/2 / ±LANE_GAP_Z/2), exactly one `link:true`; `slotFade(1)===1`, `slotFade(SLOT_N)===0`; `curvePoint` continuity at `t=LINK_VFRAC` and endpoint at `(gx, rowGL0, 0)`; `setData` with two fabricated snapshots advances slots by 1 and maps `selectedSlot` correctly (selected ordinal follows its block leftward); live-lead-hot vs selected-older-hot from `isRowHot`. Run → FAIL.
- [ ] **Step 2:** Implement by lifting the logic (keep comments). PASS; `npx tsc --noEmit`. Commit.

---

### Task 13: Scene — LedgerChamber over LedgerModel

**Files:**
- Create: `src/engine/scene/LedgerChamber.ts`
- Modify: `src/engine/Engine.ts` (import swap, drop `LedgerCtor`), `src/engine/boundary.ts` (delete `LedgerApi`)
- Delete: `js/ledger.js`

**Interfaces:**
- Consumes: `LedgerModel` (Task 12), `config.ts`.
- Produces: `class LedgerChamber` with boundary.ts's exact `LedgerApi` surface (group, sceneColors, pickables, setData, setGroupSizes, setSelected, setFilter, update, dispose). Owns: floors/panes/labels, centre block + trail meshes, the metagraph-trail InstancedMesh (incl. the `_metaLastDrawn` zero-sweep — keep verbatim), links buffer, pulse pool, rings. Every `update()` read of slot/lane/selection state goes through the model; `_gx`, `_dummy`, `_col`, `_q` stay module-scope scratch.

- [ ] **Step 1:** Translate, splitting state (→ model, already landed) from meshes (→ chamber). `setData` calls `model.setData(...)` and spawns pulses/ring glows from the returned `TickChange[]` (same behaviour as today's `_anchorMetaBlock`/queue path).
- [ ] **Step 2:** Engine import swap; delete `js/ledger.js`; boundary cleanup. `grep -rn "js/ledger" …` → zero hits.
- [ ] **Step 3:** `npx tsc --noEmit && npm test`. Visual parity vs `base-ledger.png` + live behaviour: trail marches left on each tick, pulses descend the anchor curves, rings light only on pulse arrival, LiveStrip bar hover re-colours the matching older row (lead goes neutral), filter neutralises other lanes. Commit.

---

### Task 14: ViewPolicy + Engine adoption + layer-boundary test

**Files:**
- Create: `src/engine/domain/viewPolicy.ts`, `src/engine/domain/viewPolicy.test.ts`, `src/engine/layerBoundaries.test.ts`
- Modify: `src/engine/Engine.ts`, `src/engine/scene/Globe.ts` (consume sim flags), `src/engine/scene/HyperFurniture.ts` (orbit flag)

**Interfaces:**
- Produces:

```ts
import type { Mode } from "@/src/store/store";
export interface ViewPolicy {
  canvas: boolean;
  morph: "toHyper" | "toGeo" | "frozen";
  sims: { arcs: boolean; hubOrbits: boolean; globeSpin: boolean; twinkle: boolean };
  show: { hyperFurniture: boolean; globeSurface: boolean; starfield: boolean; ledger: boolean };
  pickSources: Array<"globe" | "layers" | "ledger">;   // resolved to meshes by Engine._pickablesFor
  dofEligible: boolean;
  fog: "base" | "ledgerLinear";
}
export const VIEW_POLICIES: Record<Mode, ViewPolicy>;
// hyper: canvas, toHyper, {arcs:false, hubOrbits:true, globeSpin:false, twinkle:false},
//        show all-hyper, picks ["globe","layers"], dofEligible true, fog base
// geo:   canvas, toGeo, {arcs:true, hubOrbits:false, globeSpin:true, twinkle:true},
//        picks ["globe"], dof false, fog base
// ledger: canvas, frozen, all sims false, show.ledger, picks ["ledger","globe"], fog ledgerLinear
// status/transactions/staking: canvas false, everything false/empty
```

- [ ] **Step 1:** Write `viewPolicy.test.ts` first: arcs enabled ONLY in geo; every non-canvas view has empty `pickSources`, no sims, no DoF; ledger is frozen + ledgerLinear fog; hyper is the only `dofEligible`; exactly the three 3D modes have `canvas`. Run → FAIL. Implement → PASS.
- [ ] **Step 2:** Engine render loop consumes the policy: morph target (`"frozen"` keeps `this.morph`), `background.update(dt, show.starfield ? morph : 0)`, visibility flags replace the `flat`/`showLedger` block (`Engine.ts:743-758`), fog swap keyed on `policy.fog`, `dof.enabled = policy.dofEligible && metaSel && dofMix > 0.001`, `_pickablesFor` maps `pickSources`. Globe's arc gate becomes `this.arcSim.step(dt, policy.sims.arcs && m > 0.5)` — Engine passes the flag via `globe.setSimFlags(policy.sims)`; HyperFurniture's orbit uses `sims.hubOrbits` the same way (focusId freeze still wins).
- [ ] **Step 3:** `layerBoundaries.test.ts` — reads every file in `src/engine/domain/` with `fs`, asserts no import matches `/scene\/|three\/addons|@\/src\/store|react/`, and no file in `src/engine/scene/` imports the store. (Node `fs` + `import.meta.dirname`; keep it under 40 lines.)
- [ ] **Step 4:** `npx tsc --noEmit && npm test`; visual sweep of all six views + transitions (hyper→geo→ledger→status→hyper). Commit.

---

### Task 15: Allocation fixes, cameraRig, delete boundary.ts + js/, prod build

**Files:**
- Create: `src/engine/domain/cameraRig.ts`, `src/engine/domain/cameraRig.test.ts`
- Modify: `src/engine/Engine.ts`
- Delete: `src/engine/boundary.ts`, remaining `js/*` shims (`config.js`, `api.js`, `geo.js`, `scene.js`, `background.js`, `layers.js`) — the whole `js/` directory

**Interfaces:**
- Produces (`cameraRig.ts`): `FOCI` (moved verbatim), `hubFraming(hubLocalPos: THREE.Vector3, out: { pos: THREE.Vector3; target: THREE.Vector3 })` (the `_focusFilter` vector math, `Engine.ts:706-714`, writing into pre-allocated outs), `geoFraming(R: number, out)` (`_focusGeo` math), `easeInOutQuad(t)`. Test: framing outputs for a known hub position match the current formula (compute expected by hand in the test), `geoFraming` endpoints at R=0.7/1.0.

- [ ] **Step 1:** cameraRig test → FAIL → implement → PASS. Engine uses it (tween targets now write into reused vectors; the per-tween `clone()`s at `Engine.ts:660-663` become copies into two persistent from/to pairs).
- [ ] **Step 2: Allocation fixes** (those not already landed in Tasks 10/11): cache the DoF focus meta on filter change (`this._dofMeta`) killing the per-frame `metas.find` (`Engine.ts:765`); confirm `pickablesFor` reuses its array (Task 11) and `Heatmap.fade` uses the stored callback.
- [ ] **Step 3:** Delete `js/` + `boundary.ts`; `grep -rn "\.\./js/\|@/js/\|js/api\|js/config" --include="*.*" app components src lib` → zero hits; `grep -rn "boundary" src components app` → zero hits.
- [ ] **Step 4:** `npx tsc --noEmit && npm test` green. **Stop the dev server**, `npm run build` — clean, `/api/metagraphs` stays `○` with `10m` revalidate; restart dev.
- [ ] **Step 5:** Commit `refactor(engine): boundary.ts and js/ retired — the engine is fully typed`.

---

### Task 16: CLAUDE.md rules + full verification pass

**Files:**
- Modify: `CLAUDE.md` (architecture section + a new "Render-loop discipline" subsection), `.superpowers/sdd/progress.md` (work-ledger entry)

- [ ] **Step 1:** Update CLAUDE.md: replace the `js/*` module list with the `src/engine/domain|scene` map (same per-module descriptions, updated paths); add a short subsection codifying: the layer dependency rules (domain/scene/Engine-only-store), the ViewPolicy allow-list (new views are inert until opted in — table, not scattered ifs), the zero-allocation contract (scratch fields, write-or-zero every instance, event-driven allocation OK), and "arc/`_flash`-style cross-view side-channels are forbidden — simulations emit events, adapters apply them". Keep it terse — CLAUDE.md style.
- [ ] **Step 2: Full verification** (superpowers:verification-before-completion): `npx tsc --noEmit`; `npm test` (full suite); screenshot suite vs Task 1 baselines (hyper, hyper+DOR focus, geo, geo+country drill, ledger live, ledger with older snapshot selected, one flat view); reduced-motion spot check (emulate via devtools MCP: edge pulses blink not sweep — unaffected by this refactor but confirms no regression); phone breakpoint spot check (resize to 390×844: dock, LiveStrip). Confirm the Task 1 bug stays dead: geo 10s → ledger 20s, no flashes.
- [ ] **Step 3:** Append the progress.md entry (tasks landed, decisions, any carried-forward minors). Commit `docs: engine refactor rules in CLAUDE.md + work-ledger entry`.

---

## Self-review notes (already applied)

- Spec coverage: every spec section maps to a task (Phase 0→T1, leaf ports→T2-5, furniture/surface→T6-7, globe split→T8-11, ledger→T12-13, ViewPolicy/boundary/allocations→T14-15, docs/verification→T16). The spec's `morph.ts`/`cameraRig.ts` land in T8/T15.
- The ESLint boundary rule from the spec became a vitest check (T14) — the repo has no ESLint config; adding one for a single rule is more infra than the rule is worth. Spec intent (enforced boundary) is preserved.
- Type names used across tasks are consistent: `ValidatorRecord`/`MetaNodeRecord` (T8) consumed by T11; `ArcSim`/`ArcEndpoint` (T10) by T11; `LedgerModel`/`TileSpec` (T12) by T13; `ViewPolicy`/`VIEW_POLICIES` (T14) by Engine.
