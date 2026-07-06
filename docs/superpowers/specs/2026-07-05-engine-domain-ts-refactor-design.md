# Engine refactor: typed domain core + scene adapters

**Date:** 2026-07-05 · **Status:** approved design

## Problem

The `js/*` vanilla Three modules interleave logic and presentation, are untyped
(bridged by `src/engine/boundary.ts` assertions), and gate per-view behaviour with
scattered conditions (`if (this.ledger)`, `m > 0.5`, `mode !== …`) across five files.
That produced at least one real visual bug: entering Snapshots (ledger) from Geography
freezes `morph ≈ 1` ([Engine.ts:727]), so the arc-packet simulation — gated on
`m > 0.5` ([globe.js:986]), not on the view — keeps running invisibly and sets
`node._flash = 0.7` on arrival ([globe.js:993]); the flash feeds emissive at full
strength (`fl = flRaw * m`, [globe.js:1045]) on the very node instances the ledger
reuses as lane dots → random identity-hued dots flashing in the ledger background
(user-observed as "red dots"). The defect class is deny-by-value gates instead of
allow-by-view policy; the logic is also untestable without a browser.

## Goals

1. All engine code in TypeScript, using three's **bundled** types (no `@types/three`).
2. Logic separated from presentation with a compiler-visible, lint-enforced boundary.
3. Per-view behaviour declared in ONE place (`ViewPolicy`) — CLAUDE.md's
   "allow-list, not deny-list" rule as a data structure, not prose.
4. Zero-allocation render-loop contract made explicit per adapter; the four known
   per-frame allocations fixed (Engine DoF `metas.find` closure; per-frame `pickables`
   array in `globe.setMorph`; `_fade` traverse closure; `_arcCurve` allocations →
   per-agent pre-allocated curve pool).
5. Every behaviour rule unit-testable in Node (vitest), no WebGL.
6. **Pixel-identical visuals** at every migration step.

## Non-goals

- No change to the React/Zustand/palette architecture. The store stays the single app
  state; the identity-hue bridge (Engine's `sceneColorsFor` handing scene-lane hex maps
  to the modules) is kept as-is — it is already the right pattern.
- No multi-scene/SceneDirector/scissor rendering; the single scene + single composer
  (Render → Bokeh → Bloom) and the morph/mesh-reuse design are the product.
- No visual redesign. The three.js↔UI hover coupling (`hoverFilter`/`hoverNodeId`/
  `hoverSnapOrd`, `.subject-paired`, marker classes) is preserved verbatim.
- No new state container. Zustand = app state; `NetworkData` = data domain; the Engine
  remains the only bridge in both directions.

## Target structure

```
src/engine/
  Engine.ts              the ONE bridge: store ⇄ domain ⇄ scene, render loop, picking
  domain/                PURE logic — no renderer, no meshes; three's MATH types allowed
    viewPolicy.ts        per-Mode declarative behaviour table (see below)
    morph.ts             morph/ledgerT easing + derived scalars (surf, extras, disc-fade w)
    nodeLayout.ts        placement math: fib shells, lat/lon, ledger lanes, morph blend,
                         spreadCoLocated (phyllotaxis)
    dimModel.ts          filter/country/hover/focus → per-node dim + emissive
                         (today duplicated across the validator and metagraph loops)
    arcSim.ts            packet-agent state machine as a pure stepper; emits flash
                         events into a pre-sized ring buffer (no writes into node records)
    ledgerModel.ts       slot/trail/lane/pulse-queue state machine (from ledger.js)
    cameraRig.ts         FOCI presets, tween math, focus-framing computations
    geoMath.ts           (already pure — straight port of js/geoMath.js)
    geoStats.ts          (already pure — straight port of js/geoStats.js)
  scene/                 Three adapters — own meshes/materials/scratch; read domain, write GPU
    SceneContext.ts      renderer/camera/controls/composer/dof     (js/scene.js)
    NodeFabric.ts        instanced validator + metagraph node meshes (js/globe.js core)
    Arcs.ts              travelling-packet line swarm               (js/globe.js)
    Heatmap.ts           density glow/rings                         (js/globe.js)
    GlobeSurface.ts      body/graticule/atmosphere/continents       (js/globeSurface.js)
    HyperFurniture.ts    Global L0 core + orbiting hubs             (js/layers.js)
    LedgerChamber.ts     floors/tiles/links/pulses/rings            (js/ledger.js)
    Background.ts        skydome                                    (js/background.js)
  config.ts              endpoints, METAGRAPHS, VIS, LEDGER, metaAnchor (js/config.js)
src/data/
  api.ts                 NetworkData, typed event emitter (js/api.js — data, not scene)
  geoResolve.ts          loadGeoCache/resolveMissing (js/geo.js)
```

`js/` and `src/engine/boundary.ts` are **deleted** at the end — the boundary becomes
real types.

**Dependency rule** (documented + enforced via ESLint `no-restricted-imports`):

- `domain/` imports only: three math classes (`Vector3`/`Quaternion`/`Matrix4`/
  `Color`/`MathUtils`), `config.ts`, `src/data` types. Never a renderer, mesh,
  material, or the store.
