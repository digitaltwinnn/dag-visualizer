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
// ⚠️ A FOCUS THE WINDOW DOES NOT HOLD MOVES NOTHING (2026-09-19).
// `focusInWindow` is the ONE predicate both halves of this module read: a focus paged, re-ranked
// or re-filtered out of the visible window re-deals nothing, so `focusDepth` answers 0 and the
// camera leans back out. Two copies of "is it on screen" is exactly how the camera came to lean
// over a structure that had not moved.
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

/** World-unit depth between adjacent slots. */
export const PLANE_GAP = 9;

/** The stack's resting height — the centre the slot stagger is measured from. */
export const PLANE_Y = 2;

/** Per-slot-index falloff: how much `scale` drops for each step back into the stack. */
export const SCALE_FALLOFF = 0.03;

/** Per-slot-index falloff: how much `opacity` drops for each step back into the stack.
 *
 *  ⚠️ ZERO — EVERY PLANE IS AN OPAQUE CARD (user, 2026-09-19: "remove the transparency of the trend
 *  cards"). It was 0.16 while the planes were translucent sheets, where a fading rear plane was the
 *  depth cue; on an opaque deck a faded card is just a see-through one, and occlusion, the stagger
 *  and `SCALE_FALLOFF` carry the depth instead. Kept as a named coefficient rather than deleted so
 *  the pose still STATES its opacity (the component reads it, never assumes it) and the look can be
 *  re-opened with one number. */
export const OPACITY_FALLOFF = 0;

/** THE STAGGER, across. Each slot further back sits this much further RIGHT, so its header strip
 *  clears the plane in front of it. See the header: a covered header is a missing plane. */
export const PLANE_STEP_X = 3;

/** THE STAGGER, up. Each slot further back sits this much HIGHER — the larger of the two steps,
 *  because a header strip is wide and short: vertical clearance is what actually uncovers it.
 *  Sized to uncover the HEADER and the peak line under it, not the plot: the rear planes are an
 *  index of the roster (name, hue, latest reading), and every unit spent showing more of a rear
 *  plot is a unit the front chart is pushed away from the centre of the view. */
export const PLANE_STEP_Y = 5.4;

/** WHERE ALONG THE RUN OF SLOTS THE STAGGER IS CENTRED (user, 2026-09-19: "make the front chart
 *  more at the view center and larger"). `1` centres the BLOCK — the mean of the visible slots sits
 *  on the pose origin — which is what the first staggered build did, and it parked the front plane
 *  two whole steps down-and-left of centre: the one chart being read sat in the canvas's bottom-left
 *  while the view's centre was spent on the faint third plane. `0` would put the FRONT plane dead on
 *  the origin and hang the whole index off the top-right. The front plane is the subject and the
 *  planes behind it are its context, so the anchor sits close to the front: the subject lands near
 *  the view's centre and the index still fits above it. */
export const STAGGER_ANCHOR = 0.35;

/** The stagger's centre for a window of `n` planes, in SLOT units — the ONE home for it. Both the
 *  poses and the ground (`scene/views/TrendsView`) read this; two copies is how a floor ends up
 *  drawn under a stack that has since moved. Scaled by the visible count, so a two-plane window
 *  keeps the same proportions as a five-plane one. */
export function staggerCentre(n: number): number {
  return ((Math.max(1, n) - 1) / 2) * STAGGER_ANCHOR;
}

/** THE PLANE'S WIDTH IN WORLD UNITS — the one number that ties this pose math to the DOM the
 *  projector scales. The plane's content is `PLANE_PX_W` CSS px wide at scale 1, so the projector
 *  resolves a slot's scale as `PLANE_WORLD_W × pxPerUnit / PLANE_PX_W`: state the plane's size
 *  where the rest of the spatial grammar lives, and the browser number becomes a conversion rather
 *  than a second opinion about how big a plane is. Sized so the front plane fills most of the FREE
 *  canvas between the rails at the resting pose (user, 2026-09-19: "larger"). */
export const PLANE_WORLD_W = 58;

/** The plane's CSS width at scale 1 — READ BY BOTH SIDES (`components/TrendStack.tsx` sets it on
 *  the element; the projector divides by it). A local literal in either place is a silent drift:
 *  the planes would simply render at the wrong size, with nothing failing.
 *
 *  ⚠️ DELIBERATELY NARROWER THAN THE PLANE DRAWS (user, 2026-09-19: "larger"). The chart's HEIGHT
 *  is a fixed CSS number (a head strip over a 138px plot), so widening the authored plane only ever
 *  made a longer, flatter strip. Authoring it narrower than its on-screen width puts the front
 *  plane's CSS scale at ~1.3, and the whole chart grows with it — plot height, line weight and type
 *  together — which is what "larger" means to a reader. The browser re-rasters a transformed layer
 *  at its settled scale, so the text stays crisp at rest. */
