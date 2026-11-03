"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import NoteText from "./NoteText";
import { typedLength } from "./typedNote";

/** A NOTE, WRITTEN IN (`typedNote.ts`), one component for the AI card and the cards' notes. Only a note
 *  the reader watched arrive is typed (`waited`): one already held appears at once, as does any
 *  note under reduced motion. While it types, the unwritten rest stands invisibly in the same run,
 *  so the card takes its final height once and never grows per letter; a screen reader gets the
 *  whole text at once. Model text renders as React text only, like every note surface. */
/** Notes already written in: folding a card and opening it again shows the note, it does not retype it. */
const TYPED = new Set<string>();

export default function TypedNote({ text, waited, always, slow, className }: {
  text: string;
  waited?: boolean;
  /** Types whatever came before: the Briefing's words are a performance, not a note arriving, and
   *  each stop remounts this, which the card's once-only memory would read as already written. */
  always?: boolean;
  /** Stretches the typing clock (`typeDuration`); the Briefing's words type slower than a note. */
  slow?: number;
  className?: string;
}) {
  const [shown, setShown] = useState<number | null>(null);
  // Before paint, so the finished text never flashes ahead of the first letter.
  useLayoutEffect(() => {
    const type = (always || (waited && !TYPED.has(text))) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    TYPED.add(text);
    setShown(type ? 0 : null);
    // A note is typed when it arrives, not when `waited` next changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const typing = shown != null;
  useEffect(() => {
    if (!typing) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const n = typedLength(now - start, text.length, slow);
      if (n >= text.length) return setShown(null);
      setShown(n);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [typing, text, slow]);
  if (shown == null) return <p className={className}><NoteText text={text} /></p>;
  return (
    <p className={className}>
      {/* The rest stands invisible in the same run, so what is written never moves: a centred line
          does not re-centre on each letter, and every line wraps where it will end up. */}
      <span aria-hidden><NoteText text={text} upto={shown} /><span className="invisible">{text.slice(shown)}</span></span>
      <span className="sr-only">{text}</span>
    </p>
  );
}
