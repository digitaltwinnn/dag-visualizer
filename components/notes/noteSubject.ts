import type { NoteView } from "@/src/data/noteTypes";
import { spanPhrase } from "@/src/data/trendWindow";
import type { Mode } from "@/src/store/mode";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// THE SUBJECT A NOTE STANDS ON, per view — one home, so the card, the timeline diamonds and the
// hook can never disagree about which note is on screen. Pure: the caller hands in the two
// network answers the cards already compute (`metagraphCardNetwork`, `cardNetwork`) and the
// repo's own "is this the unlisted network" predicate, so this module reads no store and holds
// no copy of either rule.
//
// It is the VIEW's note at the filter's scope, and it holds under a drill (spec
// 2026-10-29-subject-notes): Hypergraph, Geography and Snapshots stand on the network, else
// everything (Snapshots' DAG core IS everything: `all`, one note); History stands on the plane the
// metagraph card stands on, where "all" and the core are one subject ("dag" — the plane the stack
// opens on). A committed country, provider, make-up or brushed range carries its own note on its
// own card (`subjectNote.ts`, `SubjectNote.tsx`), so none of them takes this one over. The unlisted
// network is a pseudo-network with no measured history of its own, so it has no note.

export interface NoteSubjectState {
  /** `metagraphCardNetwork(state)`: the network the metagraph card stands on ("all" when none). */
  metagraphNetwork: string | null;
  /** `cardNetwork(filter, trendFocus, trendFront)`: the plane the History card stands on. */
  trendCard: string | null;
  /** Is this id the unlisted pseudo-network? (`src/data/unlisted.ts` is the one home.) */
  unlisted: (id: string) => boolean;
}

export interface NoteSubject {
  view: NoteView;
  subject: string;
}

/** THE SPAN UNDER THE TITLE (user, 2026-10-29: every note is titled "What changed", and the span
 *  it changed over reads under it "like trend says 'last 30 days'"). The three fixed-span views'
 *  words, in the explorer's own span vocabulary (`spanPhrase`); History's span is the window pill on
 *  screen, so the card reads it from the store (null here). The lengths are the
 *  server's reads (`app/api/notes/sources.ts`: a week of the fleet for Hypergraph and Geography,
 *  R72; the last 24 hours of the chamber for Snapshots, R79). */
export function noteSpanWords(view: NoteView): string | null {
  switch (view) {
    case "hyper":
    case "geo":
      return spanPhrase("7d", null);
    case "ledger":
      return spanPhrase("24h", null);
    case "trend":
      return null;
  }
}

export function noteSubjectOf(mode: Mode, s: NoteSubjectState): NoteSubject | null {
  if (!VIEW_POLICIES[mode].aiNotes) return null;
  const view = mode as NoteView; // aiNotes is true exactly on the four note views
  if (view === "trend") {
    const net = s.trendCard;
    if (net == null || net === "all" || net === "dag") return { view, subject: "dag" };
    return s.unlisted(net) ? null : { view, subject: net };
  }
  const net = s.metagraphNetwork ?? "all";
  // The ledger's DAG core is its whole network: one subject, `all` (the routes fold it the same way).
  if (view === "ledger" && net === "dag") return { view, subject: "all" };
  return s.unlisted(net) ? null : { view, subject: net };
}
