import type { CSSProperties } from "react";

// The ONE shared "focus pairing" every rail card + explorer row uses, so a node, a snapshot, and a
// metagraph card all behave identically: a subject is "paired" when its key equals its store
// channel's current value (the same value the 3D object glows on); while paired it wears the
// `.subject-paired` class + exposes its identity hue as `--row-hue`; hovering it writes/clears the
// channel (glowing the 3D object back). No React state — a pure mapping over the passed-in value.
export function subjectPairing<T extends string | number>(
  active: T | null,
  key: T | null,
  set: (v: T | null) => void,
  hue: string,
): { paired: boolean; className: string; style: CSSProperties | undefined; onMouseEnter: () => void; onMouseLeave: () => void } {
  const paired = key != null && key === active;
  return {
    paired,
    className: paired ? "subject-paired" : "",
    style: paired ? ({ ["--row-hue"]: hue } as CSSProperties) : undefined,
    onMouseEnter: () => set(key),
    onMouseLeave: () => set(null),
  };
}
