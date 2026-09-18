import { describe, expect, it } from "vitest";
import {
  FLAT_SCALE,
  clampScroll,
  FLAT_STEP_Y,
  FOCUS_LIFT,
  OPACITY_FALLOFF,
  PLANE_GAP,
  PLANE_PX_W,
  PLANE_STEP_X,
  PLANE_STEP_Y,
  PLANE_WORLD_W,
  PLANE_Y,
  SCALE_FALLOFF,
  VISIBLE_PLANES,
  focusDepth,
  scrollToShow,
  stackPoses,
} from "./trendStack";

const IDS = ["dag-l0", "pacaswap", "dor-metagraph", "elpaca", "constellation-l1", "ded"];

describe("stackPoses", () => {
  it("returns only the visible window, nearest first", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    expect(p).toHaveLength(VISIBLE_PLANES);
    expect(p[0].id).toBe("dag-l0");
    expect(p[0].z).toBeGreaterThan(p[1].z); // nearer = larger z
  });

  it("spaces planes by PLANE_GAP in depth", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    expect(p[0].z - p[1].z).toBeCloseTo(PLANE_GAP);
  });

  it("recedes: further planes are smaller and fainter", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    expect(p[4].scale).toBeLessThan(p[0].scale);
    expect(p[4].opacity).toBeLessThan(p[0].opacity);
  });

  it("falloff matches the named coefficients exactly at slot 4", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    expect(p[4].scale).toBeCloseTo(1 - SCALE_FALLOFF * 4);
    expect(p[4].opacity).toBeCloseTo(1 - OPACITY_FALLOFF * 4);
  });

  it("STAGGERS up and to the right, so no header strip is covered", () => {
    // ⚠️ The rule this replaces (every plane at x = 0, y = PLANE_Y) is what made the built view
    // read as ONE chart with ghost headers behind it — see the module header. Each receding slot
    // steps by exactly one PLANE_STEP_X / PLANE_STEP_Y.
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    for (let i = 1; i < p.length; i++) {
      expect(p[i].x - p[i - 1].x).toBeCloseTo(PLANE_STEP_X);
      expect(p[i].y - p[i - 1].y).toBeCloseTo(PLANE_STEP_Y);
    }
    // UP and RIGHT, not down and left: the header band sits above the plane in front of it.
    expect(PLANE_STEP_X).toBeGreaterThan(0);
    expect(PLANE_STEP_Y).toBeGreaterThan(0);
  });

  it("centres the stagger on the VISIBLE count, so a short roster still sits mid-canvas", () => {
    // Read from VISIBLE_PLANES instead, a two-plane window would hang off to one side.
    const full = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    const mean = (a: { x: number; y: number }[], k: "x" | "y") =>
      a.reduce((t, v) => t + v[k], 0) / a.length;
    expect(mean(full, "x")).toBeCloseTo(0);
    expect(mean(full, "y")).toBeCloseTo(PLANE_Y);
    const two = stackPoses(IDS.slice(0, 2), { layout: "stack", scroll: 0, focus: null });
    expect(mean(two, "x")).toBeCloseTo(0);
    expect(mean(two, "y")).toBeCloseTo(PLANE_Y);
  });

  it("scrolling pages through the roster", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 1, focus: null });
    expect(p[0].id).toBe("pacaswap");
    expect(p.map((x) => x.id)).not.toContain("dag-l0");
  });

  it("clamps scroll to the roster's end", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 99, focus: null });
    expect(p).toHaveLength(VISIBLE_PLANES);
    expect(p[p.length - 1].id).toBe("ded");
  });

  it("a roster shorter than the window yields that many poses", () => {
    const short = IDS.slice(0, 3);
    const p = stackPoses(short, { layout: "stack", scroll: 0, focus: null });
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.id)).toEqual(short);
  });

  it("only the nearest plane is interactive when nothing is focused", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    expect(p[0].interactive).toBe(true);
    expect(p.slice(1).every((x) => !x.interactive)).toBe(true);
  });

  it("the focused plane comes forward and is the interactive one", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: "elpaca" });
    const f = p.find((x) => x.id === "elpaca")!;
    expect(f.z).toBe(Math.max(...p.map((x) => x.z)));
    expect(f.z).toBeCloseTo(FOCUS_LIFT);
    expect(f.interactive).toBe(true);
    expect(f.opacity).toBe(1);
    expect(f.scale).toBe(1);
    // …and CONTINUES THE STAGGER forward: half a step further down-and-left than slot 0, so the
    // front of the stack reads as one sequence rather than a plane parked over its own column.
    const slot0 = p.find((x) => x.id === "dag-l0")!;
    expect(f.x).toBeCloseTo(slot0.x - PLANE_STEP_X / 2);
    expect(f.y).toBeCloseTo(slot0.y - PLANE_STEP_Y / 2);
  });

  it("a focus leaves its neighbours' slot position, scale and opacity untouched", () => {
    const noFocus = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    const focused = stackPoses(IDS, { layout: "stack", scroll: 0, focus: "elpaca" });
    for (const id of ["dag-l0", "pacaswap", "dor-metagraph", "constellation-l1"]) {
      const a = noFocus.find((x) => x.id === id)!;
      const b = focused.find((x) => x.id === id)!;
      expect(b.x).toBe(a.x);
      expect(b.y).toBe(a.y);
      expect(b.z).toBe(a.z);
      expect(b.scale).toBe(a.scale);
      expect(b.opacity).toBe(a.opacity);
    }
  });

  it("no other plane is interactive while a focus stands", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: "elpaca" });
    expect(p.filter((x) => x.interactive)).toHaveLength(1);
    expect(p.find((x) => x.interactive)!.id).toBe("elpaca");
  });

  it("a focus outside the visible window lifts nothing and falls back to slot-0 interactivity", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: "ded" }); // ded is slot 5, window is 0..4
    expect(p.map((x) => x.id)).not.toContain("ded");
    expect(p[0].interactive).toBe(true);
    expect(p.slice(1).every((x) => !x.interactive)).toBe(true);
    expect(Math.max(...p.map((x) => x.z))).toBe(p[0].z);
  });

  it("flat is a COLUMN at one depth and one scale, nearest on top", () => {
    // ⚠️ NOT a pile. Collapsing five planes onto the same pixels is unreadable — a worse answer
    // than the stack "Align to front" is meant to clarify.
    const p = stackPoses(IDS, { layout: "flat", scroll: 0, focus: null });
    expect(new Set(p.map((x) => x.z)).size).toBe(1);
    expect(p.every((x) => x.z === 0)).toBe(true);
    expect(p.map((x) => x.id)).toEqual(IDS.slice(0, VISIBLE_PLANES));
    expect(p.every((x) => x.opacity === 1)).toBe(true);
    expect(p.every((x) => x.scale === FLAT_SCALE)).toBe(true);
    expect(p.every((x) => x.x === 0)).toBe(true);
    // Tiled down the column by FLAT_STEP_Y, nearest HIGHEST — the stack's own order, read top-down.
    for (let i = 1; i < p.length; i++) expect(p[i - 1].y - p[i].y).toBeCloseTo(FLAT_STEP_Y);
    const mean = p.reduce((t, v) => t + v.y, 0) / p.length;
    expect(mean).toBeCloseTo(PLANE_Y);
  });

  it("flat makes EVERY plane interactive — nothing is covered, so nothing needs protecting", () => {
    const p = stackPoses(IDS, { layout: "flat", scroll: 0, focus: null });
    expect(p.every((x) => x.interactive)).toBe(true);
  });

  it("a focus changes no geometry in flat", () => {
    const plain = stackPoses(IDS, { layout: "flat", scroll: 0, focus: null });
    const p = stackPoses(IDS, { layout: "flat", scroll: 0, focus: "elpaca" });
    expect(p).toEqual(plain);
  });

  it("an empty roster yields no poses rather than throwing", () => {
    expect(stackPoses([], { layout: "stack", scroll: 0, focus: null })).toEqual([]);
  });
});

