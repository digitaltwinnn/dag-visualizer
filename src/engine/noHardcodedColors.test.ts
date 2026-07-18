import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ENFORCEMENT: no scene module (nor, as of this test's components/ extension, any React component)
// may hardcode a structural (chromatic) colour. Every HUE the app renders must come from the CSS
// design tokens (app/globals.css) via the Engine's readSceneColors bridge (scene) or a `var(--…)`
// reference (components) — globals.css is the single source of truth. This test greps both trees for
// colour literals in EVERY form — `0xRRGGBB`, `#rgb`/`#rrggbb`, and `rgb()/rgba()` strings (Canvas2D
// fill/stroke, Tailwind arbitrary values, inline styles) — and fails on any CHROMATIC one that isn't
// on the small documented allowlist.
//
// GRAYSCALE (r==g==b, incl. white/black) is always allowed: it's a luminance/alpha/intensity value,
// not a palette hue — e.g. the land-mask texture encodes its grid + fill as grays and takes its hue
// from the material colour (the token). The repo has no ESLint config; architectural rules are vitest
// tests that run in `npm test` — the same gate as layerBoundaries.test.ts. (2026-07-17: the
// components/ scan was added — the handful of legacy literals it found were migrated to tokens where
// a clean `var(--…)` equivalent existed; the rest are genuine one-offs, documented in the allowlists
// below.) Per-directory allowlists prevent accidental cross-layer leakage: a components-only colour
// (e.g. 0x141a2e, TopBar gradient) must not silently validate a scene file containing the same hex.
//
// NOTE: the allocation gate's regex holes (object/array literals, un-namespaced constructors) are
// left as-is — the scene imports THREE as a namespace everywhere (un-namespaced `new Vector3()` would
// require an import-style change that layerBoundaries.test.ts would flag), and object-literal detection
// is too noisy for a grep gate. Intent is already documented via the `// event-time` marker system.

const ENGINE_DIR = join(import.meta.dirname, ".");
const COMPONENTS_DIR = join(import.meta.dirname, "..", "..", "components");

// The ONLY permitted CHROMATIC literals per directory, each a deliberate non-token colour, keyed by 0xRRGGBB:

// Engine / scene-layer allowlist:
const ENGINE_ALLOWED = new Set<number>([
  // Scene LIGHTING literals — lighting is a rendering technicality (it shades emissive materials),
  // deliberately decoupled from the palette; a light is not a surface/identity hue (see SceneContext).
  0x4a5a8c, // ambient FILL light (cool grey)
  0xccd6e6, // key light (neutral cool-white)
  0x5a6f9c, // rim light (muted cool)
  0x223046, // dimmed-node tone (Globe + NodeFabric) — TODO: derive from a token
]);

// Components-layer allowlist:
const COMPONENTS_ALLOWED = new Set<number>([
  // components/RailThread.tsx — the SVG thread ruler + node-dot ring. Kept as literal strings on
  // purpose: these are native SVG presentation ATTRIBUTES (`stroke="…"`, not a `style` prop), and
  // this codebase's own tested finding is that a `var(--…)` there doesn't reliably resolve the same
  // way the equivalent CSS-property use does elsewhere (see the file's inline comments at the
  // TICK_LINE/TICK_MINOR/TICK_MAJOR consts and the `#0c1020` node-dot ring) — so the values are
  // hand-mirrored from the tokens instead and must be kept in sync manually.
  0xb2c1df, // rgba(178,193,223,·) — mirrors --thread-line / --thread-tick / --thread-tick-major
  0x0c1020, // #0c1020 — mirrors --panel's base RGB (the node-dot's punch-out ring)

  // components/TopBar.tsx — the command bar's own glass gradient. Same base recipe as `.ig-panel`
  // (globals.css) but tuned to a slightly more transparent alpha for the spineless bar (no resting
  // edge/spine of its own); `.ig-panel`'s matching gradient stops are themselves an unlayered CSS
  // literal, not exposed as a `--…` var, so there's no token to point at without changing the alpha
  // (and therefore the rendered colour).
  0x141a2e, // rgba(20,26,46,·) — gradient top stop, mirrors .ig-panel's
  0x0a0e1c, // rgba(10,14,28,·) — gradient bottom stop, mirrors .ig-panel's

  // components/ui/sheet.tsx (overlay scrim) + components/RailDock.tsx (sheet title text-shadow) —
  // a near-black tint close to but not exactly --background's resolved sRGB (0x010207); no existing
  // token matches it exactly, and substituting one would shift the (very subtle, low-alpha) colour.
  0x03050c, // rgba(3,5,12,·)
]);

// Parse any colour-literal token to {r,g,b}, or null if it isn't one.
function parse(tok: string): { r: number; g: number; b: number } | null {
  if (tok.startsWith("0x") || tok.startsWith("#")) {
    let h = tok.replace(/^0x|^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6) return null;
    const v = parseInt(h, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  const m = tok.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

// config.ts is EXCLUDED: it is the one designated home for the static structural mirror of the CSS
// tokens (the Engine dev-warns if it drifts) + the metagraph IDENTITY-hue fallbacks. The rule is
// about the SCENE RENDERING code not inventing structural colours.
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && e.name !== "config.ts") out.push(p);
  }
  return out;
}

// Same walk, widened to `.tsx` too (JSX components) — mirrors tsFiles for the components/ scan below.
function tsAndTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsAndTsxFiles(p));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const LITERAL = /0x[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;

// Shared scan: every non-grayscale colour literal in `files` must be in the given `allowlist`, else
// it's an offender line `label:lineNo  literal  trimmed-source` (paths displayed relative to
// `displayRoot`, prefixed with `label` for readability).
function chromaticOffenders(files: string[], displayRoot: string, label: string, allowlist: Set<number>): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      for (const m of line.matchAll(LITERAL)) {
        const c = parse(m[0]);
        if (!c) continue;
        if (c.r === c.g && c.g === c.b) continue; // grayscale = luminance/intensity, allowed
        const packed = (c.r << 16) | (c.g << 8) | c.b;
        if (!allowlist.has(packed)) {
          offenders.push(`${label}${file.replace(displayRoot, "")}:${i + 1}  ${m[0]}  ${line.trim()}`);
        }
      }
    });
  }
  return offenders;
}

describe("no hardcoded structural colours in the engine", () => {
  const files = tsFiles(ENGINE_DIR);

  it("scans a non-empty set of engine source files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("has no CHROMATIC colour literal (0x / #hex / rgb()) outside the documented allowlist", () => {
    const offenders = chromaticOffenders(files, import.meta.dirname, "engine", ENGINE_ALLOWED);
    expect(offenders, `hardcoded chromatic colour(s) — source the HUE from the CSS tokens via readSceneColors, or (if genuinely non-palette) add to ENGINE_ALLOWED with a reason:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("no hardcoded structural colours in components/", () => {
  const files = tsAndTsxFiles(COMPONENTS_DIR);

  it("scans a non-empty set of component source files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("has no CHROMATIC colour literal (0x / #hex / rgb()) outside the documented allowlist", () => {
    const offenders = chromaticOffenders(files, join(COMPONENTS_DIR, ".."), "components", COMPONENTS_ALLOWED);
    expect(offenders, `hardcoded chromatic colour(s) — source the HUE from a CSS var(--…) token, or (if genuinely non-palette) add to COMPONENTS_ALLOWED with a reason:\n${offenders.join("\n")}`).toEqual([]);
  });
});
