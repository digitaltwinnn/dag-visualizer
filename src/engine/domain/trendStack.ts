// The trend stack's pose math — the whole spatial grammar as pure data. Depth reads as network:
// each chart plane is a network's history, receding into −Z the further it sits from the front,
// and the front is either the roster's own order (busiest first, decided upstream) or whichever
// plane the caller has focused. This module produces poses only — the projector
// (`src/engine/TrendStackSync.ts`) reads them through the camera and writes CSS transforms;
// framing math (rule 6) reads THESE poses, never a rendered transform.
//
// World frame: the view's resting camera is `FOCI.trend` in `domain/cameraRig.ts`, looking down
// −Z. So NEARER = LARGER z, and the stack's five visible slots span
// z = 0 … −(VISIBLE_PLANES − 1) × PLANE_GAP.
//
// ⚠️ THE STACK STAGGERS — IT IS NOT A COLUMN OF CONCENTRIC PLANES (2026-09-18, after seeing the
// first build run). Every plane originally sat at x = 0, y = PLANE_Y, so depth was carried by
// SCALE alone: seen from a frontal camera the five planes landed on top of each other and the view
// read as ONE chart with a few ghost header strips peeking out behind it. That is the whole
// proposition lost — the point of a stack is that you can see the roster, and **the header strip
// is each plane's identity channel** (its network name, its hue, its latest reading). A plane
// whose header is covered is a plane that is not in the view at all.
//
// So a receding slot steps UP and to the RIGHT as well as back: `PLANE_STEP_X` / `PLANE_STEP_Y`
// per slot, centred on the visible COUNT so the block sits mid-canvas whether it holds five planes
// or two. Up-and-right is not arbitrary — it puts each header strip in the clear band above and
// beside the plane in front of it, which is exactly where a reader's eye already runs a list, and
// it leaves the near plane's plot (the one being read) unobstructed at the bottom-left.
//
// ⚠️ AND "FLAT" IS A COLUMN, NOT A PILE. Collapsing every plane to one depth at one position would
// stack five identical rectangles on the same pixels — unreadable, and a worse answer than the
// stack it is meant to clarify. `flat` tiles them as a vertical column at `FLAT_SCALE`, nearest on
// TOP (the stack's own order, read top-down), and since nothing overlaps there, every plane is
// interactive: the interactivity rule exists to protect a covered plane from stealing a click, and
// in flat nothing is covered.
// ⚠️ AND A FOCUS MOVES NOTHING THERE, WHICH REACHES THE CAMERA: `focusDepth` answers 0 in `flat`,
// so the camera holds its resting pose while a flat column is read. The structure is what carries
// emphasis (camera principle 2) — with no plane coming forward there is nothing for a lean to meet,
// and a camera moving over a still structure is that principle exactly inverted. The commit is
// still acknowledged: the destination is then the pose already held, which is the NUDGE's job.
//
// No imports — this is arithmetic over plain objects, same discipline as `calloutPlacement.ts`.

export interface PlanePose {
  id: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  interactive: boolean;
}

/** How many planes the stack shows at once — the paging window's width. */
export const VISIBLE_PLANES = 5;

/** World-unit depth between adjacent slots in `stack` layout. */
export const PLANE_GAP = 9;

/** The stack's resting height — the centre the slot stagger is measured from. */
export const PLANE_Y = 2;

/** Per-slot-index falloff: how much `scale` drops for each step back into the stack. */
export const SCALE_FALLOFF = 0.03;

/** Per-slot-index falloff: how much `opacity` drops for each step back into the stack. */
export const OPACITY_FALLOFF = 0.16;

/** THE STAGGER, across. Each slot further back sits this much further RIGHT, so its header strip
 *  clears the plane in front of it. See the header: a covered header is a missing plane. */
export const PLANE_STEP_X = 3;

/** THE STAGGER, up. Each slot further back sits this much HIGHER — the larger of the two steps,
 *  because a header strip is wide and short: vertical clearance is what actually uncovers it. */
export const PLANE_STEP_Y = 7.8;

/** THE PLANE'S WIDTH IN WORLD UNITS — the one number that ties this pose math to the DOM the
 *  projector scales. The plane's content is `PLANE_PX_W` CSS px wide at scale 1, so the projector
 *  resolves a slot's scale as `PLANE_WORLD_W × pxPerUnit / PLANE_PX_W`: state the plane's size
 *  where the rest of the spatial grammar lives, and the browser number becomes a conversion rather
 *  than a second opinion about how big a plane is. Sized so the front plane is about half the
 *  canvas at the resting pose. */
