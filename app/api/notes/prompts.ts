import type { ChangeBrief, NoteLead, NoteView, NotableDay } from "@/src/data/noteTypes";
import { DAY_WORDS, WEEK_WORDS } from "@/src/data/noteChanges";
import { utcDayKey } from "@/src/util/localTime";
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
  "Be concise and to the point: name the two biggest moves, not every one, drop any figure or clause the point can stand without, and keep the whole note under forty-five words.",
  "Answer the question in its order: what it asks for first comes first, even when it held.",
  "Within each part, lead with what changed. Do not restate a breakdown the reader can already see on screen, such as how many nodes run each layer, unless it changed.",
  // THE CURRENT FIGURE AND HOW FAR IT MOVED (user, 2026-11-03: "from x to y, up z% can be shortened
  // by saying just the current value and its increase"). Every measured change has a "change
  // against" fact (`withChangeFacts`), so the model copies a percentage rather than working one out.
  "When something rose or fell, give the current figure and how far it moved, in one of two shapes: \"<what> fell <change> to <current figure>\", or \"<current figure>, up <change> on <what it is measured against>\". Take the change from its \"change against\" fact, with that fact's direction. Never write the earlier figure. A figure with no change fact either held, or moved too far for a percentage to mean anything: say where it stands now, and that it held only when its ends are the same.",
  // HONEST, AND SAID POSITIVELY (user, 2026-10-31). The second half of the rule is what keeps it honest.
  "Say things positively. When a figure grew, open the sentence with the growth, never leave it trailing at the end. When nothing moved, say what held steady, anywhere in a sentence: never write that something did not happen, such as \"no changes\" or \"no networks\". A range where nothing was anchored at all was quiet: say it in one sentence, in the shape \"<the range>, <name> was quiet, and last anchored on <date>\", or first anchored on the date when the facts say it had not begun, and never call it steady. State a fall plainly: never soften, hide or reframe it, and never call a figure good or bad.",
  // THE READER'S WORD (user, 2026-11-07: "you often say 'span' but I prefer range or other human readable term").
  "Call a stretch of time a range, a period or the days named, and never a span: the reader does not use that word.",
  "",
  "Rules:",
  "Plain, present tense, no hype, no advice. No meta-commentary: never mention the facts, the data, the note or yourself.",
  // EVERY SENTENCE A FINDING (user, 2026-11-09: "check … if sometimes you're not saying anything of
  // added value"): live, a History note opened "The hypergraph view shows network activity."
  "Every sentence states a finding about the subject: never describe the view, the dashboard or what it shows, and never confirm what was counted or read.",
  "Write figures exactly as the facts give them: use only numbers from the facts, and never round a small figure to zero.",
  "Do not use quantity words the facts do not state: no \"half\", \"hundreds\", \"thousands\", \"dozens\", no \"-fold\", no \"doubles\" or \"doubling\". \"Doubled\", \"tripled\" and \"halved\" are fine only when a ratio in the facts supports them.",
  "Only use durations the facts give, with the unit written out as they give it: seconds, minutes, hours, days, never a single letter and never a decimal point in a duration: the facts say a duration whole, with \"about\" where it was rounded, and so do you. Do not name a range length with digits unless a fact states it.",
  "Name the range in your first sentence, once, in exactly the words the Span line gives and no others around them: \"over the last … days\" when it says \"the last … days\", \"from … to …\" as given when it says \"from … to …\", never \"over from\"; the reader sees the same words on the card.",
  "Call the subject by its name, as the Subject line gives it, wherever you would otherwise say \"the network\" or \"it\": \"the network\" alone is only for the whole network.",
  "Describe what the numbers show: never explain why, and never read a purpose or a cause into them.",
  "Say nodes, never machines. A network's own snapshots are metagraph snapshots and the DAG's are global snapshots: name the kind every time, never a bare \"snapshots\" (a fact that says snapshots without \"global\" means metagraph snapshots), never ticks, never \"L1 snapshots\". Never say feeless. All the nodes together are the network, never the fleet.",
  "The DAG produces global snapshots and each metagraph produces its own metagraph snapshots: never say the whole network, or a metagraph, produced global snapshots. A network's share of global snapshots is what it \"was part of\"; the DAG is part of nothing: it produces them. A fact that says a network is \"in global snapshots\" is said as \"<network> was part of <figure> global snapshots per day\", with its change after it, never with another noun such as placements or appearances.",
  "A network creates its metagraph snapshots and anchors them into global snapshots. A network that creates metagraph snapshots is an active network, never an \"anchoring network\". A note about one network says nothing about other networks being active.",
  "L0, currency L1 and data L1 are layers.",
  "Make no claim about how decentralised or distributed anything is.",
  "Never say which lost or gained the most: give the figures and let the reader compare them.",
  "Use no noun more than twice in a sentence: name a thing once and let the sentence carry it.",
  "Start every sentence with a capital letter. When a count covers all of a group, say \"all\" with the number, or \"both\" for two, never the number twice.",
  "Punctuation: no dash clauses. Never use an em dash, and never a hyphen or en dash with a blank on each side. Use commas, colons and full stops.",
].join("\n");

