// A SWIPE ON A HISTORY CARD (user, 2026-10-09: "swipe the chart cards up/down — if swiped it moves
// from/to the back of the stack; swipe left/right changes what the chart displays"; 2026-10-18:
// up/down "should rotate through the whole stack"; 2026-10-24: "all the way to the back of the
// stack, right?"). Pure: the recogniser takes a gesture's travel and time and names a direction;
// the intent maps a direction onto the deck's ROTATION (a view setting, like the scroll) or the
// view's other setting (the measure) — never onto a selection.
//
// A FLICK, NEVER A DRAG. A vertical swipe on a card once stepped the measure and was removed the
// day a drag on a card became a gesture of its own (the orbit then, the brush now — TrendStack's
// `onPointerMove`). This one survives because it is a different gesture: fast and short, along one
// axis, while a brush is a slow travel the finger follows. The caller also says which axes a
// surface has free (`horizontal: false` on the plot, whose horizontal drag IS the brush).
//
// TOUCH ONLY, by the caller: a mouse has the click, the keys and the brush (the Engine's own
// `pointerType` idiom for the double-tap zoom).

export type SwipeDir = "up" | "down" | "left" | "right";

/** The travel along the dominant axis that makes a flick, in CSS px. */
export const SWIPE_MIN_PX = 40;
/** The press-to-release time past which a travel is a drag, not a flick. */
export const SWIPE_MAX_MS = 500;

/** The direction of a flick from its travel (`dx`, `dy` in px, screen axes — y grows downward)
 *  and its duration — or null for anything that is not one: too short, too slow, or diagonal (the
 *  other axis past half the dominant travel). `horizontal: false` declines the horizontal pair. */
export function swipeOf(dx: number, dy: number, ms: number, opts: { horizontal?: boolean } = {}): SwipeDir | null {
  if (ms > SWIPE_MAX_MS) return null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay >= ax) {
    if (ay < SWIPE_MIN_PX || ax > ay / 2) return null;
    return dy > 0 ? "down" : "up";
  }
  if (opts.horizontal === false) return null;
  if (ax < SWIPE_MIN_PX || ay > ax / 2) return null;
  return dx > 0 ? "right" : "left";
}

export type SwipeIntent = { kind: "rotate"; step: 1 | -1 } | { kind: "measure"; step: 1 | -1 };

/** WHAT A SWIPE ASKS FOR. Up and down TURN THE DECK (`trendStack.rotateOrder`, the store's
 *  `trendRotation`) whatever card the finger was on — the gesture is the deck's, not a card's:
 *  up sends the front card all the way to the back and the next comes forward, down brings the
 *  back card to the front (user, 2026-10-24: the walk it replaced focused the next card, and the
 *  focus re-deal slid the old front back one slot — "counterintuitive"). Left is the next
 *  measure, right the previous — the ↑/↓ keys' own steps, so the ends stop rather than wrap. */
export function swipeIntent(dir: SwipeDir): SwipeIntent {
  switch (dir) {
    case "up": return { kind: "rotate", step: 1 };
    case "down": return { kind: "rotate", step: -1 };
    case "left": return { kind: "measure", step: 1 };
    case "right": return { kind: "measure", step: -1 };
  }
}
