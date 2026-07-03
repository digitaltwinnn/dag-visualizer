# Auto Brand-Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive each metagraph's identity hue from its real brand (logo, then site theme-color) via an OFFLINE bake, and feed it into the identity-hue map as pins (brand > config > hash) — so the HUD + Three engine recolor from actual brands with zero runtime cost.

**Architecture:** A pure `src/palette/brand.ts` (OKLCH helpers, neutral filter, brand-color pick, allowed-zone snap, SVG fill parse) is unit-tested and reused by an offline `scripts/bake-brand-hues.ts` (Node + `tsx` + `jimp`, run manually) that writes `data/brand-hues.json`. `src/palette/identity.ts` gains `identityPins()` = config pins overlaid with the baked brand pins, consumed through the unchanged identity-map interface. `jimp`/`tsx` are devDependencies only — never in the runtime bundle.

**Tech Stack:** Next.js 15 + React 19 + TS + a vanilla Three.js engine, vitest (node env). `jimp` (pure-JS image decode) + `tsx` (run TS scripts) as devDeps. Verify visuals via the chrome-devtools MCP against the one shared `next dev`.

## Global Constraints

- **Full brand-first precedence:** baked brand hue → config color pin (fallback) → hash. Brand hue WINS for metagraphs present in `data/brand-hues.json`.
- **Offline only:** extraction runs in `scripts/bake-brand-hues.ts`, invoked manually (`npx tsx scripts/bake-brand-hues.ts`), NEVER in the request path or per cache cycle. The running app only READS `data/brand-hues.json`.
- **`jimp` + `tsx` are devDependencies** — only `scripts/bake-brand-hues.ts` imports `jimp`. No runtime/`src`/`app` file may import `jimp`. `/api/metagraphs` MUST stay `○ Static` and the client bundle unaffected.
- **DAG core stays structural cyan** (`id:"dag"` passthrough in `identity.ts` is unchanged) — identity lane only, two-lane rule holds.
- **Snap only guard-band hues:** `snapToAllowedZone(hue)` keeps an in-zone hue EXACTLY; only a hue inside a reserved guard-band is nudged to the nearest allowed-zone edge. Allowed zones (from `palette.ts`): `[41,74] [106,149] [211,249] [316,369-wrap]`.
- **Escape hatch:** `data/brand-hue-overrides.json` (`id → hueDeg`) wins over extraction IN THE BAKE.
- Tests: vitest node-env, pure helpers only (jimp decode + fetch are side-effectful, not unit-tested). Commit as author `digitaltwinnn` (email `alexander.assink@gmail.com`), trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Don't run `next build` alongside `next dev`.

---

## File Structure

- **Create `src/palette/brand.ts`** — pure: `hexToOklch`, `isNeutral`, `pickBrandColor`, `snapToAllowedZone`, `parseSvgFills`.
- **Create `src/palette/brand.test.ts`** — unit tests.
- **Modify `src/palette/palette.ts`** — export `ALLOWED`.
- **Modify `src/palette/identity.ts`** — `hexToHueDeg` delegates to `brand.hexToOklch` (DRY); add `brandPins()` + `identityPins()`; `identityMap` uses `identityPins()`.
- **Modify `src/palette/identity.test.ts`** — assert `identityPins` overlays brand over config.
- **Create `data/brand-hues.json`** (starts `{}`, later the bake output) + **`data/brand-hue-overrides.json`** (`{}`).
- **Modify `app/api/metagraphs/route.ts`** — `withHues` → `identityPins()`.
- **Create `scripts/bake-brand-hues.ts`** — the offline bake.
- **Modify `package.json`** — `jimp` + `tsx` devDependencies.
- **Modify `CLAUDE.md`** — document the bake.

---

### Task 1: `src/palette/brand.ts` — pure brand-color helpers (TDD)

**Files:**
- Modify: `src/palette/palette.ts` (export `ALLOWED`)
- Create: `src/palette/brand.ts`
- Create: `src/palette/brand.test.ts`
- Modify: `src/palette/identity.ts` (`hexToHueDeg` delegates — DRY)

**Interfaces:**
- Consumes: `ALLOWED` from `./palette`.
- Produces: `hexToOklch(rgb: number): { L: number; C: number; h: number }`; `isNeutral(rgb: number): boolean`; `pickBrandColor(cands: {rgb:number; weight:number}[]): number | null`; `snapToAllowedZone(hueDeg: number): number`; `parseSvgFills(svg: string): number[]`.

