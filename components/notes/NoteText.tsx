"use client";

import { IDENT_INK } from "@/components/identInk";
import { noteSegments, takeSegments } from "@/src/data/noteNames";
import { identityHudCss } from "@/src/palette/identity";

/** A NOTE'S WORDS, with each network it names in that network's colour (`noteNames.ts`), set as text
 *  (`IDENT_INK`), so every hue holds on paper. Colour only, same weight: a name is not a link here,
 *  the note's rows are where a subject is clicked. `upto` is how far a note has written itself in. */
export default function NoteText({ text, upto }: { text: string; upto?: number }) {
  const all = noteSegments(text);
  return (upto == null ? all : takeSegments(all, upto)).map((s, i) =>
    s.id ? (
      <span key={i} className={IDENT_INK} style={{ color: identityHudCss(s.id) }}>
        {s.text}
      </span>
    ) : (
      s.text
    ),
  );
}
