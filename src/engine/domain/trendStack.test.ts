import { describe, expect, it } from "vitest";
import {
  FLAT_SCALE,
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
    expect(focusDepth(IDS, "elpaca")).toBeCloseTo(p.find((x) => x.id === "elpaca")!.z);
  });

  it("falls back to the nearest plane's depth with no focus", () => {
    expect(focusDepth(IDS, null)).toBeCloseTo(stackPoses(IDS, { layout: "stack", scroll: 0, focus: null })[0].z);
  });

  it("takes no scroll or layout — it frames the front of the stack either way", () => {
    expect(focusDepth(IDS, null)).toBe(0);
    expect(focusDepth(IDS, "elpaca")).toBe(FOCUS_LIFT);
    expect(focusDepth(IDS, "not-in-roster")).toBe(0);
  });
});
