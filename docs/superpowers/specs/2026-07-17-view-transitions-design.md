# View transitions — staged gather choreography (design)

**Date:** 2026-07-17 · **Branch:** `node-view-transitions` · **Status:** approved design, pre-plan

## Intent

View transitions are a first-class element of the 3D UI/UX (more views will follow). Replace
the two current mechanisms — the hyper↔geo morph flight and the Snapshots hard snap — with ONE
staged choreography used by every 3D-view pair:

1. **OUT** — the old view's furniture fades out while the nodes fly (staggered) from their
   current positions to a **standard gathering formation** at the top of the viewport.
2. **BOUNDARY** — one invisible instant (nodes gathered, both furnitures dark): the
   destination layout parameters are applied (morph value, `ledgerT`, globe spin reset).
3. **IN** — the new view's furniture fades/builds in while the nodes fly (staggered) from the
   gathering formation to their destination positions; the camera flies to the destination
   pose during this phase.

The controlled two-leg path never crosses old/new furniture mid-teardown, the gathering
formation tells the user "these are being deliberately repositioned", and the fixed stages
keep the tempo legible — never too much at once, never long enough to feel like waiting.

**Retired by this design** (deliberate reversals of documented decisions):
- The hyper↔geo core-grows-into-the-globe morph flight. `morph` stops being a flight blend
  and becomes a snapped layout parameter applied at the boundary.
- The Snapshots "appears already-formed — no entry animation" rule. The chamber now builds in
  during IN (panes/tiles/dials/links get a real reveal), and tears down on exit.

## The choreography contract

- **One formula for node position, every pair, present and future:**
  `pos = lerp(currentViewPose(record), gatherPos(record), w_i)` where `w_i` is the node's own
  staggered gather weight. The instanced-matrix write path (NodeFabric) is unchanged in
  structure — the blend is new, the mechanism (per-frame matrix writes) is not.
- **Stagger:** each node's flight start is delayed deterministically by its row-major slot
  index within its network's gathering grid, spread over `STAGGER_SPREAD` (~0.25s) — squares
  visibly assemble on gather and dissolve on placement; each network staggers in parallel.
  Same rule both directions. No randomness.
- **Fixed stages, hard budget:** OUT ≈ 0.9s (furniture fade + gather incl. stagger spread),
  BOUNDARY instant, IN ≈ 1.0s (build + placement + camera flight). Total ≈ 1.9s, all
  durations named constants in the domain module, tuned live for balance.
- **Camera:** holds the source pose through OUT (the user watches teardown + gather under a
  still camera), then tweens to the destination pose across IN. One thing at a time.
- **Furniture never overlaps the flight:** `furnitureAlpha(from)` 1→0 completes within OUT;
  `furnitureAlpha(to)` 0→1 runs within IN; at most one view's furniture is ever lit.
- **Retargeting:** a view switch mid-transition re-enters OUT toward the new destination,
  seeding each node's weight from its current value — nodes already gathered stay gathered;
  nodes mid-flight ease back to the grid. No teleports, ever.
- **Scope:** the three 3D views (hyper/geo/ledger). Switches to/from flat views keep today's
  canvas fade. A future 3D view joins by defining its pose + furniture alpha hook + policy
  row — it inherits the choreography.

## Components

### `domain/viewTransition.ts` — the state machine (new, tested)

Pure, allocation-free. State `{from, to, phase: "idle"|"out"|"in", t}`.
- `start(from, to)` — begins a transition or retargets a live one (rules above).
- `tick(dt)` — advances; returns a one-shot `boundary` flag on the OUT→IN flip.
- `gatherWeight(slotIndex, slotCount)` — the staggered per-node weight for this frame
  (smoothstep of the stagger-offset phase progress; 0 at rest in a view, 1 at the grid).
- `furnitureAlpha(view)` — per-view furniture multiplier for this frame.
- Constants: `DUR_OUT`, `DUR_IN`, `STAGGER_SPREAD`.
- Colocated tests: phase sequencing; boundary fires exactly once; ramps monotonic + clamped;
  stagger ordering (slot 0 leads, last slot still completes within the phase); retarget
  mid-OUT and mid-IN (weight continuity, no jump); furnitureAlpha exclusivity.

### `domain/gatherLayout.ts` — the staging grids (new, tested)

Pure. Input `[(networkId, count)]` → per-node 2D slots `(u, v)` + per-network grid metadata:
- One near-square grid per network: `cols = ceil(√n)`, rows to fit — DAG's 164-node block is
  naturally much larger than a 3-node metagraph's 2×2.
- Grids packed in one row, sorted by count descending, fixed gutter, normalized to a total
  width; vertical anchor at the top band of the viewport.
- Deterministic; re-derived only on data rebuilds (event-time, commented allocation).
- Colocated tests: every node gets a unique slot; dims near-square; total fits the
  normalized width; determinism; DAG-vs-small relative sizing.

### Scene consumption (existing files, adapted)

- **NodeFabric** — records carry their gather slot (assigned at build time). Both write loops
  blend `viewPose → gatherWorld` by the staggered weight. The sphere↔chip shape crossfade
  rides the IN phase. The camera-anchored mapping (slot `(u,v)` → world) is computed ONCE per
  frame (camera right/up basis at fixed depth, top-of-viewport anchor) and passed via
  `FrameCtx` — zero per-node allocation, correct for every camera pose (ledger looks along
  −X; a world-fixed plane would miss the frame).
- **Globe** — `surf`/`extras`/density-pool opacities multiply by `furnitureAlpha("geo")`;
  spin/lean reset moves to the boundary; `ledgerT` becomes a boundary-applied parameter
  (the easing/pinning in `setLedger`/`update` is retired).
- **HyperView** — gains a view-alpha multiplier over core/hubs/hoops/fills/tethers/packets
  (`furnitureAlpha("hyper")`); `setLedger`'s show/hide flips become alpha-driven; the focus
  spot blacks out on OUT start.
- **LedgerView** — gains the build-in reveal: panes, tiles, dials, links, labels multiply by
  `furnitureAlpha("ledger")`; `group.visible` gates on alpha > 0.
- **Engine** — mode-change subscription calls `transition.start(prev, next)` (3D pairs only);
  per frame ticks the machine, threads outputs into the scene, applies boundary layout
  (morph snap, ledger placement, spin), and starts the camera tween at the boundary.
  `VIEW_POLICIES` stays the per-view allow-list; the transition machine is view-pair-agnostic.

## Invariants preserved

- Zero-allocation render loop (per-frame math uses construction-time scratch; gather slots +
  grid layout are event-time).
- Engine remains the only store bridge; domain modules stay pure (tested, no scene imports).
- Hover channels, picking, filter/dim semantics untouched — they operate on the settled view;
  picking is suppressed while a transition is live (nodes are mid-flight; a raycast against
  moving targets would mislead).
- Honesty: the gathering grids are the real nodes (every instance, identity-hued) — no
  decorative proxies.

## CLAUDE.md updates (with the implementation)

Rewrite: the morph section (flight → staged choreography; morph = boundary parameter), the
Snapshots "static entry" bullet, the `domain/` module list (+`viewTransition`, `gatherLayout`),
and the per-view behaviour notes for furniture alphas.
