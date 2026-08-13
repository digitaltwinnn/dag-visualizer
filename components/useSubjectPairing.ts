import type { CSSProperties } from "react";

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
    onMouseLeave: leave,
    onFocus: enter,
    onBlur: leave,
  };
}
