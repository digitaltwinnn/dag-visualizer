import { factsBlock, pairChange, withChangeFacts } from "@/src/data/noteFacts";
import { checkNote } from "@/src/data/noteHonesty";
import { LINE_MAX } from "@/src/engine/domain/briefing";
import type { Fact, NoteChange, NoteDay, NoteResponse, NoteView } from "@/src/data/noteTypes";
import { GateError, type gateChat, type GateErrorKind } from "./gate";
import { failKeyOf, isBriefingNote, lockKeyOf, noteKeyOf, statsKeyOf, timingOf, type NoteSpan } from "./keys";
import { buildMessages, parseAnswer, spanBeforeWords, spanWords } from "./prompts";

const NEGATIVE_RE = /\b(?:no|none)\b/i;
import { utcDayKey } from "@/src/util/localTime";
import { noteSupported, type factsFor } from "./sources";
import type { NotesStore } from "./store";

// THE GENERATOR OF AI NOTES — one function from a request to a note: cache → singleflight → facts →
// model → honesty gate → retry → store → stats. Everything per view lives in `sources.ts`'s table
// and `prompts.ts`'s; nothing here branches on a view. It applies NO limits: the request route
// does, to the kinds `isLimitedNote` names.
//
// HONESTY (rule 10):
//   · a note is stored only after EVERY number in it matched a fact (`checkNote`); a failing note
//     is asked for once more with the gate's reasons, and a second failure stores nothing and is
//     counted (`gateFail`). A failing caption drops only its day;
//   · nothing to describe (a builder's null) stores nothing and answers `none`, without a model call;
//   · a store outage, the trends reads or this cache, answers `unavailable` and is counted
//     (`store`): an instrument state, never a guess and never an error dump.
//
// A PREVIEW WRITES NOTHING (R66): `deps.writable` (`notesWritable()`, store.ts) is false there, and
// every mode then serves the cache and answers a miss `none` — no note, hold, lock or stats.
//     Anything else that throws once the lock is taken answers the same, counted as `error`; the
//     lock is released in every case.
//
// A FAILURE HOLDS ITS KEY (R38). Nothing failed is stored as a note, so without a hold every later
// read of that key would ask the model again: a cache-buster, or a 429 storm, would turn visitors
// into unbounded model calls and starve the warm pass. So a read or a request that took the lock
// and did not write leaves `failKeyOf(key)` for `FAIL_TTL_S`, and a read or request that finds it
// answers `unavailable` before the lock, with no model call. The WARM pass ignores the hold and
// leaves none: it is the scheduled writer, already paced and budgeted.
//
// The model's text is UNTRUSTED: it is stored and returned as a plain string, never markup.
// SECRETS: nothing here sees the Gate key; a log line carries the view, subject, span and an error
// KIND, never a message or a model answer.

/** A stored note (`ai:{net}:v{N}:{view}:{subject}:{span}`, JSON). */
export interface NoteRecord {
  text: string;
  writtenAt: number;
  spanFrom: number;
  spanTo: number;
  days: NoteDay[];
  /** A view note's notable changes (`noteChanges.ts`), measured when the note was written. */
  changes?: NoteChange[];
  /** The Briefing's one line, on the four notes it reads (`isBriefingNote`). */
  line?: string;
  /** Hyper `all` only: the networks with nodes when the digest was written (the warmer compares). */
  setKey?: string;
  /** The network's held count this note was warmed under (`planPass`); absent on a visitor's write. */
  driftKey?: string;
}

/** The day's counters (`statsKeyOf`): one field per outcome, then two volumes. `store` is an
 *  Upstash read or write that failed, `error` anything else that threw after the lock was taken (a
 *  bug, never the model's fault); `capped` is the request route's. `calls` is every request that
 *  reached the Gate (a retry is one more; a missing key is none), `retried` every note that needed
 *  its second attempt: the go/no-go reads call volume, not only outcomes. */
