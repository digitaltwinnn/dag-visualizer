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
  // THE DAG IS UNSCOPED HERE: since the hypergraph has its own plane (2026-09-26) a Moment read
  // under the DAG filter names "dag" as its subject, but the anchor log's chain search knows only
  // metagraphs (`searchNets` skips the root) and the ledger lens already treats a committed DAG
  // as every network. Handing "dag" through left the chain picker empty and the seek waiting
  // forever (review, 2026-09-26).
  const scoped = metaId && metaId !== "dag" ? metaId : null;
  if (scoped && st.filter !== scoped) applyClickActions(filterToggleActions(scoped, st.filter));
  st.setLogSeek({ metaId: scoped, fromMs: span.fromMs, toMs: span.toMs });
  if (st.mode !== "ledger") {
    // Remember WHERE THE DOOR WAS (user, 2026-09-26): closing the layer goes back there, not to
    // Snapshots. Set after the mode step, which clears it.
    const from = st.mode;
    st.setMode("ledger");
    st.setRawReturnMode(from);
  }
  st.setSection("data");
}


/** THE SNAPSHOT DOOR (2026-10-04): a metagraph-snapshot card's "Show the raw data" hands the log
 *  that one snapshot — its network and number — and the log's own snapshot search pages to the row
 *  and marks it (user: "it should filter on that metagraph snapshot — now I see lots of records, and
 *  quickly the one from my card is not even shown"). It opens the layer in place: the card's own
 *  view and selection are untouched, so there is no mode step and no return to remember. The log
 *  declines the search where it would read the wrong chain (a filter on another network). */
export function openSnapshotRecord(metaId: string, ordinal: number, ts: string): void {
  const st = useStore.getState();
  const at = Date.parse(ts);
  st.setLogSeek({ metaId, fromMs: at, toMs: at, snapshot: ordinal });
  st.setSection("data");
}
