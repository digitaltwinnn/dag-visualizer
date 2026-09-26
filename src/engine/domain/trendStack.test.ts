import { describe, expect, it } from "vitest";
import {
  clampScroll,
  pagerVisible,
  FOCUS_LEAN,
  OPACITY_FALLOFF,
  PLANE_GAP,
  PLANE_PLOT_PX_H,
  PLANE_PX_H,
  PLANE_PX_W,
  PLANE_STEP_X,
  PLANE_STEP_Y,
  PLANE_WORLD_H,
  PLANE_WORLD_W,
  PLANE_Y,
  SCALE_FALLOFF,
  STACK_EASE_K,
  STAGGER_ANCHOR,
  VISIBLE_PLANES,
  focusDepth,
  loneShiftPx,
  windowCount,
  focusInWindow,
  scrollToKeep,
  scrollToShow,
  staggerCentre,
  stackPoses,
  stepX,
  arrivalPose,
  fitDistance,
  PLANE_FIT,
  CARD_FIT_H,
} from "./trendStack";

const IDS = ["dag-l0", "pacaswap", "dor-metagraph", "elpaca", "constellation-l1", "ded"];

describe("stackPoses", () => {
  it("returns only the visible window, nearest first", () => {
    const p = stackPoses(IDS, { scroll: 0, focus: null });
    expect(p).toHaveLength(VISIBLE_PLANES);
    expect(p[0].id).toBe("dag-l0");
    expect(p[0].z).toBeGreaterThan(p[1].z); // nearer = larger z
  });

  it("spaces planes by PLANE_GAP in depth", () => {
    const p = stackPoses(IDS, { scroll: 0, focus: null });
    expect(p[0].z - p[1].z).toBeCloseTo(PLANE_GAP);
  });

  it("recedes by SCALE, and every card stays opaque", () => {
    const p = stackPoses(IDS, { scroll: 0, focus: null });
    expect(p[4].scale).toBeLessThan(p[0].scale);
    // Opaque cards (user, 2026-09-19): a card faded with depth is a see-through one, so depth is
    // carried by scale, the stagger and occlusion — never by opacity.
    expect(p.every((x) => x.opacity === 1)).toBe(true);
    expect(OPACITY_FALLOFF).toBe(0);
  });

  it("falloff matches the named coefficients exactly at slot 4", () => {
    const p = stackPoses(IDS, { scroll: 0, focus: null });
    expect(p[4].scale).toBeCloseTo(1 - SCALE_FALLOFF * 4);
    expect(p[4].opacity).toBeCloseTo(1 - OPACITY_FALLOFF * 4);
  });

  it("STAGGERS up and to the right, so no header strip is covered", () => {
    // ⚠️ The rule this replaces (every plane at x = 0, y = PLANE_Y) is what made the built view
    // read as ONE chart with ghost headers behind it — see the module header. Each receding slot
    // steps by exactly one PLANE_STEP_X / PLANE_STEP_Y.
    const p = stackPoses(IDS, { scroll: 0, focus: null });
    for (let i = 1; i < p.length; i++) {
      expect(p[i].x - p[i - 1].x).toBeCloseTo(PLANE_STEP_X);
      expect(p[i].y - p[i - 1].y).toBeCloseTo(PLANE_STEP_Y);
    }
    // UP and RIGHT, not down and left: the header band sits above the plane in front of it.
    expect(PLANE_STEP_X).toBeGreaterThan(0);
    expect(PLANE_STEP_Y).toBeGreaterThan(0);
  });

  it("anchors the stagger toward the FRONT plane, so the chart being read sits near the view's centre", () => {
    // ⚠️ The rule this replaces centred the BLOCK (mean of the slots on the origin), which parked
    // the front plane two whole steps down-and-left — user, 2026-09-19: "make the front chart more
    // at the view center". The front plane is the subject; the planes behind it are its index.
    const p = stackPoses(IDS, { scroll: 0, focus: null });
    const c = staggerCentre(p.length);
    expect(p[0].x).toBeCloseTo(-c * PLANE_STEP_X);
    expect(p[0].y).toBeCloseTo(PLANE_Y - c * PLANE_STEP_Y);
    // Nearer the origin than a block-centred stagger would put it — and strictly so.
    const blockCentred = (p.length - 1) / 2;
    expect(c).toBeLessThan(blockCentred);
    expect(Math.abs(p[0].x)).toBeLessThan(blockCentred * PLANE_STEP_X);
    // …but not ON the origin: the index still has to fit above and beside it.
    expect(STAGGER_ANCHOR).toBeGreaterThan(0);
    expect(STAGGER_ANCHOR).toBeLessThan(1);
  });

  it("scales the stagger's centre with the VISIBLE count, so a short roster keeps its proportions", () => {
    expect(staggerCentre(5)).toBeCloseTo(2 * STAGGER_ANCHOR);
    expect(staggerCentre(2)).toBeCloseTo(0.5 * STAGGER_ANCHOR);
    // One plane — a committed filter — sits exactly on the pose origin…
    expect(staggerCentre(1)).toBe(0);
    const one = stackPoses(IDS.slice(0, 1), { scroll: 0, focus: null });
    expect(one[0].x).toBeCloseTo(0);
    expect(one[0].y).toBeCloseTo(PLANE_Y);
    // …and an empty window cannot produce a negative centre.
    expect(staggerCentre(0)).toBe(0);
  });

  it("states the plane's height beside its width, so the ground can clear it", () => {
    // The chart's height is a fixed CSS number, so authoring the plane NARROWER than it draws is
    // what makes it larger on screen; the world height follows from the same two numbers.
    expect(PLANE_WORLD_H).toBeCloseTo((PLANE_WORLD_W * PLANE_PX_H) / PLANE_PX_W);
    // The card is its plot plus fixed chrome (padding, head strip, axis strip) — so a taller plot
    // is a taller card, one for one.
    expect(PLANE_PX_H).toBeGreaterThan(PLANE_PLOT_PX_H);
    expect(PLANE_WORLD_H).toBeGreaterThan(PLANE_STEP_Y); // the planes overlap — see TrendsView's level floor
  });

  it("scrolling pages through the roster", () => {
    const p = stackPoses(IDS, { scroll: 1, focus: null });
    expect(p[0].id).toBe("pacaswap");
    expect(p.map((x) => x.id)).not.toContain("dag-l0");
  });

  it("clamps scroll to the roster's end", () => {
    const p = stackPoses(IDS, { scroll: 99, focus: null });
    expect(p).toHaveLength(VISIBLE_PLANES);
    expect(p[p.length - 1].id).toBe("ded");
  });

  it("a roster shorter than the window yields that many poses", () => {
    const short = IDS.slice(0, 3);
    const p = stackPoses(short, { scroll: 0, focus: null });
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.id)).toEqual(short);
  });

  it("only the nearest plane is interactive when nothing is focused", () => {
    const p = stackPoses(IDS, { scroll: 0, focus: null });
    expect(p[0].interactive).toBe(true);
    expect(p.slice(1).every((x) => !x.interactive)).toBe(true);
  });

  it("a focus RE-DEALS the deck: the focused plane takes first place, exactly", () => {
    // ⚠️ The rule this replaces LIFTED the plane out in front of slot 0 while its neighbours held
    // their slots — a hole where it had been and a sixth position hovering over the front card
    // (user, 2026-09-19: "it should take the 1st place").
    const rest = stackPoses(IDS, { scroll: 0, focus: null });
    const p = stackPoses(IDS, { scroll: 0, focus: "elpaca" });
    const f = p.find((x) => x.id === "elpaca")!;
    // Slot 0's pose to the number — not nearer, not lower, not larger.
    expect({ ...f, id: "" }).toEqual({ ...rest[0], id: "" });
    expect(p[0].id).toBe("elpaca");
    expect(f.interactive).toBe(true);
  });

  it("the planes AHEAD of the focus slide back one slot and close the gap; those behind hold", () => {
    const rest = stackPoses(IDS, { scroll: 0, focus: null });
    const p = stackPoses(IDS, { scroll: 0, focus: "elpaca" }); // elpaca is slot 3
    const pose = (list: typeof p, id: string) => ({ ...list.find((x) => x.id === id)!, id: "" });
    // Ahead of it (slots 0, 1, 2) → each takes the slot BEHIND its own.
    expect(pose(p, "dag-l0")).toEqual({ ...rest[1], id: "", interactive: false });
    expect(pose(p, "pacaswap")).toEqual({ ...rest[2], id: "" });
    expect(pose(p, "dor-metagraph")).toEqual({ ...rest[3], id: "" });
    // Behind it (slot 4) → untouched.
    expect(pose(p, "constellation-l1")).toEqual({ ...rest[4], id: "" });
    // Every slot is filled exactly once: no hole, no sixth position.
    expect(p.map((x) => x.z).sort((a, b) => b - a)).toEqual(rest.map((x) => x.z));
  });

  it("returns the poses nearest first, whatever was focused", () => {
    const p = stackPoses(IDS, { scroll: 0, focus: "dor-metagraph" });
    expect(p.map((x) => x.id)).toEqual(["dor-metagraph", "dag-l0", "pacaswap", "elpaca", "constellation-l1"]);
    for (let i = 1; i < p.length; i++) expect(p[i].z).toBeLessThan(p[i - 1].z);
  });

  it("focusing the plane that is already in front changes nothing", () => {
    const rest = stackPoses(IDS, { scroll: 0, focus: null });
    expect(stackPoses(IDS, { scroll: 0, focus: "dag-l0" })).toEqual(rest);
  });

  it("no other plane is interactive while a focus stands", () => {
    const p = stackPoses(IDS, { scroll: 0, focus: "elpaca" });
    expect(p.filter((x) => x.interactive)).toHaveLength(1);
    expect(p.find((x) => x.interactive)!.id).toBe("elpaca");
  });

  it("a focus outside the visible window moves nothing", () => {
    const p = stackPoses(IDS, { scroll: 0, focus: "ded" }); // ded is slot 5, window is 0..4
    expect(p.map((x) => x.id)).not.toContain("ded");
    expect(p[0].interactive).toBe(true);
    expect(p.slice(1).every((x) => !x.interactive)).toBe(true);
    expect(Math.max(...p.map((x) => x.z))).toBe(p[0].z);
  });

  it("an empty roster yields no poses rather than throwing", () => {
    expect(stackPoses([], { scroll: 0, focus: null })).toEqual([]);
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

describe("focusInWindow — the ONE predicate the poses and the camera share", () => {
  // ⚠️ THE STRANDED-FOCUS BUG THIS EXISTS FOR (2026-09-19). `focusDepth` used to ignore the
  // scroll on the assumption the executor always pages a focus INTO the window. The PAGER, a
  // metric change and a poll re-rank all move a standing focus back OUT of it, and then
  // `stackPoses` lifted nothing while `focusDepth` still answered `FOCUS_LEAN`: the camera leaned
  // over a structure that had not moved, which is camera principle 2 inverted — the same
  // inversion. One predicate, read by both, is the structural fix.
  it("answers NO for no focus at all, and for an id the roster does not carry", () => {
    expect(focusInWindow(IDS, 0, null)).toBe(false);
    expect(focusInWindow(IDS, 0, "not-in-roster")).toBe(false);
    expect(focusInWindow([], 0, "dag-l0")).toBe(false);
  });

  it("answers YES exactly for the ids the window holds, and moves with the scroll", () => {
    expect(focusInWindow(IDS, 0, "dag-l0")).toBe(true);
    expect(focusInWindow(IDS, 0, "ded")).toBe(false); // index 5, window 0..4
    expect(focusInWindow(IDS, 1, "ded")).toBe(true);
    expect(focusInWindow(IDS, 1, "dag-l0")).toBe(false);
  });

  it("clamps the scroll exactly as the poses do", () => {
    expect(focusInWindow(IDS, 99, "ded")).toBe(true);
    expect(focusInWindow(IDS, -3, "dag-l0")).toBe(true);
  });

  it("IS what stackPoses re-deals by, for every id at every scroll", () => {
    // A focus the window holds takes FIRST PLACE; one it does not hold moves nothing, so the front
    // is whatever the window's own first id is. (When those coincide the two answers agree too.)
    for (const focus of IDS) {
      for (const scroll of [-1, 0, 1, 2, 9]) {
        const p = stackPoses(IDS, { scroll, focus });
        const rest = stackPoses(IDS, { scroll, focus: null });
        const inWindow = focusInWindow(IDS, scroll, focus);
        expect(p[0].id, `${focus} @ ${scroll}`).toBe(inWindow ? focus : rest[0].id);
        expect(p.some((x) => x.id === focus), `${focus} @ ${scroll} present`).toBe(inWindow);
      }
    }
  });
});

describe("focusDepth", () => {
  it("is the camera's lean, not a plane's depth — the focused plane sits at slot 0", () => {
    const p = stackPoses(IDS, { scroll: 0, focus: "elpaca" });
    expect(p.find((x) => x.id === "elpaca")!.z).toBeCloseTo(0);
    expect(focusDepth(IDS, "elpaca", 0)).toBe(FOCUS_LEAN);
    expect(FOCUS_LEAN).toBeGreaterThan(0);
  });

  it("falls back to the nearest plane's depth with no focus", () => {
    expect(focusDepth(IDS, null, 0)).toBeCloseTo(
      stackPoses(IDS, { scroll: 0, focus: null })[0].z,
    );
  });

  it("is the LIFT for a focus in the window, and 0 for one the roster does not carry", () => {
    expect(focusDepth(IDS, null, 0)).toBe(0);
    expect(focusDepth(IDS, "elpaca", 0)).toBe(FOCUS_LEAN);
    expect(focusDepth(IDS, "not-in-roster", 0)).toBe(0);
  });

  it("RELEASES the camera when the focus is paged OUT of the window, and takes it back", () => {
    // The pager does not clear the focus (the Layers row stays pressed), so a standing focus can
    // sit outside the window — where nothing is lifted, so there is nothing to lean toward.
    expect(focusDepth(IDS, "dag-l0", 0)).toBe(FOCUS_LEAN);
    expect(focusDepth(IDS, "dag-l0", 1)).toBe(0); // paged past it
    expect(focusDepth(IDS, "dag-l0", 0)).toBe(FOCUS_LEAN); // paged back
  });

  it("releases it when a RE-RANK carries the focused id out of the window", () => {
    // A metric switch or a poll re-rank reorders the roster under a standing focus; the window is
    // a slot range, so a plane can leave it without the scroll moving at all.
    const ranked = ["dag-l0", "pacaswap", "dor-metagraph", "elpaca", "constellation-l1", "ded"];
    const reranked = ["pacaswap", "dor-metagraph", "elpaca", "constellation-l1", "ded", "dag-l0"];
    expect(focusDepth(ranked, "dag-l0", 0)).toBe(FOCUS_LEAN);
    expect(focusDepth(reranked, "dag-l0", 0)).toBe(0);
  });

  it("agrees with the poses it is derived from — every id, every scroll", () => {
    // Stated against `stackPoses` rather than against arithmetic. THE CONTRACT: the camera leans
    // exactly when the focus actually RE-DEALT the stack — the focused plane is in the window, and
    // it therefore holds first place. A lean over a structure that did not answer the focus is
    // camera principle 2 inverted.
    for (const focus of [...IDS, null, "not-in-roster"]) {
      for (const scroll of [0, 1, 2, 9]) {
        const poses = stackPoses(IDS, { scroll, focus });
        const answered = focus != null && poses.some((p) => p.id === focus);
        if (answered) expect(poses[0].id, `${focus} @ ${scroll} front`).toBe(focus);
        expect(focusDepth(IDS, focus, scroll), `${focus} @ ${scroll}`).toBe(answered ? FOCUS_LEAN : 0);
      }
    }
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
        const p = stackPoses(LONG, { scroll: scrollToShow(LONG, id, from), focus: id });
        expect(p.map((x) => x.id)).toContain(id);
        // …and, being in the window, the focus has taken first place.
        expect(p[0].id).toBe(id);
        expect(p[0].z).toBeCloseTo(0);
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
    const poses = stackPoses(ids, { scroll: 99, focus: null });
    expect(poses.map((p) => p.id)).toEqual(ids.slice(start, start + VISIBLE_PLANES));
  });
});

// ⚠️ THE PAGER'S VISIBILITY IS THE PLANK'S RULE, NOT A JSX PREDICATE (2026-09-19):
// "an axis with nothing to navigate is ABSENT, not disabled". It lives here beside the clamp so
// the control and the geometry agree about both questions, and so the two boundaries — exactly a
// full window, and one plane past it — are pinned rather than eyeballed in a component.
describe("pagerVisible — an axis with nothing to navigate is absent", () => {
  it("is absent for a roster that fits, INCLUDING exactly one full window", () => {
    for (const n of [0, 1, VISIBLE_PLANES - 1, VISIBLE_PLANES]) expect(pagerVisible(n)).toBe(false);
  });

  it("appears the moment one plane does not fit", () => {
    expect(pagerVisible(VISIBLE_PLANES + 1)).toBe(true);
    expect(pagerVisible(VISIBLE_PLANES + 6)).toBe(true);
  });

  it("agrees with the clamp about whether there is anywhere to go", () => {
    for (const n of [0, 1, VISIBLE_PLANES, VISIBLE_PLANES + 1, VISIBLE_PLANES + 4]) {
      expect(pagerVisible(n)).toBe(clampScroll(n, Number.MAX_SAFE_INTEGER) > 0);
    }
  });
});

describe("scrollToKeep — a re-rank may not take away the card the reader put in front", () => {
  const ELEVEN = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
  // The same eleven re-ranked by another measure: "b" falls from 2nd to 9th.
  const RERANKED = ["a", "c", "d", "e", "f", "g", "h", "i", "b", "j", "k"];

  it("pages the window after a focus the new order dropped off screen — and the poses put it FIRST", () => {
    const scroll = scrollToKeep(ELEVEN, RERANKED, "b", 0);
    expect(focusInWindow(RERANKED, scroll, "b")).toBe(true);
    expect(stackPoses(RERANKED, { scroll, focus: "b" })[0].id).toBe("b");
  });

  it("moves nothing while the focus is still on screen — the re-deal already holds it in front", () => {
    const next = ["c", "a", "d", "b", "e", "f", "g", "h", "i", "j", "k"];
    expect(scrollToKeep(ELEVEN, next, "b", 0)).toBe(0);
    expect(stackPoses(next, { scroll: 0, focus: "b" })[0].id).toBe("b");
  });

  it("does not drag back a reader who had PAGED AWAY from their focus", () => {
    // "b" was off screen under scroll 4 before the re-rank: the window was the reader's choice.
    expect(scrollToKeep(ELEVEN, RERANKED, "b", 4)).toBe(4);
  });

  it("has no opinion without a focus, without a re-rank, or for a card the new roster lacks", () => {
    expect(scrollToKeep(ELEVEN, RERANKED, null, 3)).toBe(3);
    expect(scrollToKeep(ELEVEN, ELEVEN, "b", 0)).toBe(0);
    expect(scrollToKeep(ELEVEN, ["a", "c"], "b", 0)).toBe(0);
    expect(scrollToKeep(ELEVEN, [], "b", 0)).toBe(0); // the unmount publish
    expect(scrollToKeep([], ELEVEN, "k", 0)).toBe(0); // the remount publish: nothing was on screen
  });
});

describe("windowCount — how many cards stand on the floor", () => {
  it("is the roster's size up to the window, and agrees with the poses for every size", () => {
    for (let n = 0; n <= 12; n++) {
      const ids = Array.from({ length: n }, (_, i) => `n${i}`);
      expect(windowCount(n)).toBe(stackPoses(ids, { scroll: 0, focus: null }).length);
      expect(windowCount(n)).toBe(stackPoses(ids, { scroll: 99, focus: null }).length);
    }
    expect(windowCount(-1)).toBe(0);
  });
});

describe("loneShiftPx — only a card that stands ALONE centres in the rails' gap", () => {
  it("hands the gap's shift to a window of one, and nothing to any other", () => {
    expect(loneShiftPx(1, -28)).toBe(-28);
    for (const n of [0, 2, 3, VISIBLE_PLANES]) expect(loneShiftPx(n, -28)).toBe(0);
  });

  it("a lone card sits at the stagger's origin, which is what the shift is measured from", () => {
    const [only] = stackPoses(["solo"], { scroll: 0, focus: null });
    expect(only.x).toBe(0);
  });
});

describe("STACK_EASE_K — one travel rate for the cards and the floor under them", () => {
  it("is a real, frame-rate independent ease: the same wall-clock move at 12fps and at 120", () => {
    const travel = (fps: number, seconds: number): number => {
      let v = 0;
      for (let i = 0; i < fps * seconds; i++) v += (1 - v) * (1 - Math.exp(-STACK_EASE_K / fps));
      return v;
    };
    expect(STACK_EASE_K).toBeGreaterThan(0);
    expect(travel(12, 0.5)).toBeCloseTo(travel(120, 0.5), 6);
    expect(travel(60, 1)).toBeGreaterThan(0.99); // settles inside a second — a gesture, not a drift
  });
});

describe("stepX — the across-stagger is a desktop thing (user, 2026-09-26)", () => {
  it("keeps PLANE_STEP_X on desktop and drops to 0 on a narrow canvas", () => {
    expect(stepX(false)).toBe(PLANE_STEP_X);
    expect(stepX(true)).toBe(0);
  });

  it("a narrow window stacks straight up: every pose shares x = 0, the rise and depth unchanged", () => {
    const wide = stackPoses(IDS, { scroll: 0, focus: null });
    const narrow = stackPoses(IDS, { scroll: 0, focus: null, narrow: true });
    expect(narrow.length).toBe(wide.length);
    for (let i = 0; i < wide.length; i++) {
      expect(narrow[i]!.x + 0).toBe(0); // `+ 0` folds the −0 a negative step times zero leaves
      expect(narrow[i]!.y).toBe(wide[i]!.y);
      expect(narrow[i]!.z).toBe(wide[i]!.z);
      expect(narrow[i]!.scale).toBe(wide[i]!.scale);
    }
    // And the default is the desktop stagger, so nothing that never passes the flag moved.
    expect(wide.some((p) => p.x !== 0)).toBe(true);
  });
});

describe("fitDistance — the front card spans PLANE_FIT of the free band", () => {
  const FOV = 55;
  const pxPerUnitAt1 = (h: number) => h / (2 * Math.tan((FOV * Math.PI) / 360));
  const cardPx = (d: number, h: number) => (PLANE_WORLD_W * pxPerUnitAt1(h)) / d;

  it("is the projector's expression inverted: at the answered distance the card is exactly PLANE_FIT × free width", () => {
    for (const [free, h] of [[864, 1000], [820, 1180], [390, 844]] as const) {
      const d = fitDistance(free, h, FOV);
      expect(cardPx(d, h)).toBeCloseTo(PLANE_FIT * free, 6);
    }
  });

  it("reproduces the desktop pose the user tuned by eye (798px of an 864px gap at 1500×1000)", () => {
    const d = fitDistance(864, 1000, FOV);
    expect(cardPx(d, 1000)).toBeGreaterThan(790);
    expect(cardPx(d, 1000)).toBeLessThan(806);
  });

  it("scales with height over width — a portrait canvas stands the camera further back, a wider band closer", () => {
    // The FOV is vertical: px-per-unit is set by the HEIGHT, so fitting a WIDTH means the distance
    // rises with viewH / freeW. Phone portrait (390×844) therefore stands further back than desktop.
    expect(fitDistance(390, 844, FOV)).toBeGreaterThan(fitDistance(864, 1000, FOV));
    expect(fitDistance(1000, 1000, FOV)).toBeLessThan(fitDistance(864, 1000, FOV));
    expect(fitDistance(864, 1000, FOV) / fitDistance(432, 1000, FOV)).toBeCloseTo(0.5, 9);
    expect(fitDistance(1, 1, FOV)).toBeGreaterThan(0.1); // never inside the near plane on a degenerate box
  });

  it("is CAPPED by the front card's height: on a short, wide window the card spans CARD_FIT_H of the height and less than PLANE_FIT of the width", () => {
    // 1028×606 with the rails hidden (seen live): a width fit alone stood a card taller than the canvas.
    const d = fitDistance(1028, 606, FOV);
    const cardH = (PLANE_WORLD_H * pxPerUnitAt1(606)) / d;
    expect(cardH).toBeCloseTo(CARD_FIT_H * 606, 6);
    expect(cardPx(d, 606)).toBeLessThan(PLANE_FIT * 1028);
    // And inert on the tuned desktop pose: the width fit still decides there.
    const dd = fitDistance(864, 1000, FOV);
    expect(cardPx(dd, 1000)).toBeCloseTo(PLANE_FIT * 864, 6);
    expect((PLANE_WORLD_H * pxPerUnitAt1(1000)) / dd).toBeLessThan(CARD_FIT_H * 1000);
  });

  it("PLANE_FIT leaves a gutter: under 1 and above the old tablet share", () => {
    expect(PLANE_FIT).toBeLessThan(1);
    expect(PLANE_FIT).toBeGreaterThan(0.72);
  });
});

describe("arrivalPose — a lone card is dealt forward from one slot back", () => {
  it("starts one PLANE_GAP behind its target at the next slot's scale, x and y untouched by the caller", () => {
    const front = stackPoses(["only"], { scroll: 0, focus: null })[0]!;
    const from = arrivalPose(front);
    expect(from.z).toBeCloseTo(front.z - PLANE_GAP, 9);
    expect(from.scale).toBeCloseTo(front.scale * (1 - SCALE_FALLOFF), 9);
    // The same step the deck's own second slot takes — the re-deal's movement, nothing new.
    const two = stackPoses(["a", "b"], { scroll: 0, focus: null });
    expect(two[1]!.z - two[0]!.z).toBeCloseTo(from.z - front.z, 9);
  });
});