// THE COMMON READING IS RETIRED (user, 2026-11-09; it was R74, 2026-10-29): Hypergraph and Geography
// notes closed on one sentence of activity, "Activity was up: the DAG produced N global snapshots
// per day last week, up 3% on the weeks before". Activity is the Snapshots and History views'
// subject; in these two it repeated the same sentence, so neither the facts nor the question carry
// it. Each question asks for what its view shows, and VOICE says the order is the question's.
//
// THE SNAPSHOTS NOTE ASKS ONE OF TWO QUESTIONS (R71, user 2026-10-29: "change, else now"). Its
// subject is a live rhythm that mostly holds, and a note made to lead with change then opens on
// noise. The facts builder says which (`NoteFacts.lead`, from its own pairs and one threshold) and
// NAMES the pairs that moved, so the model leads with those and not with a one-percent drift
// beside them; `questionNow` is the reading itself, and it has to say so out loud because VOICE
// asks every note to lead with what changed.
//
// A SUBJECT NOTE ASKS ITS KIND'S QUESTION (a country, a provider, a node make-up). The card the
// reader pressed already sets the frame (which country, which provider, which make-up), so the
// question asks for that subject's count, ITS PLACE IN ITS RUNG — share and rank among the other
// countries, providers or make-ups, always, not only when nothing moved (user, 2026-10-30: the note
// replaces the card's measured lead, "how that selected subject relates to the overall distribution
// within the rung") — and how it moved over the range. `kind` is the kind of
// QUESTION (`NoteFacts.kind`), so the warmed network-wide country, a view note, asks the view's own.
// A kind a view has no question for falls back to the view's: only geo has country and provider,
// only hyper has type.
// A SUBJECT QUESTION SPELLS OUT ITS OPENING SHAPE (user, 2026-10-30). The Subject line is a scope
// phrase ("Dor Technologies nodes in Finland"), and VOICE's "call the subject by its name" had the
// model use it as a noun: "Dor Technologies nodes in Finland run 2", which he read as "not really
// logical". Each kind's question now gives the first sentence's shape with an ACTOR, "<network>
// hosts N nodes in <country>", so the name lands as the sentence's subject, not as a label.
type KindQuestions = Partial<Record<Exclude<SubjectKind, "view">, string>>;
// A SPAN AGAINST THE ONE BEFORE IT IS NOT A CLIMB INSIDE THE SPAN (user, 2026-11-02). Live: "Over the
// last 30 days, global snapshots rose 86% from 4,021 to 7,478 per day", where both were 30-day
// averages and the figure inside the range rose about a third. The gate holds the form, since the
// figures alone are right (`noteHonesty.ts`).
export function spanFigures(spanBefore?: string | null): string {
  const before = spanBefore ? `"${spanBefore}"` : "the range before";
  return `A figure for "this range" or the "previous range" is that whole range, as an average per day or a total, never a point in it: never say it rose or fell over the range. Give its change against ${before}, in one of two shapes: "<what> averaged <this range's figure> per day, up <change> on ${before}", or "<what> rose <change> to <this range's figure> per day on ${before}", with "down" or "fell" for a fall and the change from its "change against" fact, never the previous range's figure. After the first time, "on the range before" will do, or the averaged shape alone. A total or a spacing takes the same shapes without "averaged" and "per day". Figures "at the start of the range" and "at the end of the range" did move inside the span: write those as "<what> rose <change> to <end figure>" or "fell <change> to". A ratio is for reading: never write it as a figure. Count nothing yourself: a count the facts do not give, such as how many days are listed, is not written.`;
}

