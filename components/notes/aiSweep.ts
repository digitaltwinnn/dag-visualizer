// THE AI SWEEP ON A TAG, ONE HOME (user, 2026-10-30: "if tag comes from AI give it that color
// outline also"). A note inside a card wears none (`SubjectNote`). A TRUE RING: the sweep on a pseudo-element masked down
// to a half-pixel hairline, softened, so the card's own surface shows through under a faint wash. The AI
// card itself keeps its full edge; a chip inside a card only hints at it. The arbitrary
// `background` property, never a background-colour utility, because `--ai-edge` is a gradient (CSS
// trap 3). A named colour in the mask, since rule 3 keeps hex out of components and a mask reads
// only alpha. ⚠️ No utility-shaped literal in a comment here: Tailwind scans source for class
// names, and one once compiled into an invalid rule that took the whole stylesheet down.
export const AI_SWEEP =
  "relative border border-transparent bg-[var(--ai-wash)] before:absolute before:-inset-px before:rounded-[inherit] before:p-[0.5px] before:pointer-events-none before:content-[''] before:opacity-60 before:[background:var(--ai-edge)] before:[mask:linear-gradient(black_0_0)_content-box_exclude,linear-gradient(black_0_0)]";
