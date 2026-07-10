import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ENFORCEMENT: no scene module may hardcode a structural (chromatic) colour. Every HUE the 3D scene
// renders must come from the CSS design tokens (app/globals.css) via the Engine's readSceneColors
// bridge — globals.css is the single source of truth. This test greps the engine for colour literals
// in EVERY form — `0xRRGGBB`, `#rgb`/`#rrggbb`, and `rgb()/rgba()` strings (Canvas2D fill/stroke) —
// and fails on any CHROMATIC one that isn't on the small documented allowlist.
//
// GRAYSCALE (r==g==b, incl. white/black) is always allowed: it's a luminance/alpha/intensity value,
// not a palette hue — e.g. the land-mask texture encodes its grid + fill as grays and takes its hue
// from the material colour (the token). The repo has no ESLint config; architectural rules are vitest
// tests that run in `npm test` — the same gate as layerBoundaries.test.ts. (The JSX/components layer
// has the same rule but many legacy literals; migrating them + extending this scan is a follow-up.)

const ENGINE_DIR = join(import.meta.dirname, ".");

// The ONLY permitted CHROMATIC literals, each a deliberate non-token colour, keyed by 0xRRGGBB:
const ALLOWED = new Set<number>([
  // Scene LIGHTING literals — lighting is a rendering technicality (it shades emissive materials),
  // deliberately decoupled from the palette; a light is not a surface/identity hue (see SceneContext).
  0x4a5a8c, // ambient FILL light (cool grey)
  0xccd6e6, // key light (neutral cool-white)
  0x5a6f9c, // rim light (muted cool)
  0x223046, // dimmed-node tone (Globe + NodeFabric) — TODO: derive from a token
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

const LITERAL = /0x[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;

describe("no hardcoded structural colours in the engine", () => {
  const files = tsFiles(ENGINE_DIR);

  it("scans a non-empty set of engine source files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("has no CHROMATIC colour literal (0x / #hex / rgb()) outside the documented allowlist", () => {
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        for (const m of line.matchAll(LITERAL)) {
          const c = parse(m[0]);
          if (!c) continue;
          if (c.r === c.g && c.g === c.b) continue; // grayscale = luminance/intensity, allowed
          const packed = (c.r << 16) | (c.g << 8) | c.b;
          if (!ALLOWED.has(packed)) {
            offenders.push(`${file.replace(import.meta.dirname, "engine")}:${i + 1}  ${m[0]}  ${line.trim()}`);
          }
        }
      });
    }
    expect(offenders, `hardcoded chromatic colour(s) — source the HUE from the CSS tokens via readSceneColors, or (if genuinely non-palette) add to ALLOWED with a reason:\n${offenders.join("\n")}`).toEqual([]);
  });
});
