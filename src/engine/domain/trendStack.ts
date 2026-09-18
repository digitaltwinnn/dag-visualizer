// The trend stack's pose math — the whole spatial grammar as pure data. Depth reads as network:
// each chart plane is a network's history, receding into −Z the further it sits from the front,
// and the front is either the roster's own order (busiest first, decided upstream) or whichever
// plane the caller has focused. This module produces poses only — a later task (the projector)
// reads them through the camera and writes CSS transforms; framing math (rule 6) reads THESE
// poses, never a rendered transform.
//
// World frame: the view's resting camera is `FOCI.trend` in `domain/cameraRig.ts` — pos
// (0, 6, 54), target (0, 2, -18), looking down −Z. So NEARER = LARGER z, and the stack's five
// visible slots span z = 0 … −(VISIBLE_PLANES − 1) × PLANE_GAP, centred on the target's z.
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

/** The planes' resting height — the camera target's own y, so the stack sits centred in view. */
export const PLANE_Y = 2;

/** Per-slot-index falloff: how much `scale` drops for each step back into the stack. */
export const SCALE_FALLOFF = 0.03;

/** Per-slot-index falloff: how much `opacity` drops for each step back into the stack. */
export const OPACITY_FALLOFF = 0.16;

/** How far in FRONT of slot 0 a focused plane is lifted — half the inter-plane gap, so it clears
 *  the rest of the stack without leaving its own depth register. */
export const FOCUS_LIFT = PLANE_GAP / 2;

type Layout = "stack" | "flat";

interface StackOpts {
  layout: Layout;
  scroll: number;
  focus: string | null;
}

/** Clamp `scroll` to the roster's own end and floor it to an integer slot — a fractional scroll
 *  is a later concern. */
function clampScroll(count: number, scroll: number): number {
  const max = Math.max(0, count - VISIBLE_PLANES);
  return Math.min(max, Math.max(0, Math.floor(scroll)));
}

/**
 * The visible window's poses, ordered by slot (nearest first, which is also roster order within
 * the window). `stack` recedes in depth with monotonic scale/opacity falloff; `flat` collapses
 * every visible plane to one depth at full scale and opacity.
 *
 * A `focus` naming a plane inside the window lifts that one plane to `FOCUS_LIFT` (stack) or
 * leaves it at `z = 0` (flat) at full scale/opacity and marks it the sole interactive plane; its
 * neighbours keep exactly the slot position, scale and opacity they would have had with no focus
 * — the lift does not close the gap it leaves. A focus naming a plane OUTSIDE the window lifts
 * nothing (a later task scrolls it into view first), and interactivity falls back to the
 * no-focus rule. With no focus at all, only slot 0 is interactive.
 */
export function stackPoses(ids: readonly string[], opts: StackOpts): PlanePose[] {
  const { layout, scroll, focus } = opts;
  const start = clampScroll(ids.length, scroll);
  const visible = ids.slice(start, start + VISIBLE_PLANES);
  const focusInWindow = focus !== null && visible.includes(focus);

  return visible.map((id, i) => {
    const isFocused = focusInWindow && id === focus;
    const z = layout === "flat" ? 0 : isFocused ? FOCUS_LIFT : -i * PLANE_GAP;
    const scale = isFocused || layout === "flat" ? 1 : 1 - SCALE_FALLOFF * i;
    const opacity = isFocused || layout === "flat" ? 1 : 1 - OPACITY_FALLOFF * i;
    const interactive = focusInWindow ? isFocused : i === 0;
    return { id, x: 0, y: PLANE_Y, z, scale, opacity, interactive };
  });
}

/**
 * The z the camera frames: the focused plane's own depth when `focus` names a plane in the
 * roster, else slot 0's resting depth (`0`). Takes no scroll or layout — the camera frames the
 * front of the stack either way, and a plane outside the current window is a scroll concern, not
 * a framing one.
 */
export function focusDepth(ids: readonly string[], focus: string | null): number {
  return focus !== null && ids.includes(focus) ? FOCUS_LIFT : 0;
}
