import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// THE TREND STACK's contracts, made executable (2026-09-18 — the boundary-test idiom).
//
// The stack is split across two owners exactly like the subject callout: React renders the
// planes and owns everything inside them (`components/TrendStack.tsx`), and a later task's
// engine-side projector (`TrendStackSync`) writes each plane's `transform` per frame. That
// split only holds while five agreements do, and every one of them fails SILENTLY — tsc stays
// green, vitest stays green, and the symptom is a frozen stack, a dead orbit drag or a frame
// budget spent on re-rasters:
//
//  1. The MARKERS exist. `#trend-stack` and `[data-plane]` are what the projector queries; a
//     rename here leaves it writing transforms onto nothing.
//  2. ONE CHART PRIMITIVE, two registers. The planes host the document's own `TrendChart`, so
//     every honesty rule (null = gap, the stamped readout, the "nothing measured" wording)
//     carries into the scene rather than being re-implemented beside it.
//  3. The mount gates on `VIEW_POLICIES[mode].chartStack` (convention 7 — gate on the view a
//     behaviour is FOR). A `mode === "trend"` comparison is the deny-list shape the convention
//     exists to prevent, and it is invisible until a fifth view arrives.
//  4. NO BLUR AND NO SHADOW on a plane. Each forces the compositor to re-raster a transformed
//     layer every frame, and with five planes under a per-frame matrix that is the single
//     biggest cost of this whole approach. It cannot be caught by reading a screenshot.
//  5. The component never imports the ENGINE's imperative side. The reach is one-way: the engine
//     finds this DOM through the marker, and React never calls into it. (Pure `domain/` data is a
//     different thing entirely, and rule 6 of this file requires it.)
//  6. The PLANE'S SHAPE is the projector's coordinate system (2026-09-18). `[data-plane]` is a
//     0-size anchor with `transform-origin: 0 0`, so `TrendStackSync`'s matrix can be the projected
//     point with no centring term composed in, and it mounts `invisible` so a plane never flashes
//     at the layer's corner before the first projection lands. React must also write no `transform`
//     of its own on that element: two owners of one property is the whole failure mode this split
//     exists to prevent, and the losing write is invisible in both files.
//  7. ONE PLANE WIDTH, and it lives in `domain/trendStack.ts`. The projector divides by the same
//     constant to resolve a slot's scale, so a local `540` here would render every plane at the
//     wrong size with nothing failing anywhere.
//
// EXEMPTIONS: none. The scan is this one file's source, comments stripped (the prose above and
// the component's own header are allowed to name what the rules forbid).
const FILE = "components/TrendStack.tsx";

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const code = (): string => stripComments(readFileSync(FILE, "utf8"));

describe("trend-stack boundary", () => {
  it("renders the two markers the projector queries", () => {
    const src = code();
    expect(src.includes('id="trend-stack"'), `${FILE} must render the #trend-stack root — TrendStackSync queries it`).toBe(true);
    expect(/data-plane[=\s]/.test(src), `${FILE} must mark each plane with data-plane — TrendStackSync writes its transform`).toBe(true);
  });

  it("hosts the document's own chart primitive", () => {
    expect(
      /import\s+TrendChart\s+from\s+["']@\/components\/docs\/TrendChart["']/.test(code()),
      `${FILE} must render @/components/docs/TrendChart — one chart implementation, two registers, so the honesty rules cannot diverge`,
    ).toBe(true);
  });

  it("gates its mount on the chartStack policy, never on a mode comparison", () => {
    const src = code();
    expect(src.includes("chartStack"), `${FILE} must gate on VIEW_POLICIES[mode].chartStack (convention 7)`).toBe(true);
    expect(
      /mode\s*[!=]==\s*["']trend["']|["']trend["']\s*[!=]==\s*mode/.test(src),
      `${FILE} compares the Mode string — convention 7: gate on the view-policy allow-list instead`,
    ).toBe(false);
  });

  it("carries no blur and no shadow — a transformed layer must never re-raster", () => {
    const src = code();
    for (const banned of ["backdrop-filter", "backdrop-blur", "blur-", "shadow-", "box-shadow", "drop-shadow"]) {
      expect(src.includes(banned), `${FILE} uses ${banned} — it forces a per-frame re-raster of every transformed plane`).toBe(false);
    }
  });

  it("never imports the engine — the reach is one-way", () => {
    expect(
      /@\/src\/engine\/Engine/.test(code()),
      `${FILE} must not import the Engine: the engine finds these planes through the marker, never the reverse`,
    ).toBe(false);
    expect(
      /TrendStackSync/.test(code()),
      `${FILE} must not reach for the projector: it writes onto this DOM, it is never called from it`,
    ).toBe(false);
  });

  it("renders each plane as a 0-size anchor React never positions", () => {
    const src = code();
    // The anchor's own geometry IS the projector's coordinate system — see rule 6 above.
    expect(/data-plane=\{[^}]*\}/.test(src), `${FILE} must key each anchor by network id`).toBe(true);
    for (const cls of ["origin-top-left", "invisible", "left-0", "top-0"]) {
      expect(src.includes(cls), `${FILE} must give the [data-plane] anchor \`${cls}\` — the matrix is written against it`).toBe(true);
    }
    // ⚠️ TWO OWNERS OF ONE PROPERTY IS THE FAILURE MODE. React re-rendering a `transform` would
    // fight the engine's per-frame write, and whichever lost would be invisible in both files.
    expect(
      /transform:/.test(src),
      `${FILE} must not write a transform — TrendStackSync owns that property on these elements`,
    ).toBe(false);
    // `origin-top-left` is the class form; an inline transformOrigin would be a second opinion.
    expect(/transformOrigin/.test(src), `${FILE} states the anchor's origin as a class, not inline`).toBe(false);
  });

  it("takes the plane's width from the pose module, never a local number", () => {
    const src = code();
    expect(
      /PLANE_PX_W/.test(src) && /from\s+["']@\/src\/engine\/domain\/trendStack["']/.test(src),
      `${FILE} must read PLANE_PX_W from domain/trendStack — the projector divides by the same constant`,
    ).toBe(true);
    expect(/\b540\b/.test(src), `${FILE} carries a literal 540 — that number has one home now`).toBe(false);
  });
});
