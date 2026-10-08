"use client";

import { useStore } from "@/src/store/store";
import { UNLISTED_ID } from "@/src/data/unlisted";

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
  /** The span in the CARD'S OWN WORDS ("Sep 22, 2026", "Sep 8 – Oct 8", "last 30 days") — the log's
   *  applied chip repeats it rather than re-deriving local days from the instants, which named two
   *  days for a one-day (UTC) Moment (2026-10-07). */
  label?: string;
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
 *  does a cursor read with nothing focused. A null `span` opens the log unseeked, on its newest
 *  page (History's RAW under the ALL window).
 *
 *  The last two steps are a MODE step plus a section one, in that order: `mode` is what swaps the
 *  raw layer's surface to the ledger's records, and `setSection("data")`
 *  is what makes the door work from the scene as well (a no-op when the layer is already open). */
export function openRecords(metaId: string | null, span: RecordSpan | null): void {
  const st = useStore.getState();
  // THE DAG IS UNSCOPED HERE: since the hypergraph has its own plane (2026-09-26) a Moment read
  // under the DAG filter names "dag" as its subject, but the anchor log's chain search knows only
  // metagraphs (`searchNets` skips the root) and the ledger lens already treats a committed DAG
  // as every network. Handing "dag" through left the chain picker empty and the seek waiting
  // forever (review, 2026-09-26).
  // …and so are the UNLISTED channels (user, 2026-10-08: "is it possible to see the actual snapshot
  // — in the past I was able to see what's inside"). They have no chain the log can page, so a
  // scoped seek waited forever for a walk that never starts — the reason this door was dead for
  // them. Unscoped, the log cuts its RECENT rows to the span (the unlisted rows among them; only
  // them under the Unlisted filter's lens), and a row opens its snapshot's contents like any other.
  // A span older than the recent rows answers the way every unscoped seek does.
  const scoped = metaId && metaId !== "dag" && metaId !== UNLISTED_ID ? metaId : null;
  // ⚠️ THE DOOR NEVER WRITES THE APP FILTER (user, 2026-10-04: "it sets the global filter, that
  // should not happen; only set the filter in the raw list / search section"). It hands the network
  // to the log, which scopes ITSELF to it (AnchorLogTable's `searchMeta`) — the top bar, the scene
  // and every other view keep the lens the reader chose.
  // A null span (History's ALL window has none to hand over) opens the log on its newest page,
  // with no seek — the door still lands on the records.
  if (span) st.setLogSeek({ metaId: scoped, fromMs: span.fromMs, toMs: span.toMs, ...(span.label ? { label: span.label } : {}) });
  if (st.mode !== "ledger") {
    // Remember WHERE THE DOOR WAS (user, 2026-09-26): closing the layer goes back there, not to
    // Snapshots. Set after the mode step, which clears it.
    const from = st.mode;
    const focus = st.trendFocus; // the view switch clears it; the return restores it
    st.setMode("ledger");
    st.setRawReturnMode(from, focus);
  }
  st.setSection("data");
}


/** THE SNAPSHOT DOOR (2026-10-04): a metagraph-snapshot card's "Show the raw data" hands the log
 *  that one snapshot — its network and number — and the log's own snapshot search pages to the row
 *  and marks it (user: "it should filter on that metagraph snapshot — now I see lots of records, and
 *  quickly the one from my card is not even shown"). It opens the layer in place: the card's own
 *  view and selection are untouched, so there is no mode step and no return to remember. The log
 *  pages the door's network even under another filter (AnchorLogTable's `doorMeta`). */
export function openSnapshotRecord(metaId: string, ordinal: number, ts: string): void {
  const st = useStore.getState();
  const at = Date.parse(ts);
  st.setLogSeek({ metaId, fromMs: at, toMs: at, snapshot: ordinal });
  st.setSection("data");
}
