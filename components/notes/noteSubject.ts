import type { NoteView } from "@/src/data/noteTypes";
import { spanPhrase } from "@/src/data/trendWindow";
import type { LedgerRegister, Mode } from "@/src/store/mode";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// THE SUBJECT A NOTE STANDS ON, per view: one home, so the card, the timeline diamonds and the hook
// can never disagree about which note is on screen. Pure: the caller hands in the network the card
// already computes (`metagraphCardNetwork`) and the repo's own "is this the unlisted network"
// predicate, so this module reads no store and holds no copy of either rule.
//
// ONE SCOPE (user, 2026-11-02: "make top card scope be the network, and apply either the filter or
// the network that is selected in the rung/has the focus"): the view's note stands on the network
// the Metagraph rung stands on, the filter unless one is selected there, in every view. All and the
// DAG core fold per view: Snapshots' core IS everything (`all`, one note), History's All is the
// hypergraph's plane ("dag"). A committed country, provider, make-up or brushed range carries its
// own note on its own card (`subjectNote.ts`, `SubjectNote.tsx`), so none of them takes this one over.
// THE UNLISTED SET HAS A NOTE IN HISTORY ALONE (user, 2026-10-30: "does AI work on unknown networks?
// I'd like that also"): the sampler measures its chains, so History has a record; they publish no
// nodes and no places, so the other views have nothing measured to say.

/** The product's name, wherever the AI signs its words. */
export const AI_TITLE = "Constellation Gate AI";
/** The card's head says it short (user, 2026-11-03: "'constellation gate AI' -> 'Gate AI' to save
 *  space"): the rail is narrow, and the head also carries the span chip and now the −. */
export const AI_CARD_TITLE = "Gate AI";

export interface NoteSubjectState {
  /** `metagraphCardNetwork(state)`: the network the metagraph card stands on ("all" when none). */
  metagraphNetwork: string | null;
  /** Is this id the unlisted pseudo-network? (`src/data/unlisted.ts` is the one home.) */
  unlisted: (id: string) => boolean;
  /** The register the view is read in (`store.ledgerRegister`); a view that does not offer it reads its own. */
  register?: LedgerRegister;
}

/** THE NOTE A REGISTER CARRIES IN PLACE OF ITS VIEW'S (controller ruling, 2026-11-06: "in the Blocks
 *  register the top Gate AI card is the blocks note … the Snapshots register keeps the ledger note").
 *  Keyed by the register, read only where the view's policy offers it (`registers`), so no view is
 *  named here. The block DAG's note is the whole network's alone (`sources.ts`): its subject is `all`
 *  whatever the rung stands on — a filter is a lens on the chamber, and the note reads every chain. */
const REGISTER_NOTES: Record<LedgerRegister, NoteView | null> = { snapshots: null, blocks: "blocks" };

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
    case "blocks":
      return spanPhrase("24h", null);
    case "trend":
      return null;
  }
}

/** The view a note's words stand in: its own, except the block DAG's, which is the Snapshots view's
 *  Blocks register (a register, not a Mode). */
export function noteModeOf(view: NoteView): Mode {
  return view === "blocks" ? "ledger" : view;
}

export function noteSubjectOf(mode: Mode, s: NoteSubjectState): NoteSubject | null {
  const { aiNotes, noteScope, registers } = VIEW_POLICIES[mode];
  if (!aiNotes) return null;
  const registerNote = s.register && registers.includes(s.register) ? REGISTER_NOTES[s.register] : null;
  if (registerNote) return { view: registerNote, subject: "all" };
  const view = mode as NoteView; // aiNotes is true exactly on the four note views
  const net = s.metagraphNetwork ?? "all";
  if (noteScope === "history") {
    if (net === "all" || net === "dag") return { view, subject: "dag" };
    return { view, subject: net }; // the unlisted set included: History alone has its record (above)
  }
  // The ledger's DAG core is its whole network: one subject, `all` (the routes fold it the same way).
  if (noteScope === "chamber" && net === "dag") return { view, subject: "all" };
  return s.unlisted(net) ? null : { view, subject: net };
}