export const NOTE_STATS = ["ok", "gateFail", "rate", "http", "timeout", "empty", "nokey", "store", "error", "capped", "calls", "retried"] as const;
export type NoteStat = (typeof NOTE_STATS)[number];
/** How long a day's counters are kept: the go/no-go script reads the last 14 days. */
export const STATS_TTL_S = 30 * 86_400;

/** The singleflight lock's TTL. A warm item's paced wait runs INSIDE the lock (`pacedChat` wraps
 *  the chat this generator calls), so the worst writer holds it for the facts reads, a paced wait
 *  of a second or two, two Gate attempts at their 20-second timeout and the set: 42 s plus the
 *  reads, a Snapshots note's row lookups among them (`LOCATE_BUDGET_MS`, 8 s). 90 s leaves the reads
 *  about 45 s. The unlock is unconditional, so a writer that outlived its lock would free the next
 *  writer's (R30). */
export const LOCK_TTL_S = 90;

/** How long a failed read or request holds its key (see the header): long enough that a burst of
 *  visitors, or a 429 run, costs one attempt per key, short enough that a passing outage heals. */
export const FAIL_TTL_S = 15 * 60;

export interface NoteRequest {
  net: string;
  view: NoteView;
  subject: string;
  span: NoteSpan;
}

export interface GenerateDeps {
  store: NotesStore;
  facts: typeof factsFor;
  chat: typeof gateChat;
  now: () => number;
  /** `notesWritable()` (store.ts): false on a preview, where every mode serves what is cached and
   *  answers a miss `none`, writing nothing (no note, hold, lock or stats) into the shared store. */
  writable: boolean;
}

/** "read": a visitor's read (an on-request kind is not written here); "warm": one item the cron
 *  pass PLANNED (`warm.ts`'s `planPass` already judged the cached record due, by age or by the
 *  network set, so whatever is cached is rewritten); "request": the request route (writes on a miss). */
export type GenerateMode = "read" | "warm" | "request";

export interface GenerateOptions {
  /** Warm only: the record's `writtenAt` when the pass planned this item (null: there was none).
   *  A record found with ANOTHER `writtenAt`, before or once the lock is held, was just written by
   *  someone else (an overlapping pass, a visitor's read): it is served, not rewritten. */
  seenWrittenAt?: number | null;
  /** Warm only: stored on the record, what the next pass compares against. */
  driftKey?: string;
  /** Request only: the limits, SPENT ONLY ON A WRITE (review 2026-10-29). Asked once the facts are
   *  in hand and non-null — inside the lock, before the model — so an ask that answers `none`
   *  (nothing measured for the subject) or `pending` (another writer's lock) costs the visitor
   *  nothing. An answer, when it gives one, stands in the note's place: no model call, nothing
   *  stored, no hold. */
  spend?: () => Promise<NoteResponse | null>;
}

const NONE: NoteResponse = { state: "none" };
const PENDING: NoteResponse = { state: "pending" };
const UNAVAILABLE: NoteResponse = { state: "unavailable" };
const REQUEST: NoteResponse = { state: "request" };


/** Count one outcome in the day's stats. Best effort: a stats write never changes the answer. */
export async function countStat(store: NotesStore, net: string, nowMs: number, field: NoteStat): Promise<void> {
  try {
    await store.hincr(statsKeyOf(net, utcDayKey(nowMs)), field, STATS_TTL_S);
  } catch {
    // The store is down; the answer already says so where it matters.
  }
}

function parseRecord(raw: string | null): NoteRecord | null {
  if (raw == null) return null;
  try {
    const r = JSON.parse(raw) as Partial<NoteRecord> | null;
    if (!r || typeof r.text !== "string" || typeof r.writtenAt !== "number" || typeof r.spanFrom !== "number" ||
      typeof r.spanTo !== "number" || !Array.isArray(r.days)) return null;
    return r as NoteRecord;
  } catch {
    return null;
  }
}

function okOf(r: NoteRecord): NoteResponse {
  return { state: "ok", text: r.text, writtenAt: r.writtenAt, spanFrom: r.spanFrom, spanTo: r.spanTo, days: r.days, ...(r.changes?.length ? { changes: r.changes } : {}), ...(r.line ? { line: r.line } : {}) };
}

