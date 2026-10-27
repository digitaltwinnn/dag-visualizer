import { factsBlock } from "@/src/data/noteFacts";
import { checkNote } from "@/src/data/noteHonesty";
import type { NoteDay, NoteResponse, NoteView } from "@/src/data/noteTypes";
import { GateError, type gateChat, type GateErrorKind } from "./gate";
import { lockKeyOf, noteKeyOf, statsKeyOf, timingOf, type NoteSpan } from "./keys";
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
//     Anything else that throws once the lock is taken answers the same, counted as `error`; the
//     lock is released in every case.
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

/** The day's counters (`statsKeyOf`): one field per outcome. `store` is an Upstash read or write
 *  that failed, `error` anything else that threw after the lock was taken (a bug, never the model's
 *  fault); `capped` is the request route's. */
export const NOTE_STATS = ["ok", "gateFail", "rate", "http", "timeout", "empty", "nokey", "store", "error", "capped"] as const;
export type NoteStat = (typeof NOTE_STATS)[number];
/** How long a day's counters are kept: the go/no-go script reads the last 14 days. */
export const STATS_TTL_S = 30 * 86_400;

/** The singleflight lock's TTL: two Gate attempts at their 20-second timeout plus the reads, with
 *  room to spare. The unlock is unconditional, so a writer that outlived its lock would free the
 *  next writer's (R30). */
export const LOCK_TTL_S = 60;

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
}

/** "read": a visitor's read (an on-request kind is not written here); "warm": the cron pass (a
 *  record older than its refresh is rewritten); "request": the request route (writes on a miss). */
export type GenerateMode = "read" | "warm" | "request";

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
): Promise<Written> {
  const block = factsBlock(input.facts, input.blurbs);
  const days = input.days.length ? input.days : null;
  let reasons: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let answer: string;
    try {
      answer = await chat(buildMessages(req.view, input.label, block, days, reasons));
    } catch (e) {
      if (!(e instanceof GateError)) throw e; // not the Gate's: `generateNote` counts it as `error`
      const kind: GateErrorKind = e.kind;
      warn(req, kind);
      return { ok: false, stat: kind };
    }
    const { note, captions } = parseAnswer(answer);
    const check = checkNote(note, input.facts, input.names, { maxSentences: 3 });
    if (!check.ok) {
      reasons = check.reasons;
      continue;
    }
    const kept: NoteDay[] = [];
    for (const d of input.days) {
      const caption = captions.get(isoDay(d.dayMs));
      if (caption && checkNote(caption, input.facts, input.names, { maxSentences: 1 }).ok)
        kept.push({ dayMs: d.dayMs, kind: d.kind, networkId: d.networkId, caption });
    }
    return { ok: true, text: note, days: kept };
  }
  warn(req, "gateFail");
  return { ok: false, stat: "gateFail" };
}

export async function generateNote(req: NoteRequest, deps: GenerateDeps, mode: GenerateMode): Promise<NoteResponse> {
  const { net, view, subject, span } = req;
  const { store } = deps;

  // 1. A note exists only for mainnet and the view's own, listed subjects.
  if (net !== "mainnet" || !noteSupported(view, subject, span, net)) return NONE;

  const key = noteKeyOf(net, view, subject, span);
  const timing = timingOf(view, span);
  const now = deps.now();

  // 2. Cached: served, unless the warm pass finds it older than its refresh.
  let cached: NoteRecord | null;
  try {
    cached = parseRecord(await store.get(key));
  } catch {
    warn(req, "store");
    await countStat(store, net, now, "store");
    return UNAVAILABLE;
  }
  const stale = cached != null && mode === "warm" && timing.refreshMs != null && now - cached.writtenAt > timing.refreshMs;
  if (cached && !stale) return okOf(cached);

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
    // 5. The facts. Nothing to describe: nothing stored, no model call.
    let input: Awaited<ReturnType<typeof factsFor>>;
    try {
      input = await deps.facts(net, view, subject, span, now);
    } catch {
      warn(req, "store");
      await countStat(store, net, now, "store");
      return UNAVAILABLE;
    }
    if (!input) return NONE;

    // 6–7. The model, held to the facts.
    const written = await write(req, input, deps.chat);
    if (!written.ok) {
      await countStat(store, net, now, written.stat);
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
      return UNAVAILABLE;
    }
    await countStat(store, net, now, "ok");
    return okOf(record);
  } catch {
    // Anything else that threw once the lock was taken: an instrument state, counted, never a dump.
    warn(req, "error");
    await countStat(store, net, now, "error");
    return UNAVAILABLE;
  } finally {
    try {
      await store.unlock(lock);
    } catch {
      // The lock's own TTL reaps it.
    }
  }
}
