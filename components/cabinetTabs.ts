// THE TABS — one recipe, every tab strip in the app. UNDERLINE TABS since 2026-10-02 (user: "I
// don't like the rounded corners with color — looks like a card, but this is a simple control").
//
// They were "file-cabinet" tabs from 2026-09-29: the active tab a rounded, filled, outlined shape
// notched into a body that wore the same outline, so label and contents were one contour. That
// made a two-way switch look like a container — a card inside a card on the rail. What that design
// was FOR still holds, and each rule below keeps one part of it:
//   · TABS HUG THEIR LABELS, left-aligned. Equal halves across the width are a heading's shape.
//   · THE ACTIVE TAB IS UNMISTAKABLE: full-strength ink and a 2px accent rule sitting ON the row's
//     baseline hairline. The idle tab is muted ink and nothing else. No fill, no outline, no
//     radius — a wash that size reads as a committed region in this app.
//   · THE BODY BELONGS TO THE ROW ABOVE IT by adjacency: it starts directly under the baseline and
//     carries no box of its own.
//
// Class strings rather than a component: each surface keeps its own sizes and its own Radix
// wiring; what cannot drift is the look. The names keep "cabinet" so the three call sites and
// their history read unchanged.

/** The `TabsList` (variant "line" — the only one without a track behind it).
 *  ⚠️ THE LIST HUGS ITS TABS, SO THE ACCENT RULE LANDS ON THE BASELINE (user, 2026-10-04: "the
 *  underline … is not positioned correctly"). The primitive sizes a horizontal list through a
 *  group variant, `group-data-[orientation=horizontal]/tabs:h-9`, which outranks a plain `h-auto`
 *  — so a 28px tab centred in 36px and its 2px rule floated 4px above the hairline it belongs on.
 *  The override names the SAME variant (twMerge replaces it), and `items-end` keeps a tab on the
 *  baseline whatever height a call site gives it. */
export const CABINET_LIST =
  "relative flex h-auto group-data-[orientation=horizontal]/tabs:h-auto items-end flex-none w-full justify-start gap-4 rounded-none p-0 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border";

/** Every `TabsTrigger`. The primitive's own active underline and focus ring are replaced: the
 *  accent rule is drawn as a 2px background along the bottom (no layout, no pseudo to fight), and this app's focus
 *  language is a 1px outline. */
export const CABINET_TRIGGER = [
  "flex-none flex items-center justify-center gap-1.5 px-0.5 pointer-coarse:min-h-11 rounded-none!",
  "tracking-caps uppercase font-normal",
  "text-muted-foreground bg-transparent! border-0!",
  "hover:text-foreground",
  "after:hidden focus-visible:ring-0",
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
  "data-[state=active]:z-[1] data-[state=active]:text-foreground!",
  // ⚠️ THE RULE IS A BACKGROUND, NOT AN INSET SHADOW (test pass, 2026-10-03). A tab hugs its
  // label, so its box is a fractional width (44.26px), and at a 3x pixel ratio Chrome's inset
  // shadow leaked a one-pixel vertical hairline down the tab's right edge. A 2px gradient laid
  // along the bottom has no edge to leak from. `shadow-none!` clears the primitive's own.
  "data-[state=active]:shadow-none!",
  // ⚠️ THE RULE'S PLACE IS STATED AT REST, and only its LENGTH changes on the active tab (user,
  // 2026-10-03: "clicking that tab has the underline arriving from the top, looks strange"). The
  // image, its position and its size all used to arrive with the active state, and the primitive
  // transitions every property — so the rule eased from a background's defaults (top-left, full
  // height) down to the bottom edge. Pinned to the bottom-left at zero length, it can only grow
  // along the baseline it belongs to.
  "[background-image:linear-gradient(var(--primary),var(--primary))]! [background-position:left_bottom]! bg-no-repeat! [background-size:0%_2px]!",
  "data-[state=active]:[background-size:100%_2px]!",
  // The growth is the primitive's `transition-all`; reduced motion gets the rule at full length.
  "motion-reduce:transition-none!",
].join(" ");

/** The body under the row. No box: the baseline hairline above it is the only division. */
export const CABINET_BODY = "";
