// THE AI SWEEP ON A PIECE OF A CARD, ONE HOME (user, 2026-10-30: the iridescent outline belongs on
// every surface a model's words produced; 2026-10-31: the section "doesn't match with the card itself
// ... the writing also gives the AI effect"). A TRUE RING: the sweep on a pseudo-element masked down
// to its 1px padding, softened, so the card's own surface shows through under a faint wash. The AI
// card itself keeps its full edge; a plate or a chip inside a card only hints at it. The arbitrary
// `background` property, never a background-colour utility, because `--ai-edge` is a gradient (CSS
// trap 3). A named colour in the mask, since rule 3 keeps hex out of components and a mask reads
// only alpha. ⚠️ No utility-shaped literal in a comment here: Tailwind scans source for class
// names, and one once compiled into an invalid rule that took the whole stylesheet down.
export const AI_SWEEP =
  "relative border border-transparent bg-[var(--ai-wash)] before:absolute before:-inset-px before:rounded-[inherit] before:p-px before:pointer-events-none before:content-[''] before:opacity-60 before:[background:var(--ai-edge)] before:[mask:linear-gradient(black_0_0)_content-box_exclude,linear-gradient(black_0_0)]";