describe("the plane's own size", () => {
  it("states the plane in BOTH registers, so the projector's scale is a conversion", () => {
    // `TrendStackSync` resolves a slot's CSS scale as `PLANE_WORLD_W × pxPerUnit / PLANE_PX_W`.
    // Both numbers live here because the alternative — a world width in the engine and a `540` in
    // the component — is a silent drift: nothing fails, the planes just render the wrong size.
    // `components/TrendStack.tsx` reads `PLANE_PX_W` for the element's own width.
    expect(PLANE_WORLD_W).toBeGreaterThan(0);
    expect(PLANE_PX_W).toBeGreaterThan(0);
    // A plane is WIDE against the stack's depth spacing — the column reads as a stack of charts,
    // not a row of cards seen edge-on.
    expect(PLANE_WORLD_W).toBeGreaterThan(PLANE_GAP * 2);
    // …and the STAGGER is a fraction of the plane, not a tiling: the planes must overlap, or this
    // stops being a stack and becomes a scattered row.
    expect(PLANE_STEP_X * (VISIBLE_PLANES - 1)).toBeLessThan(PLANE_WORLD_W);
  });
});

describe("focusDepth", () => {
  it("is the focused plane's own z", () => {
    const p = stackPoses(IDS, { layout: "stack", scroll: 0, focus: "elpaca" });
    expect(focusDepth(IDS, "elpaca", "stack")).toBeCloseTo(p.find((x) => x.id === "elpaca")!.z);
  });

  it("falls back to the nearest plane's depth with no focus", () => {
    expect(focusDepth(IDS, null, "stack")).toBeCloseTo(
      stackPoses(IDS, { layout: "stack", scroll: 0, focus: null })[0].z,
    );
  });

  it("takes no scroll — a plane outside the window is a scroll concern, not a framing one", () => {
    expect(focusDepth(IDS, null, "stack")).toBe(0);
    expect(focusDepth(IDS, "elpaca", "stack")).toBe(FOCUS_LIFT);
    expect(focusDepth(IDS, "not-in-roster", "stack")).toBe(0);
  });

  it("is ZERO in flat, whatever is focused — nothing comes forward, so nothing is framed", () => {
    // The camera's half of `stackPoses`' own rule that a focus "changes no geometry in flat". A
    // lean there would move the camera over a structure that held still — camera principle 2
    // inverted. The click is still acknowledged: same pose, so `tweenTo` runs the nudge.
    for (const id of [...IDS, null, "not-in-roster"]) {
      expect(focusDepth(IDS, id, "flat")).toBe(0);
    }
  });

  it("agrees with the poses it is derived from, in BOTH layouts", () => {
    // Stated against `stackPoses` rather than against arithmetic: the depth the camera frames is
    // the front plane's own z, whatever the layout says that is.
    for (const layout of ["stack", "flat"] as const) {
      for (const focus of ["elpaca", null]) {
        const poses = stackPoses(IDS, { layout, scroll: 0, focus });
        expect(focusDepth(IDS, focus, layout)).toBeCloseTo(Math.max(...poses.map((p) => p.z)));
      }
    }
  });
});

