import { createHash, createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import type { NoteResponse } from "@/src/data/noteTypes";
import { sampledIds } from "@/src/net/lineage";
import { netOf } from "@/src/net/request";
import { countStat, generateNote, type GenerateDeps } from "./generate";
import { gateChat } from "./gate";
import { capKeyOf, rateKeyOf } from "./keys";
import { isLimitedSpan, parseNoteParams, parseNoteRequest } from "./params";
import { factsFor, readGeoDays } from "./sources";
import { notesStore } from "./store";
import { executePass, latestCountries, pacedChat, planPass, warmCandidates, warmKeyOf } from "./warm";

// THE NOTE ROUTES' BODIES — `app/api/notes/route.ts` (read), `request/route.ts` and `warm/route.ts`
// each hand their request to one of these with a deps THUNK, so the tests run them against an
// in-memory store and a stub model while the routes build the live clients. The thunk is called
// inside the handler's try: a missing Upstash env is an `unavailable` answer, never an error dump.
//
// Every answer that is not a note's own (`pending`, `unavailable`, a 400, a 429) is `no-store`,
// so the CDN never holds an instrument state past the moment. Only the read route is public.
//
// MAINNET ONLY, answered FIRST: off mainnet both routes answer `none` before parsing the subject,
// because the subject is checked against mainnet's catalog and a testnet network would otherwise
// be a 400 the card reads as "unavailable".
//
// LIMITS (the global constraints): only a BRUSHED RANGE is limited (`isLimitedSpan`), since it is
// the one unbounded key space. Per visitor 20 an hour, keyed by the first 16 hex characters of
// HMAC-SHA256(CRON_SECRET, ip) — plain sha256(ip) where no secret is set (a local server) — so a
// stored key cannot be reversed by hashing the IPv4 space (the raw address and the secret are never
// stored or logged); globally 2,000 a UTC day, a tripwire
// counted as stats `capped`. Only a MISS is counted: a cached brush, or a subject no note exists
// for, is answered without touching either counter. Every other kind is bounded by its key and the
// singleflight lock.

const NET = "mainnet";
export const RATE_PER_HOUR = 20;
export const CAP_PER_DAY = 2_000;
const RATE_TTL_S = 2 * 3600;
const CAP_TTL_S = 2 * 86_400;
/** The warm route's `maxDuration` is 300 s: no new item starts after this. The worst item is two
 *  paced Gate attempts at their 20 s timeout (3.5 + 20 + 3.5 + 20 s) plus its reads, so 210 s
 *  leaves it room to finish. */
export const WARM_BUDGET_MS = 210_000;
/** One item at a time, and the Gate calls spaced (`pacedChat`): the free model 429'd at about five
 *  calls in 15 s (2026-10-27, R32). */
export const WARM_CONCURRENCY = 1;
export const WARM_SPACING_MS = 3_500;

const PUBLIC = "public, s-maxage=300, stale-while-revalidate=600";
const NO_STORE = "no-store";
const UNAVAILABLE: NoteResponse = { state: "unavailable" };
const NONE: NoteResponse = { state: "none" };

const json = (body: unknown, cache: string, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": cache } });
const isoHour = (ms: number) => new Date(ms).toISOString().slice(0, 13);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The live dependencies: the write-token notes store, the trends store's reads, the Gate. */
export function liveDeps(): GenerateDeps {
  return { store: notesStore(), facts: factsFor, chat: gateChat, now: Date.now };
}

/** GET /api/notes?view=…&subject=…&span=… (or &from=…&to=… for a brushed range). */
export async function readNote(req: Request, deps: () => GenerateDeps): Promise<Response> {
  if (netOf(req) !== NET) return json(NONE, PUBLIC);
  const d = settle(deps);
  const parsed = parseNoteParams(new URL(req.url).searchParams, d ? d.now() : Date.now());
  if ("error" in parsed) return json({ error: parsed.error }, NO_STORE, 400);
  if ("none" in parsed) return json(NONE, PUBLIC);
  if (!d) return json(UNAVAILABLE, NO_STORE);
  try {
    const res = await generateNote({ net: netOf(req), ...parsed }, d, "read");
    const cacheable = res.state === "ok" || res.state === "none" || res.state === "request";
    return json(res, cacheable ? PUBLIC : NO_STORE);
  } catch {
    return json(UNAVAILABLE, NO_STORE);
  }
}

/** The visitor, as the limits count it: the first `x-forwarded-for` entry, else `x-real-ip`. */
function visitorHash(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
  const secret = process.env.CRON_SECRET;
  const h = secret ? createHmac("sha256", secret) : createHash("sha256");
  return h.update(ip).digest("hex").slice(0, 16);
}

/** POST /api/notes/request — History's on-request kinds: the 1h pill and a brushed range. */
export async function requestNote(req: Request, deps: () => GenerateDeps): Promise<Response> {
  if (netOf(req) !== NET) return json(NONE, NO_STORE);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad body" }, NO_STORE, 400);
  }
  const d = settle(deps);
  const now = d ? d.now() : Date.now();
  const parsed = parseNoteRequest(body, now);
  if ("error" in parsed) return json({ error: parsed.error }, NO_STORE, 400);
  if ("none" in parsed) return json(NONE, NO_STORE);
  if (!d) return json(UNAVAILABLE, NO_STORE);
  const note = { net: netOf(req), ...parsed };
  const { net } = note;
  try {
    // ONLY A MISS IS COUNTED. A read answers first: `none` for a note that does not exist (another
    // network, a subject the view has no note for: `noteSupported`), the cached note when there is
    // one; `request` means a miss, and only then do the limits count and the model write.
    const cached = await generateNote(note, d, "read");
    if (cached.state !== "request") return json(cached, NO_STORE);
    if (isLimitedSpan(parsed.span)) {
      if ((await d.store.incr(rateKeyOf(net, visitorHash(req), isoHour(now)), RATE_TTL_S)) > RATE_PER_HOUR)
        return json(UNAVAILABLE, NO_STORE, 429);
      if ((await d.store.incr(capKeyOf(net, isoDay(now)), CAP_TTL_S)) > CAP_PER_DAY) {
        await countStat(d.store, net, now, "capped");
        return json(UNAVAILABLE, NO_STORE);
      }
    }
    return json(await generateNote(note, d, "request"), NO_STORE);
  } catch {
    return json(UNAVAILABLE, NO_STORE);
  }
}

export interface WarmDeps extends GenerateDeps {
  /** The whole fleet's countries on the newest measured geo day. */
  countries(nowMs: number): Promise<string[]>;
  /** The current networks-with-nodes key (the hyper digest's own `setKey`); null when unknown. */
  setKey(nowMs: number): Promise<string | null>;
  sleep(ms: number): Promise<void>;
}

const D = 86_400_000;

export function liveWarmDeps(): WarmDeps {
  const base = liveDeps();
  return {
    ...base,
    // Two days, so a pass run before today's first hourly geo sample still finds yesterday's.
    countries: async (nowMs) => latestCountries((await readGeoDays(NET, nowMs - 2 * D, nowMs)).geoDays),
    // The digest's own builder decides which networks have nodes, so the two keys cannot disagree.
    setKey: async (nowMs) => (await factsFor(NET, "hyper", "all", "day", nowMs))?.setKey ?? null,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** GET /api/notes/warm — the hourly cron (vercel.json `7 * * * *`). */
export async function warmNotes(req: Request, deps: () => WarmDeps): Promise<Response> {
  // ⚠️ `!process.env.CRON_SECRET` is load-bearing: without it, an unset secret turns the
  // template literal into the literal string "Bearer undefined" and authenticates anyone
  // who sends exactly that — concretely reachable on a preview deploy sharing prod Redis.
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const d = deps();
    const now = d.now(); // the budget's clock starts here: the prefetch spends it too
    const subjects = ["all", "dag", ...sampledIds(NET)];
    const [countries, setKey] = await Promise.all([
      d.countries(now).catch(() => [] as string[]),
      d.setKey(now).catch(() => null),
    ]);
    // ONE prefetch of every candidate's record, so the planner is pure and the pass costs one read.
    const candidates = warmCandidates(subjects, countries);
    const keys = candidates.map(warmKeyOf);
    const raws = await d.store.mget(keys);
    const records = new Map<string, { writtenAt: number; setKey?: string }>();
    raws.forEach((raw, i) => {
      const rec = recordOf(raw);
      if (rec) records.set(keys[i]!, rec);
    });
    const plan = planPass(now, subjects, countries, setKey, (k) => records.get(k) ?? null);
    const paced = { ...d, chat: pacedChat(d.chat, WARM_SPACING_MS, d.now, d.sleep) };
    const result = await executePass(
      plan,
      (item) => generateNote({ net: NET, ...item }, paced, "warm", { seenWrittenAt: records.get(warmKeyOf(item))?.writtenAt ?? null }),
      { now: d.now, start: now, budgetMs: WARM_BUDGET_MS, concurrency: WARM_CONCURRENCY },
    );
    return json(result, NO_STORE);
  } catch {
    return json(UNAVAILABLE, NO_STORE);
  }
}

/** A stored record's planning fields; null for a missing or unreadable one (a miss: rewritten). */
function recordOf(raw: string | null): { writtenAt: number; setKey?: string } | null {
  if (raw == null) return null;
  try {
    const r = JSON.parse(raw) as { writtenAt?: unknown; setKey?: unknown } | null;
    if (!r || typeof r.writtenAt !== "number") return null;
    return typeof r.setKey === "string" ? { writtenAt: r.writtenAt, setKey: r.setKey } : { writtenAt: r.writtenAt };
  } catch {
    return null;
  }
}

/** The deps, or null when building them threw (a missing env): the caller answers `unavailable`. */
function settle<T>(deps: () => T): T | null {
  try {
    return deps();
  } catch {
    return null;
  }
}
