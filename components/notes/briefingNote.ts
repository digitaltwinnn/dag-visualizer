import type { NoteResponse, NoteView } from "@/src/data/noteTypes";
import { LINE_MAX, type BriefingStop } from "@/src/engine/domain/briefing";
import type { NoteReq } from "./noteLoader";
import { noteSubjectOf } from "./noteSubject";

// WHAT THE BRIEFING SAYS AT EACH STOP (`domain/briefing.ts`): the model's own short line, else the
// opening of the same note, else a plain sentence about the view. The last carries no AI mark and
// no number: it stands in for a note that is not there, and nothing is invented (rule 10).

/** The window History rests on. A visitor on the tour has not chosen one. */
const TREND_SPAN = "30d";

/** The note a stop reads: the view at its widest, as a visitor with no filter would see it. The
 *  blocks stop reads the block DAG's own note, its whole network. */
export function briefingReq(stop: BriefingStop): NoteReq {
  if (stop.register === "blocks") return { view: "blocks", subject: "all", span: null };
  const view = stop.mode;
  const subject = noteSubjectOf(view, { metagraphNetwork: "all", unlisted: () => false })!;
  return { view: subject.view, subject: subject.subject, span: view === "trend" ? TREND_SPAN : null };
}

const PLAIN: Record<NoteView, string> = {
  geo: "Every node, at its real location.",
  ledger: "Every snapshot, anchored as it happens.",
  hyper: "Every network, by the nodes that run it.",
  trend: "The measured record of the network.",
  blocks: "Every block, built on two before it.",
};

const SENTENCE_RE = /.*?[.!?](?=\s|$)/gs;

/** The note's opening: its first sentence, and the next one while the caption holds them. A stop in
 *  a figure ("5.8") is not an end. A first sentence the caption cannot hold is cut at a word, with
 *  an ellipsis (user, 2026-11-02). */
export function openingOf(text: string): string {
  const [first, ...rest] = (text.match(SENTENCE_RE) ?? [text]).map((s) => s.trim());
  if (first!.length > LINE_MAX) return `${first!.slice(0, LINE_MAX).replace(/\s+\S*$/, "").replace(/[\s,;:]+$/, "")}…`;
  let out = first!;
  for (const next of rest) {
    if (out.length + 1 + next.length > LINE_MAX) break;
    out += ` ${next}`;
  }
  return out;
}

/** The words for a stop, and whether they are the AI's. */
export function briefingWords(view: NoteView, res: NoteResponse | null): { text: string; ai: boolean } {
  if (res?.state !== "ok") return { text: PLAIN[view], ai: false };
  return { text: res.line ?? openingOf(res.text), ai: true };
}