describe("the LAYOUT alone never moves the camera (camera principle 2)", () => {
  // "Align to front" is a plain layout setting: it moves the STRUCTURE. The Engine re-resolves the
  // camera only when `focusDepth` changes (or a standing focus moves), so this pure equality IS the
  // pin — with nothing focused, flipping the layout changes no depth, so no resolve can run.
  it("with nothing focused, both layouts frame the same depth", () => {
    expect(focusDepth(IDS, null, "stack")).toBe(focusDepth(IDS, null, "flat"));
    expect(focusDepth([], null, "stack")).toBe(focusDepth([], null, "flat"));
  });

  it("and the planes DO move — the structure carries the change, by itself", () => {
    const a = stackPoses(IDS, { layout: "stack", scroll: 0, focus: null });
    const b = stackPoses(IDS, { layout: "flat", scroll: 0, focus: null });
    expect(b.map((p) => [p.x, p.y, p.z, p.scale])).not.toEqual(a.map((p) => [p.x, p.y, p.z, p.scale]));
  });
});

describe("scrollToShow (the paging a focus asks for)", () => {
  // The executor calls this when a plane click focuses an id the window does not hold: the focus
  // must be SEEN, and `stackPoses` deliberately lifts nothing for an off-window focus.
  const LONG = [...IDS, "seven", "eight"]; // 8 ids, window 5, so scroll runs 0..3

  it("leaves the scroll alone when the plane is already in the window", () => {
    expect(scrollToShow(LONG, "dag-l0", 0)).toBe(0);
    expect(scrollToShow(LONG, "constellation-l1", 0)).toBe(0); // slot 4, the last visible one
    expect(scrollToShow(LONG, "ded", 1)).toBe(1);
  });

  it("pages FORWARD by the minimum that brings the plane into the window", () => {
    // "ded" is index 5; a window starting at 0 ends at 4, so exactly one step is enough.
    expect(scrollToShow(LONG, "ded", 0)).toBe(1);
    expect(scrollToShow(LONG, "eight", 0)).toBe(3); // index 7 → start 7 − 5 + 1
  });

  it("pages BACKWARD to the plane itself, and no further", () => {
    expect(scrollToShow(LONG, "dag-l0", 3)).toBe(0);
    expect(scrollToShow(LONG, "pacaswap", 3)).toBe(1);
  });

  it("clamps exactly as stackPoses clamps — the two must agree about the window", () => {
    expect(scrollToShow(LONG, "dag-l0", 99)).toBe(0);
    expect(scrollToShow(LONG, "eight", -4)).toBe(3);
  });

  it("holds still for an id the roster does not carry — including an empty roster", () => {
    // It hands the caller's own scroll back rather than a clamped one: neither case is a paging
    // request, and normalising the window on a focus the stack cannot show is a silent move.
    expect(scrollToShow(LONG, "not-in-roster", 2)).toBe(2);
    expect(scrollToShow(IDS.slice(0, 3), "elpaca", 2)).toBe(2);
    expect(scrollToShow([], "dag-l0", 2)).toBe(2);
    expect(scrollToShow([], "dag-l0", 0)).toBe(0);
    // …and the same for a plane that is on screen under an out-of-range scroll: a roster shorter
    // than the window IS one window, so there is no paging to do and `stackPoses` does the
    // clamping the display needs.
    expect(scrollToShow(IDS.slice(0, 3), "dag-l0", 9)).toBe(9);
  });

  it("whatever it returns, stackPoses' window contains the plane", () => {
    // The contract, stated against the other half of the module rather than against arithmetic.
    for (const id of LONG) {
      for (const from of [0, 1, 2, 3]) {
        const p = stackPoses(LONG, { layout: "stack", scroll: scrollToShow(LONG, id, from), focus: id });
        expect(p.map((x) => x.id)).toContain(id);
        expect(p.find((x) => x.id === id)!.z).toBeCloseTo(FOCUS_LIFT);
      }
    }
  });
});

