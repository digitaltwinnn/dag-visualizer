import type { NoteLead, NoteView, NotableDay } from "@/src/data/noteTypes";
import type { SubjectKind } from "./keys";

// THE PROMPTS OF AI NOTES — one home for what the model is told and how its answer is read back.
// The voice is the About page's (`components/aboutCopy.ts`): plain, present tense, nodes not
// machines. The honesty gate (`src/data/noteHonesty.ts`) FAILS CLOSED on a number it cannot back
// and on the house vocabulary, so `VOICE` also steers the model toward what the gate accepts;
// every rule here that sounds fussy (write figures exactly, no "half", no "-fold") is a sentence
// the gate would otherwise reject and the generator would pay a retry for.
//
// Changing any wording here changes what notes say: bump `NOTES_VERSION` (keys.ts).
//
// NO DIGITS IN AN EXAMPLE (R59): the model echoes them. "(from 14 a month ago to 9)" here was
// followed by a note ending "to 9" on facts where 9 was a provider's count; examples are words.
//
// The model's text is UNTRUSTED. Nothing here renders it; `parseAnswer` only splits it.

export const VOICE = [
  "You write one short note about a live network dashboard: the reader can see the numbers; say what stands out, in two or three plain sentences.",
  "Answer the question in its order: what it asks for first is what this view shows and comes first, even when it held; what it asks for last comes last, in one sentence.",
  "Within each part, lead with what changed. Do not restate a breakdown the reader can already see on screen, such as how many nodes run each layer, unless it changed.",
  "When something rose or fell, say by how much: write it from the earlier figure to the current one, both as the facts state them for that same thing, never only the direction.",
  "",
  "Rules:",
  "Plain, present tense, no hype, no advice. No meta-commentary: never mention the facts, the data, the note or yourself.",
  "Write figures exactly as the facts give them: use only numbers from the facts, and never round a small figure to zero.",
  "Do not use quantity words the facts do not state: no \"half\", \"hundreds\", \"thousands\", \"dozens\", no \"-fold\", no \"doubles\" or \"doubling\". \"Doubled\", \"tripled\" and \"halved\" are fine only when a ratio in the facts supports them.",
  "Only use durations the facts give. Do not name a span length with digits unless a fact states it.",
  "Describe what the numbers show: never explain why, and never read a purpose or a cause into them.",
  "Say nodes, never machines. Say snapshots or global snapshots, never ticks, never \"L1 snapshots\". Never say feeless. All the nodes together are the network, never the fleet.",
  "A network's share of global snapshots is what it \"was part of\".",
  "L0, currency L1 and data L1 are layers.",
  "Make no claim about how decentralised or distributed anything is.",
  "Punctuation: no dash clauses. Never use an em dash, and never a hyphen or en dash with a blank on each side. Use commas, colons and full stops.",
].join("\n");

// THE VIEW'S OWN SUBJECT FIRST, THE COMMON READING LAST (user, 2026-10-29; R74): a Hypergraph note
// opened on snapshots ("Digital Evidence was part of 7,329 global snapshots per day… The node count
// held at 3") because VOICE said "lead with what changed" and the nodes had not. Each question now
// has two parts in order — what the view shows, then the one common reading, activity
// (`src/data/noteFactsActivity.ts`) — and VOICE says the order is the question's. Snapshots and
// History ask one question: the ledger's subject is activity itself, History measures everything.
//
// THE SNAPSHOTS NOTE ASKS ONE OF TWO QUESTIONS (R71, user 2026-10-29: "change, else now"). Its
// subject is a live rhythm that mostly holds, and a note made to lead with change then opens on
// noise. The facts builder says which (`NoteFacts.lead`, from its own pairs and one threshold) and
// NAMES the pairs that moved, so the model leads with those and not with a one-percent drift
// beside them; `questionNow` is the reading itself, and it has to say so out loud because VOICE
// asks every note to lead with what changed.
// `questionCommon` is the LAST part (R74), asked only while the facts hold the common reading
// (`common`): asked without it, the model wrote one from a share ratio.
//
// A SUBJECT NOTE ASKS ITS KIND'S QUESTION (a country, a provider, a node make-up). The card the
// reader pressed already sets the frame (which country, which provider, which make-up), so the
// question asks only for that subject's count and how it moved, with its place in the whole when
// nothing moved. The common reading is the NETWORK's, not the subject's, so a subject note has
// none: its facts answer `common: false` and the part is never asked. `kind` is the kind of
// QUESTION (`NoteFacts.kind`), so the warmed network-wide country, a view note, asks the view's own.
// A kind a view has no question for falls back to the view's: only geo has country and provider,
// only hyper has type.
type KindQuestions = Partial<Record<Exclude<SubjectKind, "view">, string>>;
export const PROMPTS: Record<NoteView, { question: string; questions?: KindQuestions; questionNow?: string; questionCommon?: string; system: (subjectLabel: string, lead?: NoteLead, common?: boolean, kind?: SubjectKind) => string }> = {
  hyper: {
    question: "First, who and what is on the network over the span: networks or layers that gained or lost nodes, networks that started or stopped anchoring; if nothing changed there, say that it held, with the level.",
    questions: {
      type: "First, how many of the network's nodes run this make-up and how that changed over the span; if nothing changed, say it held, with the level and its share of the network's nodes.",
    },
    questionCommon: "Last, in one sentence, how active it was: the global snapshots it was part of per day last week against the weeks before.",
    system: (subjectLabel, _lead, common, kind) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${questionOf("hyper", kind)}${common ? ` ${PROMPTS.hyper.questionCommon}` : ""}`,
  },
  geo: {
    questions: {
      country: "First, how many of the network's nodes run in the country and how that moved over the span; if nothing moved, say it held, with the level and the country's place among the network's countries. Say nothing about speed.",
      provider: "First, how many nodes the provider hosts across the network and how that moved over the span, stated as network-wide, not for one place; if nothing moved, say it held, with the level and its place among the providers. Say nothing about speed.",
    },
    question: "First, where the nodes run: countries and hosting providers that gained or lost nodes, or where the nodes are now when nothing moved. Say nothing about speed.",
    questionCommon: "Last, in one sentence, how active the network was: its global snapshots per day last week against the weeks before.",
    system: (subjectLabel, _lead, common, kind) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${questionOf("geo", kind)}${common ? ` ${PROMPTS.geo.questionCommon}` : ""}\nStay on where the nodes are located and who hosts them${common ? ", then the one sentence on activity" : ""}, and nothing else.`,
  },
  ledger: {
    question: "Say what changed in the anchoring rhythm over the recent hours against the usual: what sped up or slowed down, from the usual figure to the recent one, and which networks did it. Then the reading itself: the longest gap, and what was part of the global snapshots.",
    questionNow: "The recent hours ran close to the usual, so this note does not lead with what changed, whatever the rules above say: do not describe a change and do not mention the usual figures. Say what the anchoring rhythm looks like right now over the recent hours: how often snapshots are being anchored, their spacing, the longest gap, which networks are doing it and what they were part of.",
    system: (subjectLabel, lead) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${lead?.kind === "now" ? PROMPTS.ledger.questionNow : PROMPTS.ledger.question}${
        lead?.kind === "change" ? `\nLead with what moved: ${lead.moved.join("; ")}. Every other figure held close to its usual: give it as a reading, never as a change.` : ""
      }`,
  },
  trend: {
    question: "Say what changed over the span: what rose, what fell and when, as the numbers show it.",
    system: (subjectLabel) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${PROMPTS.trend.question}`,
  },
};

