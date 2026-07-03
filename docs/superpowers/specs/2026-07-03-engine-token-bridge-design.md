# Engine token-bridge — design

**Date:** 2026-07-03
**Scope:** Wire the identity-hue generator into BOTH lanes — the HUD (React/CSS) and the vanilla Three.js engine — through ONE deterministic source of truth, so a metagraph's HUD dot/chip/spine and its 3D hub/nodes are always the same hue by construction. Replaces the scattered reads of the hardcoded `config.METAGRAPHS[].color`.

This is the long-deferred "engine token-bridge" from the HUD-refresh build order (`dag-hud-refresh-specs` memory). It builds on Phase 1's generator (`src/palette/palette.ts`, already producing per-metagraph OKLCH hues in `/api/metagraphs`).

## Goal

- One identity-hue **source of truth** consumed by both lanes → HUD and scene colors for a metagraph can never drift apart.
- **New / unlisted metagraphs auto-color** with a consistent, guard-safe identity hue instead of today's grey `DEFAULT_META_COLOR`.
- **No visual regression** for the known metagraphs: their exact brand hues are preserved (just normalized per-lane).

## Non-goals / explicitly deferred

- **Auto brand-extraction** (fetch each metagraph's logo `iconUrl` / site `theme-color`, extract a dominant hue). This is a **separate follow-up spec**. It runs server-side in `/api/metagraphs` (already `unstable_cache`d ~10 min → zero runtime/Three overhead, a static hex fed in) and slots in behind the SAME `hue`/pin interface with **no change to the wiring** built here. This spec ships the wiring with **config-seeded pins** (below), which already gives the brand-connected look.
- No change to any Three material setting, opacity, `emissiveIntensity`, bloom, tone mapping, color management, fog, or DoF. The bridge swaps the color **value** only.
- The DAG core + all structural tokens (cyan/blue/status colors) are untouched — this is the identity lane only (two-lane rule).

## Architecture — one identity-hue map

New module **`src/palette/identity.ts`** (pure, deterministic, Node-test-safe — no `window`, no THREE) is the single source. It wraps the existing `assignPalette(ids, pins)` and exposes per metagraph:

```ts
interface IdentityHue {
  id: string;
  hueDeg: number;   // the SHARED identity — what the eye reads as "same metagraph"
  hudHex: string;   // oklch(0.80, 0.15, hue)  → flat, legible on dark glass (HUD lane)
  hudOklch: string; // the same as a CSS oklch() string
  sceneHex: string; // bloom-tuned (see Per-lane L/C) → fed to Three (engine lane)
}

// Synchronous resolver for the KNOWN config metagraphs (+ the DAG core passthrough).
function identityHue(id: string): IdentityHue;
// Full map for a given id set (used server-side for the API + to seed the engine).
function identityMap(ids: string[]): Map<string, IdentityHue>;
// Explicit per-LANE accessors — call sites pick the lane, so the HUD hex and the scene
// hex never get crossed (both derive from the same `hueDeg`):
function identityHudHex(id: string): string;   // HUD lane
function identitySceneHex(id: string): string; // engine/Three lane
```

**Lane discipline (important):** `metagraphById(id).color` is read by BOTH lanes today — HUD components AND the engine's own reads (e.g. `Engine.ts:395` `const accent = metagraphById(this.filter)?.color`). So we do NOT blanket-overload it with one lane's hex. Instead each call site resolves through the explicit lane accessor: HUD surfaces (`filterAccent`, chips/dots, `metaList[].color`) → `identityHudHex`; the engine's internal color reads + `layers.js`/`globe.js` → `identitySceneHex`. This keeps the two hexes from crossing while both stay tied to the one `hueDeg`.

- **Known metagraphs** (the `config.METAGRAPHS` 10) resolve **synchronously at module load** — the config is static — so the engine can color hubs at construction with no first-paint flash.
- **New listed metagraphs** (in the API directory but not in `config.METAGRAPHS`) are resolved when their ids arrive from `/api/metagraphs`; the route returns their `hue` and the engine colors them via `globe.setMetagraphs`.

## Hue assignment

- **Known metagraphs → honor their exact brand hue.** Convert each `config.METAGRAPHS[].color` (hex) → its OKLCH **hue degree** and pass it as a `pin`. `assignPalette` uses pins as-is (never snapped), so DED stays green, DOR stays red, SWAP amber, etc. — brand hue preserved exactly; only L/C is normalized per lane.
- **New / unlisted metagraphs → auto-assigned, guard-safe.** They take the generator's normal path: a hashed slot inside the **allowed zones** (which already avoid the reserved structural guard-bands red/amber/green/cyan/blue/violet), de-collided against the pinned hues. So a brand-new metagraph gets a consistent identity hue distinct from structural cues.
- Guard-band snapping applies **only to the auto path**, never to the pins — a deliberate brand color near a structural hue (e.g. DED green) is a named, intentional identity and is kept.

**Pin derivation:** a helper `hexToHueDeg(hex)` (sRGB → OKLab → hue angle; the inverse-direction math of `palette.ts`'s existing OKLab pipeline) converts each config color to its hue degree. Pins are `Record<id, hueDeg>`.

## Per-lane L/C — the hue, rendered for each medium

The identity is the **hue degree**. Each lane renders it at an L/C suited to its medium (we deliberately do NOT chase pixel-identical RGB — impossible through the Three pipeline, and fragile):

- **HUD `hudHex` = `oklch(0.80, 0.15, hue)`** — the current generator output; light, low-chroma, legible as a flat dot/chip/spine on dark glass.
- **Scene `sceneHex` = a bloom-tuned color at the same hue** — higher chroma + lower L so it stays a vivid, distinct hue under **emissive + bloom** instead of blowing out to white. **Starting target `oklch(0.68, 0.20, hue)`, gamut-mapped** (reuse `palette.ts`'s chroma-reduction). Both derive from `oklchToHex` in `palette.ts`.

The exact scene L/C is the one value **tuned visually during implementation** (a verify gate — see Testing). Everything else is deterministic.

### Rendering-boundary note (why HUD ≠ scene pixels, by design)

A color number becomes a scene pixel only after Three's pipeline: sRGB→linear color management + **tone mapping**, **emissive** (`emissiveIntensity 1.1`), **bloom**, **opacity/transparency**, **fog/DoF**, material type (hubs `MeshBasicMaterial`, nodes patched `MeshStandardMaterial`). The flat HUD dot experiences none of these. So the rendered scene color legitimately differs from the HUD swatch — the bridge matches the **hue** (the identity), not the RGB, and leaves the whole pipeline untouched.

## Engine integration (TS → vanilla-JS boundary)

`identity.ts` is TS; `js/layers.js` / `js/globe.js` are vanilla JS. Keep the boundary clean: **the Engine (TS) owns the map and passes scene colors as DATA** — the vanilla modules never import the generator.

- **`js/layers.js` (hubs):** today reads `config.METAGRAPHS[].color` at build (lines ~100–123: `color`, `emissive`, link + burst colors). Change to take a resolved color per metagraph — the Engine hands `Layers` an `id → sceneColor` lookup (or attaches `sceneColor` to the config entries it iterates). All 10 resolve synchronously → hubs build correct, no flash. Only the color value changes; `emissive`/intensity/opacity unchanged.
- **`js/globe.js` (nodes):** `setMetagraphs(list, geoMap)` currently sets `m.color = cfg ? cfg.color : DEFAULT_META_COLOR` via id-match (lines ~483–496). Change to the identity `sceneHex` (Engine attaches it to each `metaData` entry, or globe reads a passed map). New/unlisted metagraphs carry their own `sceneHex`.
- **`src/engine/Engine.ts`:** owns the identity map; feeds `identitySceneHex` to globe/layers; the HUD-facing `metaList[].color` it publishes uses `identityHudHex` (line ~289); its own internal scene reads (e.g. the filter accent line ~395) use `identitySceneHex`. The DAG core (`isRoot`, cyan) is passed through unchanged.

## HUD integration

- **HUD surfaces resolve `identityHudHex`.** `src/data/network.ts`'s `filterAccent(id)` and the HUD components' color reads (chips/dots, `metaList[].color`) resolve through `identity.ts` to `hudHex` instead of raw `config.color`. All existing inline-style / `--filter-accent` / per-element `--mg` usages then pick up the identity hue automatically — no component changes. (Per the lane-discipline note above, engine call sites of `metagraphById().color` are switched to `identitySceneHex` instead, not `hudHex`.)
- **No app-wide `--mg-<id>` mount.** Global per-id CSS vars have no current consumer (the HUD colors via JS + inline styles); mounting `MetagraphVars` is YAGNI here and is a trivial add later if a CSS rule ever needs a static per-id reference. `lib/mgVars.tsx` stays as-is (still unmounted).
- **DAG core stays structural cyan** — not a metagraph identity, untouched.

## Data flow

```
config.METAGRAPHS colors ──hexToHueDeg──> pins ─┐
                                                 ├─ assignPalette(ids, pins) ─> IdentityHue{hue, hudHex, sceneHex}
API directory ids (new metagraphs) ─────────────┘            │
                                                             ├─ HUD lane:  metagraphById/filterAccent/metaList → hudHex (inline styles, --filter-accent)
                                                             └─ Engine lane: Engine → layers.js hubs + globe.js nodes ← sceneHex (THREE.Color)
```

Server-side `/api/metagraphs` also runs the same generator (with the config-seeded pins) so new listed metagraphs arrive with a `hue`; the follow-up auto-extraction spec replaces the pin source there with no wiring change.

## Components / files

- **Create** `src/palette/identity.ts` — the identity map + `hexToHueDeg` + `hudHex`/`sceneHex` derivation.
- **Create** `src/palette/identity.test.ts` — unit tests (TDD).
- **Modify** `app/api/metagraphs/route.ts` — pass config-seeded pins into `assignPalette` (currently `assignPalette(list.map(m=>m.id))` with no pins).
- **Modify** `src/data/network.ts` — `metagraphById`/`filterAccent` resolve identity `hudHex`.
- **Modify** `src/engine/Engine.ts` — own the map; feed `sceneHex` to layers/globe; `metaList` uses `hudHex`.
- **Modify** `js/layers.js` — hubs take the resolved scene color (not `config.color`).
- **Modify** `js/globe.js` — nodes take the identity `sceneHex` (not `config.color`).
- `lib/mgVars.tsx` — unchanged (unmounted; documented YAGNI).

## Testing

- **Unit (TDD, vitest node-env)** — `identity.test.ts`:
  - `hexToHueDeg` round-trips a known color to the expected hue band.
  - Config pins preserve each known metagraph's exact hue (pin honored, not snapped).
  - A new (non-config) id gets a hue in an allowed zone, de-collided against pins.
  - `hudHex` = `oklch(0.80,0.15,hue)`; `sceneHex` at the scene L/C, gamut-mapped, in-gamut.
  - **Hue-match invariant:** `hueDeg(hudHex) ≈ hueDeg(sceneHex) ≈ pin/assigned hue` (within a small epsilon).
- **Visual verify (chrome-devtools MCP, one shared dev server):**
  - Per metagraph, the HUD dot hue clearly matches its 3D hub/node hue.
  - Scene nodes read as **distinct** hues under bloom (not washed to white) — this is the gate for tuning the scene L/C.
  - A new/unlisted metagraph is auto-colored (not grey).
  - DAG core still structural cyan; desktop HUD otherwise unchanged.
  - No first-paint flash on the known hubs (synchronous resolve).

## Open / follow-ups

- **Auto brand-extraction spec** (the real "brand-first"): server-side `iconUrl`/`theme-color` → dominant hue → replaces the config-seeded pins behind the same interface. Its own spec → plan → implementation.
- Scene L/C final values are set during implementation via the visual gate above.