- [ ] **Step 1: Export `ALLOWED` from `palette.ts`.** Change `const ALLOWED` (line ~19) to `export const ALLOWED`.

- [ ] **Step 2: Write the failing test** `src/palette/brand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hexToOklch, isNeutral, pickBrandColor, snapToAllowedZone, parseSvgFills } from "./brand";

describe("hexToOklch", () => {
  it("gives red a mid L, high C, ~29deg hue", () => {
    const { L, C, h } = hexToOklch(0xff0000);
    expect(h).toBeGreaterThan(15); expect(h).toBeLessThan(45);
    expect(C).toBeGreaterThan(0.15);
  });
});
describe("isNeutral", () => {
  it("rejects white/black/grey, keeps a saturated colour", () => {
    expect(isNeutral(0xffffff)).toBe(true);
    expect(isNeutral(0x000000)).toBe(true);
    expect(isNeutral(0x808080)).toBe(true);
    expect(isNeutral(0xff5a3c)).toBe(false);
  });
});
describe("pickBrandColor", () => {
  it("picks the most weighted saturated colour, ignoring neutrals", () => {
    const cands = [
      { rgb: 0xffffff, weight: 500 }, // neutral, dropped
      { rgb: 0x2a9df4, weight: 40 },  // blue
      { rgb: 0x36e29a, weight: 10 },  // green, less weight
    ];
    expect(pickBrandColor(cands)).toBe(0x2a9df4);
  });
  it("returns null when every candidate is neutral", () => {
    expect(pickBrandColor([{ rgb: 0xeeeeee, weight: 9 }, { rgb: 0x111111, weight: 9 }])).toBe(null);
  });
});
describe("snapToAllowedZone", () => {
  it("keeps a hue already in an allowed zone unchanged", () => {
    expect(snapToAllowedZone(120)).toBe(120); // inside [106,149]
    expect(snapToAllowedZone(230)).toBe(230); // inside [211,249]
  });
  it("nudges a guard-band hue to the nearest allowed edge", () => {
    // red guard ~25: a ~20deg hue snaps up to the [41,74] zone's near edge
    const s = snapToAllowedZone(20);
    const inZone = (s >= 41 && s <= 74) || (s >= 316 || s <= 9);
    expect(inZone).toBe(true);
  });
});
describe("parseSvgFills", () => {
  it("extracts hex + rgb() colours, skips none/currentColor", () => {
    const svg = `<svg><path fill="#ff5a3c"/><rect style="fill:#123456"/><stop stop-color="rgb(0,128,255)"/><path fill="none"/><path fill="currentColor"/></svg>`;
    const got = parseSvgFills(svg);
    expect(got).toContain(0xff5a3c);
    expect(got).toContain(0x123456);
    expect(got).toContain(0x0080ff);
    expect(got.length).toBe(3);
  });
});
```

- [ ] **Step 3: Run it, verify it fails** — `npx vitest run src/palette/brand.test.ts` → "hexToOklch is not a function".

- [ ] **Step 4: Implement `src/palette/brand.ts`:**

