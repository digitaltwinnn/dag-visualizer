"use client";

import { useEffect, useState } from "react";
import { rowsThatFit } from "./fitRows";

// Measures how many explorer rows fit between the card and the bottom of its HOST, and answers
// the page size (`fitRows.ts` has the arithmetic and its fixed-point argument). Two hosts:
//  · the desktop RAIL — usable bottom = its own top plus its resolved `max-height` (globals.css
//    `#leftcol`: the bar, the band's reserve and the footer are already subtracted there);
//  · the tablet edge SHEET (user, 2026-09-28: "tablet should not be limited — like on normal it
//    spans the height and can grow to almost view height") — usable bottom = the sheet's own
//    bottom less its bottom padding.
// The PHONE's bottom sheet sizes to its content, so there is no bottom to fill to: the caller
// passes `fill = false` and a fixed fallback.
//
// `measuring` says the rows on screen ARE the paged list (the explorer's root level): a drilled
// level shows other rows, so the hook holds its last answer there rather than resizing a page
// the reader is not looking at.
export default function useFitRows(cardId: string, fill: boolean, measuring: boolean, fallback: number): number {
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    if (!fill) {
      setSize(fallback);
      return;
    }
    if (!measuring) return;
    const card = document.getElementById(cardId);
    const sheet = card?.closest<HTMLElement>('[data-slot="sheet-content"]') ?? null;
    const rail = sheet ?? document.getElementById("leftcol");
    if (!rail || !card) return;
    const hostBottom = (): number => {
      if (sheet) return sheet.getBoundingClientRect().bottom - parseFloat(getComputedStyle(sheet).paddingBottom || "0");
      // The column's own bottom padding (the shadow bleed, or `.rail-clip`'s runway) is no room
      // for rows.
      const cs = getComputedStyle(rail);
      const maxH = parseFloat(cs.maxHeight);
      return Number.isFinite(maxH) ? rail.getBoundingClientRect().top + maxH - (parseFloat(cs.paddingBottom) || 0) : NaN;
    };
    const measure = () => {
      const rows = card.querySelectorAll<HTMLElement>(".nb-row");
      if (rows.length < 2) return;
      const pitch = rows[1]!.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().top;
      const bottom = hostBottom();
      if (!Number.isFinite(bottom)) return;
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
  }, [cardId, fill, measuring, fallback]);
  return size;
}
