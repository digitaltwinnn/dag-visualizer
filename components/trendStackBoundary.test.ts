import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PLANE_PX_W } from "@/src/engine/domain/trendStack";

// THE TREND STACK's contracts, made executable (2026-09-18 — the boundary-test idiom).
//
// The stack is split across two owners exactly like the subject callout: React renders the
// planes and owns everything inside them (`components/TrendStack.tsx`), and the engine-side
// projector (`src/engine/TrendStackSync.ts`) writes each plane's `transform` per frame. That
// split only holds while every agreement below does, and each one fails SILENTLY — tsc stays
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
//  7. ONE WINDOW DATA PATH, two registers (2026-09-18). The planes and the Trends DOCUMENT are two
//     registers of one rung, so WHICH payloads a window needs and how each is cut must be the one
//     shared path (`components/useTrendsSlice.ts` over `src/data/trendWindow.ts`'s plan). A private
//     `useTrendsWindow` call here is exactly how the two drifted before: it compiles, it renders,
//     and the scene quietly answers a different question from the page — no fleet payload at the
//     fine windows, no auto-tiered range, no daily readout.
//  8. ONE PLANE WIDTH, and it lives in `domain/trendStack.ts`. The projector divides by the same
//     constant to resolve a slot's scale, so a local copy of the number here would render every
//     plane at the wrong size with nothing failing anywhere. The check reads the live
//     `PLANE_PX_W` rather than naming a value, so re-tuning the plane can never quietly retire it.
//
//  9. THE CHART PRIMITIVE'S PLOT STAYS MEMOISED, AND THE CURSOR STAYS OUT OF IT (Task 12b,
//     2026-09-19). Measured: with the shared cursor drawn as a recharts `ReferenceLine`, every
//     bucket write re-rendered all five planes' charts and a scrub ran at 3-4 FPS — the view's
//     primary gesture, unusable. The fix is structural, not a tuning: the recharts subtree is a
//     `React.memo` child whose props are the series alone, and the cursor is a CSS overlay beside
//     it. Both halves fail SILENTLY if undone — re-adding a `ReferenceLine` renders a correct
//     chart at a fifth of the frame rate, and dropping the memo is invisible in every screenshot.
//     So this one rule reaches the CHART's source as well as the stack's; the stack is the only
//     surface that pays for the regression, which is why the pin lives with it.
//
// 10. THE CURSOR OVERLAY'S GEOMETRY IS AN AGREEMENT WITH RECHARTS (2026-09-19, a review finding
//     deferred from Task 12b). That overlay is a `calc()` over a PERCENTAGE of the plate, and it is
//     exact only because the plot box is knowable without measuring it: the chart's margin is
//     `PLOT_MARGIN` — the same constant the overlay insets by — and the YAxis is `hide`, so recharts
//     reserves nothing for it. Give the axis a width, or restate the margin at one of the two call
//     sites, and every cursor on every plane lands a few pixels off the bucket it names, in the one
//     place a reader could never catch it. Both halves are pinned here because both fail silently.
//
// 11. THE PLANES' AREA FILL IS OPT-IN, AND IT IS AS HONEST AS THE LINE (2026-09-19). The stack's
//     planes pass `fill`; the DOCUMENT passes nothing and keeps its `LineChart` element unchanged,
//     which is why the chart type is switched conditionally rather than swapped outright. And the
//     area carries `connectNulls={false}` exactly as the line does — an area that bridged an
//     unmeasured bucket, or dropped to the baseline across it, would draw a measurement nobody took
//     (rule 10), and it is invisible in a screenshot of a window that happens to have no holes.
//
// EXEMPTIONS: none. The scan is these two files' source, comments stripped (the prose above and
// each component's own header are allowed to name what the rules forbid).
const FILE = "components/TrendStack.tsx";
const CHART = "components/docs/TrendChart.tsx";

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
      /import\s+TrendChart(\s*,\s*\{[^}]*\})?\s+from\s+["']@\/components\/docs\/TrendChart["']/.test(code()),
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

  it("reads its window through the shared slice hook, never a fetch of its own", () => {
    const src = code();
    expect(
      /import\s+useTrendsSlice\s+from\s+["']@\/components\/useTrendsSlice["']/.test(src),
      `${FILE} must take its data from @/components/useTrendsSlice — one window data path, two registers`,
    ).toBe(true);
    expect(
      /useTrendsWindow|useTrendsRange/.test(src),
      `${FILE} fetches a window of its own: the plan in src/data/trendWindow.ts decides what a window needs, and useTrendsSlice is how both registers ask for it`,
    ).toBe(false);
  });

  it("takes the plane's width from the pose module, never a local number", () => {
    const src = code();
    expect(
      /PLANE_PX_W/.test(src) && /from\s+["']@\/src\/engine\/domain\/trendStack["']/.test(src),
      `${FILE} must read PLANE_PX_W from domain/trendStack — the projector divides by the same constant`,
    ).toBe(true);
    // Not `\b540\b` — a pinned literal stops meaning anything the moment the constant is retuned.
    // This asks the question the rule is actually about: does the file repeat TODAY's width?
    const bare = new RegExp(`(^|[^\\w.])${PLANE_PX_W}([^\\w]|$)`);
    expect(
      bare.test(src),
      `${FILE} repeats the plane width (${PLANE_PX_W}) as a literal — PLANE_PX_W has one home`,
    ).toBe(false);
  });

  it("hosts a chart whose recharts plot is memoised — a cursor write must not re-render it", () => {
    const src = stripComments(readFileSync(CHART, "utf8"));
    expect(
      /const\s+TrendPlot\s*=\s*memo\(/.test(src),
      `${CHART} must keep its recharts plot behind React.memo — without it every cursor write and every hover re-renders five full charts (measured: 3-4 FPS across a scrub)`,
    ).toBe(true);
    expect(
      /\bReferenceLine\b/.test(src),
      `${CHART} draws the shared cursor with a recharts ReferenceLine again — that is INSIDE the memo boundary, so it re-renders the whole plot per bucket; the cursor is a CSS overlay positioned by cursorFraction`,
    ).toBe(false);
    expect(
      /cursorFraction/.test(src),
      `${CHART} must position its cursor overlay with cursorFraction (src/data/trendWindow.ts) — the chart's own numeric axis, re-expressed as a fraction, so the overlay needs no measurement`,
    ).toBe(true);
  });

  it("keeps the plot box the cursor overlay is calculated against", () => {
    const src = stripComments(readFileSync(CHART, "utf8"));
    expect(
      /<YAxis\s+hide\b/.test(src),
      `${CHART} must keep its YAxis \`hide\` — a shown axis reserves width, and the cursor overlay's calc() assumes the plot box starts at PLOT_MARGIN.left`,
    ).toBe(true);
    expect(
      /margin=\{PLOT_MARGIN\}/.test(src),
      `${CHART} must pass margin={PLOT_MARGIN} — the overlay insets by that same constant, and a restated margin puts every cursor off its bucket`,
    ).toBe(true);
  });

  it("fills the planes' area without inventing a measurement", () => {
    const src = stripComments(readFileSync(CHART, "utf8"));
    // A bare JSX boolean attribute on its own line — the stack's one call site.
    const passesFill = (f: string): boolean => /^\s*fill\s*$/m.test(stripComments(readFileSync(f, "utf8")));
    expect(
      passesFill(FILE),
      `${FILE} must pass \`fill\` to TrendChart — the plane's colour is the area under its line`,
    ).toBe(true);
    // The document's own call sites must NOT: a filled document chart is a different page, and
    // the chart type only leaves `LineChart` when the fill is on.
    expect(
      passesFill("components/docs/TrendsDoc.tsx"),
      `components/docs/TrendsDoc.tsx passes \`fill\` — the document register is line-only`,
    ).toBe(false);
    // The area is a graphical item like the line, so it takes the line's own honesty prop. Two
    // occurrences: the Line's and the Area's.
    expect(
      (src.match(/connectNulls=\{false\}/g) ?? []).length >= 2,
      `${CHART} must give its Area \`connectNulls={false}\` too — a filled gap is a measurement nobody took (rule 10)`,
    ).toBe(true);
  });

  it("holds every prop feeding that memo still across a cursor write", () => {
    const src = code();
    expect(
      /lines=\{\[/.test(src),
      `${FILE} passes an inline lines={[…]} literal — a fresh array every render defeats the plot's memo on exactly the writes it exists to absorb`,
    ).toBe(false);
    expect(
      /linesById/.test(src) && /useMemo/.test(src),
      `${FILE} must hand each plane a memoised lines array (linesById)`,
    ).toBe(true);
  });
});
