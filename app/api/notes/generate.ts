import { factsBlock } from "@/src/data/noteFacts";
import { checkNote } from "@/src/data/noteHonesty";
import type { NoteDay, NoteResponse, NoteView } from "@/src/data/noteTypes";
import { GateError, type gateChat, type GateErrorKind } from "./gate";
import { failKeyOf, lockKeyOf, noteKeyOf, statsKeyOf, timingOf, type NoteSpan } from "./keys";
import { buildMessages, parseAnswer } from "./prompts";
import { noteSupported, type factsFor } from "./sources";
import type { NotesStore } from "./store";

// THE GENERATOR OF AI NOTES — one function from a request to a note: cache → singleflight → facts →
// model → honesty gate → retry → store → stats. Everything per view lives in `sources.ts`'s table
// and `prompts.ts`'s; nothing here branches on a view. It applies NO limits: the request route
// does, and only to brushed ranges (Task 9).
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
  /** Hyper `all` only: the networks with nodes when the digest was written (the warmer compares). */
  setKey?: string;
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
 *  of up to 8 s, two Gate attempts at their 20-second timeout (pacing is start to start, so there
 *  is no wait after a 20 s first call) and the set: 48 s plus the reads. 90 s leaves the reads about
 *  40 s. The unlock is unconditional, so a writer that outlived its lock would free the next
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
}

const NONE: NoteResponse = { state: "none" };
const PENDING: NoteResponse = { state: "pending" };
const UNAVAILABLE: NoteResponse = { state: "unavailable" };
const REQUEST: NoteResponse = { state: "request" };

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Count one outcome in the day's stats. Best effort: a stats write never changes the answer. */
export async function countStat(store: NotesStore, net: string, nowMs: number, field: NoteStat): Promise<void> {
  try {
    await store.hincr(statsKeyOf(net, isoDay(nowMs)), field, STATS_TTL_S);
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
  return { state: "ok", text: r.text, writtenAt: r.writtenAt, spanFrom: r.spanFrom, spanTo: r.spanTo, days: r.days };
}

function warn(req: NoteRequest, kind: string): void {
  console.warn(`[notes] ${req.view}/${req.subject}/${req.span}: ${kind}`);
}

type Written = { ok: true; text: string; days: NoteDay[] } | { ok: false; stat: NoteStat };

/** The model and the gate: at most two attempts, the second told why the first was rejected. */
async function write(
  req: NoteRequest,
  input: NonNullable<Awaited<ReturnType<typeof factsFor>>>,
  chat: typeof gateChat,
  count: (field: NoteStat) => Promise<void>,
): Promise<Written> {
  const block = factsBlock(input.facts, input.blurbs);
  const days = input.days.length ? input.days : null;
  // A sentence naming no one speaks of the subject (R39): absent for the whole network.
  const subject = input.subjectName;
  let reasons: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await count("retried");
    let answer: string;
    try {
      answer = await chat(buildMessages(req.view, input.label, block, days, reasons));
      await count("calls");
    } catch (e) {
      if (!(e instanceof GateError)) throw e; // not the Gate's: `generateNote` counts it as `error`
      const kind: GateErrorKind = e.kind;
      if (kind !== "nokey") await count("calls"); // a missing key never reached the Gate
      warn(req, kind);
      return { ok: false, stat: kind };
    }
    const { note, captions } = parseAnswer(answer);
    const check = checkNote(note, input.facts, input.names, { maxSentences: 3, subject });
    if (!check.ok) {
      reasons = check.reasons;
      continue;
    }
    const kept: NoteDay[] = [];
    for (const d of input.days) {
      const caption = captions.get(isoDay(d.dayMs));
      if (caption && checkNote(caption, input.facts, input.names, { maxSentences: 1, subject }).ok)
        kept.push({ dayMs: d.dayMs, kind: d.kind, networkId: d.networkId, caption });
    }
    return { ok: true, text: note, days: kept };
  }
  warn(req, "gateFail");
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
  const timing = timingOf(view, span);
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
      ...(input.setKey != null ? { setKey: input.setKey } : {}),
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
