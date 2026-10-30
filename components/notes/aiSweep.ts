// THE AI SWEEP, ONE HOME (user, 2026-10-30: the AI card's iridescent outline belongs on every
// surface a model's words produced — the card, the plate inside a subject card, the kind chip a
// notable day puts on a head, the timeline's diamonds). The card's layer trick: the fill clipped to
// the padding box over the `--ai-edge` gradient clipped to the border box, with a transparent
// 1px border, so the sweep shows only in the ring and never tints the fill. Two fills are stated
// here: the plate's and chip's `--ai-wash` over an opaque ground (`--panel-solid` is translucent,
// and a sweep under a translucent fill tints it — the card's own lesson, NotesCard). The arbitrary
// `background` property, never a background-colour utility over the token, because `--ai-edge`
// is a gradient (CSS trap 3). ⚠️ And no utility-shaped literal in THIS comment either: Tailwind
// scans source files for class names, and one here compiled into an invalid rule that took the
// whole stylesheet down (2026-10-30).
export const AI_SWEEP =
  "border border-transparent [background:linear-gradient(var(--ai-wash),var(--ai-wash))_padding-box,linear-gradient(var(--panel-solid),var(--panel-solid))_padding-box,linear-gradient(var(--background),var(--background))_padding-box,var(--ai-edge)_border-box]";
