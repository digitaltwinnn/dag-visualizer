// THE FILE-CABINET TABS — one recipe, every tab strip in the app (user, 2026-09-29, design A of
// `raw-trends-tabs.html`: "I don't really see there are 2 tabs and that the content shown is
// related"). Two surfaces had carried verbatim copies — the Trends document's Hypergraph /
// Metagraphs and the raw channel pane's State / Data / Signers — and both had faded the same way:
// full-width halves read as a heading bar rather than a choice, the active tab differed from the
// idle one by a shade, and the body's half-strength outline was too faint to say what it belonged to.
//
// The rules, each answering one of those:
//   · TABS HUG THEIR LABELS, left-aligned. Equal halves across the width are a heading's shape.
//   · THE ACTIVE TAB IS THE ACCENT: primary ink and a 2px primary top edge. Ink and an edge only,
//     never a plate — a drawer-sized wash reads as a committed region in this app (user,
//     2026-09-26, on both surfaces), which is why these stay in the hairline register.
//   · THE ACTIVE TAB OPENS INTO ITS BODY. Its fill (`--panel-solid`) sits over the row's baseline
//     hairline and notches it, and the body wears the SAME full-strength hairline on its other three
//     sides, so label and contents are one contour. The idle tab is muted ink with no outline.
//
// Class strings rather than a component: each surface keeps its own sizes (the channel pane's
// lanes carry icons at `text-micro`) and its own Radix wiring; what cannot drift is the look.

/** The `TabsList` (variant "line" — the only one without a track behind it). */
export const CABINET_LIST =
  "relative flex h-auto flex-none w-full justify-start gap-1 rounded-none p-0 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border";

/** Every `TabsTrigger`. The primitive's own active underline and focus ring are replaced: the notch
 *  is the active cue, and this app's focus language is a 1px outline. */
export const CABINET_TRIGGER = [
  "flex-none flex items-center justify-center gap-1.5 px-3.5 rounded-t-md! rounded-b-none!",
  "tracking-caps uppercase font-normal",
  "text-muted-foreground bg-transparent border border-transparent border-b-0",
  "hover:text-foreground",
  "after:hidden focus-visible:ring-0 focus-visible:border-transparent",
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
  "data-[state=active]:z-[1] data-[state=active]:text-primary!",
  "data-[state=active]:border-border! data-[state=active]:bg-[var(--panel-solid)]!",
  "data-[state=active]:shadow-[inset_0_2px_0_var(--primary)]!",
].join(" ");

/** The body the active tab opens into: the baseline hairline is its top edge. */
export const CABINET_BODY = "border border-t-0 border-border rounded-b-md";
