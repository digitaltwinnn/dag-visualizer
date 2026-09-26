"use client";

import { filterToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";

// THE MEASURED HISTORY'S TWO DOORS — ONE HOME (2026-09-19).
//
// Convention 12's observation ladder has three depths, and the middle one is where this view
// lives: the live scene above it, the RECORD-level microscope below. The rung's rule is that a
// step down CARRIES ITS CONTEXT — a chart range hands its network and its dates to the anchor
// log's search — so the step is never a bare navigation, it is a sequence: commit the network
// through the one write path, hand the span to the log, land on the view that can show records,
// and open the raw layer there.
//
// That sequence lived inside `components/docs/TrendsDoc.tsx` as `inspectRange`, which was the one
// surface offering it. The History view's cursor card offers the SAME door, and a second copy of
// four ordered steps is how two surfaces end up landing a reader in different places from the
// same words. So it lives here, called by both.
//
// ⚠️ THE NETWORK COMMIT RIDES THE TABLE (rule 2). `filterToggleActions` is the same builder the
// explorer row and the scene hub run, applied through the one executor — and it is GUARDED by the
// `st.filter !== metaId` check, because that builder TOGGLES: handing it the already-committed
// network would release the filter on a control whose whole purpose is to scope the log to it.

/** The span a door hands the anchor log — a brushed range, or the window on screen. */
export interface RecordSpan {
  fromMs: number;
  toMs: number;
}

/** The span the WINDOW on screen implies, from the buckets actually drawn.
 *
 *  A reader who has brushed no range is still looking at a span, and the door should be open
 *  either way (user, 2026-09-09: "that button can always exist"). `toMs` is the newest bucket's
 *  END, since a bucket is `[start, start + step)`. An empty axis has no span and answers null —
 *  a door onto nothing is worse than no door. */
export function spanOfWindow(buckets: readonly number[], stepMs: number): RecordSpan | null {
  if (!buckets.length) return null;
  return { fromMs: buckets[0], toMs: buckets[buckets.length - 1] + stepMs };
}

/** ONE RUNG DOWN — the anchor log's records for `metaId` over `span`.
 *
 *  `metaId` null is the unscoped log: the global charts have no chain of their own, and neither
 *  does a cursor read with nothing focused. A null `span` is a no-op rather than a navigation to
 *  an unbounded search.
 *
 *  The last two steps are a MODE step plus a section one, in that order: `mode` is what swaps the
 *  raw layer's surface from the trends document to the ledger's records, and `setSection("data")`
 *  is what makes the door work from the scene as well (a no-op when the layer is already open). */
export function openRecords(metaId: string | null, span: RecordSpan | null): void {
  if (!span) return;
  const st = useStore.getState();
  if (metaId && st.filter !== metaId) applyClickActions(filterToggleActions(metaId, st.filter));
  st.setLogSeek({ metaId, fromMs: span.fromMs, toMs: span.toMs });
  if (st.mode !== "ledger") st.setMode("ledger");
  st.setSection("data");
}

