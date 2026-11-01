"use client";

import { IDENT_INK } from "@/components/identInk";
import { noteSegments, takeSegments } from "@/src/data/noteNames";
import { identityHudCss } from "@/src/palette/identity";

/** How much of its own colour a name keeps on dark, the rest being the text's. Full colour read loud
 *  in a sentence there (user, 2026-11-01), and mixing toward the ink RAISES the contrast (worst hue 7.3
 *  to 9.2). In oklab, never oklch: a polar mix rotates the hue toward the ink's.
 *  PAPER KEEPS THE FULL COLOUR (user, same day: "in light looks even softer than before"). There the
 *  text is near-black and the mix greys a name out, so a name reads less like a name, not quieter. */
const NAME_TINT = 75;

/** A NOTE'S WORDS, with each network it names in that network's colour (`noteNames.ts`), set
 *  as text (`IDENT_INK`), so every hue holds on paper. Colour only, same weight: a name is not a link
 *  here, the note's rows are where a subject is clicked. `upto` is how far a note has written itself in. */
export default function NoteText({ text, upto }: { text: string; upto?: number }) {
  const all = noteSegments(text);
  return (upto == null ? all : takeSegments(all, upto)).map((s, i) => {
    if (!s.id) return s.text;
    const ink = identityHudCss(s.id);
    return (
      <span key={i} className={IDENT_INK} style={{ color: `light-dark(${ink}, color-mix(in oklab, ${ink} ${NAME_TINT}%, var(--foreground)))` }}>
        {s.text}
      </span>
    );
  });
}
