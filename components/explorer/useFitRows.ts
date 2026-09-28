"use client";

import { useEffect, useState } from "react";
import { rowsThatFit } from "./fitRows";

// Measures how many explorer rows fit between the card and the bottom of the desktop rail, and
// answers the page size (`fitRows.ts` has the arithmetic and its fixed-point argument). The
// rail's usable bottom is its own top plus its resolved `max-height` (globals.css `#leftcol` —
// the bar, the band's reserve and the footer are already subtracted there), so this never
// re-derives the rail's geometry. Off the desktop tier the explorer lives in a sheet that sizes
// to its content, with no bottom to fill to, so it answers `fallback` there.
//
// `measuring` says the rows on screen ARE the paged list (the explorer's root level): a drilled
// level shows other rows, so the hook holds its last answer there rather than resizing a page
// the reader is not looking at.
export default function useFitRows(cardId: string, desktop: boolean, measuring: boolean, fallback: number): number {
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    if (!desktop) {
      setSize(fallback);
      return;
    }
    if (!measuring) return;
    const rail = document.getElementById("leftcol");
    const card = document.getElementById(cardId);
    if (!rail || !card) return;
    const measure = () => {
      const rows = card.querySelectorAll<HTMLElement>(".nb-row");
      if (rows.length < 2) return;
      const pitch = rows[1]!.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().top;
      const maxH = parseFloat(getComputedStyle(rail).maxHeight);
      if (!Number.isFinite(maxH)) return;
      const bottom = rail.getBoundingClientRect().top + maxH;
      const free = bottom - card.getBoundingClientRect().bottom;
      const next = rowsThatFit(rows.length, free, pitch, fallback);
      setSize((cur) => (cur === next ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rail);
    ro.observe(card);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [cardId, desktop, measuring, fallback]);
  return size;
}
