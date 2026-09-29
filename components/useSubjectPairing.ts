import { useCallback, useEffect, useRef, type CSSProperties } from "react";

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
// ⚠️ A TAP IS NOT A HOVER (user, 2026-09-29: on a large tablet a History explorer row, tapped,
// brought its chart forward and then stayed "selected/hovered"; a PC never showed it). A tap fires
// the browser's EMULATED mouseenter/mousemove and focuses the button, and nothing fires the
// matching mouseleave or blur until the next tap lands elsewhere — so the preview channel held
// the tapped subject indefinitely (convention 9: hovers preview, never commit). A phone rarely
// showed it because its dock closes on a commit and the unmount releases the channel.
// So the writers ask what the LAST REAL INPUT was, recorded from pointer events — which every
// modern browser (Safari included) dispatches BEFORE the compatibility mouse events — and from
// keydown: enter/move preview only for a MOUSE, focus previews for anything but a TAP (keyboard
// focus keeps the pairing language keyboard-reachable, and a mouse click's focus is the hover it
// already made). The clearing half always runs. Module state, not React state: it is a fact about
// the device's last gesture, shared by every surface.
type InputKind = "mouse" | "touch" | "keyboard";
let lastInput: InputKind = "mouse";
/** Record the last input — the browser listeners below call it; exported for the tests. */
export function noteInput(kind: InputKind): void {
  lastInput = kind;
}
if (typeof window !== "undefined") {
  const onPointer = (e: PointerEvent) => noteInput(e.pointerType === "mouse" ? "mouse" : "touch");
  const opts = { capture: true, passive: true } as const;
  window.addEventListener("pointerdown", onPointer, opts);
  window.addEventListener("pointermove", onPointer, opts);
  window.addEventListener("keydown", () => noteInput("keyboard"), opts);
}

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
  // See "A TAP IS NOT A HOVER" above: the writers gate on the last real input, the clears never do.
  const hover = () => {
    if (lastInput === "mouse") enter();
  };
  return {
    paired,
    className: paired ? "subject-paired" : "",
    style: paired ? ({ ["--row-hue"]: hue } as CSSProperties) : undefined,
    onMouseEnter: hover,
    onMouseMove: () => {
      if (active !== key) hover();
    },
    onMouseLeave: leave,
    onFocus: () => {
      if (lastInput !== "touch") enter();
    },
    onBlur: leave,
  };
}

/** Whether a surface should release the shared hover channel.
 *
 *  ⚠️ OWNERSHIP, NOT DOMAIN (2026-09-19, and the first cut got this exactly wrong). The channels
 *  this backstop guards are SHARED by design — `hoverFilter` alone is written by the top bar's
 *  filter strip over every catalog metagraph, by the History rails over the whole roster, and by
 *  the chart stack over only the handful of planes on screen. So "is this id in MY list" answers a
 *  question about the SUBJECT, and using it to decide a release answers it about the WRITER. Both
 *  failure modes are real and neither is visible in code review: a surface with the narrower domain
 *  wipes, on its very next render, a hover the pointer is still resting on somewhere else; and a
 *  surface that is unmounting wipes whatever the pointer has since moved on to, because that id
 *  happens to be in its roster too.
 *
 *  Three conditions, all required: this surface SET the current value, the channel still HOLDS
 *  that value, and nothing of this surface renders it any more. The third covers both ways a
 *  subject can vanish — it left the rendered set, or the whole surface is going away, which is the
 *  same statement with an empty set. */
export function shouldRelease<T extends string | number>(s: {
  /** The last key THIS surface wrote, or null if it has written none (or cleared its own). */
  mine: T | null;
  /** The channel's current value, whoever set it. */
  active: T | null;
  /** The subjects this surface renders right now — empty while it unmounts. */
  present: readonly T[];
}): boolean {
  if (s.mine == null) return false; // never ours to release
  if (s.active !== s.mine) return false; // the channel moved on; someone else owns it now
  return !s.present.includes(s.mine);
}

/** THE UNMOUNT BACKSTOP for a pairing — the structural half of the stuck-hover class of bug that
 *  `ExplorerShell`'s `onLeave` answers at container scale.
 *
 *  A row clears its own hover on `mouseleave`, and that is enough while the row is still there to
 *  hear one. It is not: a subject can LEAVE THE RENDERED SET under a stationary pointer — a metric
 *  switch re-ranks the roster, the stack pages a plane out of its window, a filter commit cuts the
 *  list to one — and an element that has been removed never fires a leave. The channel then holds a
 *  subject nothing on screen is pointing at, and the scene keeps a preview lit until the next hover
 *  somewhere else.
 *
 *  ⚠️ IT RETURNS THE SETTER THE PAIRING MUST USE, and that is the whole mechanism rather than a
 *  convenience: ownership can only be known by the thing that does the WRITING. Hand this setter to
 *  `subjectPairing` (and to any container-level `onLeave`) and the hook sees every write this
 *  surface makes; hand it the raw store setter and it sees none, which is the state the first cut
 *  was in when it fell back to guessing from the value.
 *
 *  ⚠️ NO EVERY-RENDER EFFECT. The in-place release is keyed on the rendered SET, because "the
 *  element that set it is gone" is precisely what a change in that set means. An unkeyed effect
 *  re-ran on every write from every source — and on a surface that subscribes to the channel, that
 *  is every hover anywhere.
 *
 *  It only ever CLEARS, and only a value this surface wrote. Clearing a preview is always safe (a
 *  preview is not a commit, rule 9). */
export function useHoverRelease<T extends string | number>(
  active: T | null,
  present: readonly T[],
  set: (v: T | null) => void,
): (v: T | null) => void {
  const mine = useRef<T | null>(null);
  // Ownership lapses the moment the channel holds someone else's subject. Derived from the current
  // value during render (the `CardHead.useRolledTitle` idiom — a ref adjusted from props, not a
  // side effect), so no second effect fires on every hover in the app to maintain it.
  if (mine.current != null && active !== mine.current) mine.current = null;

  const live = useRef({ active, present, set });
  live.current = { active, present, set };

  const key = present.join("\u0000");
  useEffect(() => {
    const now = live.current;
    if (shouldRelease({ mine: mine.current, active: now.active, present: now.present })) {
      mine.current = null;
      now.set(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the SET is the trigger; everything
    // else is read live, so the effect fires when a subject leaves and at no other time.
  }, [key]);

  useEffect(
    () => () => {
      const now = live.current;
      // An unmounting surface renders nothing, so it asks the same question with an empty set.
      if (shouldRelease({ mine: mine.current, active: now.active, present: [] })) {
        mine.current = null;
        now.set(null);
      }
    },
    [],
  );

  return useCallback((v: T | null) => {
    mine.current = v;
    live.current.set(v);
  }, []);
}
