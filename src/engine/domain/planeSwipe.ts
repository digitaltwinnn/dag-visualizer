// A SWIPE ON A HISTORY CARD (user, 2026-10-09: "swipe the chart cards up/down — if swiped it moves
// from/to the back of the stack; swipe left/right changes what the chart displays"; 2026-10-18:
// up/down "should rotate through the whole stack"). Pure: the recogniser takes a gesture's travel
// and time and names a direction; the intent maps a direction onto the stack's one selection (a
// plane focus, one step along the roster) or the view's one setting (the measure).
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

export type SwipeIntent = { kind: "forward"; id: string } | { kind: "measure"; step: 1 | -1 };

/** THE CARD A VERTICAL SWIPE BRINGS FORWARD — one step along the ROSTER'S order, wrapping at the
 *  ends, so repeated swipes walk the whole stack (user, 2026-10-18: "it just switches between the
 *  front card and the one behind it: it should rotate up or down through the whole stack"). The
 *  first cut stepped to "the card behind the front", which after a focus re-deal is always the
 *  rank-0 card — two cards toggling. The walk is along `order` (rank, the DAG plane first while
 *  it is the focus) from the FRONT: the focus while the window holds it, else the window's first
 *  card. Up sends the front back, so the NEXT card comes forward; down brings the PREVIOUS back.
 *  Null for a lone card. */
export function planeStep(order: readonly string[], front: string | null, dir: "up" | "down"): string | null {
  const n = order.length;
  if (n < 2) return null;
  const i = front ? order.indexOf(front) : 0;
  const j = (Math.max(0, i) + (dir === "up" ? 1 : n - 1)) % n;
  return order[j] ?? null;
}

/** WHAT A SWIPE ASKS FOR. Up and down walk the stack (`planeStep`) whatever card the finger was on —
 *  the gesture is the deck's, not a card's — and each step is the same focus a row click commits
 *  (never the card already in front, so the toggle in `trendPlaneActions` cannot fire). Left is
 *  the next measure, right the previous — the ↑/↓ keys' own steps, so the ends stop rather than
 *  wrap. `front` is the card in slot 0 as the STACK has it — the focus only while the window still
 *  holds it, else the window's first card. */
export function swipeIntent(dir: SwipeDir, deck: { order: readonly string[]; front: string | null }): SwipeIntent | null {
  switch (dir) {
    case "up":
    case "down": {
      const id = planeStep(deck.order, deck.front, dir);
      return id ? { kind: "forward", id } : null;
    }
    case "left": return { kind: "measure", step: 1 };
    case "right": return { kind: "measure", step: -1 };
  }
}