function warn(req: NoteRequest, kind: string): void {
  console.warn(`[notes] ${req.view}/${req.subject}/${req.span}: ${kind}`);
}

type Written = { ok: true; text: string; days: NoteDay[]; line?: string } | { ok: false; stat: NoteStat };

/** The room an answer with a line gets: a cut-off answer is no answer, so a line must never cost
 *  its note (History's 30-day note also carries up to five captions). */
const LINE_TOKENS = 1000;

/** A note is a sentence or more. The parser takes what the model labelled, and a model has labelled
 *  a bare "the last 24 hours" (2026-11-01), which holds nothing the gate could fault. */
const NOTE_MIN_WORDS = 6;

/** Where a note is asked to say it again shorter. The prompt says under forty-five and the model
 *  drifts past that, so this catches the ones that run on, not the ones that land near it. */
const NOTE_MAX_WORDS = 50;

/** THE MODEL'S WORDS ARE ITS OWN (user, 2026-11-03: "remove hardcoded text changes on the prompt
 *  response"). Code once tidied checked text — percentages spliced in, an earlier figure dropped,
 *  "3 of the 3" made "all 3", "10s" spelled out, a first letter capitalised — and each splice was a
 *  hidden patch that could garble a sentence ("up 11% before", live). The prompt asks for all of it
 *  now and the facts carry every figure it needs (`withChangeFacts`); what the model still gets
 *  wrong in form is named here and asked for once more, like a negative or a long note, and the
 *  checked note stands if the second answer is no better. Honesty stays the gate's. */
function styleSlips(text: string, facts: readonly Fact[]): string[] {
  const out: string[] = [];
  if (/^[a-z]/.test(text.trim())) out.push("start the note with a capital letter");
  const unit = /\b\d+(?:\.\d+)?\s?(?:s|m|h|d)\b/.exec(text);
  if (unit) out.push(`"${unit[0]}": write the unit out in full, as the facts write it`);
  const whole = /(?<![\w.,])(\d+) of (?:the |its |their )?\1(?![\w%]|[.,]\d)/.exec(text);
  if (whole && whole[1] !== "1") out.push(`"${whole[0]}": say "${whole[1] === "2" ? "both" : `all ${whole[1]}`}" instead`);
  // AN EARLIER FIGURE WRITTEN BESIDE ITS CHANGE: the prompt asks for the current figure and how far it
  // moved, so a past end that has a change fact is one figure too many.
  const said = new Set<string>();
  for (const from of facts) {
    if (from.pair?.end !== "from" || said.has(from.text)) continue;
    const to = facts.find((f) => f.pair?.key === from.pair!.key && f.pair.end === "to");
    const pct = to ? pairChange(from, to) : 0;
    const hasChange = to != null && pct !== 0 && to.value !== 0 && pct < 1000;
    const elsewhere = facts.some((f) => f !== from && f.pair?.end !== "from" && f.text === from.text);
    const esc = from.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (hasChange && !elsewhere && new RegExp(`(?<![\\d.,])${esc}(?![\\d]|[.,]\\d)`).test(text)) {
      said.add(from.text);
      out.push(`"${from.text}" is an earlier figure: give only ${to!.text} and how far it moved, as its change fact says`);
    }
  }
  // A WHOLE SPAN WRITTEN AS A CLIMB ("blocks fell 50% to 154 per day" over two 90-day averages, live):
  // the figure is right and the shape says it moved inside the span (user, 2026-11-02).
  for (const to of facts) {
    if (to.pair?.end !== "to" || !to.pair.span) continue;
    const esc = to.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "grew 85% to 7,553 per day on the 30 days before" names what it is measured against and reads
    // true; the same rise with no "on …" after it reads as a climb inside the span.
    const climb = new RegExp(`\\b(?:rose|fell|grew|dropped|climbed|declined|increased|decreased|slipped)\\b[^.;]{0,40}?\\bto ${esc}(?![\\d]|[.,]\\d)([^.;,]*)`, "i").exec(text);
    if (climb && !/\bon\b/.test(climb[1] ?? ""))
      out.push(`"${to.text}" is a whole span's figure: say what it is measured against ("on the span before"), or write "averaged ${to.text} per day" with its change`);
  }
  // A NETWORK'S GLOBAL SNAPSHOTS AS A SHARE OR ANOTHER NOUN ("its share of global snapshots rose 5%",
  // "placements", live 2026-11-03): the figure is the global snapshots it was part of.
  const share = /\b(?:share of global snapshots|global snapshot (?:placements|appearances))\b/i.exec(text);
  if (share) out.push(`"${share[0]}": say "<network> was part of <figure> global snapshots per day"`);
  // "HELD" WITH A CHANGE BESIDE IT ("Fees held at 332 DAG per day, up 11%", live): held is no change.
  const held = /\bheld\b[^.;]*?\d+%/i.exec(text);
  if (held) out.push(`"${held[0]}": held means it did not move; a figure with a change rose or fell`);
  // A CHANGE WITH NO CURRENT FIGURE ("Germany lost 9% of its nodes", live): the reader gets how far
  // it moved and not where it stands.
  const moves = new Map<string, string[]>();
  for (const to of facts) {
    if (to.pair?.end !== "to") continue;
    const from = facts.find((f) => f.pair?.key === to.pair!.key && f.pair.end === "from");
    const pct = from ? pairChange(from, to) : 0;
    if (pct) moves.set(`${Math.abs(pct)}%`, [...(moves.get(`${Math.abs(pct)}%`) ?? []), to.text]);
  }
  for (const [pct, nows] of moves) {
    const has = (t: string) => new RegExp(`(?<![\\d.,])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d]|[.,]\\d)`).test(text);
    if (has(pct) && !nows.some(has)) out.push(`"${pct}": give the current figure beside its change, as "<what> fell ${pct} to <current figure>"`);
  }
  return out;
}

