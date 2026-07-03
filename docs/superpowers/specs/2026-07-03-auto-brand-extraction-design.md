# Auto brand-extraction — design

**Date:** 2026-07-03
**Scope:** Derive each metagraph's identity HUE from its actual brand (logo `iconUrl`, secondarily site `theme-color`) as an OFFLINE bake step, and feed the result into the existing identity-hue map as pins. Replaces the config-color-derived pins (full brand-first) behind the SAME interface, so the HUD + Three engine wiring is unchanged and there is zero runtime cost.

Follow-up to the engine token-bridge (`docs/superpowers/specs/2026-07-03-engine-token-bridge-design.md`); consumes `src/palette/identity.ts` / `palette.ts`.

## Goal

- Metagraph identity hues come from their **real brand color**, not a hand-maintained config table.
- New/future listed metagraphs auto-color from their logo after a single re-bake — no per-metagraph hand-picking.
- **Zero runtime / Three overhead:** extraction happens offline; the running app reads a static committed file.

## Key decisions (from brainstorming)

- **Full brand-first:** the extracted brand hue WINS over the config color for every metagraph (the current 10 recolor to their logo hue). Precedence: **baked brand hue → config color pin (legacy fallback) → hash**.
- **Bake, don't compute per request.** A brand hue is effectively static (logos never change; new metagraphs appear ~yearly). So extraction is a deliberate OFFLINE script (like `scripts/bake-metagraphs.py`), run only when the metagraph set changes — NOT in the `/api/metagraphs` request path, NOT on the 10-min cache cycle.
- **`jimp` for raster decode** (pure-JS, no native binary), **devDependency only** — it never ships to the serverless runtime. SVG logos are handled by a text fill-parse (no decode).
- **Escape hatch:** a committed `data/brand-hue-overrides.json` (`id → hueDeg`) wins over extraction in the bake, so a bad auto result is a one-line manual fix that survives re-bakes.
- The DAG core stays structural cyan (identity lane only; two-lane rule unchanged).

## Architecture — offline bake → static file → identity pins

```
scripts/bake-brand-hues.ts  (Node + tsx + jimp, run manually)
   reads data/metagraphs.json (iconUrl/siteUrl per id)
   + src/palette/brand.ts pure helpers + data/brand-hue-overrides.json
   → writes data/brand-hues.json   { id: { hueDeg, srcHex, source } }
                                   │
        (committed, read at runtime — no jimp, no decode)
                                   ▼
src/palette/identity.ts  identityPins() = { ...configColorPins, ...brandHuePins }
   → assignPalette(ids, identityPins())  (unchanged interface)
        ├─ HUD lane  (identityHudHex / metagraphById().color / metaList)
        ├─ Engine lane (identitySceneHex → layers.js/globe.js)
        └─ /api/metagraphs withHues  (identityPins() instead of configPins())
```

Runtime consumers are UNCHANGED — they still read pins through the identity map; only the pin *source* changes (baked brand hues over config colors).

## Extraction pipeline (the bake, per metagraph)

Pure logic lives in **`src/palette/brand.ts`** (TS, vitest-testable, DRY — reused by the bake + `snapToAllowedZone` shared with identity):

1. **Gather candidate colors from the logo `iconUrl`:**
   - **SVG** (text): fetch, regex all color tokens (`fill`/`stroke`/`stop-color`/inline `style`/CSS hexes + `rgb()`), each with a rough prominence weight.
   - **PNG/JPG** (jimp, in the bake script — NOT in `brand.ts`): decode, downscale to ~64px, histogram pixels into quantized buckets; weight = pixel count. Ignore near-transparent pixels.
