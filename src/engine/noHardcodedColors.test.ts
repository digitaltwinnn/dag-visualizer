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

const ENGINE_DIR = join(import.meta.dirname, ".");
const COMPONENTS_DIR = join(import.meta.dirname, "..", "..", "components");

// The ONLY permitted CHROMATIC literals per directory, each a deliberate non-token colour, keyed by 0xRRGGBB:

// Engine / scene-layer allowlist:
const ENGINE_ALLOWED = new Set<number>([
  // Scene LIGHTING used to hold three entries here (ambient / key / rim). The rig replaced them with
  // a TEMPERATURE axis (domain/sceneRig.ts · tempTint), so lighting is still decoupled from the
  // palette — it just no longer needs a colour literal to say so, and this list shrank by three.
  0x223046, // dimmed-node tone (Globe + NodeFabric) — TODO: derive from a token
]);

// Components-layer allowlist:
const COMPONENTS_ALLOWED = new Set<number>([
  // RailThread/TopBar/scrim literals became themed tokens — light/dark spec §1.
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
