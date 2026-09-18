"use client";

import dynamic from "next/dynamic";
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
// The document's own chunk stays SPLIT — the raw layer mounts in every view, and TrendsDoc pulls
// the chart primitive and the whole trends slice path behind it. `dynamic()` here is the same
// treatment DocLayer gives About and Design.
const TrendsDoc = dynamic(() => import("@/components/docs/TrendsDoc"));

export default function DocumentSurface() {
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
