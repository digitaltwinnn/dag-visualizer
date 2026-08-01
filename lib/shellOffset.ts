// The two-section shell's live Y offset (spec 2026-08-01).
//
// `SectionSlider` wraps the whole scene shell in a `position:fixed; inset:0` box that carries a
// transform — which makes it the containing block for every `position:fixed` descendant (canvas,
// rails, LiveStrip) AND shifts what their `getBoundingClientRect()` reports. Rects are VISUAL
// (viewport) coordinates, so while section 2 is presented every measurement taken inside the
// wrapper carries the translate. Anything that feeds a measured rect back into a fixed `top` (the
// rail threads) or compares it against the viewport (the rail clip) must subtract this offset, or
// it double-counts and renders a full viewport away.
//
// The wrapper's own untranslated top is 0 (`inset-0`), so its rect top IS the translate. 0 while
// the scene section is presented — the common case, and the value when the shell isn't mounted.
export const SHELL_ID = "shell";

export function shellOffsetY(): number {
  if (typeof document === "undefined") return 0;
  const el = document.getElementById(SHELL_ID);
  return el ? el.getBoundingClientRect().top : 0;
}
