import { describe, it, expect } from "vitest";
import {
  SCENE_RIG, SCENE_RIG_DEFAULTS, RIG_ROW_SCHEMA,
  RIG_PAPER, RIG_PAPER_DEFAULTS, RIG_PAPER_SCHEMA,
  tempTint,
} from "./sceneRig";

// The rig's SPECIFICATION. Everything here asserts the DEFAULTS, never the live struct (the tune
// contract's rule 1), so a turned knob can never make this pass or fail. What is pinned is the
// SHAPE OF THE DESIGN — the ratios that make a sphere read as a sphere — not the tuning: any number
// may move, but a key that stops out-ranking its fill has stopped being a key.

describe("scene rig", () => {
  it("stages every 3D view", () => {
    expect(Object.keys(SCENE_RIG_DEFAULTS).sort()).toEqual(["geo", "hyper", "ledger"]);
    // The live struct is the same shape — the panel binds it directly.
    expect(Object.keys(SCENE_RIG).sort()).toEqual(Object.keys(SCENE_RIG_DEFAULTS).sort());
  });

  it("keeps the sculpt ratio in every view: key > fill > 0, and ambient never out-ranks the key", () => {
    for (const [view, row] of Object.entries(SCENE_RIG_DEFAULTS)) {
      expect(row.fillInt, `${view} fill`).toBeGreaterThan(0);
      expect(row.keyInt, `${view} key beats fill`).toBeGreaterThan(row.fillInt);
      // A rig whose ambient rivals its key has no shadow side left to sculpt with — that flatness
      // IS the bug this module was built to fix, so it is pinned rather than left to taste.
      expect(row.ambInt, `${view} ambient stays under the key`).toBeLessThan(row.keyInt * 0.5);
    }
  });

  it("keeps the key in front of the subject and the rim behind it", () => {
    for (const [view, row] of Object.entries(SCENE_RIG_DEFAULTS)) {
      // Azimuths are camera-relative: |az| < π/2 is a light the viewer is looking WITH, |az| > π/2
      // one they are looking INTO. A key on the far side lights the side you cannot see.
      expect(Math.abs(row.keyAz), `${view} key is camera-side`).toBeLessThan(Math.PI / 2);
      expect(Math.abs(row.rimAz), `${view} rim is behind`).toBeGreaterThan(Math.PI / 2);
      expect(row.keyEl, `${view} key is above the horizon`).toBeGreaterThan(0);
    }
  });

  it("schemas cover every knob the rows carry", () => {
    for (const key of Object.keys(SCENE_RIG_DEFAULTS.hyper)) {
      expect(RIG_ROW_SCHEMA, `${key} has a slider`).toHaveProperty(key);
    }
    for (const key of Object.keys(RIG_PAPER_DEFAULTS)) {
      expect(RIG_PAPER_SCHEMA, `${key} has a slider`).toHaveProperty(key);
    }
  });

  it("takes every channel DOWN on paper — the page is its own bounce card", () => {
    expect(Object.keys(RIG_PAPER).sort()).toEqual(["amb", "fill", "key", "rim"]);
    for (const [ch, mul] of Object.entries(RIG_PAPER_DEFAULTS)) {
      expect(mul, `${ch} is reduced on paper`).toBeGreaterThan(0);
      expect(mul, `${ch} is reduced on paper`).toBeLessThan(1);
    }
    // The ratio statement: on paper the rig narrows to FORM, so the omnidirectional channel gives up
    // more than the directional one. Ambient dropping below the key is what says that.
    expect(RIG_PAPER_DEFAULTS.amb).toBeLessThan(RIG_PAPER_DEFAULTS.key);
  });

  it("tempTint is neutral at 0 and never leaves the unit range", () => {
    const c = { r: 0, g: 0, b: 0 };
    tempTint(0, c);
    expect(c).toEqual({ r: 1, g: 1, b: 1 });
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      tempTint(k, c);
      for (const ch of [c.r, c.g, c.b]) {
        expect(ch).toBeGreaterThan(0);
        expect(ch).toBeLessThanOrEqual(1);
      }
    }
  });

  it("tempTint runs cool→warm: blue leads below 0, red leads above it", () => {
    const c = { r: 0, g: 0, b: 0 };
    tempTint(-1, c);
    expect(c.b).toBeGreaterThan(c.g);
    expect(c.g).toBeGreaterThan(c.r);
    tempTint(1, c);
    expect(c.r).toBeGreaterThan(c.g);
    expect(c.g).toBeGreaterThan(c.b);
  });
});