export const PLANE_PX_W = 640;

/** THE CARD'S PLOT HEIGHT in CSS px — passed to `TrendChart` as `plotHeight` by
 *  `components/TrendStack.tsx` (user, 2026-09-19: the cards read as "quite horizontal / long, give
 *  them some more height"). The document's small-multiples keep the chart's own short default; a
 *  card in the stack is one chart read on its own, so it gets a plot with room in it — about 2.3:1
 *  for the whole card, against the 3.4:1 strip it was. Stated HERE, beside the width, because the
 *  card's height is what the ground's drop is derived from. */
export const PLANE_PLOT_PX_H = 210;

/** Everything in a card that is NOT plot: the card's padding and hairline, `TrendChart`'s head
 *  strip and its axis strip (measured 2026-09-19: a 120px plot made a 186px card). */
const PLANE_CHROME_PX_H = 66;

/** The plane's NOMINAL CSS height at scale 1. A browser number rather than a layout one — the
 *  plane is content-height — but the ground has to clear the card's bottom edge, and deriving it
 *  from the same place as the width is what keeps a re-tune of either from driving the floor
 *  through a plot. */
export const PLANE_PX_H = PLANE_PLOT_PX_H + PLANE_CHROME_PX_H;

/** The plane's height in world units, from the two numbers above and its world width. */
export const PLANE_WORLD_H = (PLANE_WORLD_W * PLANE_PX_H) / PLANE_PX_W;

/** How far the CAMERA closes on the stack while a plane is focused (`focusDepth`, scaled by
 *  `cameraRig.TREND_FOCUS_PUSH`). It was the focused plane's own lift in front of slot 0 until a
 *  focus became a RE-DEAL (user, 2026-09-19) — the focused card takes first place, so there is no
 *  plane out in front any more; what is left is the camera's small lean, which is how a focus
 *  commit is acknowledged when the clicked card already IS the front one. */
export const FOCUS_LEAN = PLANE_GAP / 2;

