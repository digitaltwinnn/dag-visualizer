# Engine Token-Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every metagraph color through one deterministic identity-hue map so a metagraph's HUD dot/chip/spine and its 3D hub/nodes always share the same hue, and new/unlisted metagraphs auto-color instead of going grey.

**Architecture:** A new pure module `src/palette/identity.ts` (built on the existing `src/palette/palette.ts` generator) resolves each metagraph id → a shared **hue degree** plus a `hudHex` (oklch 0.80/0.15, legible on glass) and a `sceneHex` (bloom-tuned, for Three). Known metagraphs keep their exact brand hue via config-seeded **pins**; new ones auto-assign guard-safe. The HUD lane flips through `metagraphById().color` → `identityHudNumber`; the engine lane feeds `identitySceneHex` into `js/layers.js`/`js/globe.js` as data (no TS import in vanilla JS). The bridge swaps the color **value** only — no material/bloom/tone-mapping changes.

**Tech Stack:** Next.js 15 + React 19 + TS + Zustand + vanilla Three.js engine, vitest (node env). Verify visuals with the chrome-devtools MCP against the one shared `next dev`.

## Global Constraints

- **Match the HUE, not the RGB.** The identity is the hue degree; HUD renders it at `oklch(0.80, 0.15, hue)`, the scene at a bloom-tuned `oklch(SCENE_L, SCENE_C, hue)`. Do NOT try to make HUD and scene pixels identical.
- **Two-lane rule holds:** this is the identity lane only. The **DAG core stays structural cyan** (`COLORS.core`) — `id: "dag"` is a passthrough in every accessor. Structural tokens/status colors untouched.
- **Bridge swaps the color VALUE only** — no change to any material setting, opacity, `emissiveIntensity`, bloom, tone mapping, color management, fog, or DoF.
- **Known metagraphs keep their exact brand hue** (config colors → pins, honored as-is, never snapped). Only new/unlisted metagraphs are auto-assigned into the allowed zones.
- **Lane discipline:** HUD surfaces resolve `identityHudHex`/`identityHudNumber`; engine/Three reads resolve `identitySceneHex`/`identitySceneNumber`. `metagraphById().color` is HUD (it feeds the HUD-facing `metaList` too); the engine's own reads switch to the scene accessor.
- **No first-paint flash:** the 10 config metagraphs resolve synchronously at module load.
- **Auto brand-extraction is OUT of scope** (a separate follow-up spec); ship with config-seeded pins.
- Tests: vitest **node-env** (pure module only). Visual checks via the chrome-devtools MCP on the shared dev server; do NOT run `next build` alongside `next dev`. Commit as author `digitaltwinnn` (email `alexander.assink@gmail.com`), trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- **Create `src/palette/identity.ts`** — the identity map. `hexToHueDeg`, `configPins`, `identityMap`, `SCENE_L`/`SCENE_C`, and the lane accessors (`identityHudHex/Number`, `identitySceneHex/Number`). Built on `palette.ts`. Node-safe (imports `js/config.js` for `METAGRAPHS`/`COLORS`, no `window`/THREE).
- **Create `src/palette/identity.test.ts`** — unit tests.
- **Modify `src/data/network.ts`** — `metagraphById().color` → `identityHudNumber(id)`; audit remaining raw-config HUD color reads.
- **Modify `src/data/hoverSubject.ts`** — the `meta`/`cfg` pick tooltip color → `identityHudHex`.
- **Modify `src/engine/Engine.ts`** — build + hold the scene-color map; hand it to `layers`/`globe`; switch the scene-accent read (line ~395) to `identitySceneHex`.
- **Modify `js/layers.js`** — hubs/tethers/pulse read the scene color from a map the Engine sets (fallback `cfg.color`).
- **Modify `js/globe.js`** — nodes read the scene color from the same map (fallback `DEFAULT_META_COLOR`).
- **Modify `app/api/metagraphs/route.ts`** — pass `configPins()` into `assignPalette` (consistency + follow-up).

---

### Task 1: `identity.ts` — the identity-hue map (TDD)

**Files:**
- Create: `src/palette/identity.ts`
- Test: `src/palette/identity.test.ts`