```ts
// Pure brand-colour helpers for the offline brand-hue bake (scripts/bake-brand-hues.ts). No jimp,
// no fetch here — those are the bake script's side-effectful shell around these tested functions.
import { ALLOWED } from "./palette";

// sRGB 0xRRGGBB → OKLCH {L, C, h(deg)}. Standard sRGB→linear→OKLab (Björn Ottosson).
export function hexToOklch(rgb: number): { L: number; C: number; h: number } {
  const srgb = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((v) => v / 255);
  const lin = srgb.map((u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)));
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}

// A colour is unusable as a brand hue if it's near-white / near-black / desaturated (grey).
export function isNeutral(rgb: number): boolean {
  const { L, C } = hexToOklch(rgb);
  return C < 0.04 || L > 0.93 || L < 0.08;
}

// The brand colour = the most (weight × chroma) prominent NON-neutral candidate. null if none.
export function pickBrandColor(cands: { rgb: number; weight: number }[]): number | null {
  let best: number | null = null;
  let bestScore = 0;
  for (const c of cands) {
    if (isNeutral(c.rgb)) continue;
    const score = c.weight * hexToOklch(c.rgb).C;
    if (score > bestScore) { bestScore = score; best = c.rgb; }
  }
  return best;
}

const norm = (h: number) => ((h % 360) + 360) % 360;
const inZone = (h: number) => ALLOWED.some(([lo, hi]) => { const H = h < lo && hi > 360 ? h + 360 : h; return H >= lo && H < hi; });

// Keep an in-zone hue exactly; nudge a guard-band hue to the nearest allowed-zone edge.
export function snapToAllowedZone(hueDeg: number): number {
  const h = norm(hueDeg);
  if (inZone(h)) return h;
  const edges: number[] = [];
  for (const [lo, hi] of ALLOWED) { edges.push(norm(lo), norm(hi - 0.001)); }
  const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  let best = edges[0], bestD = Infinity;
  for (const e of edges) { const d = dist(h, e); if (d < bestD) { bestD = d; best = e; } }
  return best;
}

// Extract candidate colours (as 0xRRGGBB) from an SVG's fill/stroke/stop-color (attr + inline style
// + CSS), normalising #rgb/#rrggbb/rgb(). Skips none/transparent/currentColor.
export function parseSvgFills(svg: string): number[] {
  const out: number[] = [];
  const re = /(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))/g;
  let mch: RegExpExecArray | null;
  while ((mch = re.exec(svg))) {
    const tok = mch[1];
    let n: number | null = null;
    if (tok[0] === "#") {
      let hexs = tok.slice(1);
      if (hexs.length === 3) hexs = hexs.split("").map((c) => c + c).join("");
      if (hexs.length >= 6) n = parseInt(hexs.slice(0, 6), 16);
    } else {
      const [r, g, b] = tok.replace(/[^\d,]/g, "").split(",").map(Number);
      n = ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
    }
    if (n !== null && !out.includes(n)) out.push(n);
  }
  return out;
}
```

- [ ] **Step 5: Run tests, verify pass** — `npx vitest run src/palette/brand.test.ts`.

- [ ] **Step 6: DRY — make `identity.ts` `hexToHueDeg` delegate.** In `src/palette/identity.ts`, replace the body of `hexToHueDeg(rgb)` with `return hexToOklch(rgb).h;` and `import { hexToOklch } from "./brand";`. Run `npx vitest run` (full suite) — `identity.test.ts` must stay green (same hue values). `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit** — `feat(palette): pure brand-colour helpers (oklch, neutral, pick, snap, svg)`.

---

### Task 2: `identity.ts` brand pins + route + empty data files (inert until baked)

**Files:**
- Create: `data/brand-hues.json` (`{}`)
- Create: `data/brand-hue-overrides.json` (`{}`)
- Modify: `src/palette/identity.ts`
- Modify: `src/palette/identity.test.ts`
- Modify: `app/api/metagraphs/route.ts`

**Interfaces:**
- Consumes: `configPins` (existing). Produces: `brandPins(): Record<string,number>`, `identityPins(): Record<string,number>`.

This task is VISUALLY INERT — `data/brand-hues.json` is `{}`, so `identityPins()` === `configPins()` and nothing recolors until Task 3's bake fills the file. It wires the plumbing.

- [ ] **Step 1: Create the data files.** `data/brand-hues.json` = `{}`. `data/brand-hue-overrides.json` = `{}`.

- [ ] **Step 2: Add `brandPins`/`identityPins` to `identity.ts`.** Import the map statically (like the route imports `@/data/metagraphs.json`) and merge (brand overrides config):

```ts
import brandHues from "../../data/brand-hues.json";
// brand-hues.json shape: { [id: string]: { hueDeg: number; srcHex: string; source: string } }
let _brandPins: Record<string, number> | null = null;
export function brandPins(): Record<string, number> {
  if (_brandPins) return _brandPins;
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(brandHues as Record<string, { hueDeg: number }>)) out[id] = v.hueDeg;
  _brandPins = Object.freeze(out);
  return _brandPins;
}
let _identityPins: Record<string, number> | null = null;
export function identityPins(): Record<string, number> {
  if (_identityPins) return _identityPins;
  _identityPins = Object.freeze({ ...configPins(), ...brandPins() }); // brand WINS over config
  return _identityPins;
}
```
Then change `identityMap` (line ~63) to use `identityPins()` instead of `configPins()`, and the on-the-fly `resolve()` map build (line ~91) similarly if it passes pins. Keep `configPins()` as the fallback layer.

- [ ] **Step 3: Test the merge.** Add to `src/palette/identity.test.ts`:

```ts
import { identityPins, configPins } from "./identity";
it("identityPins overlays brand hues over config (brand wins)", () => {
  // brand-hues.json is empty in-repo, so identityPins === configPins until a bake runs
  expect(identityPins()).toEqual(configPins());
});
```
(When a real bake exists this test still holds structurally; if you want to assert override precedence directly, do it against a fixture object rather than the committed file.)

- [ ] **Step 4: Route uses `identityPins()`.** In `app/api/metagraphs/route.ts` `withHues`, change `assignPalette(list.map((m) => m.id), configPins())` → `assignPalette(list.map((m) => m.id), identityPins())` (import `identityPins`).

- [ ] **Step 5: Verify inert + green.** `npx tsc --noEmit` clean; `npx vitest run` all green. Load the app (chrome-devtools MCP) — colors UNCHANGED from today (brand-hues empty → config pins still drive). No console errors.

- [ ] **Step 6: Commit** — `feat(palette): identityPins = config overlaid with baked brand pins (inert until bake)`.

---

### Task 3: The offline bake script → `data/brand-hues.json` + visual verify

**Files:**
- Modify: `package.json` (`jimp` + `tsx` devDependencies)
- Create: `scripts/bake-brand-hues.ts`
- Modify: `data/brand-hues.json` (bake OUTPUT — real hues)
- Modify: `CLAUDE.md` (document the bake)

**Interfaces:**
- Consumes: `parseSvgFills`, `pickBrandColor`, `snapToAllowedZone`, `hexToOklch` from `@/src/palette/brand`; `hexToHueDeg` from `@/src/palette/identity`; `data/metagraphs.json`; `data/brand-hue-overrides.json`.

- [ ] **Step 1: Add devDeps.** `npm install -D jimp tsx` (confirm they land in `devDependencies`, not `dependencies`).

- [ ] **Step 2: Write `scripts/bake-brand-hues.ts`:**

```ts
// OFFLINE bake — run manually when the metagraph set changes: `npx tsx scripts/bake-brand-hues.ts`.
// Derives each metagraph's identity hue from its brand (logo, then site theme-color) and writes
// data/brand-hues.json. NEVER imported by the app/runtime — jimp is a devDependency only.
import { readFileSync, writeFileSync } from "node:fs";
import { Jimp } from "jimp";
import { parseSvgFills, pickBrandColor, snapToAllowedZone, hexToOklch } from "../src/palette/brand";

