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
      // ⚠️ THE CONTENT'S BOTTOM, NOT THE BOX'S (user, 2026-11-02: the bottom kept jumping a row):
      // `HeightEase` clips the card to its old height while the rows already stand at the new one,
      // so the box read free room that was not there, and the page grew and shrank for good.
      const content = card.lastElementChild!.getBoundingClientRect().bottom;
      const free = bottom - content - (parseFloat(getComputedStyle(card).borderBottomWidth) || 0);
      const next = rowsThatFit(rows.length, free, pitch, fallback);
      setSize((cur) => (cur === next ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rail);
    ro.observe(card);
    window.addEventListener("resize", measure);
    // ⚠️ THE CAP MOVES WITHOUT A RESIZE (user, 2026-11-09: "only 6 rows (with 1/9 pages) while there
    // is a lot of room left"). The rail's max-height is a CSS calc over root custom properties —
    // `--topbar-extra` (the filter strip, `TopBar`), `--bottom-reserve` (the band, `BottomStream`) —
    // written on `<html style>`. A cap that SHRINKS clips the rail, which resizes it, and the page
    // shrinks; a cap that GROWS back resizes nothing (the rail is content-sized under it), so the
    // page never grew back: a ratchet down, one filter strip at a time. Every write to those
    // variables is a write to the root's style attribute, so that is what is watched.
    const mo = new MutationObserver(measure);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    // …AND MEASURES AGAIN WHEN THE RAIL HAS ARRIVED (review I3, 2026-11-09): the column slides its
    // `top` over 0.25s while its max-height jumps at once, so the measure above reads the old top
    // against the new cap — off by the strip's height. The slide's end is the settled reading.
    const settled = (e: TransitionEvent) => {
      if (e.target === rail && e.propertyName === "top") measure();
    };
    rail.addEventListener("transitionend", settled);
    rail.addEventListener("transitioncancel", settled);
    return () => {
      ro.disconnect();
      mo.disconnect();
      rail.removeEventListener("transitionend", settled);
      rail.removeEventListener("transitioncancel", settled);
      window.removeEventListener("resize", measure);
    };
  }, [cardId, fill, measuring, fallback]);
  return size;
}