/** The question a note asks: its kind's when the view has one for it, else the view's own. */
function questionOf(view: NoteView, kind?: SubjectKind): string {
  const p = PROMPTS[view];
  return (kind && kind !== "view" ? p.questions?.[kind] : undefined) ?? p.question;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The two messages for one attempt. `days` (History's 7d / 30d / 1y / all) asks for one caption
 *  line per notable day, in the order given; the facts already describe each day, numbered the
 *  same way. `retryReasons` names why the previous answer was rejected, so the second attempt can
 *  correct it. `lead` is the Snapshots builder's choice of question (R71); the other views ignore it.
 *  `common` says the facts hold the common reading, so Hypergraph and Geography ask for it (R74).
 *  `kind` is the kind of question (`NoteFacts.kind`): a subject note asks its own. */
export function buildMessages(
  view: NoteView,
  subjectLabel: string,
  factsBlock: string,
  days: NotableDay[] | null,
  retryReasons?: string[],
  lead?: NoteLead,
  common?: boolean,
  kind?: SubjectKind,
): { role: "system" | "user"; content: string }[] {
  const withDays = !!days && days.length > 0;
  const format = withDays
    ? "Answer format: first a line starting NOTE: with the note, then exactly one line per listed day, starting DAY YYYY-MM-DD: with a caption of one short sentence using only numbers from the facts. Do not repeat the date in the caption. Nothing else."
    : "Answer format: one line starting NOTE: and nothing else.";
  const parts = [`Facts:\n${factsBlock}`];
  if (withDays) parts.push(`Days to caption, in order:\n${days.map((d) => `DAY ${isoDay(d.dayMs)}`).join("\n")}`);
  if (retryReasons && retryReasons.length)
    parts.push(`Your previous answer was rejected: ${retryReasons.join("; ")}. Write it again and fix this.`);
  return [
    { role: "system", content: `${PROMPTS[view].system(subjectLabel, lead, common, kind)}\n\n${format}` },
    { role: "user", content: parts.join("\n\n") },
  ];
}

// A closed block, or an UNCLOSED one running to the end (the model reasoned until max_tokens).
const THINK_RE = /<think>[\s\S]*?(?:<\/think>|$)/gi;
const NOTE_RE = /^\s*NOTE:\s*(.*)$/i;
const DAY_RE = /^\s*DAY\s+(\d{4}-\d{2}-\d{2})\s*:\s*(.*)$/i;

/** READ THE ANSWER BACK: `NOTE: …` then one `DAY YYYY-MM-DD: …` line per day. Tolerant by design,
 *  because the model sometimes wraps its output or reasons first: whitespace and any lines before
 *  `NOTE:` are ignored, and a leaked `<think>` block, closed or cut off, is dropped. A note may run over several lines
 *  up to the first DAY line. With no `NOTE:` line at all the whole trimmed text is the note, and
 *  there are no captions. */
export function parseAnswer(text: string): { note: string; captions: Map<string, string> } {
  const lines = text.replace(THINK_RE, "").trim().split("\n").map((l) => l.trim());
  const captions = new Map<string, string>();
  const start = lines.findIndex((l) => NOTE_RE.test(l));
  if (start < 0) return { note: lines.join("\n").trim(), captions };
  const note = [NOTE_RE.exec(lines[start]!)![1]!];
  let inNote = true;
  for (const line of lines.slice(start + 1)) {
    const day = DAY_RE.exec(line);
    if (day) {
      inNote = false;
      const caption = day[2]!.trim();
      if (caption) captions.set(day[1]!, caption);
    } else if (inNote && line) note.push(line);
  }
  return { note: note.join("\n").trim(), captions };
}