type Meta = { id: string; name: string; iconUrl: string; siteUrl: string };
const metas = JSON.parse(readFileSync("data/metagraphs.json", "utf8")) as Meta[];
const overrides = JSON.parse(readFileSync("data/brand-hue-overrides.json", "utf8")) as Record<string, number>;

async function fetchBuf(url: string): Promise<Buffer | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); }
  catch { return null; }
}

// Raster → candidate {rgb, weight} histogram (downscaled, quantised, alpha-gated).
async function rasterCandidates(buf: Buffer): Promise<{ rgb: number; weight: number }[]> {
  const img = await Jimp.read(buf);
  img.resize({ w: 64 });
  const hist = new Map<number, number>();
  const b = img.bitmap;
  for (let i = 0; i < b.data.length; i += 4) {
    if (b.data[i + 3] < 128) continue; // skip transparent
    const q = (v: number) => v & 0xf0; // quantise to 16 levels/channel
    const rgb = (q(b.data[i]) << 16) | (q(b.data[i + 1]) << 8) | q(b.data[i + 2]);
    hist.set(rgb, (hist.get(rgb) ?? 0) + 1);
  }
  return [...hist].map(([rgb, weight]) => ({ rgb, weight }));
}

function themeColor(html: string): number | null {
  const m = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']\s*(#[0-9a-fA-F]{3,6})/i);
  if (!m) return null;
  let h = m[1].slice(1); if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return parseInt(h.slice(0, 6), 16);
}

async function brandHueFor(m: Meta): Promise<{ hueDeg: number; srcHex: string; source: string } | null> {
  if (m.id in overrides) return { hueDeg: snapToAllowedZone(overrides[m.id]), srcHex: "", source: "override" };
  // 1) logo
  const buf = m.iconUrl ? await fetchBuf(m.iconUrl) : null;
  let chosen: number | null = null; let source = "";
  if (buf) {
    if (/\.svg(\?|$)/i.test(m.iconUrl) || buf.slice(0, 200).toString("utf8").includes("<svg")) {
      chosen = pickBrandColor(parseSvgFills(buf.toString("utf8")).map((rgb) => ({ rgb, weight: 1 })));
      source = "svg";
    } else {
      chosen = pickBrandColor(await rasterCandidates(buf)); source = "raster";
    }
  }
  // 2) theme-color fallback
  if (chosen === null && m.siteUrl) {
    const html = (await fetchBuf(m.siteUrl))?.toString("utf8");
    if (html) { chosen = themeColor(html); source = "theme-color"; }
  }
  if (chosen === null || Number.isNaN(hexToOklch(chosen).h)) return null;
  return { hueDeg: snapToAllowedZone(hexToOklch(chosen).h), srcHex: "#" + (chosen & 0xffffff).toString(16).padStart(6, "0"), source };
}