**Interfaces:**
- Consumes: `assignPalette`, `oklchToHex`, `IDENTITY_L` (0.8), `IDENTITY_C` (0.15) from `./palette`; `METAGRAPHS`, `COLORS` from `../../js/config.js`.
- Produces:
  - `SCENE_L: number` (start `0.68`), `SCENE_C: number` (start `0.20`).
  - `hexToHueDeg(rgb: number): number` — sRGB 0xRRGGBB → OKLCH hue degree [0,360).
  - `configPins(): Record<string, number>` — each config metagraph id → `hexToHueDeg(color)`.
  - `interface IdentityHue { id: string; hueDeg: number; hudHex: string; hudOklch: string; sceneHex: string }`.
  - `identityMap(ids: string[]): Map<string, IdentityHue>`.
  - `identityHudHex(id): string`, `identityHudNumber(id): number`, `identitySceneHex(id): string`, `identitySceneNumber(id): number` — single-id accessors; `id: "dag"` returns `COLORS.core` in both lanes (structural passthrough).

- [ ] **Step 1: Write the failing test** `src/palette/identity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hexToHueDeg, configPins, identityMap, identityHudHex, identitySceneHex, identityHudNumber, SCENE_L, SCENE_C } from "./identity";
import { METAGRAPHS, COLORS } from "../../js/config.js";
import { oklchToHex } from "./palette";

describe("hexToHueDeg", () => {
  it("maps primaries to their OKLCH hue neighbourhood", () => {
    expect(hexToHueDeg(0xff0000)).toBeGreaterThan(15);   // red ~29°
    expect(hexToHueDeg(0xff0000)).toBeLessThan(45);
    expect(hexToHueDeg(0x00ff00)).toBeGreaterThan(130);  // green ~142°
    expect(hexToHueDeg(0x0000ff)).toBeGreaterThan(250);  // blue ~264°
  });
});

describe("configPins", () => {
  it("pins every config metagraph to its brand hue (not snapped)", () => {
    const pins = configPins();
    for (const m of METAGRAPHS as { id: string; color: number }[]) {
      expect(pins[m.id]).toBeCloseTo(hexToHueDeg(m.color), 5);
    }
  });
});

describe("identityMap", () => {
  it("keeps a known metagraph's exact brand hue", () => {
    const m0 = (METAGRAPHS as { id: string; color: number }[])[0];
    const e = identityMap([m0.id]).get(m0.id)!;
    expect(e.hueDeg).toBeCloseTo(hexToHueDeg(m0.color), 5);
  });
  it("derives hud/scene hexes at the two L/C for the SAME hue", () => {
    const m0 = (METAGRAPHS as { id: string }[])[0];
    const e = identityMap([m0.id]).get(m0.id)!;
    expect(e.hudHex).toBe(oklchToHex(0.8, 0.15, e.hueDeg));
    expect(e.sceneHex).toBe(oklchToHex(SCENE_L, SCENE_C, e.hueDeg));
  });
  it("gives a NEW id a hue in an allowed zone, de-collided against pins", () => {
    const e = identityMap(["totally-new-metagraph-id"]).get("totally-new-metagraph-id")!;
    const h = e.hueDeg;
    const inAllowed = (h>=41&&h<74)||(h>=106&&h<149)||(h>=211&&h<249)||(h>=316||h<9);
    expect(inAllowed).toBe(true);
  });
});

describe("lane accessors", () => {
  it("dag is structural cyan in both lanes", () => {
    const cyan = "#" + COLORS.core.toString(16).padStart(6, "0");
    expect(identityHudHex("dag")).toBe(cyan);
    expect(identitySceneHex("dag")).toBe(cyan);
    expect(identityHudNumber("dag")).toBe(COLORS.core);
  });
  it("hud and scene share the hue for a known metagraph", () => {
    const m0 = (METAGRAPHS as { id: string }[])[0];
    expect(Math.abs(hexToHueDeg(parseInt(identityHudHex(m0.id).slice(1),16)) - hexToHueDeg(parseInt(identitySceneHex(m0.id).slice(1),16)))).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/palette/identity.test.ts` → "hexToHueDeg is not a function".

- [ ] **Step 3: Implement `src/palette/identity.ts`:**

