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
// So a receding slot steps UP as well as back: `PLANE_STEP_Y` per slot, centred on the visible
// COUNT so the block sits mid-canvas whether it holds five planes or two. It stepped RIGHT too
// (`PLANE_STEP_X`, 3) until 2026-09-28: once the vertical step was cut to the header strip alone
// the across-step no longer cleared anything, and the user read it as the deck sitting off to the
// right of the chart ("keep it centred, no?") — so the deck stacks straight up at every tier, the
// way the narrow tiers already did, and the constant stands at 0 with its plumbing intact.
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

/** THE STAGGER, across — ZERO since 2026-09-28 (user: "keep it centred"): the deck stacks straight
 *  up behind the front chart at every tier. It was 3, then 2.4, while the across-step helped clear
 *  each header; with the vertical step sized to the header alone it cleared nothing and read as a
 *  sideways drift. The constant and `stepX` stay so the poses and the ground still share one
 *  number, and a non-zero value re-opens the look in one edit. */
export const PLANE_STEP_X = 0;

/** THE STAGGER ACROSS, PER TIER. On a NARROW canvas (tablet, phone — `breakpointOf` below the
 *  desktop tier) the across-step is ZERO regardless of the constant: the front card is fitted to
 *  the canvas width there (`fitDistance`), so any across-stagger would push a rear header's right
 *  end — its reading — off the edge (user, 2026-09-26: "the front card should take more width on
 *  tablet/phone"). Desktop reads `PLANE_STEP_X`, which is 0 too since 2026-09-28 (its note). */
export function stepX(narrow: boolean): number {
  return narrow ? 0 : PLANE_STEP_X;
}

/** THE STAGGER, up. Each slot further back sits this much HIGHER — the larger of the two steps,
 *  because a header strip is wide and short: vertical clearance is what actually uncovers it.
 *  Sized to uncover the HEADER ALONE (user, 2026-09-28: "closer to each other so that only the
 *  headers are (partially) shown and readable" — it was 5.4, which also showed the peak line and
 *  the top of each rear plot): the rear planes are an index of the roster (name, hue, latest
 *  reading), and every unit spent showing more of a rear card is a unit the front chart is pushed
 *  away from the centre of the view. Measured at the desktop pose, 4.3 leaves the front gap at
 *  about a header's height and the rearmost headers clipped by a few pixels, which is the
 *  "partially" the user asked for. */
export const PLANE_STEP_Y = 4.3;

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

/** How fast the stack TRAVELS to a new arrangement, in e-folds per second (`1 − e^(−k·dt)`, so the
 *  same gesture takes the same wall-clock time at 12fps and at 120). A focus or paging change is
 *  a spatial claim about which network is in front, and a jump reads as a redraw rather than a
 *  movement. ONE number for the cards (`TrendStackSync`) and the floor under them
 *  (`scene/views/TrendsView`): two rates would slide a rung out from under its own card for the
 *  length of every move. */
export const STACK_EASE_K = 8;

/** How many planes the visible window holds for a roster of `total` — the count `stackPoses`
 *  returns, stated without building the poses. The ground (`scene/views/TrendsView`) draws one
 *  rung per plane that is actually there, and centres them on `staggerCentre` of this number, so
 *  the floor and the stack can never disagree about how many cards stand on it. */
export function windowCount(total: number): number {
  return Math.max(0, Math.min(VISIBLE_PLANES, total));
}

/** The screen-space shift a window of `count` planes takes, given where the gap between the rails
 *  is centred (`gatherLayout.railGapShiftPx`). Only a plane that stands ALONE takes it: one card
 *  has no stack to compose it, so the gap's centre is the only centre it has, while a window of
 *  two or more is composed by its stagger, which already lands the front card mid-gap. ONE home,
 *  read by the projector (the card) and the Engine (the rung under it). */
