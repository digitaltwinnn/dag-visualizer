import type { NoteLead, NoteView, NotableDay } from "@/src/data/noteTypes";
import type { NoteSpan, SubjectKind } from "./keys";

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
  // HONEST, AND SAID POSITIVELY (user, 2026-10-31). The second half of the rule is what keeps it honest.
  "Say things positively. When a figure grew, open the sentence with the growth, never leave it trailing at the end. When nothing moved, say what held steady, anywhere in a sentence: never write that something did not happen, such as \"no changes\" or \"no networks\". A span where nothing was anchored at all was quiet. State a fall plainly: never soften, hide or reframe it, and never call a figure good or bad.",
  "",
  "Rules:",
  "Plain, present tense, no hype, no advice. No meta-commentary: never mention the facts, the data, the note or yourself.",
  "Write figures exactly as the facts give them: use only numbers from the facts, and never round a small figure to zero.",
  "Do not use quantity words the facts do not state: no \"half\", \"hundreds\", \"thousands\", \"dozens\", no \"-fold\", no \"doubles\" or \"doubling\". \"Doubled\", \"tripled\" and \"halved\" are fine only when a ratio in the facts supports them.",
  "Only use durations the facts give. Do not name a span length with digits unless a fact states it.",
  "Name the span in your first sentence, once, in exactly the words the Span line gives and no others around them: \"over the last … days\" when it says \"the last … days\", \"from … to …\" as given when it says \"from … to …\", never \"over from\"; the reader sees the same words on the card.",
  "Call the subject by its name, as the Subject line gives it, wherever you would otherwise say \"the network\" or \"it\": \"the network\" alone is only for the whole network.",
  "Describe what the numbers show: never explain why, and never read a purpose or a cause into them.",
  "Say nodes, never machines. Say snapshots or global snapshots, never ticks, never \"L1 snapshots\". Never say feeless. All the nodes together are the network, never the fleet.",
  "A network's share of global snapshots is what it \"was part of\"; the whole network is part of nothing: it produces them.",
  "A network creates its snapshots and anchors them into global snapshots. A network that creates snapshots is an active network, never an \"anchoring network\". A note about one network says nothing about other networks being active.",
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
// question asks for that subject's count, ITS PLACE IN ITS RUNG — share and rank among the other
// countries, providers or make-ups, always, not only when nothing moved (user, 2026-10-30: the note
// replaces the card's measured lead, "how that selected subject relates to the overall distribution
// within the rung") — and how it moved over the span. The common reading is the NETWORK's, not the subject's, so a subject note has
// none: its facts answer `common: false` and the part is never asked. `kind` is the kind of
// QUESTION (`NoteFacts.kind`), so the warmed network-wide country, a view note, asks the view's own.
// A kind a view has no question for falls back to the view's: only geo has country and provider,
// only hyper has type.
// A SUBJECT QUESTION SPELLS OUT ITS OPENING SHAPE (user, 2026-10-30). The Subject line is a scope
// phrase ("Dor Technologies nodes in Finland"), and VOICE's "call the subject by its name" had the
// model use it as a noun: "Dor Technologies nodes in Finland run 2", which he read as "not really
// logical". Each kind's question now gives the first sentence's shape with an ACTOR, "<network>
// hosts N nodes in <country>", so the name lands as the sentence's subject, not as a label.
type KindQuestions = Partial<Record<Exclude<SubjectKind, "view">, string>>;
// The whole network's activity, in its own words (user, 2026-10-30): one string for both views.
const QUESTION_COMMON_WHOLE = "Last, in one sentence, how active the network was: open with the direction, up, down or steady, then the global snapshots it produced per day last week against the weeks before.";
export const PROMPTS: Record<NoteView, { question: string; questions?: KindQuestions; questionNow?: string; questionCommon?: string; questionCommonWhole?: string; system: (subjectLabel: string, lead?: NoteLead, common?: boolean, kind?: SubjectKind, whole?: boolean) => string }> = {
  hyper: {
    // A QUIET WEEK IS SAID (user, 2026-10-30): the facts count what changed even at 0, so the note
    // says the composition held rather than reaching for the node count, which is Geography's too.
    question: "First, who and what is on the network over the span: networks or layers that gained or lost nodes, networks that became active or went quiet; if nothing changed there, say so plainly: a steady week: the node count held at its level and the layers held steady, and for the whole network so did the active networks.",
    questions: {
      // "LAYER GROUP", never "make-up" (user, 2026-10-30): the Composition rung's own word. And the
      // group's place is said as a reader would ("its largest group"), not as a share and a rank
      // (the same day: "I don't know what is meant by 'which is 52% of its nodes and ranks first
      // among its layer groups'"). And the NODES are the sentence's subject, since a node runs its
      // layers (the same day: "do they run the nodes on L0 or is the node composed out of it?").
      type: "Open with a plain sentence whose subject is the nodes, in the shape \"N of the M <network> nodes run <layers>\", M being all its nodes, the layers named exactly as the facts name them, with no possessive on the name (a node RUNS its layers, so the verb is run); then say in plain words where that group stands among the network's layer groups, as a reader would (\"its largest group\", \"the smaller of its two groups\"), never \"share\", \"rank\" or a percentage; then how that changed over the span, or that it held.",
    },
    questionCommon: "Last, in one sentence, how active it was: open with the direction, up, down or steady, then the global snapshots it was part of per day last week against the weeks before.",
    questionCommonWhole: QUESTION_COMMON_WHOLE,
    system: (subjectLabel, _lead, common, kind, whole) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${questionOf("hyper", kind)}${common ? ` ${whole ? QUESTION_COMMON_WHOLE : PROMPTS.hyper.questionCommon}` : ""}`,
  },
  geo: {
    questions: {
      country: "Open with a plain sentence with the network as its actor, in the shape \"<network> hosts N nodes in <country>\"; then what share of the network's located nodes that is and the country's place among the network's countries; then how that moved over the span, or that it held. Say nothing about speed.",
      provider: "Open with a plain sentence with the provider as its actor, in the shape \"<provider> hosts N of <network>'s nodes\", network-wide, not for one place; then what share of the network's nodes with a known provider that is and its place among the network's providers; then how that moved over the span, or that it held. Say nothing about speed.",
    },
    question: "First, where the nodes run: countries and hosting providers that gained or lost nodes, or where the nodes are now when nothing moved. Say nothing about speed.",
    questionCommon: "Last, in one sentence, how active the network was: open with the direction, up, down or steady, then its global snapshots per day last week against the weeks before.",
    questionCommonWhole: QUESTION_COMMON_WHOLE,
    system: (subjectLabel, _lead, common, kind, whole) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${questionOf("geo", kind)}${common ? ` ${whole ? QUESTION_COMMON_WHOLE : PROMPTS.geo.questionCommon}` : ""}\nStay on where the nodes are located and who hosts them${common ? ", then the one sentence on activity" : ""}, and nothing else.`,
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
    questions: {
      // THE SPAN FACET (user, 2026-10-30: the Range card on the window must not copy the top card's
      // note — "we should be able to write something complementary"): the same facts, the span read
      // for its SHAPE (its extremes against the typical day), never its ends: live, "where it began
      // and ended" came back as the very rise the top card states.
      span: "Describe the span's shape, as a companion to a note above it that already states what rose and fell: the busiest day and the quietest day, each with its date and figure, and a typical day's figure, using only the facts named for those days. If the facts name none, say how quiet or steady the span was. Do not say what rose or fell overall.",
    },
    system: (subjectLabel, _lead, _common, kind) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${questionOf("trend", kind)}`,
  },
};

/** The question a note asks: its kind's when the view has one for it, else the view's own. */
function questionOf(view: NoteView, kind?: SubjectKind): string {
  const p = PROMPTS[view];
  return (kind && kind !== "view" ? p.questions?.[kind] : undefined) ?? p.question;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** THE SPAN IN THE CARD PILL'S OWN WORDS (user, 2026-10-30: "mention the range in its text as
 *  well … 'The network held at 6 networks during the last 7 days'"), stated to the model on a
 *  `Span:` line and asked for in the first sentence. One vocabulary with the client's
 *  (`spanPhrase` / `noteSpanWords`): the fixed week of Hypergraph and Geography, the Snapshots day,
 *  History's pills, and a brushed range by its UTC days exactly as the Range card titles it
 *  (`rangeDays`: the last day shown is the day holding `toMs - 1`). The honesty gate backs every
 *  figure here: the digits are the span-length duration facts, the dates a range's `Span start` /
 *  `Span end` date facts. */
const PILL_WORDS: Record<string, string> = {
  "1h": "the last hour",
  "24h": "the last 24 hours",
  "7d": "the last 7 days",
  "30d": "the last 30 days",
  "1y": "the last year",
  all: "all measured history",
};
const utcDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export function spanWords(view: NoteView, span: NoteSpan, spanFrom: number, spanTo: number): string {
  if (view === "hyper" || view === "geo") return "the last 7 days";
  if (view === "ledger") return "the last 24 hours";
  if (span in PILL_WORDS) return PILL_WORDS[span]!;
  const a = utcDay(spanFrom);
  const b = utcDay(Math.max(spanFrom, spanTo - 1));
  return a === b ? `on ${a}` : `from ${a} to ${b}`;
}

/** The two messages for one attempt. `days` (History's 7d / 30d / 1y / all) asks for one caption
 *  line per notable day, in the order given; the facts already describe each day, numbered the
 *  same way. `retryReasons` names why the previous answer was rejected, so the second attempt can
 *  correct it. `lead` is the Snapshots builder's choice of question (R71); the other views ignore it.
 *  `common` says the facts hold the common reading, so Hypergraph and Geography ask for it (R74).
 *  `kind` is the kind of question (`NoteFacts.kind`): a subject note asks its own. */
/** THE CAPTION FORMAT. THE ROW SAYS THE DATE AND THE KIND (user, 2026-10-30, design B: "date and
 *  kind lead"), so a caption repeats neither: a short clause with the figure and whose it was. */
export const CAPTION_FORMAT =
  "Answer format: first a line starting NOTE: with the note, then exactly one line per listed day, starting DAY YYYY-MM-DD: with a caption of one short clause, at most ten words, using only numbers from the facts, in plain words a reader would say: never \"median\", never \"against\". The reader sees the day's date and what kind of day it was beside the caption, so the caption repeats neither: it gives the figure and whose it was, as the facts name the day. For a first or last day, the network and that nothing was anchored before, or since. For the span's busiest, quietest, longest wait or most networks, the day's figure, then the typical day's as \"usually …\". For a spike or a dip, the same shape: the day's figure, then the usual as \"usually …\". Nothing else.";

export function buildMessages(
  view: NoteView,
  subjectLabel: string,
  factsBlock: string,
  days: NotableDay[] | null,
  retryReasons?: string[],
  lead?: NoteLead,
  common?: boolean,
  kind?: SubjectKind,
  span?: string | null,
  whole?: boolean,
): { role: "system" | "user"; content: string }[] {
  const withDays = !!days && days.length > 0;
  const format = withDays
    ? CAPTION_FORMAT
    : "Answer format: one line starting NOTE: and nothing else.";
  const parts = [...(span ? [`Span: ${span}`] : []), `Facts:\n${factsBlock}`];
  if (withDays) parts.push(`Days to caption, in order:\n${days.map((d) => `DAY ${isoDay(d.dayMs)}`).join("\n")}`);
  if (retryReasons && retryReasons.length)
    parts.push(`Your previous answer was rejected: ${retryReasons.join("; ")}. Write it again and fix this.`);
  return [
    { role: "system", content: `${PROMPTS[view].system(subjectLabel, lead, common, kind, whole)}\n\n${format}` },
    { role: "user", content: parts.join("\n\n") },
  ];
}

// A closed block, or an UNCLOSED one running to the end (the model reasoned until max_tokens).
const THINK_RE = /<think>[\s\S]*?(?:<\/think>|$)/gi;
const NOTE_RE = /^[\s*_#]*NOTE[*_]*:[*_\s]*(.*)$/i;
const DAY_RE = /^[\s*_#]*DAY\s+(\d{4}-\d{2}-\d{2})[*_]*\s*:[*_\s]*(.*)$/i;
const FENCE_RE = /^```/;

/** READ THE ANSWER BACK: `NOTE: …` then one `DAY YYYY-MM-DD: …` line per day. Tolerant by design,
 *  because the model sometimes wraps its output or reasons first: whitespace, code fences, markdown
 *  on the markers and any lines before `NOTE:` are ignored, a leaked `<think>` block, closed or cut
 *  off, is dropped, and a blank line ends the note. A second caption for one date is keyed
 *  `<date>#2`, so two notable days on a date keep their own. A note may run over several lines
 *  up to the first DAY line. With no `NOTE:` line at all the whole trimmed text is the note, and
 *  there are no captions. */
export function parseAnswer(text: string): { note: string; captions: Map<string, string> } {
  const lines = text.replace(THINK_RE, "").trim().split("\n").map((l) => l.trim()).filter((l) => !FENCE_RE.test(l));
  const captions = new Map<string, string>();
  const start = lines.findIndex((l) => NOTE_RE.test(l));
  if (start < 0) return { note: lines.join("\n").trim(), captions };
  const note = [NOTE_RE.exec(lines[start]!)![1]!];
  const seen = new Map<string, number>();
  let inNote = true;
  for (const line of lines.slice(start + 1)) {
    const day = DAY_RE.exec(line);
    if (day) {
      inNote = false;
      const caption = day[2]!.trim();
      const n = (seen.get(day[1]!) ?? 0) + 1;
      seen.set(day[1]!, n);
      if (caption) captions.set(n === 1 ? day[1]! : `${day[1]!}#${n}`, caption);
    } else if (inNote) {
      if (line) note.push(line);
      else if (note.some(Boolean)) inNote = false; // what follows a blank line is the model talking
    }
  }
  return { note: note.join("\n").trim(), captions };
}