export const PROMPTS: Record<NoteView, { question: string; questions?: KindQuestions; questionNow?: string; system: (subjectLabel: string, lead?: NoteLead, kind?: SubjectKind, spanBefore?: string | null) => string }> = {
  hyper: {
    // A QUIET WEEK IS SAID (user, 2026-10-30): the facts count what changed even at 0, so the note
    // says the composition held rather than reaching for the node count, which is Geography's too.
    // NOTHING THAT DID NOT HAPPEN (user, 2026-11-09): live, "no network became active or went quiet"
    // ended a sentence about the DAG's nodes. A network that started or stopped is named only when one did.
    question: "First, who and what is on the network over the span: networks or layers that gained or lost nodes, and a network that became active or went quiet only when one did; if nothing changed there, say plainly that it was a steady week: the node count held at its level and the layers held steady, and for the whole network so did the number of active networks.",
    questions: {
      // "LAYER GROUP", never "make-up" (user, 2026-10-30): the Composition rung's own word. And the
      // group's place is said as a reader would ("its largest group"), not as a share and a rank
      // (the same day: "I don't know what is meant by 'which is 52% of its nodes and ranks first
      // among its layer groups'"). And the NODES are the sentence's subject, since a node runs its
      // layers (the same day: "do they run the nodes on L0 or is the node composed out of it?").
      type: "Open with a plain sentence whose subject is the nodes, in the shape \"N of the M <network> nodes run <layers>\", M being all its nodes, the layers named exactly as the facts name them, with no possessive on the name (a node RUNS its layers, so the verb is run); then say in plain words where that group stands among the network's layer groups, as a reader would (\"its largest group\", \"the smaller of its two groups\", \"its only group\"), never \"share\", \"rank\" or a percentage; then how that changed over the range, or that it held.",
    },
    system: (subjectLabel, _lead, kind) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${questionOf("hyper", kind)}`,
  },
  geo: {
    questions: {
      // VARIED, NOT A TEMPLATE (user, 2026-11-03: "for country or provider the text is very similar, we
      // can show some variation"): the shapes stay as guides, so the name is still the sentence's
      // actor (2026-10-30), and the note opens on whatever is most telling for this subject.
      country: "Say three things about this country, in whichever order reads best for it, opening on the most telling: if it gained or lost nodes, that move; else its place or its share. The three: how many of the network's nodes it hosts, with the network or the country as the sentence's actor (\"<network> runs N nodes in <country>\", \"<country> hosts N of <network>'s nodes\", or your own plain words); what share of the network's nodes that is and its place among the network's countries said in plain words (\"the network's largest\", \"its third\"), never \"rank\", or, when the facts count one country, that it is the network's only country, with no share and no place; and how that moved over the range, or that it held. A count of countries or providers is the network's, never this country's. Say nothing about speed.",
      provider: "Say three things about this provider, network-wide and not for one place, in whichever order reads best for it, opening on the most telling: if it gained or lost nodes, that move; else its place or its share. The three: how many of the network's nodes it hosts, with the provider as the sentence's actor (\"<provider> hosts N of <network>'s nodes\", \"<provider> runs N nodes for <network>\", or your own plain words); what share of the network's nodes that is and its place among the network's providers said in plain words (\"the network's largest\", \"its third\"), never \"rank\", or, when the facts count one provider, that it is the network's only provider, with no share and no place; and how that moved over the range, or that it held. Say nothing about speed.",
    },
    // ONE PLACE, NOT TWO (user, 2026-11-03: "Germany fell 6% to 31 and Hetzner Online fell 7% to 52":
    // "the country and provider are closely related; so pick only one of the two with the most
    // significant change"): a provider's nodes sit in a country, so the two moves are usually one.
    question: "First, how many nodes there are and how that moved, then where they run: of the countries and hosting providers that gained or lost nodes, name only the ONE with the largest change, since a provider's nodes sit in a country and the two moves are usually the same nodes, with its current count, as \"<country or provider> fell <change> to <count>\", without calling it the largest; or where the nodes are now when nothing moved. Say nothing about speed.",
    system: (subjectLabel, _lead, kind) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${questionOf("geo", kind)}\nStay on where the nodes are located and who hosts them, and nothing else.`,
  },
  ledger: {
    question: "Say what changed in the anchoring rhythm over the recent hours against the usual: what sped up or slowed down, as the recent figure and how far it is from the usual (\"<recent figure>, up <change> on the usual\"), and which networks did it. Then the reading itself: the longest gap, then, in one short clause: for the whole network, what each global snapshot holds, as \"N metagraph snapshots from M networks in each global snapshot\", never that it was part of anything; for one network, only the share of global snapshots it was part of.",
    questionNow: "The recent hours ran close to the usual, so this note does not lead with what changed, whatever the rules above say: do not describe a change and do not mention the usual figures. Say what the anchoring rhythm looks like right now over the recent hours: how often metagraph snapshots are being anchored, their spacing, the longest gap, then, in one short clause: for the whole network, what each global snapshot holds, as \"N metagraph snapshots from M networks in each global snapshot\", never that it was part of anything; for one network, only the share of global snapshots it was part of.",
    system: (subjectLabel, lead) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${lead?.kind === "now" ? PROMPTS.ledger.questionNow : PROMPTS.ledger.question}${
        lead?.kind === "change" ? `\nLead with what moved: ${lead.moved.join("; ")}. Every other figure held close to its usual: give it as a reading, never as a change.` : ""
      }`,
  },
  // THE BLOCK DAG (the Snapshots view's Blocks register): the chamber's
  // second clock, in the ledger's voice. Its facts hold no earlier figure, so, like the ledger's
  // `questionNow`, it says out loud that it does not lead with change: VOICE asks every note to.
  blocks: {
    // WHAT THE BLOCKS CARRIED, NOT THE HEIGHT (user, 2026-11-09: a technical confirmation is "of no
    // use to the reader; focus on the core message"): a block exists to carry transfers.
    question: "What has the block DAG been doing? This note does not lead with what changed, whatever the rules above say: the facts hold no earlier figure, so never say anything rose or fell. Say how many blocks were accepted over the recent hours and the transfers they carried, the DAG's first, as \"the DAG accepted N blocks carrying M transfers\", then each network's token blocks the same way. A block carries transfers: never call a block a snapshot or a transfer.",
    system: (subjectLabel) => `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${PROMPTS.blocks.question}`,
  },
  // THE DATA BLOCKS (the Snapshots view's Data blocks register, 2026-11-07): the live window, read
  // when the note is written — a few minutes of the chamber, no earlier figure, so nothing moved.
  data: {
    question: "What data are the networks writing right now? This note does not lead with what changed, whatever the rules above say: the facts hold no earlier figure, so never say anything rose or fell. Say how many data blocks were carried over the window and how many updates they held, then each network that carried any, as \"<network> carried N data blocks with M updates\". Only when the facts say how many of the window's global snapshots were read, add in one clause that the counts cover those; otherwise say nothing about reading. A data block carries updates, never transactions or transfers.",
    system: (subjectLabel) => `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${PROMPTS.data.question}`,
  },
  trend: {
    question: "Say what changed over the range: what rose, what fell and when, as the numbers show it.",
    questions: {
      // THE SPAN FACET (user, 2026-10-30: the Range card on the window must not copy the top card's
      // note — "we should be able to write something complementary"): the same facts, the range read
      // for its SHAPE (its extremes against the typical day), never its ends: live, "where it began
      // and ended" came back as the very rise the top card states.
      span: "Describe the range's shape, as a companion to a note above it that already states what rose and fell: the busiest day and the quietest day, each with its date and figure, and a typical day's figure, using only the facts named for those days. If the facts name none, say how quiet or steady the range was. Do not say what rose or fell overall.",
    },
    // THE SPAN-BEFORE WORDS ARE WRITTEN IN (live 2026-11-03: a placeholder naming the "Span before
    // line" came back as "up 26% … on the Span before"): the rule carries the very words to use.
    system: (subjectLabel, _lead, kind, spanBefore) =>
      `${VOICE}\n\nSubject: ${subjectLabel}.\nQuestion: ${questionOf("trend", kind)}\n${spanFigures(spanBefore)}`,
  },
};

/** The question a note asks: its kind's when the view has one for it, else the view's own. */
function questionOf(view: NoteView, kind?: SubjectKind): string {
  const p = PROMPTS[view];
  return (kind && kind !== "view" ? p.questions?.[kind] : undefined) ?? p.question;
}


/** THE SPAN IN THE CARD PILL'S OWN WORDS (user, 2026-10-30: "mention the range in its text as
 *  well … 'The network held at 6 networks during the last 7 days'"), stated to the model on a
 *  `Span:` line and asked for in the first sentence. One vocabulary with the client's
 *  (`spanPhrase` / `noteSpanWords`): the fixed week of Hypergraph and Geography, the Snapshots day,
 *  History's pills, and a brushed range by its UTC days exactly as the Range card titles it
 *  (`rangeDays`: the last day shown is the day holding `toMs - 1`). The honesty gate backs every
 *  figure here: the digits are the range-length duration facts, the dates a range's `Span start` /
 *  `Span end` date facts. */
const PILL_WORDS: Record<string, string> = {
  "1h": "the last hour",
  "24h": "the last 24 hours",
  "7d": "the last 7 days",
  "30d": "the last 30 days",
  "90d": "the last 90 days",
  "1y": "the last year",
  all: "all measured history",
};
const BEFORE_WORDS: Record<string, string> = {
  "1h": "the hour before",
  "24h": "the 24 hours before",
  "7d": "the 7 days before",
  "30d": "the 30 days before",
  "90d": "the 90 days before",
  "1y": "the year before",
};
/** The equal range History compares its figures with, in the note's words. Null where none is read. */
export function spanBeforeWords(view: NoteView, span: NoteSpan): string | null {
  if (view !== "trend" || span === "all") return null;
  const range = /^r(\d+)-(\d+)$/.exec(span);
  const days = range ? (Number(range[2]) - Number(range[1])) / 86_400_000 : 0;
  if (days === 1) return "the day before";
  return Number.isInteger(days) && days > 1 ? `the ${days} days before` : (BEFORE_WORDS[span] ?? "the same length of time before");
}
const utcDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export function spanWords(view: NoteView, span: NoteSpan, spanFrom: number, spanTo: number): string {
  if (view === "hyper" || view === "geo") return WEEK_WORDS.range;
  if (view === "ledger" || view === "blocks") return DAY_WORDS.range;
  // The data note's window is the chamber's: a few minutes, measured when the note was written.
  if (view === "data") { const min = Math.max(1, Math.round((spanTo - spanFrom) / 60_000)); return `the last ${min} ${min === 1 ? "minute" : "minutes"}`; }
  if (span in PILL_WORDS) return PILL_WORDS[span]!;
  const a = utcDay(spanFrom);
  const b = utcDay(Math.max(spanFrom, spanTo - 1));
  return a === b ? `on ${a}` : `from ${a} to ${b}`;
}

/** The two messages for one attempt. `days` (History's 7d / 30d / 1y / all) asks for one caption
 *  line per notable day, in the order given; the facts already describe each day, numbered the
 *  same way. `retryReasons` names why the previous answer was rejected, so the second attempt can
 *  correct it. `lead` is the Snapshots builder's choice of question (R71); the other views ignore it.
 *  `kind` is the kind of question (`NoteFacts.kind`): a subject note asks its own. */
/** THE CAPTION FORMAT. THE ROW SAYS THE DATE AND THE KIND (user, 2026-10-30, design B: "date and
 *  kind lead"), so a caption repeats neither: a short clause with the figure and whose it was. */
export const CAPTION_FORMAT =
  "Answer format: first a line starting NOTE: with the note, then exactly one line per listed day, starting DAY YYYY-MM-DD: with a caption of one short clause, at most ten words, using only numbers from the facts, in plain words a reader would say: never \"median\", never \"against\". The reader sees the day's date and what kind of day it was beside the caption, so the caption repeats neither: it gives the figure and whose it was, as the facts name the day. For a first or last day, the network and that nothing was anchored before, or since. For the range's busiest or quietest day, a spike or a dip: the day's figure and what it counts, then how far it stood from the usual, in the shape \"<figure> <what>, up <change> on a typical day\", with \"down\" for a fall and the change from the day's \"change against\" fact. For a pause or a longest gap: what paused and for how long, then the normal spacing it stood against, in the shape \"Global snapshots paused for <gap>, normally one every <spacing>\" for the hypergraph, or \"Anchoring paused for <gap>, normally a metagraph snapshot every <spacing>\" for a network. Never \"wait\". For the most networks: the day's figure, then the typical day's as \"usually …\". Start with a capital letter. Nothing else.";

/** THE NOTABLE-CHANGE ROWS, IN THE MODEL'S WORDS (user, 2026-11-03: "the notable-change rows all must
 *  come from AI"). Code picks each row and hands its brief; the model writes the line. */
export const ROW_FORMAT =
  "Then, after every other line, exactly one line per listed row, starting CHANGE n: with the row's line: one plain sentence of at most twelve words, without a full stop, that names the row's subject first and says what happened, using only that row's own figures as they are given. A count that moved reads like \"<subject> lost <nodes lost> nodes, now <end figure>\", with the place after the subject when the row names one, and no percentage: the note carries those; a pause like \"<subject> paused for <pause length>, normally one every <normal spacing>\"; a pace like \"<subject> sped up: a metagraph snapshot every <recent>, usually <usual>\"; an event with no figures says what happened in plain words. A row adds to the note, never repeats it (user: rows should not \"almost copy\" the note): use different words from the note, and when the note already gives the row's change, the row gives what the note leaves out, such as where it stands now or where it happened. Never \"wait\", never a figure the row does not give.";

/** THE BRIEFING'S LINE: what the tour shows at this view's stop, in the note's own answer. */
export const LINE_FORMAT =
  "One more line belongs in this answer, whatever the format above says: directly after the note, a line starting LINE: with the note's main findings as one or two plain sentences, eighteen to twenty-two words in all, opening with the range in the Span line's own words. Keep the note's own wording for it: the range, what moved, and its figures and changes as the note writes them.";

export function buildMessages(
  view: NoteView,
  subjectLabel: string,
  factsBlock: string,
  days: NotableDay[] | null,
  retryReasons?: string[],
  lead?: NoteLead,
  kind?: SubjectKind,
  span?: string | null,
  line?: boolean,
  spanBefore?: string | null,
  rows?: readonly ChangeBrief[] | null,
): { role: "system" | "user"; content: string }[] {
  const withDays = !!days && days.length > 0;
  const withRows = !!rows && rows.length > 0;
  const format = (withDays
    ? CAPTION_FORMAT
    : withRows ? "Answer format: first a line starting NOTE: with the note." : "Answer format: one line starting NOTE: and nothing else.") + (withRows ? ` ${ROW_FORMAT}` : "");
  const spanLines = [...(span ? [`Span: ${span}`] : []), ...(spanBefore ? [`Span before: ${spanBefore}`] : [])];
  const parts = [...(spanLines.length ? [spanLines.join("\n")] : []), `Facts:\n${factsBlock}`];
  if (withDays) parts.push(`Days to caption, in order:\n${days.map((d) => `DAY ${utcDayKey(d.dayMs)}`).join("\n")}`);
  // The note and its rows share one card, so the note keeps to the overall picture and leaves each
  // row's own figures to the row (user, 2026-11-03: the rows "almost copy the card's own AI section").
  if (withRows) parts.push("These rows stand under the note on the card: keep the note on the overall picture, and leave each row's own figures to its row rather than saying them twice.");
  if (withRows) parts.push(`Rows to write, in order:\n${rows.map((r, i) => [`CHANGE ${i + 1}: ${r.about}`, ...r.facts.map((f) => `  ${f.label}: ${f.text}`)].join("\n")).join("\n")}`);
  if (retryReasons && retryReasons.length)
    parts.push(`Your previous answer was rejected: ${retryReasons.join("; ")}. Write it again and fix this.`);
  return [
    { role: "system", content: `${PROMPTS[view].system(subjectLabel, lead, kind, spanBefore)}\n\n${format}${line ? ` ${LINE_FORMAT}` : ""}` },
    { role: "user", content: parts.join("\n\n") },
  ];
}

// A closed block, or an UNCLOSED one running to the end (the model reasoned until max_tokens).
const THINK_RE = /<think>[\s\S]*?(?:<\/think>|$)/gi;
const NOTE_RE = /^[\s*_#]*NOTE[*_]*:[*_\s]*(.*)$/i;
const DAY_RE = /^[\s*_#]*DAY\s+(\d{4}-\d{2}-\d{2})[*_]*\s*:[*_\s]*(.*)$/i;
const LINE_RE = /^[\s*_#]*LINE[*_]*:[*_\s]*(.*?)[*_\s]*$/i;
const CHANGE_RE = /^[\s*_#]*CHANGE\s+(\d+)[*_]*\s*:[*_\s]*(.*?)[*_\s]*$/i;
/** A `LINE:` the model ran on from the note: put on its own line before anything reads it. */
const LINE_RUN_ON_RE = /(?<=\S)[ \t]+(?=[*_]*LINE[*_]*:)/g;
const FENCE_RE = /^```/;

/** READ THE ANSWER BACK: `NOTE: …`, an optional `LINE: …`, then one `DAY YYYY-MM-DD: …` line per day. Tolerant by design,
 *  because the model sometimes wraps its output or reasons first: whitespace, code fences, markdown
 *  on the markers and any lines before `NOTE:` are ignored, a leaked `<think>` block, closed or cut
 *  off, is dropped, and a blank line ends the note. A second caption for one date is keyed
 *  `<date>#2`, so two notable days on a date keep their own. A note may run over several lines
 *  up to the first DAY line. With no `NOTE:` line at all the whole trimmed text is the note, and
 *  there are no captions. */
export function parseAnswer(text: string): { note: string; captions: Map<string, string>; line: string | null; rows: Map<number, string> } {
  const lines = text.replace(THINK_RE, "").replace(LINE_RUN_ON_RE, "\n").trim().split("\n").map((l) => l.trim()).filter((l) => !FENCE_RE.test(l));
  const captions = new Map<string, string>();
  const rows = new Map<number, string>();
  const start = lines.findIndex((l) => NOTE_RE.test(l));
  if (start < 0) {
    const said = lines.find((l) => LINE_RE.test(l));
    // A row or a caption line is never the note, even with no NOTE: line to say where it ends.
    return { note: lines.filter((l) => l !== said && !CHANGE_RE.test(l) && !DAY_RE.test(l)).join("\n").trim(), captions, line: said ? LINE_RE.exec(said)![1]!.trim() || null : null, rows };
  }
  const note = [NOTE_RE.exec(lines[start]!)![1]!];
  const seen = new Map<string, number>();
  let inNote = true;
  let brief: string | null = null;
  for (const line of lines.slice(start + 1)) {
    const day = DAY_RE.exec(line);
    const said = LINE_RE.exec(line);
    const change = CHANGE_RE.exec(line);
    if (change) {
      inNote = false;
      const text = change[2]!.trim();
      if (text) rows.set(Number(change[1]), text);
    } else if (said) {
      inNote = false;
      brief = said[1]!.trim() || null;
    } else if (day) {
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
  return { note: note.join("\n").trim(), captions, line: brief, rows };
}
