import type { NoteResponse, NoteView } from "@/src/data/noteTypes";
import { BRIEFING_STOPS } from "@/src/engine/domain/briefing";
import type { NoteReq } from "./noteLoader";
import { noteSubjectOf } from "./noteSubject";

// WHAT THE BRIEFING SAYS AT EACH STOP (`domain/briefing.ts`): the model's own short line, else the
// first sentence of the same note, else a plain sentence about the view. The last carries no AI
// mark and no number: it stands in for a note that is not there, and nothing is invented (rule 10).

/** The window History rests on. A visitor on the tour has not chosen one. */
const TREND_SPAN = "30d";

/** The note a stop reads: the view at its widest, as a visitor with no filter would see it. */
export function briefingReq(view: (typeof BRIEFING_STOPS)[number]): NoteReq {
  const subject = noteSubjectOf(view, { metagraphNetwork: "all", trendFilter: "all", unlisted: () => false })!;
  return { view: subject.view, subject: subject.subject, span: view === "trend" ? TREND_SPAN : null };
}

const PLAIN: Record<NoteView, string> = {
  geo: "Every node, at its real location.",
  ledger: "Every snapshot, anchored as it happens.",
  hyper: "Every network, by the nodes that run it.",
  trend: "The measured record of the network.",
};

/** The note's opening sentence: a stop in a figure ("5.8") is not an end. */
export function firstSentence(text: string): string {
  return (/^.*?[.!?](?=\s|$)/s.exec(text)?.[0] ?? text).trim();
}

/** The words for a stop, and whether they are the AI's. */
export function briefingWords(view: NoteView, res: NoteResponse | null): { text: string; ai: boolean } {
  if (res?.state !== "ok") return { text: PLAIN[view], ai: false };
  return { text: res.line ?? firstSentence(res.text), ai: true };
}