export const PLANE_WORLD_W = 52;

/** The plane's CSS width at scale 1 — READ BY BOTH SIDES (`components/TrendStack.tsx` sets it on
 *  the element; the projector divides by it). A local literal in either place is a silent drift:
 *  the planes would simply render at the wrong size, with nothing failing. Paired with
 *  `PLANE_WORLD_W` so the CSS scale at the resting pose lands near 1 and the chart's text is
 *  rasterised at roughly its authored size. */
export const PLANE_PX_W = 720;

/** How far in FRONT of slot 0 a focused plane is lifted — half the inter-plane gap, so it clears
 *  the rest of the stack without leaving its own depth register. */
export const FOCUS_LIFT = PLANE_GAP / 2;

/** `flat`'s uniform scale. Below 1 because five planes have to fit the canvas HEIGHT there, where
 *  the stack spent its room on depth instead. */
export const FLAT_SCALE = 0.7;

/** World-unit pitch between rows in `flat` — the column's own spacing, large enough that two
 *  neighbouring charts never touch. */
export const FLAT_STEP_Y = 10.5;

/** The two ways the planes can sit. Exported because `focusDepth` takes it: a caller that asks
 *  what the camera should frame has to say which layout it is asking about. */
export type Layout = "stack" | "flat";

interface StackOpts {
  layout: Layout;
  scroll: number;
  focus: string | null;
}

/** Clamp `scroll` to the roster's own end and floor it to an integer slot — a fractional scroll
 *  is a later concern.
 *
 *  EXPORTED because the rail's PAGER steps this same axis (2026-09-19): a control that clamped
 *  with its own arithmetic could offer a step the stack would then refuse, or refuse one it would
 *  take — the plank's "an exhausted direction is inactive" rule only reads honestly while the
 *  control and the geometry agree about where the ends are. */
export function clampScroll(count: number, scroll: number): number {
  const max = Math.max(0, count - VISIBLE_PLANES);
  return Math.min(max, Math.max(0, Math.floor(scroll)));
}

/** Whether the roster has anywhere to page TO.
 *
 *  The rail plank's rule, stated where the geometry is (2026-09-19): "an exhausted direction is
 *  INACTIVE while an axis with nothing to ever navigate is ABSENT". A roster that fits the window
 *  — exactly `VISIBLE_PLANES` included — has one legal scroll and therefore no axis at all, so its
 *  pager is not a disabled control, it is no control. Living beside `clampScroll` is the point:
 *  presence and the end stops are the same question asked twice, and a component predicate could
 *  drift from the clamp by one plane with nothing failing. */
export function pagerVisible(count: number): boolean {
  return count > VISIBLE_PLANES;
}

/**
 * The visible window's poses, ordered by slot (nearest first, which is also roster order within
 * the window).
 *
 * `stack` recedes in depth with monotonic scale/opacity falloff AND a per-slot stagger up and to
 * the right (see the header — the stagger is what keeps every header strip visible). The stagger
 * is centred on the visible COUNT, `(i − (n−1)/2)`, so a window holding two planes sits in the
 * middle of the canvas exactly as a window holding five does.
 *
 * `flat` tiles the same planes as a vertical COLUMN at one depth and one scale, nearest on top.
 *
 * A `focus` naming a plane inside the window lifts that one plane to `FOCUS_LIFT` and carries it
 * half a step further down-and-left than slot 0 — continuing the stagger forward, so the front of
 * the stack reads as one sequence — at full scale and opacity, and marks it the sole interactive
 * plane. Its neighbours keep exactly the slot pose they would have had with no focus: `n` does not
 * change when a plane is focused, so the lift does not close the gap it leaves. A focus naming a
 * plane OUTSIDE the window lifts nothing (a later task scrolls it into view first), and
 * interactivity falls back to the no-focus rule. With no focus at all, only slot 0 is interactive.
 * In `flat` a focus changes no geometry and every plane is interactive regardless: nothing is
 * covered there, so there is nothing for the rule to protect.
 */