// ── THE PAGER'S END STOPS (2026-09-19) ──────────────────────────────────────────────────────
// `clampScroll` became the rail pager's rule as well as the stack's own: the control and the
// geometry have to agree about where the ends are, or a chevron dims one step early or one step
// late. The visibility question — whether the pager exists at all — is the plank's own rule (an
// axis with nothing to navigate is ABSENT, not disabled), which is exactly `count > VISIBLE_PLANES`.
describe("clampScroll — one rule for the stack and its pager", () => {
  it("a roster that FITS the window has exactly one legal scroll", () => {
    for (const count of [0, 1, VISIBLE_PLANES]) {
      expect(clampScroll(count, 0)).toBe(0);
      expect(clampScroll(count, 3)).toBe(0);
      expect(clampScroll(count, -2)).toBe(0);
    }
  });

  it("one plane past the window opens exactly one step", () => {
    expect(clampScroll(VISIBLE_PLANES + 1, 0)).toBe(0);
    expect(clampScroll(VISIBLE_PLANES + 1, 1)).toBe(1);
    expect(clampScroll(VISIBLE_PLANES + 1, 2)).toBe(1);
  });

  it("floors a fractional scroll rather than rounding it", () => {
    expect(clampScroll(VISIBLE_PLANES + 3, 1.9)).toBe(1);
  });

  it("agrees with stackPoses about which window a scroll means", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const start = clampScroll(ids.length, 99);
    const poses = stackPoses(ids, { layout: "stack", scroll: 99, focus: null });
    expect(poses.map((p) => p.id)).toEqual(ids.slice(start, start + VISIBLE_PLANES));
  });
});