export function loneShiftPx(count: number, gapShiftPx: number): number {
  return count === 1 ? gapShiftPx : 0;
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

/** A PLANE'S FORMAT — everything about a card that follows from how wide it is AUTHORED. */
export interface PlaneFormat {
  /** CSS width at scale 1 (the element's own width; the projector divides by it). */
  pxW: number;
  /** The chart's plot height in CSS px (`TrendChart`'s `plotHeight`). */
  plotPxH: number;
  /** The card's nominal CSS height at scale 1. */
  pxH: number;
  /** The card's height in world units. */
  worldH: number;
  /** The up-stagger per slot, in world units — sized to uncover a rear card's HEADER STRIP. */
  stepY: number;
}

/** The format every tier wore until 2026-10-03, and still the desktop and tablet one — the
 *  constants above, gathered. */
const WIDE_FORMAT: PlaneFormat = {
  pxW: PLANE_PX_W,
  plotPxH: PLANE_PLOT_PX_H,
  pxH: PLANE_PX_H,
  worldH: PLANE_WORLD_H,
  stepY: PLANE_STEP_Y,
};

/** THE PHONE'S AUTHORED WIDTH. The front card is fitted to `PLANE_FIT` of the canvas at every tier
 *  (`fitDistance`), so its ON-SCREEN width is decided; what the authored width decides is the CSS
 *  SCALE the card is drawn at, and with it the size of every glyph on it. A 640px card fitted to a
 *  390px phone runs at 0.56 — measured 2026-10-03, its 12px type rendered at 6.7px (user: "tiny
 *  text"). Authored at about the width a phone gives it, the card runs at ~1 and the type is the
 *  type. */
const PHONE_PX_W = 360;
/** The phone plot. Shorter than the wide one in CSS px but far taller on screen (170 at scale ~1
 *  against 210 at 0.56): a portrait canvas has the height, and the 1.5:1 card uses it. */
const PHONE_PLOT_PX_H = 170;

/** ⚠️ THE STEP FOLLOWS THE WIDTH. A header strip is a fixed number of CSS px, so on a card authored
 *  narrower the same strip is a LARGER share of the card's world width — the up-stagger that
 *  uncovers it has to grow by the same ratio, or the rear headers (the roster's index) sink behind
 *  the card in front. Derived, so a re-tune of either width keeps the headers showing. */
const PHONE_FORMAT: PlaneFormat = {
  pxW: PHONE_PX_W,
  plotPxH: PHONE_PLOT_PX_H,
  pxH: PHONE_PLOT_PX_H + PLANE_CHROME_PX_H,
  worldH: (PLANE_WORLD_W * (PHONE_PLOT_PX_H + PLANE_CHROME_PX_H)) / PHONE_PX_W,
  stepY: (PLANE_STEP_Y * PLANE_PX_W) / PHONE_PX_W,
};

/** The card's format for a canvas tier — the ONE home. Four readers: the component (the element's
 *  size and its plot), the projector (the scale it divides by), the poses (the up-stagger) and the
 *  ground (the drop under the front card). Two stable objects, so a caller may compare by
 *  reference. `phone` is `breakpointOf(...) === "phone"`; the tablet keeps the wide format because
 *  a 644px-plus card already runs at scale 1 or more there. */
export function planeFormat(phone: boolean): PlaneFormat {
  return phone ? PHONE_FORMAT : WIDE_FORMAT;
}

/** THE FRONT CARD'S SHARE OF THE FREE BAND — the fraction of the canvas width between the rails
 *  (the whole width where the rails are sheets) the front card spans at rest. Measured off the
 *  desktop pose the user tuned by eye (2026-09-19, "larger"): 798px of the 864px gap at 1500×1000,
 *  0.924. Stating it makes every tier the same rule — tablet stood at 0.72 and phone at 0.99 with
 *  the card's left edge 11px off the canvas, because the global aspect lever is a √ compromise for
 *  3D volumes and a card has an exact pixel width (user, 2026-09-26). */
export const PLANE_FIT = 0.92;

/** The camera DISTANCE (along the view axis, to the front card's depth) at which the front card
 *  spans `PLANE_FIT` of `freeWidthPx`. The projector's own expression, inverted: a card
 *  `PLANE_WORLD_W` wide at view depth d is `PLANE_WORLD_W × pxPerUnitAt1 / d` px wide, with
 *  `pxPerUnitAt1 = viewH / (2·tan(fov/2))`. Pure — the Engine hands in the live numbers. This is
 *  the History pose's ONE lever: it replaces `dollyBack`, `railsLean` and `aspectFit` for that
 *  pose (the rails' gap and the aspect are its inputs; the global zoom is folded into `PLANE_FIT`),
 *  because those three scale a pose tuned for a 3D volume and this subject is a DOM card whose
 *  width is a known number. */
export function fitDistance(freeWidthPx: number, viewHeightPx: number, fovDeg: number, phone = false): number {
  const pxPerUnitAt1 = Math.max(1, viewHeightPx) / (2 * Math.tan((fovDeg * Math.PI) / 360));
  const byWidth = (PLANE_WORLD_W * pxPerUnitAt1) / (PLANE_FIT * Math.max(1, freeWidthPx));
  // The card's own height for this tier — the phone card is squarer (`planeFormat`).
  const byHeight = (planeFormat(phone).worldH * pxPerUnitAt1) / (CARD_FIT_H * Math.max(1, viewHeightPx));
  return Math.max(byWidth, byHeight);
}

/** The FRONT CARD's share of the canvas HEIGHT the width fit may not exceed. A short, wide window
 *  (a 1028×606 desktop with the rails hidden, seen live 2026-09-26) fits a card wider than the
 *  canvas is tall, so the camera stands at whichever is further: the width fit or this. Measured at
 *  the tuned desktop pose (1500×1000): the front card spans 0.34 of the height there, so the cap is
 *  inert on the pose the user tuned and only bites on a shorter window. The FRONT card, not the
 *  deck: the rear cards project smaller than their world rise says, and a cap on the deck's world
 *  height fired on the desktop pose it was meant to leave alone. */
export const CARD_FIT_H = 0.36;

/** WHERE A LONE CARD ARRIVES FROM (user, 2026-09-26: "trend view has no animation when we swipe
 *  the details card left/right — it should be the filter animation, consistent across views").
 *  A filter commit scopes the stack to ONE card, and the History pose is the same for every
 *  network, so the camera has nothing to fly and the card simply appeared. Every other view
 *  answers a filter commit with the structure (the hub flies up, the globe turns, the chamber
 *  tilts); here the structure's own gesture is the RE-DEAL, a card coming forward — so a card
 *  that arrives alone starts one slot BACK, at that slot's scale, and eases to the front. Only a
 *  lone card: a five-card roster refresh starting every card a slot back would be an entrance the
 *  data never asked for (the projector's own first-seen rule). */
export function arrivalPose(p: Pick<PlanePose, "z" | "scale">): { z: number; scale: number } {
  return { z: p.z - PLANE_GAP, scale: p.scale * (1 - SCALE_FALLOFF) };
}

/** How far the CAMERA closes on the stack while a plane is focused (`focusDepth`, scaled by
 *  `cameraRig.TREND_FOCUS_PUSH`). It was the focused plane's own lift in front of slot 0 until a
 *  focus became a RE-DEAL (user, 2026-09-19) — the focused card takes first place, so there is no
 *  plane out in front any more; what is left is the camera's small lean, which is how a focus
 *  commit is acknowledged when the clicked card already IS the front one. */
export const FOCUS_LEAN = PLANE_GAP / 2;

interface StackOpts {
  scroll: number;
  focus: string | null;
  /** A narrow canvas (below the desktop tier): the across-stagger is zero — see `stepX`. */
  narrow?: boolean;
  /** The phone tier: the card wears the phone format, whose up-stagger is larger (`planeFormat`). */
  phone?: boolean;
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
  const { scroll, focus, narrow = false, phone = false } = opts;
  const sx = stepX(narrow);
  const sy = planeFormat(phone).stepY;
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
      x: (slot - c) * sx,
      y: PLANE_Y + (slot - c) * sy,
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

/** The id the HINT plane wears — never a network's (those are DAG addresses). */
export const MORE_ID = "more";

/** How many networks the window leaves off the stage, at this scroll. */
export function moreCount(ids: readonly string[], scroll: number): number {
  const start = clampScroll(ids.length, scroll);
  return Math.max(0, ids.length - (start + VISIBLE_PLANES));
}

/**
 * THE SIXTH, UNNAMED PLANE (user, 2026-09-28: "if there are more, maybe add a 6th unnamed to
 * hint there are more"). The window is a DEPTH BUDGET — a scene decision, five cards receding —
 * and once the explorer stopped paging (its rows drive the stage now) nothing in the view said
 * that a roster of eleven had six more behind the deck. This pose is that statement: one more
 * card at the slot behind the last visible one, at the stack's own falloff so it reads as the
 * deck continuing, carrying no network and never interactive — the rows are the one route onto
 * the stage. `null` whenever the roster fits, so a short roster shows no ghost at all.
 *
 * Kept OUT of `stackPoses` on purpose: that function is the window's poses, read by the camera's
 * `focusDepth` and by every test that says "five"; the hint is a sixth thing both consumers
 * (the planes and the projector) append. It sits at slot `visible.length` against the SAME
 * stagger centre the window uses, so the deck does not shift when the hint appears — it simply
 * has one more card behind it. A focus re-deal moves the window's cards among slots 0…n−1 and
 * leaves this one where it is.
 */
export function morePose(ids: readonly string[], opts: StackOpts): PlanePose | null {
  if (moreCount(ids, opts.scroll) === 0) return null;
  const n = windowCount(ids.length);
  const c = staggerCentre(n);
  const sx = stepX(opts.narrow ?? false);
  const sy = planeFormat(opts.phone ?? false).stepY;
  const slot = n;
  return {
    id: MORE_ID,
    x: (slot - c) * sx,
    y: PLANE_Y + (slot - c) * sy,
    z: -slot * PLANE_GAP,
    scale: 1 - SCALE_FALLOFF * slot,
    opacity: 1 - OPACITY_FALLOFF * slot,
    interactive: false,
  };
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
  // ⚠️ A FOCUS THAT JOINS THE ROSTER WITH THIS PUBLISH IS SHOWN (whole-branch review, 2026-10-03).
  // History's DAG plane is not in the resting deck: it joins at the front when its row is
  // picked, a publish AFTER the executor's own `scrollToShow` — which ran against a roster that
  // did not hold it yet and so had no opinion. With the window paged down, the plane joined at
  // index 0, out of sight: the row washed as selected and no chart came forward. "Was it on
  // screen before" cannot be asked of a plane that did not exist before; it has just been asked
  // for. An EMPTY previous roster is a view arriving, not a plane joining, and keeps the scroll.
  if (prev.length > 0 && !prev.includes(focus)) return scrollToShow(next, focus, scroll);
  if (!focusInWindow(prev, scroll, focus)) return scroll;
  return scrollToShow(next, focus, scroll);
}

/** THE NETWORK HISTORY'S METAGRAPH CARD STANDS ON (user, 2026-10-07 — "if we click a network in
 *  explorer, should we set the metagraph card accordingly? (not the global filter though)"): the
 *  plane brought forward, else the filter, else THE PLANE IN FRONT (user, 2026-10-08: "always one
 *  card sits in the front and when that changes it also populates that card"). Snapshots'
 *  tick-local network is the precedent (`tickNet.ledgerNetwork`): a view-local pick names the
 *  card without writing the top bar. `front` is `frontPlane()` — null while the stack is not
 *  mounted, which leaves the card its ghost. */
export function cardNetwork(filter: string, focus: string | null, front: string | null = null): string {
  return focus ?? (filter !== "all" ? filter : (front ?? filter));
}

/** THE PLANE IN FRONT with no focus re-deal: the first slot of the window the scroll shows
 *  (`stackPoses`' own arithmetic — slot 0 is `ids[clampScroll(…)]`). Null for an empty roster. */
export function frontPlane(ids: readonly string[], scroll: number): string | null {
  return ids.length ? (ids[clampScroll(ids.length, scroll)] ?? null) : null;
}

/** THE PLANE A CHAIN BELONGS TO — the id History keys a plane by. A snapshot's `metaId` is a chain
 *  address: a catalog network's current id, one of its FORMER ids (a retired chain, re-registered
 *  since), or an uncataloged channel's address. The plane is the network's current id for the first
 *  two and the unlisted set for the third — the same fold the roster applies when it draws them. The
 *  catalog is a parameter so this stays pure. */
export function planeOfChain(
  chainId: string,
  catalog: readonly { id: string; formerIds?: readonly string[] }[],
  unlistedId: string,
): string {
  return catalog.find((m) => m.id === chainId || m.formerIds?.includes(chainId))?.id ?? unlistedId;
}

/** THE FOCUS HISTORY RETURNS TO when the raw layer a door opened is closed (2026-10-09 — user, on
 *  selecting a BioFi snapshot in the log after a Range door: "the selected metagraph might still be
 *  'pinned', as in selected and become the front card"). One selection, every surface: a commit in
 *  the log is the app's commit, and History shows a committed NETWORK as the plane in front. So the
 *  snapshot committed in the log (its tick-network failing that) brings its network's plane forward
 *  on return; with nothing committed there, the plane that was in front when the door opened comes
 *  back, as before. The chain → plane fold is `planeOfChain`'s. */
export function focusOnReturn(
  committedChain: string | null,
  saved: string | null,
  planeOf: (chainId: string) => string,
): string | null {
  return committedChain != null ? planeOf(committedChain) : saved;
}
