import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ENFORCEMENT: no scene module may hardcode a structural colour. Every colour the 3D scene renders
// must come from the CSS design tokens (app/globals.css) via the Engine's readSceneColors bridge —
// globals.css is the single source of truth. This test greps the engine for raw 0xRRGGBB literals
// and fails on any that isn't on the small, documented allowlist below, so a new hardcoded colour
// can't slip in unnoticed (the repo has no ESLint config; architectural rules are vitest tests that
// run in `npm test` — the same gate as layerBoundaries.test.ts).
//
// (The JSX/components layer has the same rule via the CSS-var tokens, but many legacy rgb()/#hex
// literals still live there; migrating them + extending this scan to components/ is a follow-up.)

const ENGINE_DIR = join(import.meta.dirname, ".");

// The ONLY permitted raw colour literals, each a deliberate NON-structural-palette value:
const ALLOWED = new Set<number>([
  0xffffff, // white — a neutral tint canvas for per-instance InstancedMesh colouring, not a palette hue
  0x000000, // black — additive/flatten neutral
  0x4a5a8c, // ambient FILL light — a lighting technicality (cool grey), not a surface colour
  0x223046, // dimmed-node tone (Globe + NodeFabric) — TODO: derive from a token; kept literal for now
  // Density HEATMAP gradient — a functional data-viz sequential scale (cold→hot), NOT the structural
  // palette; it is intentionally its own set of colours (see objects/Heatmap.ts):
  0x1a6cff, 0x36e29a, 0xffd166, 0xff5a3c,
]);

// config.ts is EXCLUDED on purpose: it is the one designated home for (a) the static structural
// mirror of the CSS tokens that the non-DOM data/palette layer needs — the Engine warns in dev if it
// drifts from the live tokens — and (b) the metagraph IDENTITY-hue fallbacks (a separate colour lane).
// The rule is about the SCENE RENDERING code not inventing structural colours.
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && e.name !== "config.ts") out.push(p);
  }
  return out;
}

describe("no hardcoded structural colours in the engine", () => {
  const files = tsFiles(ENGINE_DIR);

  it("scans a non-empty set of engine source files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("has no raw 0xRRGGBB colour literal outside the documented allowlist", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        // 6-hex-digit literals in the engine are colours (there are no 6-digit bitmasks here).
        for (const m of line.matchAll(/0x[0-9a-fA-F]{6}\b/g)) {
          const val = parseInt(m[0], 16);
          if (!ALLOWED.has(val)) {
            offenders.push(`${file.replace(import.meta.dirname, "engine")}:${i + 1}  ${m[0]}  ${line.trim()}`);
          }
        }
      });
    }
    expect(offenders, `hardcoded structural colour(s) — source them from the CSS tokens via readSceneColors, or (if genuinely non-palette) add to ALLOWED with a reason:\n${offenders.join("\n")}`).toEqual([]);
  });
});
