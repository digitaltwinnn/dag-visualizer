import { METAGRAPHS } from "@/src/engine/config";

// THE NETWORKS A NOTE NAMES (user, 2026-10-31: "should/could it color code the metagraph text when
// mentioned?"). A note is plain text from a model, so code finds the names afterwards, against the
// catalog: the model decides no colour and its text is never trusted as markup. Pure, and each
// segment is the note's own characters, so the segments always join back to the text.
//
// Matched exactly and case-sensitively, whole words only: full names, tickers of three letters or
// more ("UP" is a word), and two short forms a first-word rule could not reach safely ("Common",
// "National" and "El" start names too). A shortened name outside those stays plain, which only
// costs a colour. Mainnet's catalog: notes exist nowhere else.

export interface NoteSegment {
  text: string;
  /** The network this text names, null for the words around it. */
  id: string | null;
}

const SHORT_FORMS: Record<string, string> = { "Dor Technologies": "Dor", "The Upsider AI": "Upsider AI" };

const FORMS = new Map<string, string>([["DAG", "dag"]]);
for (const m of METAGRAPHS) {
  FORMS.set(m.name, m.id);
  if (m.ticker.length >= 3) FORMS.set(m.ticker, m.id);
  const short = SHORT_FORMS[m.name];
  if (short) FORMS.set(short, m.id);
}

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Longest first, so "The Upsider AI" is one name and never "Upsider AI" inside it. */
const NAMES = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${[...FORMS.keys()].sort((a, b) => b.length - a.length).map(escaped).join("|")})(?![\\p{L}\\p{N}])`,
  "gu",
);
/** "333 DAG" is an amount of the token, not the network: fees are stated in it. */
const AMOUNT_BEFORE = /\d[\d,.]*[KMBT]?\s*$/;

export function noteSegments(text: string): NoteSegment[] {
  const out: NoteSegment[] = [];
  let at = 0;
  for (const m of text.matchAll(NAMES)) {
    const start = m.index;
    if (m[0] === "DAG" && AMOUNT_BEFORE.test(text.slice(0, start))) continue;
    if (start > at) out.push({ text: text.slice(at, start), id: null });
    out.push({ text: m[0], id: FORMS.get(m[0])! });
    at = start + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), id: null });
  return out;
}

/** The first `n` characters, for a note writing itself in: a name colours as its letters arrive. */
export function takeSegments(segments: readonly NoteSegment[], n: number): NoteSegment[] {
  const out: NoteSegment[] = [];
  let left = n;
  for (const s of segments) {
    if (left <= 0) break;
    out.push(s.text.length <= left ? s : { ...s, text: s.text.slice(0, left) });
    left -= s.text.length;
  }
  return out;
}
