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

/** THE NOTE ON SCREEN, one derivation for the card, the rail's manifest and its focus, and the
 *  timeline diamonds: the subject the view stands on, the request for its note, and the answer.
 *  Every caller shares one fetch (the loader's cache and in-flight map are module-level). */
export function useAiNote(): { subject: NoteSubject | null; req: NoteReq | null; note: NoteState } {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const tickNet = useStore((s) => s.tickNet);
  const snap = useStore((s) => s.snap);
  const inspect = useStore((s) => s.inspect);
  const country = useStore((s) => s.country);
  const trendFocus = useStore((s) => s.trendFocus);
  const trendFront = useStore((s) => s.trendFront);
  const trendWindow = useStore((s) => s.trendWindow);
  const trendRange = useStore((s) => s.trendRange);
  const tickHasFilter = useTickHasFilter();

  const subject = noteSubjectOf(mode, {
    metagraphNetwork: metagraphCardNetwork({ mode, filter, tickNet, snap, tickHasFilter, trendFocus, trendFront, inspect }),
    country,
    trendCard: cardNetwork(filter, trendFocus, trendFront),
    unlisted: (id) => id === UNLISTED_ID,
  });
  // History's note is over the span on screen: the brushed range, else the window pill.
  const span = subject?.view === "trend" ? (trendRange ? `r${trendRange.fromMs}-${trendRange.toMs}` : trendWindow) : null;
  // Notes are written for mainnet only (the routes answer `none` everywhere else), so off mainnet
  // nothing is asked and no card stands — never a card that reads, then vanishes.
  // ⚠️ HYDRATION (I2): the server always renders mainnet, so the card's presence reads the network
  // through `useNet()` — mainnet until mounted, on the client too — and server and client agree on
  // the first render (a mismatch makes React 19 regenerate the tree and strip <html data-net>). The
  // FETCH reads the real network, so a dev network's one mainnet-faced frame asks nothing: its card
  // reads for that frame, under the boot overlay, then stands down.
  const net = useNet();
  const req: NoteReq | null = subject && net === "mainnet" ? { view: subject.view, subject: subject.subject, span } : null;
  return { subject, req, note: useNote(NET === net ? req : null) };
}
