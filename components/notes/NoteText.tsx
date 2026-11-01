"use client";

import { IDENT_INK } from "@/components/identInk";
import { noteSegments, takeSegments } from "@/src/data/noteNames";
import { identityHudCss } from "@/src/palette/identity";

/** How much of its own colour a name keeps, the rest being the text's. Full colour read loud in a
 *  sentence (user, 2026-11-01). Mixing toward the ink RAISES the contrast (measured worst hue,
 *  dark 7.3 to 10.6, paper 4.8 to 8.5), so the limit is telling two names apart, not reading them.
 *  In oklab, never oklch: a polar mix rotates the hue toward the ink's, and on paper Dor's orange
 *  came out plum and Upsider's gold came out green. */
const NAME_TINT = 60;

/** A NOTE'S WORDS, with each network it names in a tint of that network's colour (`noteNames.ts`), set
 *  as text (`IDENT_INK`), so every hue holds on paper. Colour only, same weight: a name is not a link
 *  here, the note's rows are where a subject is clicked. `upto` is how far a note has written itself in. */
export default function NoteText({ text, upto }: { text: string; upto?: number }) {
  const all = noteSegments(text);
  return (upto == null ? all : takeSegments(all, upto)).map((s, i) =>
    s.id ? (
      <span key={i} className={IDENT_INK} style={{ color: `color-mix(in oklab, ${identityHudCss(s.id)} ${NAME_TINT}%, var(--foreground))` }}>
        {s.text}
      </span>
    ) : (
      s.text
    ),
  );
}