/** The model and the gate: at most two attempts, the second told why the first was rejected. */
async function write(
  req: NoteRequest,
  input: NonNullable<Awaited<ReturnType<typeof factsFor>>>,
  chat: typeof gateChat,
  count: (field: NoteStat) => Promise<void>,
): Promise<Written> {
  // Every measured change carries its own percentage (`withChangeFacts`): the model is shown it and
  // the gate backs it, so the note can say how far a figure moved without arithmetic.
  const facts = withChangeFacts(input.facts);
  const block = factsBlock(facts, input.blurbs);
  const days = input.days.length ? input.days : null;
  // A sentence naming no one speaks of the subject (R39): absent for the whole network.
  const subject = input.subjectName;
  const wantsLine = isBriefingNote(req.view, req.subject, req.span);
  const span = spanWords(req.view, req.span, input.spanFrom, input.spanTo);
  let reasons: string[] | undefined;
  let lastNote = "";
  /** A note that passed the gate and only failed the style rewrite: it stands if the rewrite fails. */
  let held: Written | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await count("retried");
    let answer: string;
    try {
      answer = await chat(buildMessages(req.view, input.label, block, days, reasons, input.lead, input.common, input.kind, span, input.whole, wantsLine, spanBeforeWords(req.view, req.span)), wantsLine ? { maxTokens: LINE_TOKENS } : undefined);
      await count("calls");
    } catch (e) {
      if (!(e instanceof GateError)) throw e; // not the Gate's: `generateNote` counts it as `error`
      const kind: GateErrorKind = e.kind;
      if (kind !== "nokey") await count("calls"); // a missing key never reached the Gate
      warn(req, kind);
      if (held) return held; // the rewrite was style, and a checked note is in hand
      return { ok: false, stat: kind };
    }
    const parsed = parseAnswer(answer);
    const { captions } = parsed;
    const note = parsed.note.trim();
    lastNote = note;
    const line = parsed.line?.trim();
    const check = checkNote(note, facts, input.names, { maxSentences: 3, minWords: NOTE_MIN_WORDS, subject });
    if (!check.ok) {
      if (held) return held;
      reasons = check.reasons;
      continue;
    }
    // SAID POSITIVELY, ONE REWRITE (user, 2026-10-31): the prompt alone was ignored ("no changes in
    // layers", live). This is style, not honesty, so it asks once and the second answer stands: a
    // true note is never lost over a word. Notes only: a caption is a short clause of figures. A
    // note that runs long takes the same one rewrite (user, 2026-11-01: "to the point").
    const negative = attempt === 0 ? NEGATIVE_RE.exec(note)?.[0] : null;
    const words = note.trim().split(/\s+/).length;
    const wordy = attempt === 0 && words > NOTE_MAX_WORDS;
    const slips = attempt === 0 ? styleSlips(note, facts) : [];
    const kept: NoteDay[] = [];
    const seen = new Map<string, number>();
    for (const d of input.days) {
      // The nth notable day of a date takes that date's nth caption (`parseAnswer`).
      const iso = utcDayKey(d.dayMs);
      const n = (seen.get(iso) ?? 0) + 1;
      seen.set(iso, n);
      const caption = captions.get(n === 1 ? iso : `${iso}#${n}`);
      if (caption && checkNote(caption, facts, input.names, { maxSentences: 1, subject }).ok)
        kept.push({ dayMs: d.dayMs, kind: d.kind, networkId: d.networkId, ...(d.measure ? { measure: d.measure } : {}), caption: caption.trim() });
    }
    // The Briefing's line is held to the note's gate and is never worth a retry: one that fails,
    // runs long or says what did not happen is dropped, and the tour reads the note instead.
    // THE TOUR'S LINE NAMES ITS RANGE (user, 2026-11-03: "the geo intro should mention the range"): a
    // line without the span's words is dropped, and the tour reads the note's opening, which names it.
    const named = line?.toLowerCase().includes(span.replace(/^the /, "").toLowerCase());
    const brief = wantsLine && line && named && !NEGATIVE_RE.test(line) && checkNote(line, facts, input.names, { maxSentences: 2, subject }).ok ? line : null;
    const written: Written = { ok: true, text: note, days: kept, ...(brief && brief.length <= LINE_MAX ? { line: brief } : {}) };
    if (negative || wordy || slips.length) {
      held = written;
      reasons = [
        ...(negative ? [`say what held steady instead of "${negative.toLowerCase()}"`] : []),
        ...(wordy ? [`${words} words: keep the note under forty-five, naming only the two biggest moves and cutting every other clause`] : []),
        ...slips,
      ];
      continue;
    }
    return written;
  }
  warn(req, "gateFail");
  // A LOCAL TRIAL NEEDS THE WHY (2026-11-03): prompt work reads the gate's reasons; production keeps its log to the outcome.
  if (process.env.NODE_ENV !== "production" && reasons?.length) console.warn(`[notes]   ${reasons.join("; ")}\n[notes]   wrote: ${lastNote}`);
  return { ok: false, stat: "gateFail" };
}