```ts
// Identity-lane colour map: ONE deterministic source of a metagraph's identity hue, resolved for
// each medium (HUD flat-on-glass vs the 3D scene under emissive+bloom). Built on the palette
// generator. See docs/superpowers/specs/2026-07-03-engine-token-bridge-design.md.
import { METAGRAPHS, COLORS } from "../../js/config.js";
import { assignPalette, oklchToHex } from "./palette";

// Bloom-tuned L/C for the 3D lane — higher chroma / lower L than the HUD so an emissive+bloomed
// node keeps a distinct hue instead of blowing out to white. Visually tuned in Task 3.
export const SCENE_L = 0.68;
export const SCENE_C = 0.20;
const HUD_L = 0.8;
const HUD_C = 0.15;

export interface IdentityHue {
  id: string;
  hueDeg: number;
  hudHex: string;
  hudOklch: string;
  sceneHex: string;
}

const numToHex = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
const CORE_HEX = numToHex(COLORS.core);

// sRGB 0xRRGGBB → OKLCH hue degree [0,360). Standard sRGB→linear→OKLab (Björn Ottosson), then the
// hue angle. Inverse direction of palette.ts's OKLab→sRGB pipeline.
export function hexToHueDeg(rgb: number): number {
  const srgb = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((v) => v / 255);
  const lin = srgb.map((u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)));
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}

const CONFIG = METAGRAPHS as { id: string; color: number }[];

let _pins: Record<string, number> | null = null;
export function configPins(): Record<string, number> {
  if (_pins) return _pins;
  _pins = {};
  for (const m of CONFIG) _pins[m.id] = hexToHueDeg(m.color);
  return _pins;
}

function toEntry(id: string, hueDeg: number): IdentityHue {
  return {
    id, hueDeg,
    hudHex: oklchToHex(HUD_L, HUD_C, hueDeg),
    hudOklch: `oklch(${HUD_L} ${HUD_C} ${hueDeg}deg)`,
    sceneHex: oklchToHex(SCENE_L, SCENE_C, hueDeg),
  };
}

export function identityMap(ids: string[]): Map<string, IdentityHue> {
  const palette = assignPalette(ids, configPins());
  const out = new Map<string, IdentityHue>();
  for (const [id, e] of palette) out.set(id, toEntry(id, e.hueDeg));
  return out;
}

// Memoised map of the known config metagraphs (synchronous, no network).
let _known: Map<string, IdentityHue> | null = null;
function known(): Map<string, IdentityHue> {
  if (!_known) _known = identityMap(CONFIG.map((m) => m.id));
  return _known;
}

// Resolve a single id. `dag` is structural cyan in both lanes. A known metagraph hits the cache;
// an unknown id is resolved on the fly (de-collided against the pins).
function resolve(id: string): IdentityHue | null {
  if (id === "dag") return { id, hueDeg: hexToHueDeg(COLORS.core), hudHex: CORE_HEX, hudOklch: "", sceneHex: CORE_HEX };
  return known().get(id) ?? identityMap([...CONFIG.map((m) => m.id), id]).get(id) ?? null;
}

export function identityHudHex(id: string): string { return resolve(id)?.hudHex ?? CORE_HEX; }
export function identitySceneHex(id: string): string { return resolve(id)?.sceneHex ?? CORE_HEX; }
export function identityHudNumber(id: string): number { return parseInt(identityHudHex(id).slice(1), 16); }
export function identitySceneNumber(id: string): number { return parseInt(identitySceneHex(id).slice(1), 16); }
```

