import type { NoteView, NotableDay } from "@/src/data/noteTypes";

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
  "Lead with what changed. Do not restate a breakdown the reader can already see on screen, such as how many nodes run each layer, unless it changed.",
  "When something rose or fell, say by how much: write it from the earlier figure to the current one, both as the facts state them for that same thing, never only the direction.",
  "",
  "Rules:",
  "Plain, present tense, no hype, no advice. No meta-commentary: never mention the facts, the data, the note or yourself.",
  "Write figures exactly as the facts give them: use only numbers from the facts, and never round a small figure to zero.",
  "Do not use quantity words the facts do not state: no \"half\", \"hundreds\", \"thousands\", \"dozens\", no \"-fold\", no \"doubles\" or \"doubling\". \"Doubled\", \"tripled\" and \"halved\" are fine only when a ratio in the facts supports them.",
  "Only use durations the facts give. Do not name a span length with digits unless a fact states it.",
  "Describe what the numbers show: never explain why, and never read a purpose or a cause into them.",
  "Say nodes, never machines. Say snapshots or global snapshots, never ticks, never \"L1 snapshots\". Never say feeless.",
  "A network's share of global snapshots is what it \"was part of\".",
  "L0, currency L1 and data L1 are layers.",
  "Make no claim about how decentralised or distributed anything is.",
  "Punctuation: no dash clauses. Never use an em dash, and never a hyphen or en dash with a blank on each side. Use commas, colons and full stops.",
].join("\n");

export const PROMPTS: Record<NoteView, { question: string; system: (subjectLabel: string) => string }> = {
  hyper: {
    question: "Say what changed in who and what is on the network over the span: networks or layers that gained or lost nodes, networks that started or stopped anchoring, how much more or less active they were. If nothing changed, say in one sentence that it held, with the level.",
    system: (subjectLabel) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${PROMPTS.hyper.question}`,
  },
  geo: {
    question: "Say how the places the nodes run have shifted: countries and hosting providers that gained or lost nodes. Where the facts hold no change, say briefly where the nodes are now. Say nothing about activity or speed.",
    system: (subjectLabel) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${PROMPTS.geo.question}\nStay on where the nodes are located and who hosts them, and nothing else.`,
  },
  ledger: {
    question: "Say what the anchoring rhythm looks like over the recent hours: how steadily snapshots are being anchored and which networks are doing it.",
    system: (subjectLabel) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${PROMPTS.ledger.question}`,
  },
  trend: {
    question: "Say what changed over the span: what rose, what fell and when, as the numbers show it.",
    system: (subjectLabel) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${PROMPTS.trend.question}`,
  },
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The two messages for one attempt. `days` (History's 7d / 30d / 1y / all) asks for one caption
 *  line per notable day, in the order given; the facts already describe each day, numbered the
 *  same way. `retryReasons` names why the previous answer was rejected, so the second attempt can
 *  correct it. */
export function buildMessages(
  view: NoteView,
  subjectLabel: string,
  factsBlock: string,
  days: NotableDay[] | null,
  retryReasons?: string[],
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
    { role: "system", content: `${PROMPTS[view].system(subjectLabel)}\n\n${format}` },
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
