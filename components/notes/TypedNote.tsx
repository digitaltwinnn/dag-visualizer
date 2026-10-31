"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import { typedLength } from "./typedNote";

/** A NOTE, WRITTEN IN (`typedNote.ts`), one component for the AI card and the plates. Only a note
 *  the reader watched arrive is typed (`waited`): one already held appears at once, as does any
 *  note under reduced motion. While it types, the whole text stands invisibly in the same grid cell,
 *  so the card takes its final height once and never grows per letter; a screen reader gets the
 *  whole text at once. Model text renders as React text only, like every note surface. */
export default function TypedNote({ text, waited, className }: { text: string; waited: boolean; className?: string }) {
  const [shown, setShown] = useState<number | null>(null);
  // Before paint, so the finished text never flashes ahead of the first letter.
  useLayoutEffect(() => {
    setShown(waited && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : null);
    // A note is typed when it arrives, not when `waited` next changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const typing = shown != null;
  useEffect(() => {
    if (!typing) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const n = typedLength(now - start, text.length);
      if (n >= text.length) return setShown(null);
      setShown(n);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [typing, text]);
  if (shown == null) return <p className={className}>{text}</p>;
  return (
    <p className={`grid ${className ?? ""}`}>
      <span className="invisible col-start-1 row-start-1">{text}</span>
      <span aria-hidden className="col-start-1 row-start-1">{text.slice(0, shown)}</span>
      <span className="sr-only">{text}</span>
    </p>
  );
}
