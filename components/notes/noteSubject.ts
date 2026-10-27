import type { NoteView } from "@/src/data/noteTypes";
import type { Mode } from "@/src/store/mode";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// THE SUBJECT A NOTE STANDS ON, per view — one home, so the card, the timeline diamonds and the
// hook can never disagree about which note is on screen. Pure: the caller hands in the two
// network answers the cards already compute (`metagraphCardNetwork`, `cardNetwork`) and the
// repo's own "is this the unlisted network" predicate, so this module reads no store and holds
// no copy of either rule.
//
// The ladder is the views' own: Geography's finest committed rung is the country (a note about
// that country's nodes), else the network, else everything; Hypergraph and Snapshots stand on the
// network, else everything (Snapshots' DAG core IS everything: `all`, one note); History stands on
// the plane the metagraph card stands on, where "all" and the core are one subject ("dag" — the
// plane the stack opens on). The unlisted
// network is a pseudo-network with no measured history of its own, so it has no note.

export interface NoteSubjectState {
  /** `metagraphCardNetwork(state)`: the network the metagraph card stands on ("all" when none). */
  metagraphNetwork: string | null;
  /** The committed country code in Geography, else null. */
  country: string | null;
  /** `cardNetwork(filter, trendFocus, trendFront)`: the plane the History card stands on. */
  trendCard: string | null;
  /** Is this id the unlisted pseudo-network? (`src/data/unlisted.ts` is the one home.) */
  unlisted: (id: string) => boolean;
}

export interface NoteSubject {
  view: NoteView;
  subject: string;
}

export function noteSubjectOf(mode: Mode, s: NoteSubjectState): NoteSubject | null {
  if (!VIEW_POLICIES[mode].aiNotes) return null;
  const view = mode as NoteView; // aiNotes is true exactly on the four note views
  if (view === "trend") {
    const net = s.trendCard;
    if (net == null || net === "all" || net === "dag") return { view, subject: "dag" };
    return s.unlisted(net) ? null : { view, subject: net };
  }
  if (view === "geo" && s.country) return { view, subject: `cc:${s.country}` };
  const net = s.metagraphNetwork ?? "all";
  // The ledger's DAG core is its whole network: one subject, `all` (the routes fold it the same way).
  if (view === "ledger" && net === "dag") return { view, subject: "all" };
  return s.unlisted(net) ? null : { view, subject: net };
}
