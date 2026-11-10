"use client";

import { useRef } from "react";
import { metagraphCardNetwork } from "@/components/railCards";
import { useTickHasFilter } from "@/components/useTickHasFilter";
import { UNLISTED_ID } from "@/src/data/unlisted";
import type { NoteResponse } from "@/src/data/noteTypes";
import { viewNetwork } from "@/src/engine/domain/viewNetwork";
import { useStore } from "@/src/store/store";
import { noteSubjectOf, type NoteSubject } from "./noteSubject";
import { nextWait, type WaitState } from "./typedNote";
import type { NoteReq } from "./noteLoader";
import useNote, { type NoteState } from "./useNote";

// Its own module (2026-10-27) so the rail, the card and History's diamonds import the derivation
// without the card's render tree.

/** THE SCOPE A COUNTRY OR PROVIDER CARD'S OWN NOTE IS ASKED AT (`subjectNote.ts`): the network the
 *  view stands on, the FILTER unless one is browsed, "all" being the fleet. Not `metagraphCardNetwork`, the top card's rule: the card's lead divides
 *  by `selNodes`, the filter's population ("Hosts 30% of the selection's nodes"), and under no
 *  filter Geography's metagraph card moves to a committed node's network while that lead keeps
 *  counting everything. The note is scoped as its lead is, so the two never read in two frames. */
export function useNoteScopeNetwork(): string {
  return useStore(viewNetwork);
}

/** Whether the reader watched this answer arrive: true once the note has been seen waiting, so a
 *  note that lands types itself in (`TypedNote`) and one already held simply stands. */
export function useWaited(res: NoteResponse | null): boolean {
  const state = useRef<WaitState>({ waited: false, text: null });
  state.current = nextWait(state.current, res);
  return state.current.waited;
}

/** THE NOTE ON SCREEN, one derivation for the card, the rail's manifest and its focus, and the
 *  timeline diamonds: the subject the view stands on, the request for its note, and the answer.
 *  Every caller shares one fetch (the loader's cache and in-flight map are module-level). */
export function useAiNote(): { subject: NoteSubject | null; req: NoteReq | null; note: NoteState } {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const railNet = useStore((s) => s.railNet);
  const tickNet = useStore((s) => s.tickNet);
  const snap = useStore((s) => s.snap);
  const inspect = useStore((s) => s.inspect);
  const trendFocus = useStore((s) => s.trendFocus);
  const trendFront = useStore((s) => s.trendFront);
  const trendWindow = useStore((s) => s.trendWindow);
  const register = useStore((s) => s.ledgerRegister);
  const tickHasFilter = useTickHasFilter();

  const subject = noteSubjectOf(mode, {
    metagraphNetwork: metagraphCardNetwork({ mode, filter, railNet, tickNet, snap, tickHasFilter, trendFocus, trendFront, inspect }),
    unlisted: (id) => id === UNLISTED_ID,
    register,
  });
  // History's note is over the WINDOW pill on screen, brushed or not: a brushed range's note is
  // the Range card's own (`SubjectNote`), so a brush never takes this card over.
  const span = subject?.view === "trend" ? trendWindow : null;
  const req: NoteReq | null = subject ? { view: subject.view, subject: subject.subject, span } : null;
  return { subject, req, note: useNote(req) };
}