export function stackPoses(ids: readonly string[], opts: StackOpts): PlanePose[] {
  const { layout, scroll, focus } = opts;
  const start = clampScroll(ids.length, scroll);
  const visible = ids.slice(start, start + VISIBLE_PLANES);
  const focusInWindow = focus !== null && visible.includes(focus);
  // The stagger's centre. Read from the VISIBLE count, never VISIBLE_PLANES: a short roster (a
  // committed filter, a small network set) would otherwise hang off to one side of the canvas.
  const mid = (visible.length - 1) / 2;

  return visible.map((id, i) => {
    if (layout === "flat") {
      // Nearest on TOP: the stack's own order read top-down, so switching layouts re-arranges the
      // same sequence rather than reversing it.
      return {
        id,
        x: 0,
        y: PLANE_Y + (mid - i) * FLAT_STEP_Y,
        z: 0,
        scale: FLAT_SCALE,
        opacity: 1,
        interactive: true,
      };
    }
    if (focusInWindow && id === focus) {
      return {
        id,
        x: (0 - mid) * PLANE_STEP_X - PLANE_STEP_X / 2,
        y: PLANE_Y + (0 - mid) * PLANE_STEP_Y - PLANE_STEP_Y / 2,
        z: FOCUS_LIFT,
        scale: 1,
        opacity: 1,
        interactive: true,
      };
    }
    return {
      id,
      x: (i - mid) * PLANE_STEP_X,
      y: PLANE_Y + (i - mid) * PLANE_STEP_Y,
      z: -i * PLANE_GAP,
      scale: 1 - SCALE_FALLOFF * i,
      opacity: 1 - OPACITY_FALLOFF * i,
      interactive: focusInWindow ? false : i === 0,
    };
  });
}

/**
 * The z the camera frames: the focused plane's own depth when `focus` names a plane in the
 * roster, else slot 0's resting depth (`0`). Takes no SCROLL — a plane outside the current window
 * is a scroll concern, not a framing one — but it does take the LAYOUT, and that is the point:
 *
 * ⚠️ IN `flat` A FOCUS MOVES NOTHING, SO THERE IS NOTHING FOR THE CAMERA TO MEET (2026-09-18).
 * `stackPoses` says so itself — in `flat` every plane sits at `z: 0` at `FLAT_SCALE` and every one
 * of them is interactive, and a focus there "changes no geometry" by that function's own tested
 * rule. Answering `FOCUS_LIFT` anyway made the camera lean toward a plane that had not come
 * forward: the structure holding still while the camera moves is camera principle 2 exactly
 * inverted. The commit is still acknowledged — the destination is then the pose the camera already
 * holds, which is what the NUDGE is for (principle 3).
 *
 * The answer lives HERE rather than as a `layout === "flat"` compare in the Engine, because this
 * module is where the stack's spatial grammar is stated: the camera reads the geometry, it does not
 * re-derive it.
 */
export function focusDepth(ids: readonly string[], focus: string | null, layout: Layout): number {
  if (layout === "flat") return 0;
  return focus !== null && ids.includes(focus) ? FOCUS_LIFT : 0;
}

/**
 * The scroll that brings `id` into the visible window, moving as little as possible.
 *
 * A plane click focuses whatever it names, and `stackPoses` deliberately lifts NOTHING for a focus
 * outside the window — so the click's executor (`src/store/applyClickActions.ts`, the one place
 * allowed to read the published roster) pages the window first and the focus lands somewhere the
 * reader can see it. Minimal movement on purpose: paging further would re-order the rest of the
 * stack around a gesture that named one plane.
 *
 * ⚠️ IT ONLY EVER ANSWERS THE QUESTION IT WAS ASKED — "what scroll shows this plane?" — and where
 * there is nothing to show it hands the caller's own scroll straight back, UNNORMALISED. A plane
 * already on screen, an id the roster does not hold, a roster still EMPTY because React has not
 * published one yet: none of those is a paging request, and answering them with a clamped value
 * would let a focus click quietly move the window (at boot, all the way back to 0) for a plane it
 * could not bring into view anyway. Where it does page, the result is clamped by the same rule
 * `stackPoses` clamps with, so the two can never disagree about which window a scroll means.
 */
export function scrollToShow(ids: readonly string[], id: string, scroll: number): number {
  const i = ids.indexOf(id);
  if (i < 0) return scroll; // nothing to bring into view — no opinion about the window
  const start = clampScroll(ids.length, scroll);
  if (i < start) return i;
  if (i >= start + VISIBLE_PLANES) return clampScroll(ids.length, i - VISIBLE_PLANES + 1);
  return scroll; // already on screen under the window this scroll means
}