interface StackOpts {
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

/** Is `focus` one of the planes the window currently holds?
 *
 *  ⚠️ ONE PREDICATE, TWO READERS (2026-09-19). `stackPoses` lifts a focused plane only while it is
 *  in the window, and `focusDepth` tells the camera how far it came forward — so the two have to
 *  answer "is it on screen" the same way or the camera leans toward a plane that did not move.
 *  `focusDepth` used to skip the question entirely, on the assumption that the click executor
 *  always pages a focus INTO view; it does, but the PAGER, a metric switch and a poll re-rank all
 *  move a standing focus back out afterwards, and the lean then stood over a stack that had not moved
 *  (camera principle 2 inverted).
 *
 *  Clamps with the module's own `clampScroll`, so it can never disagree with the window the poses
 *  are cut from. */
export function focusInWindow(ids: readonly string[], scroll: number, focus: string | null): boolean {
  if (focus === null) return false;
  const start = clampScroll(ids.length, scroll);
  const end = Math.min(ids.length, start + VISIBLE_PLANES);
  for (let i = start; i < end; i++) if (ids[i] === focus) return true;
  return false;
}

/**
 * The visible window's poses, ordered by slot (nearest first, which is also roster order within
 * the window).
 *
 * The stack recedes in depth with monotonic scale/opacity falloff AND a per-slot stagger up and to
 * the right (see the header — the stagger is what keeps every header strip visible). The stagger
 * is centred on the visible COUNT, `(i − (n−1)/2)`, so a window holding two planes sits in the
 * middle of the canvas exactly as a window holding five does.
 *
 * A `focus` naming a plane inside the window RE-DEALS the stack: that plane takes slot 0, the
 * planes that were ahead of it each step back one slot to close the gap, and the planes behind it
 * do not move. The front slot is the interactive one, focused or not. A focus naming a plane
 * OUTSIDE the window moves nothing — the ONE EXECUTOR pages it into the window first, which is why
 * a plane focus goes through the click table rather than straight to its setter.
 */
export function stackPoses(ids: readonly string[], opts: StackOpts): PlanePose[] {
  const { scroll, focus } = opts;
  const start = clampScroll(ids.length, scroll);
  const visible = ids.slice(start, start + VISIBLE_PLANES);
  // The shared predicate, never a local `visible.includes` — `focusDepth` reads the same answer,
  // and that agreement IS the fix for the stranded lean (see `focusInWindow`).
  const lifted = focusInWindow(ids, scroll, focus);
  // The stagger's centre, anchored toward the front plane (`STAGGER_ANCHOR`). Read from the
  // VISIBLE count, never VISIBLE_PLANES: a short roster (a committed filter, a small network set)
  // would otherwise hang off to one side of the canvas.
  const c = staggerCentre(visible.length);

  // A FOCUS RE-DEALS THE DECK (user, 2026-09-19: "it should take the 1st place and the other cards
  // should slide back so that it fills the empty place left behind"). The focused card takes slot
  // 0; every card that was AHEAD of it steps back one slot, closing the gap it left; the cards
  // behind it do not move. It first LIFTED in front of the stack while its neighbours held their
  // slots — which left a hole where it had been and a sixth position hovering over the front card,
  // so the stack read as a deck with one card pulled half out. Re-dealt, the focused network is
  // simply the one being read, in the place the view reads from.
  const f = lifted ? visible.indexOf(focus as string) : -1;
  const slotOf = (i: number): number => (f < 0 ? i : i === f ? 0 : i < f ? i + 1 : i);

  const poses = visible.map((id, i): PlanePose => {
    const slot = slotOf(i);
    return {
      id,
      x: (slot - c) * PLANE_STEP_X,
      y: PLANE_Y + (slot - c) * PLANE_STEP_Y,
      z: -slot * PLANE_GAP,
      scale: 1 - SCALE_FALLOFF * slot,
      opacity: 1 - OPACITY_FALLOFF * slot,
      // The front card is the one being read, focused or not — and it is the only one whose body
      // nothing covers, so it is the only one a body click cannot be ambiguous about.
      interactive: slot === 0,
    };
  });
  // Ordered by SLOT, nearest first — the contract every consumer reads the array by.
  return poses.sort((p, q) => q.z - p.z);
}

/**
 * How far the camera leans in: `FOCUS_LEAN` while a focus has actually RE-DEALT the stack, else
 * `0`. It takes every input the re-deal takes — the roster, the focus and the SCROLL — because the
 * whole contract is that the camera only ever answers a structure that moved (camera principle 2):
 *
 * ⚠️ A FOCUS OUTSIDE THE VISIBLE WINDOW MOVES NOTHING (2026-09-19). It used to ignore the
 * SCROLL on the argument that a plane outside the window "is a scroll concern, not a framing one"
 * — true only while something always pages the focus back in. The rail's PAGER, a metric change
 * and a poll re-rank each strand a standing focus off-window, where `stackPoses` moves nothing;
 *  the lean then stood over an unmoved stack. `focusInWindow`
 * is the one predicate both halves read, so the two can no longer disagree.
 *
 * The answer lives HERE rather than in the Engine, because this module is where the stack's spatial grammar is stated: the camera reads the geometry, it does not
 * re-derive it.
 */
export function focusDepth(
  ids: readonly string[],
  focus: string | null,
  scroll: number,
): number {
  return focusInWindow(ids, scroll, focus) ? FOCUS_LEAN : 0;
}

/**
 * The scroll that brings `id` into the visible window, moving as little as possible.
 *
 * A plane click focuses whatever it names, and `stackPoses` deliberately moves NOTHING for a focus
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

/**
 * The scroll that KEEPS a standing focus on screen when the roster re-orders under it (user,
 * 2026-09-19: "keep front row if user selected it"). A measure step or a poll re-ranks the stack
 * busiest-first; a card the reader put in front is the one thing that ranking may not take away,
 * so where the new order would drop it out of the visible window the window follows the card — and
 * `stackPoses` then re-deals it to first place as before. Inside the window nothing is needed: the
 * re-deal already holds it at slot 0 whatever its rank.
 *
 * ⚠️ ONLY A FOCUS THAT WAS ON SCREEN IS KEPT. A reader who paged away from their focus chose the
 * window over the card, and a re-rank is not a reason to drag them back; `prev` is what says which
 * of the two it was. An unchanged roster (`prev === next`, the by-reference publish) is no re-rank
 * at all, and everything `scrollToShow` declines — an id the new roster does not hold, a roster
 * still empty — this declines with it.
 */
export function scrollToKeep(
  prev: readonly string[],
  next: readonly string[],
  focus: string | null,
  scroll: number,
): number {
  if (focus === null || prev === next) return scroll;
  if (!focusInWindow(prev, scroll, focus)) return scroll;
  return scrollToShow(next, focus, scroll);
}