export async function generateNote(
  req: NoteRequest, deps: GenerateDeps, mode: GenerateMode, opts: GenerateOptions = {},
): Promise<NoteResponse> {
  const { net, view, subject, span } = req;
  const { store } = deps;
  const seen = opts.seenWrittenAt;
  /** Warm: a record other than the one planned (see `GenerateOptions`). */
  const writtenSincePlan = (r: NoteRecord | null): r is NoteRecord =>
    mode === "warm" && seen !== undefined && r != null && r.writtenAt !== seen;

  // 1. A note exists only for mainnet and the view's own, listed subjects.
  if (net !== "mainnet" || !noteSupported(view, subject, span, net)) return NONE;

  const key = noteKeyOf(net, view, subject, span);
  const timing = timingOf(view, span, subject);
  const now = deps.now();

  // 2. Cached: served, unless the warm pass planned its rewrite (and nobody has done it since).
  let cached: NoteRecord | null;
  try {
    cached = parseRecord(await store.get(key));
  } catch {
    warn(req, "store");
    if (deps.writable) await countStat(store, net, now, "store");
    return UNAVAILABLE;
  }
  if (cached && (mode !== "warm" || writtenSincePlan(cached))) return okOf(cached);

  // 2a. A read-only deployment (a preview, R66) serves the cache and writes nothing, in every mode.
  if (!deps.writable) return cached ? okOf(cached) : NONE;

  // 2b. A recent failure holds the key: no model call until it expires (reads and requests only).
  const failKey = failKeyOf(key);
  if (mode !== "warm") {
    try {
      if ((await store.get(failKey)) != null) return UNAVAILABLE;
    } catch {
      warn(req, "store");
      await countStat(store, net, now, "store");
      return UNAVAILABLE;
    }
  }
  /** Leave the hold after a failed read or request. Best effort: a failed write changes nothing. */
  const hold = async (): Promise<void> => {
    if (mode === "warm") return;
    try {
      await store.set(failKey, "1", FAIL_TTL_S);
    } catch {
      // The store is down; the answer already says so.
    }
  };

  // 3. An on-request kind (the 1h pill, a brushed range) is written only when asked for.
  if (!cached && timing.refreshMs == null && mode === "read") return REQUEST;

  // 4. Singleflight: one writer per note.
  const lock = lockKeyOf(key);
  try {
    if (!(await store.lock(lock, LOCK_TTL_S))) return PENDING;
  } catch {
    warn(req, "store");
    await countStat(store, net, now, "store");
    return UNAVAILABLE;
  }

  try {
    // 4b. Warm: the lock may have been taken just after another writer released it, so the record
    // is read again under the lock; one written since the plan is served, never paid for twice.
    if (mode === "warm" && seen !== undefined) {
      let held: NoteRecord | null;
      try {
        held = parseRecord(await store.get(key));
      } catch {
        warn(req, "store");
        await countStat(store, net, now, "store");
        return UNAVAILABLE;
      }
      if (writtenSincePlan(held)) return okOf(held);
    }

    // 5. The facts. Nothing to describe: nothing stored, no model call.
    let input: Awaited<ReturnType<typeof factsFor>>;
    try {
      input = await deps.facts(net, view, subject, span, now);
    } catch {
      warn(req, "store");
      await countStat(store, net, now, "store");
      await hold();
      return UNAVAILABLE;
    }
    if (!input) return NONE;

    // 5b. A limited request spends its count now, on a note that is about to be written.
    if (opts.spend) {
      const refused = await opts.spend();
      if (refused) return refused;
    }

    // 6–7. The model, held to the facts.
    const written = await write(req, input, deps.chat, (field) => countStat(store, net, now, field));
    if (!written.ok) {
      await countStat(store, net, now, written.stat);
      await hold();
      return UNAVAILABLE;
    }

    // 8. Stored, counted.
    const record: NoteRecord = {
      text: written.text,
      writtenAt: now,
      spanFrom: input.spanFrom,
      spanTo: input.spanTo,
      days: written.days,
      ...(input.changes.length ? { changes: input.changes } : {}),
      ...(written.line ? { line: written.line } : {}),
      ...(input.setKey != null ? { setKey: input.setKey } : {}),
      ...(opts.driftKey != null ? { driftKey: opts.driftKey } : {}),
    };
    try {
      await store.set(key, JSON.stringify(record), timing.ttlS);
    } catch {
      warn(req, "store");
      await countStat(store, net, now, "store");
      await hold();
      return UNAVAILABLE;
    }
    await countStat(store, net, now, "ok");
    return okOf(record);
  } catch {
    // Anything else that threw once the lock was taken: an instrument state, counted, never a dump.
    warn(req, "error");
    await countStat(store, net, now, "error");
    await hold();
    return UNAVAILABLE;
  } finally {
    try {
      await store.unlock(lock);
    } catch {
      // The lock's own TTL reaps it.
    }
  }
}