2. **Drop neutrals:** a candidate is unusable if near-transparent, or OKLCH chroma < 0.04 (grey), or L > 0.93 (near-white) / L < 0.08 (near-black). Monochrome logos fall through.
3. **Pick the brand color:** `max(weight × saturation)` over the non-neutral candidates (brand marks are the prominent saturated color, not the neutral fill/outline).
4. **Secondary source:** if the logo yields nothing usable, try the site `theme-color` (`<meta name="theme-color" content>` from `siteUrl`); use if non-neutral.
5. `hexToHueDeg(chosen)` → **`snapToAllowedZone(hue)`:** if the hue is already inside an allowed zone, keep it exactly; else nudge to the nearest allowed-zone edge (this is the ONLY thing that moves a brand hue — e.g. DOR-red off the structural red guard). Zone de-collision stays in `assignPalette`.
6. Write `{ hueDeg, srcHex, source: "svg" | "raster" | "theme-color" }`. If nothing usable, **omit** the id (→ runtime config/hash fallback).
7. **Overrides:** `data/brand-hue-overrides.json[id]` (if present) wins outright — written straight into `data/brand-hues.json` for that id, bypassing extraction.

## Runtime integration

- **`data/brand-hues.json`** + **`data/brand-hue-overrides.json`** committed (imported statically so they ship in the serverless bundle, like `data/*.json` already are).
- **`src/palette/identity.ts`:** add `brandPins()` (reads `brand-hues.json` → `{id: hueDeg}`) and `identityPins()` = `{ ...configPins(), ...brandPins() }` (brand overrides config). Change `identityMap` to use `identityPins()`. `configPins()` stays as the config-color fallback layer. `snapToAllowedZone` moves to `brand.ts` and is imported where needed.
- **`app/api/metagraphs/route.ts`:** `withHues` calls `assignPalette(ids, identityPins())` instead of `configPins()` — still pure, still Static, no jimp.
- **`package.json`:** `jimp` + `tsx` as **devDependencies**. `next build` must NOT bundle jimp (only the bake script imports it) — verify the API route stays Static and the client bundle is unaffected.

## Components / files

- **Create** `src/palette/brand.ts` — pure: `isNeutral(hex)`, `pickBrandColor(candidates)`, `snapToAllowedZone(hueDeg)`, `parseSvgFills(svgText)`.
- **Create** `src/palette/brand.test.ts` — unit tests.
- **Create** `scripts/bake-brand-hues.ts` — the offline bake (imports `brand.ts` + jimp + fetch; reads `data/metagraphs.json` + overrides; writes `data/brand-hues.json`).
- **Create** `data/brand-hues.json` (bake output, committed) + `data/brand-hue-overrides.json` (`{}`).
- **Modify** `src/palette/identity.ts` — `brandPins()`, `identityPins()`, move `snapToAllowedZone` to `brand.ts`, `identityMap` uses `identityPins()`.
- **Modify** `src/palette/identity.test.ts` — a case asserting `identityPins` merges brand over config (fixture).
- **Modify** `app/api/metagraphs/route.ts` — `identityPins()` in `withHues`.
- **Modify** `package.json` — `jimp` + `tsx` devDependencies.
- **Modify** `CLAUDE.md` — document the bake step (when/how to run) alongside the existing bakes.

## Testing

- **Unit (vitest node-env)** — `brand.test.ts`: `isNeutral` (grey/white/black rejected, saturated kept); `pickBrandColor` (weight×saturation winner, all-neutral → none); `snapToAllowedZone` (in-zone hue unchanged; guard-band hue → nearest allowed edge); `parseSvgFills` (extracts hex + rgb() from a sample SVG). `identity.test.ts`: `identityPins` = config with brand overriding, given a fixture brand map.
- **Bake + visual verify (chrome-devtools MCP, shared dev server):** run `npx tsx scripts/bake-brand-hues.ts`; confirm each metagraph recolors to a brand-recognizable, distinct hue in BOTH the HUD (filter picker dots) and the 3D scene (hubs/nodes); DAG core still cyan; note any off result → add a `brand-hue-overrides.json` line + re-bake.
- The bake script's fetch + jimp decode are side-effectful (not unit-tested); its correctness is the tested pure helpers + the visual verify of the committed output.

## Out of scope

- Per-request / live extraction (deliberately rejected — brand is static; bake offline).
- Rasterizing SVG (handled by text fill-parse; no sharp).
- Auto-detecting a new metagraph and re-baking automatically (manual re-bake is fine given the ~yearly cadence).

## Open / follow-ups

- Final neutral-filter thresholds + the raster downscale size are tuned during implementation (the pure helpers make them easy to adjust); the visual verify is the gate.
- If a future metagraph's logo is an unusual format (e.g. WEBP), extend the bake's decode path then.
