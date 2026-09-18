"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/src/store/store";
import { RAW_EXIT_S } from "@/components/SectionShell";
import { DOC_MEASURE } from "@/components/docs/measure";

// THE RAW LAYER'S DOCUMENT REGISTER (2026-09-18) — the History view's other half.
//
// The measured history is ONE rung of the observation ladder with TWO registers: the 3D stack of
// chart planes is the view, and this document is the same history read as prose. `section` is the
// app's presentation axis, so the document is reached exactly the way every other view's records
// are — the command bar's RAW toggle, Escape, the layer's own ×, all through `setSection`.
//
// ⚠️ IT IS NOT A DOC OVERLAY, and cannot be. `store.docPage` forces `section` back to `"scene"`
// and the command bar hides the presentation pair under any open doc, so a document rendered
// through DocLayer would be a room with no door: RAW would open it and nothing would close it.
// `trends` therefore left the doc registry (views.ts) with the two flags it was the only user of.
//
// ⚠️ AND IT MOUNTS WITH RAW, NOT WITH THE VIEW (review, 2026-09-18) — the one place this surface
// deliberately departs from its records sibling. `DataSection` keys on `mode` alone and
// `SectionShell` keeps the raw layer RENDERED at all times (`visibility:hidden` + `inert`), so a
// surface that simply returned its content would be standing the moment History is entered. For a
// table that is merely wasteful; for this document it is WRONG:
//
//   · `TrendsDoc.initialTab` reads the committed filter ONCE AT MOUNT, and mounting on view entry
//     latches that read before the reader has committed anything — enter /trends on `all`, commit
//     DOR in the bar, press RAW, and the document opened on the Hypergraph side, which is exactly
//     the case `initialTab` exists to answer.
//   · the reader's zoom, range and scroll survived a close/reopen, so an "open" was a resume.
//   · dozens of charts sat laid out behind the live scene, and the app's largest dynamic chunk was
//     pulled during the view's own entry choreography.
//
// So `openedAt` is both the mount flag and the record of WHICH open this is: null while the
// register is down, the rising edge's timestamp while it is up. Unmounting IS the remount — every
// open builds a fresh document, which is what makes `initialTab`, the zoom and the scroll mean
// "as it is now" rather than "as you left it".
//
// ⚠️ The unmount is HELD for the layer's own recede (`RAW_EXIT_S`, SectionShell's one number —
// never a second constant). The store write lands the instant RAW is pressed, while GSAP still has
// 0.3s of sinking to do; dropping the content there blanks the layer mid-flight instead of letting
// it leave. Reduced motion has no recede to wait for, so the drop is immediate — read live from
// the media query, exactly as the shell reads it. A reopen inside that window keeps the standing
// document: nothing ever left the screen, so there is nothing to start clean.
//
// The document's own chunk stays SPLIT, and with the mount gated it is now fetched on the FIRST
// OPEN rather than at view entry — `dynamic()` only calls its importer when the component renders.
const TrendsDoc = dynamic(() => import("@/components/docs/TrendsDoc"));

export default function DocumentSurface() {
  const open = useStore((s) => s.section === "data");
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const drop = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clear = () => {
      if (drop.current) {
        clearTimeout(drop.current);
        drop.current = null;
      }
    };
    clear();
    if (open) {
      // `?? Date.now()` rather than a fresh stamp: a reopen inside the recede window continues the
      // standing document instead of tearing down one the reader can still see.
      setOpenedAt((t) => t ?? Date.now());
      return clear;
    }
    const ms = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : RAW_EXIT_S * 1000;
    drop.current = setTimeout(() => {
      drop.current = null;
      setOpenedAt(null);
    }, ms);
    return clear;
  }, [open]);

  if (openedAt == null) return null;
  return (
    // The layer's own `.ig-panel` glass IS this document's sheet — so the column adds nothing but
    // the reading measure it shares with the overlay (docs/measure.ts). A second veil here would
    // be a plate on a plate, which is the flattening the card grammar warns about, and the raw
    // layer already sits in the band below the command bar, so the overlay's bar-clearing top pad
    // has nothing to clear.
    //
    // The scroll lives on the LAYER-WIDE box, not on the column: the raw layer is a fixed box, so
    // the document needs its own viewport — and a wheel anywhere over the panel, margins included,
    // has to move the text. `slim-scroll` is CSS trap 9 (any scroll region on glass wears it);
    // `overscroll-contain` keeps a flick at the end of the document off whatever is behind.
    <div className="h-full overflow-y-auto overscroll-contain slim-scroll">
      <div className={DOC_MEASURE + " pb-16"}>
        <TrendsDoc />
      </div>
    </div>
  );
}
