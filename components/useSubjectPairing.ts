import { useEffect, useRef, type CSSProperties } from "react";

// The ONE shared "focus pairing" every rail card + explorer row uses, so a node, a snapshot, and a
// metagraph card all behave identically: a subject is "paired" when its key equals its store
// channel's current value (the same value the 3D object glows on); while paired it wears the
// `.subject-paired` class + exposes its identity hue as `--row-hue`; hovering it writes/clears the
// channel (glowing the 3D object back). No React state — a pure mapping over the passed-in value.
//
// `onFocus`/`onBlur` are the SAME two writers (2026-08-13): a hover previews the subject a click
// would commit (rule 9), and keyboard focus reaches every one of these rows — the preview must
// ride it too, or the whole scene↔HUD pairing language is mouse-only. One pair of functions, four
// event props, so focus and hover can never preview differently. (React's onFocus/onBlur bubble
// like focusin/focusout; on a wrapper whose children swap focus the channel is re-set to the same
// key, which the store dedupes.)
//
// `onMouseMove` is the SWAP-UNDER-POINTER healer (user, 2026-08-15 — "when a card is swiped, it
// loses the hover effect"): a pager step or a live follow advance replaces the KEYED element
// under a stationary cursor, and mouseenter only fires on boundary CROSSINGS — the new element
// never hears one, so the pairing stays dead until the pointer leaves and returns. The first
// pointer move over the element re-arms it; guarded on `active !== key`, so it writes once and
// every later move over an already-paired subject is a no-op, not a store write per pixel.
export function subjectPairing<T extends string | number>(
  active: T | null,
  key: T | null,
  set: (v: T | null) => void,
  hue: string,
): {
  paired: boolean;
  className: string;
  style: CSSProperties | undefined;
  onMouseEnter: () => void;
  onMouseMove: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
} {
  const paired = key != null && key === active;
  const enter = () => set(key);
  const leave = () => set(null);
  return {
    paired,
    className: paired ? "subject-paired" : "",
    style: paired ? ({ ["--row-hue"]: hue } as CSSProperties) : undefined,
    onMouseEnter: enter,
    onMouseMove: () => {
      if (active !== key) enter();
    },
    onMouseLeave: leave,
    onFocus: enter,
    onBlur: leave,
  };
}

/** THE UNMOUNT BACKSTOP for a pairing (2026-09-19) — the structural half of the stuck-hover class
 *  of bug that `ExplorerShell`'s `onLeave` answers at container scale.
 *
 *  A row clears its own hover on `mouseleave`, and that is enough while the row is still there to
 *  hear one. It is not: a subject can LEAVE THE RENDERED SET under a stationary pointer — a metric
 *  switch re-ranks the roster, the stack pages a plane out of its window, a filter commit cuts the
 *  list to one — and an element that has been removed never fires a leave. The channel then holds a
 *  subject nothing on screen is pointing at, and the scene keeps a preview lit until the next hover
 *  somewhere else.
 *
 *  Two effects, because there are two ways to disappear. The unkeyed one runs after every render and
 *  answers "the hovered subject is no longer in this surface's set". The mount-scoped one answers
 *  "this whole surface is going away while it holds the channel" — reading the LATEST values through
 *  a ref, since an empty-dep cleanup closes over the first render otherwise.
 *
 *  ⚠️ It only ever CLEARS, and only a value this surface could have set. Clearing a preview is
 *  always safe (a preview is not a commit, rule 9), and the worst case is that a hover drops one
 *  frame early on a surface that was unmounting anyway. */
export function useHoverRelease<T extends string | number>(
  active: T | null,
  present: readonly T[],
  clear: () => void,
): void {
  const live = useRef({ active, present, clear });
  live.current = { active, present, clear };
  useEffect(() => {
    if (active != null && !present.includes(active)) clear();
  });
  useEffect(
    () => () => {
      const now = live.current;
      if (now.active != null && now.present.includes(now.active)) now.clear();
    },
    [],
  );
}