- [ ] **Step 4: Run tests, verify pass** — `npx vitest run src/palette/identity.test.ts` (all pass) + `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `feat(palette): identity-hue map (config-seeded pins, hud/scene lanes)`.

---

### Task 2: HUD lane — route HUD colors through the identity map

**Files:**
- Modify: `src/data/network.ts` (`metagraphById`, ~line 91-97)
- Modify: `src/data/hoverSubject.ts` (~line 37, 46)

**Interfaces:**
- Consumes: `identityHudHex`, `identityHudNumber` from `@/src/palette/identity` (Task 1).

Rationale: flipping `metagraphById().color` to the identity HUD number carries almost every HUD read at once — `filterAccent` (uses `metagraphById`), the Engine-built `metaList[].color` (line ~289 reads `metagraphById(m.id)?.color`, and that list is the HUD's source for chips/dossier/tags), and every `hex(cfg.color)` where `cfg` came from `metagraphById`. The only HUD reads NOT covered are ones that read a **pick's** raw `cfg`/`meta` (from `layers.js` `userData.pick.cfg`, raw config) — those get an explicit resolve.

- [ ] **Step 1: Flip `metagraphById().color` to the identity HUD number.** In `src/data/network.ts`, import the accessor and resolve the color field (keep `dag`'s cyan via the accessor's passthrough):

```ts
import { identityHudNumber } from "@/src/palette/identity";
// ...
export function metagraphById(id: string): MetagraphConfig | null {
  if (id === "dag") return DAG_CFG;
  const cfg = (METAGRAPHS as MetagraphConfig[]).find((m) => m.id === id);
  return cfg ? { ...cfg, color: identityHudNumber(id) } : null;
}
```

- [ ] **Step 2: Resolve the pick-sourced HUD colors.** In `src/data/hoverSubject.ts`, the `meta`/`cfg` pick tooltip colors read a raw pick color; resolve through the map. Replace `hex(p.meta.color)` / `hex(p.cfg.color)` with the identity HUD hex (import `identityHudHex`; the pick carries the metagraph id — use `p.meta?.id` / `p.cfg.id`):

```ts
import { identityHudHex } from "@/src/palette/identity";
// meta pick: color: p.meta ? identityHudHex(p.meta.id) : CORE,
// cfg  pick: color: identityHudHex(p.cfg.id),
```

- [ ] **Step 3: `tsc --noEmit` clean.** Run `npx tsc --noEmit`.
- [ ] **Step 4: Visual verify (chrome-devtools MCP).** On the shared dev server: the filter picker dots, filter pill dot, dossier/context bullet, snapshot `AnchoredTags` pills, and geo node-row hues now render the identity HUD hues (lighter, uniform L/C) — and the DAG/"All" cue stays cyan. No console errors; `metaList`-driven surfaces (chips, tags) all agree.
- [ ] **Step 5: Commit** — `feat(hud): resolve metagraph colors through the identity map (hud lane)`.

---

### Task 3: Scene lane — feed identity scene colors into the Three engine

**Files:**
- Modify: `src/engine/Engine.ts` (scene-color map; `metaData`/`setMetagraphs` handoff; accent read ~line 395)
- Modify: `js/layers.js` (`_buildMetagraphs`, ~line 98-125)
- Modify: `js/globe.js` (`setMetagraphs`, ~line 483-496)

**Interfaces:**
- Consumes: `identitySceneHex`, `identitySceneNumber`, `identityMap` from `@/src/palette/identity` (Task 1).
- Produces: an `id → sceneColorNumber` lookup the vanilla modules read (Engine sets it on `layers` + `globe`).

Rationale: `layers.js`/`globe.js` are vanilla JS and must NOT import the TS generator — the Engine (TS) owns the map and hands scene colors over as data.

- [ ] **Step 1: Engine builds + shares the scene-color map — TWO phases (timing matters).**
  In `src/engine/Engine.ts`, add a small helper and use it at two points:

```ts
import { identityMap } from "@/src/palette/identity";
// helper: id[] -> { id: sceneColorNumber }
const sceneColorsFor = (ids: string[]) => {
  const out: Record<string, number> = {};
  for (const [id, e] of identityMap(ids)) out[id] = parseInt(e.sceneHex.slice(1), 16);
  return out;
};
```
  - **(a) layers — at CONSTRUCTION, before hubs build.** `js/layers.js` builds all its hubs from `config.METAGRAPHS` synchronously when Layers is constructed/built (before any API data). So set `layers.sceneColors` to the config-only map BEFORE that build runs (find where the Engine creates/builds `this.layers` and set it just before): `this.layers.sceneColors = sceneColorsFor(METAGRAPHS.map((m) => m.id));` (import `METAGRAPHS` from `@/src/data/network` or `../../js/config.js`). Layers only ever has the config 10 hubs, so this never needs updating → no recolor pass, no flash.
  - **(b) globe — in `refreshMeta`, before `globe.setMetagraphs`.** Globe colors nodes for ALL current metagraphs incl. new ones from the API, so build the map over the live id set each refresh and set it just before `this.globe.setMetagraphs(...)`: `this.globe.sceneColors = sceneColorsFor((this.metaData || []).map((m) => m.id));`

- [ ] **Step 2: Switch the engine's own scene-accent read.** In `Engine.ts` (~line 395) the filter accent is a SCENE color — resolve the scene hex (it currently reads `metagraphById(this.filter)?.color`, which is now the HUD number):

```ts
const accent = this.filter && this.filter !== "all" ? new THREE.Color(identitySceneHex(this.filter)).getHex() : null;
```
(Keep the existing `null`-for-"all" behaviour; `identitySceneHex("dag")` stays cyan.)

- [ ] **Step 3: `layers.js` hubs read the scene map.** In `js/layers.js` `_buildMetagraphs`, resolve a per-hub color with a config fallback, and use it for the hub material color+emissive, the tether, and the pulse mesh (replace the three `cfg.color` reads):

```js
METAGRAPHS.forEach((cfg, i) => {
  const col = (this.sceneColors && this.sceneColors[cfg.id]) ?? cfg.color;
  // hubMat: color: col, emissive: col, ...
  // tether LineBasicMaterial: color: col
  // pulseMesh MeshBasicMaterial: color: col
```
The `?? cfg.color` fallback is only a safety net — per Task 3 Step 1(a), the Engine sets `layers.sceneColors` (config map) BEFORE the hubs build, so `col` is the identity scene color on the first build with no recolor pass and no flash.

- [ ] **Step 4: `globe.js` nodes read the scene map.** In `js/globe.js` `setMetagraphs`, replace `m.color = cfg ? cfg.color : DEFAULT_META_COLOR;` with the scene map (fallback preserved):

```js
m.color = (this.sceneColors && this.sceneColors[m.id]) ?? (cfg ? cfg.color : DEFAULT_META_COLOR);
```

- [ ] **Step 5: `tsc --noEmit` clean** (JS changes won't show in tsc; TS Engine changes will). Run `npx tsc --noEmit`.
- [ ] **Step 6: Visual verify + TUNE the scene L/C (chrome-devtools MCP).** In `hyper` view: every metagraph hub + its node shell now render the identity scene hue; each clearly MATCHES its HUD dot's hue (open the filter picker to compare side by side). Confirm nodes read as **distinct** hues under bloom — NOT washed to white. If any look pale/blown-out, lower `SCENE_L` / raise `SCENE_C` in `identity.ts` and re-check (that's the tuning gate). Confirm: no first-paint flash on the hubs; the DAG core stays cyan; a metagraph not in `config.METAGRAPHS` (if present in the live directory) is colored (not grey). Geo view nodes + ledger tiles also pick up the scene hue.
- [ ] **Step 7: Commit** — `feat(engine): feed identity scene colors into the Three hubs + nodes`.

---

### Task 4: API pins consistency

**Files:**
- Modify: `app/api/metagraphs/route.ts` (`withHues`, ~line 170)

**Interfaces:**
- Consumes: `configPins` from `@/src/palette/identity` (Task 1).

Rationale: the route already computes `hue` per metagraph via `assignPalette(ids)` with NO pins — so its hues for the config metagraphs don't match `identity.ts` (which pins them). Pass the same pins so the API `hue` field is consistent (and ready for the follow-up brand-extraction, which will replace the pins server-side).

- [ ] **Step 1: Pass the config pins.** In `app/api/metagraphs/route.ts`:

```ts
import { configPins } from "@/src/palette/identity";
// ...
function withHues(list: Metagraph[]): Metagraph[] {
  const palette = assignPalette(list.map((m) => m.id), configPins());
  return list.map((m) => {
    const e = palette.get(m.id);
    return e ? { ...m, hue: { deg: e.hueDeg, oklch: e.oklch, hex: e.hex } } : m;
  });
}
```

- [ ] **Step 2: `tsc --noEmit` clean.**
- [ ] **Step 3: Verify the route stays Static + hues are pinned.** With `next dev` STOPPED, run `npm run build` and confirm `/api/metagraphs` is still `○` (Static) with `10m` revalidate (NOT `ƒ` Dynamic). Restart `next dev`. Hit `/api/metagraphs` and confirm a known metagraph's `hue.deg` ≈ `hexToHueDeg(its config color)` (matches `identity.ts`). (Optional, only if the build check is deferred to a phase boundary — otherwise verify via a unit assertion that `withHues` uses `configPins()`.)
- [ ] **Step 4: Commit** — `feat(api): seed /api/metagraphs hues with the config pins`.

---

## Self-Review notes (for the executor)

- **Spec coverage:** source-of-truth map (T1) · hue assignment pins + new auto (T1) · per-lane L/C (T1, tuned in T3 step 6) · engine integration incl. no-flash (T3) · HUD integration, no `--mg` mount (T2) · API pins (T4) · testing unit+visual (T1/T2/T3). Rendering-boundary is honored by *only* swapping color values.
- **Lane discipline is the #1 correctness risk:** verify no engine/Three read accidentally uses `identityHudHex`, and no HUD read uses `identitySceneHex`. `metagraphById().color` is HUD; `Engine.ts:395` + `layers.js`/`globe.js` are scene.
- **Type consistency:** `identityHudNumber`/`identitySceneNumber` return `number` (for `.color` fields + THREE); `identityHudHex`/`identitySceneHex` return `#rrggbb` strings. `sceneColors` maps are `Record<string, number>`.
- **Verify visually** (no test for the render pipeline) via the chrome-devtools MCP at desktop; the scene L/C tuning (T3 step 6) is the one non-deterministic knob. Only `identity.ts` is unit-tested.
- **Follow-up (out of scope):** the auto brand-extraction spec replaces `configPins()`'s source (server-side logo/theme-color) behind the same interface.