- `scene/` imports `domain/` + three. Never the store, never React.
- Only `Engine.ts` touches the Zustand store (both directions).

## ViewPolicy

One declarative table keyed by `Mode` (the union stays exported from the store),
consulted by the render loop and handed down as explicit flags — modules never infer
view state from morph values:

```ts
type ViewPolicy = {
  canvas: boolean;                       // flat views: false
  morph: "toHyper" | "toGeo" | "frozen"; // ledger freezes at entry value
  sims: { arcs: boolean; hubOrbits: boolean; globeSpin: boolean; twinkle: boolean };
  show: { hyperFurniture: boolean; globeSurface: boolean; starfield: boolean; ledger: boolean };
  pickables: PickSource[];               // the allow-list pick registry, now data
  dofEligible: boolean;                  // ANDed with metagraph-selected in Engine
  fog: "base" | "ledgerLinear";
};
```

The arc bug becomes structurally impossible: `sims.arcs` is true only for `geo`, and
`ArcSim.step()` is simply not called otherwise. Same mechanism covers the hub-orbit
freeze, starfield/surface gating in ledger, the fog swap, DoF eligibility, and the
pick registry (raycaster ignores `visible` — the registry stays the only gate).

## Zero-allocation contract (per scene adapter)

a) All scratch objects (vectors, quats, colors, matrices, dummies) are instance or
   module fields allocated at construction — reused via `.set()`/`.copy()`.
b) **Every instanced slot is written or zero-scaled every frame** (the existing
   invariant in `globe.setMorph` and `LedgerChamber`'s `_metaLastDrawn` sweep, now a
   stated contract per adapter).
c) No allocation in any `update()`/`sync()` path. Event-driven allocation (a camera
   tween on click; an agent re-route using its pre-allocated curve buffer) is
   acceptable and noted inline. No dogma beyond that — `for…of` etc. is fine.

`ArcSim` returns arrival/flash events instead of mutating node records — the
side-channel that let the flash bleed across views is removed.

## Data flow (unchanged shape, typed)

Store change → Engine sets domain state → per frame: `domain.step(dt)` → adapters
`sync()` read domain outputs and write matrices/attributes/uniforms →
`composer.render()`. Lane A (high-freq `NetworkData` events → engine) and Lane B
(store command bridge) stay exactly as documented in CLAUDE.md.

## Testing

Vitest, pure Node, no WebGL/jsdom:

- `viewPolicy` — invariants: arcs only in geo; ledger pickables exclude hidden hubs;
  flat views pick nothing; DoF only hyper.
- `nodeLayout` — morph endpoints exact (m=0 shell, m=1 surface), lane placement,
  phyllotaxis determinism (no jitter).
- `dimModel` — filter × country × hover/focus matrices, hyper-vs-geo dim ramp.
- `arcSim` — hop lifecycle; **regression: zero flash events when disabled**.
- `ledgerModel` — slot advance, history seeding, selected-slot mapping, lane grids.
- `cameraRig` — framing math (hub focus uses local/unscaled positions).
- Existing suites (store, palette, composition, useSubjectPairing) untouched.
- Visual parity per phase via chrome-devtools MCP screenshots against the live app.

## Migration order

Each phase lands green (`npx tsc --noEmit` + `npm test` + targeted visual check) as
one commit; the dev server stays up throughout (no `next build` mid-stream).

- **Phase 0** — reproduce the ledger red-dot flash in the browser; confirm root
  cause; minimal targeted fix committed first (bug understood, not "disappeared").
  Its regression test rides along (arcSim disabled ⇒ no flash events).
- **Phase 1** — leaf ports: `config.ts`, `geoMath.ts`, `geoStats.ts`, `api.ts`,
  `geoResolve.ts`, `Background.ts`, `SceneContext.ts`.
- **Phase 2** — `HyperFurniture` + `GlobeSurface`, extracting their small domain bits.
- **Phase 3** — the big one: `globe.js` → `NodeFabric`/`Arcs`/`Heatmap` +
  `nodeLayout`/`dimModel`/`arcSim`, tests alongside.
- **Phase 4** — `ledger.js` → `LedgerChamber` + `ledgerModel`.
- **Phase 5** — `ViewPolicy` consolidation in Engine; delete `boundary.ts` + `js/`;
  allocation fixes; ESLint boundary rule.
- **Phase 6** — CLAUDE.md rules section (render-loop discipline + layer boundaries);
  full verification: prod build with dev stopped, screenshot suite, reduced-motion +
  tablet/phone spot checks.

## Risks & mitigations

- **Visual drift during the globe.js split (Phase 3).** Mitigate: port math verbatim
  first, refactor second; screenshot diff hyper/geo/ledger + mid-morph before/after.
- **The ledger's reuse seam** (`if (this.ledger)` branches in globe's setMorph/update)
  is deliberate — it becomes an explicit `NodeFabric.placement` mode driven by
  ViewPolicy, not a scatter of conditionals, but the reuse itself is kept.
- **HMR/dev-server discipline** per CLAUDE.md: one shared `next dev`, `next build`
  only at phase boundaries with dev stopped.
