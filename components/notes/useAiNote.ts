"use client";

import { metagraphCardNetwork } from "@/components/railCards";
import { useNet } from "@/components/topbar/useNet";
import { useTickHasFilter } from "@/components/useTickHasFilter";
import { UNLISTED_ID } from "@/src/data/unlisted";
import { NET } from "@/src/net/current";
import { cardNetwork } from "@/src/engine/domain/trendStack";
import { useStore } from "@/src/store/store";
import { noteSubjectOf, type NoteSubject } from "./noteSubject";
import type { NoteReq } from "./noteLoader";
import useNote, { type NoteState } from "./useNote";

// Its own module (2026-10-27) so the rail, the card and History's diamonds import the derivation
// without the card's render tree.

/** THE SCOPE A COUNTRY OR PROVIDER CARD'S OWN NOTE IS ASKED AT (`subjectNote.ts`): the FILTER,
 *  "all" being the fleet. Not `metagraphCardNetwork`, the top card's rule: the card's lead divides
 *  by `selNodes`, the filter's population ("Hosts 30% of the selection's nodes"), and under no
 *  filter Geography's metagraph card moves to a committed node's network while that lead keeps
 *  counting everything. The note is scoped as its lead is, so the two never read in two frames. */
export function useNoteScopeNetwork(): string {
  return useStore((s) => s.filter);
}

/** THE MAINNET GATE, one home for the top card and every subject card's note. Notes are written
 *  for mainnet only (the routes answer `none` everywhere else), so off mainnet nothing is asked and
 *  no card stands — never a card that reads, then vanishes.
 *  ⚠️ HYDRATION (I2): the server always renders mainnet, so a card's PRESENCE reads the network
 *  through `useNet()` — mainnet until mounted, on the client too — and server and client agree on
 *  the first render (a mismatch makes React 19 regenerate the tree and strip <html data-net>). The
 *  caller gates its `req` on that (`net === "mainnet"`). The FETCH, here, reads the real network,
 *  so a dev network's one mainnet-faced frame asks nothing: its card reads for that frame, under
 *  the boot overlay, then stands down. */
export function useMainnetNote(req: NoteReq | null): NoteState {
  const net = useNet();
  return useNote(NET === net ? req : null);
}

/** THE NOTE ON SCREEN, one derivation for the card, the rail's manifest and its focus, and the
 *  timeline diamonds: the subject the view stands on, the request for its note, and the answer.
 *  Every caller shares one fetch (the loader's cache and in-flight map are module-level). */
export function useAiNote(): { subject: NoteSubject | null; req: NoteReq | null; note: NoteState } {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const tickNet = useStore((s) => s.tickNet);
  const snap = useStore((s) => s.snap);
  const inspect = useStore((s) => s.inspect);
  const trendFocus = useStore((s) => s.trendFocus);
  const trendFront = useStore((s) => s.trendFront);
  const trendWindow = useStore((s) => s.trendWindow);
  const tickHasFilter = useTickHasFilter();

  const subject = noteSubjectOf(mode, {
    metagraphNetwork: metagraphCardNetwork({ mode, filter, tickNet, snap, tickHasFilter, trendFocus, trendFront, inspect }),
    trendCard: cardNetwork(filter, trendFocus, trendFront),
    unlisted: (id) => id === UNLISTED_ID,
  });
  // History's note is over the WINDOW pill on screen, brushed or not: a brushed range's note is
  // the Range card's own (`SubjectNote`), so a brush never takes this card over.
  const span = subject?.view === "trend" ? trendWindow : null;
  // Presence through `useNet()`, the fetch through the gate (`useMainnetNote`, the hydration rule).
  const net = useNet();
  const req: NoteReq | null = subject && net === "mainnet" ? { view: subject.view, subject: subject.subject, span } : null;
  return { subject, req, note: useMainnetNote(req) };
}