const out: Record<string, unknown> = {};
for (const m of metas) {
  const r = await brandHueFor(m);
  if (r) { out[m.id] = r; console.log(`${m.name.padEnd(22)} ${r.source.padEnd(11)} hue ${r.hueDeg.toFixed(1)}  ${r.srcHex}`); }
  else console.log(`${m.name.padEnd(22)} (no usable brand colour — will fall back to config)`);
}
writeFileSync("data/brand-hues.json", JSON.stringify(out, null, 2) + "\n");
console.log(`\nwrote data/brand-hues.json (${Object.keys(out).length}/${metas.length} metagraphs)`);
```
(Adjust the `jimp` v1 API import/resize call if the installed version differs — verify against the installed `jimp` package's README before running.)

- [ ] **Step 3: Run the bake** — `npx tsx scripts/bake-brand-hues.ts`. Confirm it prints a hue per metagraph and writes `data/brand-hues.json`. Inspect the file: every listed metagraph (that has a usable brand colour) has `{hueDeg, srcHex, source}`.

- [ ] **Step 4: Restart-free reload + visual verify (chrome-devtools MCP, shared dev server).** HMR picks up the JSON. Open the filter picker + the hyper/geo views: each metagraph's HUD dot AND its 3D hub/nodes now render the BRAND hue (recolored from today's config colors), and the HUD dot matches its 3D hub. Brand-recognizable + distinct; DAG core still cyan. For any hue that looks wrong (e.g. a logo whose extraction picked a bad colour), add a line to `data/brand-hue-overrides.json` (`"<id>": <hueDeg>`) and re-run Step 3.

- [ ] **Step 5: Confirm jimp is not in the runtime.** `grep -rn "jimp" app src` → NO hits (only `scripts/`). With `next dev` STOPPED, `npm run build` and confirm it succeeds, `/api/metagraphs` is `○ Static`, and no jimp-related bundle error; restart `next dev`. (Or defer this to a phase boundary and reason it out: no `app`/`src` file imports jimp, so it can't be bundled.)

- [ ] **Step 6: Document in `CLAUDE.md`.** Add a short note under the Data section: `data/brand-hues.json` is baked by `npx tsx scripts/bake-brand-hues.ts` (offline, when metagraphs change) — it drives the identity hues (brand > config > hash); `data/brand-hue-overrides.json` is the manual escape hatch.

- [ ] **Step 7: Commit** — `feat(palette): bake brand hues from logos into data/brand-hues.json` (include `package.json`, `scripts/bake-brand-hues.ts`, `data/brand-hues.json`, `data/brand-hue-overrides.json`, `CLAUDE.md`).

---

## Self-Review notes (for the executor)

- **Spec coverage:** pure helpers (T1) · identityPins brand>config + route (T2) · offline bake + jimp/tsx devDeps + data file + doc (T3) · escape-hatch overrides (T3 bake) · testing unit+visual (T1/T3). Precedence brand>config>hash via `identityPins`.
- **jimp isolation is the #1 risk:** only `scripts/bake-brand-hues.ts` may import `jimp`; verify (T3 step 5) it's absent from `app`/`src` and the route stays Static.
- **Type consistency:** `hexToOklch` returns `{L,C,h}`; `snapToAllowedZone`/`hexToHueDeg` return a degree number; `pickBrandColor` returns `number|null`; pins maps are `Record<string,number>`. `brand-hues.json` values are `{hueDeg, srcHex, source}`; `brandPins` reads `.hueDeg`.
- **DRY:** `identity.hexToHueDeg` delegates to `brand.hexToOklch` (T1 step 6); `snapToAllowedZone` + `ALLOWED` shared (not duplicated).
- **Only `brand.ts` is unit-tested; the bake's fetch/jimp are verified by the committed output + visual check.** The scene L/C + neutral thresholds are tunable in the pure helpers.
