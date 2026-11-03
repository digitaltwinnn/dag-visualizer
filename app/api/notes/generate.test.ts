import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fact } from "@/src/data/noteFacts";
import { checkNote } from "@/src/data/noteHonesty";
import type { NotableDay } from "@/src/data/noteTypes";
import type { TrendsWindowData } from "@/src/data/trendWindow";
import { LINE_MAX } from "@/src/engine/domain/briefing";
import { FAIL_TTL_S, generateNote, LOCK_TTL_S, NOTE_STATS, type NoteRecord } from "./generate";
import { GateError, type GateMessage } from "./gate";
import { KIND_TIMING, lockKeyOf, noteKeyOf, statsKeyOf } from "./keys";
import { PROMPTS } from "./prompts";
import { factsFor, type NoteFacts, type NoteReads } from "./sources";
import { memoryNotesStore, type NotesStore } from "./store";

const H = 3_600_000;
const D = 86_400_000;
const NOW = Date.UTC(2026, 9, 27, 12, 30);
const DAY_ISO = "2026-10-27";

const FACTS: NoteFacts = {
  kind: "view",
  common: false,
  whole: false,
  facts: [
    fact("Snapshots anchored, per day, this span", 1200, "count"),
    fact("Snapshots anchored, ratio to previous span", 1.37, "ratio"),
    fact("Span length", 604_800, "duration"),
  ],
  names: ["USDC.dag", "BioFi", "DAG"],
  blurbs: [],
  days: [],
  changes: [],
  spanFrom: NOW - 7 * D,
  spanTo: NOW,
  label: "the hypergraph",
};

const CLEAN = "NOTE: The hypergraph anchored 1,200 snapshots a day, up 37% on the span before.";
const BAD = "NOTE: The hypergraph anchored 9,999 snapshots a day.";

const REQ = { net: "mainnet", view: "trend" as const, subject: "dag", span: "7d" as const };
const KEY = noteKeyOf("mainnet", "trend", "dag", "7d");

let store: NotesStore;

function deps(over: { facts?: typeof factsFor; chat?: (m: GateMessage[]) => Promise<string>; answers?: string[]; writable?: boolean } = {}) {
  const answers = [...(over.answers ?? [CLEAN])];
  const chat = vi.fn(over.chat ?? (async () => answers.shift() ?? CLEAN));
  const facts = vi.fn(over.facts ?? (async () => structuredClone(FACTS)));
  return { store, facts, chat, now: () => NOW, writable: over.writable ?? true };
}

async function stats(): Promise<Record<string, number>> {
  const raw = await store.get(statsKeyOf("mainnet", DAY_ISO));
  return raw ? JSON.parse(raw) : {};
}

async function lockFree(key = KEY): Promise<boolean> {
  const free = await store.lock(lockKeyOf(key), 40);
  if (free) await store.unlock(lockKeyOf(key));
  return free;
}

function record(over: Partial<NoteRecord> = {}): string {
  return JSON.stringify({ text: "A cached note.", writtenAt: NOW - H, spanFrom: NOW - 7 * D, spanTo: NOW - H, days: [], ...over });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  store = memoryNotesStore();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("generateNote", () => {
  it("answers a cached record with no model call", async () => {
    await store.set(KEY, record(), 3600);
    const d = deps();
    const res = await generateNote(REQ, d, "read");
    expect(res).toEqual({ state: "ok", text: "A cached note.", writtenAt: NOW - H, spanFrom: NOW - 7 * D, spanTo: NOW - H, days: [] });
    expect(d.chat).not.toHaveBeenCalled();
    expect(d.facts).not.toHaveBeenCalled();
  });

  it("on a miss: one model call, the record stored with the kind's TTL, then ok", async () => {
    const set = vi.spyOn(store, "set");
    const d = deps();
    const res = await generateNote(REQ, d, "read");
    expect(d.chat).toHaveBeenCalledTimes(1);
    expect(res).toEqual({
      state: "ok",
      text: "The hypergraph anchored 1,200 snapshots a day, up 37% on the span before.",
      writtenAt: NOW,
      spanFrom: NOW - 7 * D,
      spanTo: NOW,
      days: [],
    });
    const write = set.mock.calls.find(([k]) => k === KEY)!;
    expect(write[2]).toBe(KIND_TIMING.trendDaily.ttlS);
    expect(JSON.parse(write[1])).toEqual({ text: res.state === "ok" && res.text, writtenAt: NOW, spanFrom: NOW - 7 * D, spanTo: NOW, days: [] });
    expect(await stats()).toEqual({ ok: 1, calls: 1 });
    expect(await lockFree()).toBe(true);
  });

  // THE MODEL'S WORDS ARE ITS OWN (user, 2026-11-03): the change is a fact it is shown, and an
  // earlier figure written beside it is asked for once more, never cut out by code.
  it("shows each change as a fact, and asks again when the note writes the earlier figure", async () => {
    const pair = (end: "from" | "to") => ({ key: "b", end, span: true }) as const;
    const facts = { ...FACTS, facts: [...FACTS.facts, fact("Blocks, per day, this span", 64, "count", undefined, pair("to")), fact("Blocks, per day, previous span", 73, "count", undefined, pair("from"))] };
    const d = deps({
      facts: async () => facts,
      answers: [
        "NOTE: Over the last 7 days, blocks averaged 64 per day, down from 73, and the network held.",
        "NOTE: Over the last 7 days, blocks averaged 64 per day, down 12% on the 7 days before, and the network held.",
      ],
    });
    const res = await generateNote(REQ, d, "read");
    expect(d.chat.mock.calls[0]![0][1]!.content).toContain("Blocks, per day, this span, change against previous span, down: 12%");
    expect(d.chat.mock.calls[1]![0].map((m) => m.content).join("\n")).toContain('"73" is an earlier figure');
    expect(res.state === "ok" && res.text).toBe("Over the last 7 days, blocks averaged 64 per day, down 12% on the 7 days before, and the network held.");
  });

  it("keeps the checked note as written when the second answer is no better", async () => {
    const pair = (end: "from" | "to") => ({ key: "b", end, span: true }) as const;
    const facts = { ...FACTS, facts: [...FACTS.facts, fact("Blocks, per day, this span", 64, "count", undefined, pair("to")), fact("Blocks, per day, previous span", 73, "count", undefined, pair("from"))] };
    const first = "NOTE: Over the last 7 days, blocks averaged 64 per day, down from 73, and the network held.";
    const res = await generateNote(REQ, deps({ facts: async () => facts, answers: [first, first] }), "read");
    expect(res.state === "ok" && res.text).toBe("Over the last 7 days, blocks averaged 64 per day, down from 73, and the network held.");
  });

  it("keeps a notable day's caption in the model's own words", async () => {
    const day = { dayMs: Date.UTC(2026, 9, 22), kind: "peak" as const, networkId: null, value: 1200, level: 1000, score: 0 };
    const d = deps({ facts: async () => ({ ...FACTS, days: [day] }), answers: [`${CLEAN}\nDAY 2026-10-22: The hypergraph anchored 1,200 snapshots.`] });
    const res = await generateNote(REQ, d, "read");
    expect(res.state === "ok" && res.days[0]!.caption).toBe("The hypergraph anchored 1,200 snapshots.");
  });

  it("the model is shown the facts and the subject", async () => {
    const d = deps();
    await generateNote(REQ, d, "read");
    const [system, user] = d.chat.mock.calls[0]![0];
    expect(system!.content).toContain("Subject: the hypergraph.");
    expect(user!.content).toContain("Span length: 7 days");
    expect(user!.content).toContain("Snapshots anchored, per day, this span: 1,200");
  });

  it("answers pending, with no model call, while another caller holds the lock", async () => {
    await store.lock(lockKeyOf(KEY), 40);
    const d = deps();
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "pending" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(d.facts).not.toHaveBeenCalled();
  });

  it("retries once with the gate's reasons, then stores the clean answer", async () => {
    const d = deps({ answers: [BAD, CLEAN] });
    const res = await generateNote(REQ, d, "read");
    expect(d.chat).toHaveBeenCalledTimes(2);
    expect(res.state).toBe("ok");
    const retry = d.chat.mock.calls[1]![0][1]!.content;
    expect(retry).toContain("Your previous answer was rejected");
    expect(retry).toContain("9,999");
    expect(await store.get(KEY)).not.toBeNull();
  });

  it("two failed answers: unavailable, nothing stored, gateFail counted", async () => {
    const d = deps({ answers: [BAD, BAD] });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).toHaveBeenCalledTimes(2);
    expect(await store.get(KEY)).toBeNull();
    expect(await stats()).toEqual({ gateFail: 1, calls: 2, retried: 1 });
    expect(await lockFree()).toBe(true);
  });

  it("a Gate error: unavailable, its kind counted, the lock released", async () => {
    const d = deps({ chat: async () => { throw new GateError("rate"); } });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).toHaveBeenCalledTimes(1);
    expect(await stats()).toEqual({ rate: 1, calls: 1 });
    expect(await lockFree()).toBe(true);
  });

  it("a Gate error on the retry counts that error, not a gate failure", async () => {
    const answers = [BAD];
    const d = deps({ chat: async () => { const a = answers.shift(); if (a) return a; throw new GateError("timeout"); } });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(await stats()).toEqual({ timeout: 1, calls: 2, retried: 1 });
  });

  it("no facts: none, no model call, nothing stored", async () => {
    const d = deps({ facts: async () => null });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "none" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await store.get(KEY)).toBeNull();
    expect(await lockFree()).toBe(true);
  });

  it("a request's spend is asked once the facts are in hand, and its answer stands in the note's place (review 2026-10-29)", async () => {
    // Nothing measured: none, and the spend is never asked.
    const unasked = vi.fn(async () => null);
    expect(await generateNote(REQ, deps({ facts: async () => null }), "request", { spend: unasked })).toEqual({ state: "none" });
    expect(unasked).not.toHaveBeenCalled();
    // Refused: the spend's own answer — no model call, nothing stored, no hold, the lock released.
    const d = deps();
    const refused = vi.fn(async () => ({ state: "unavailable" as const }));
    expect(await generateNote(REQ, d, "request", { spend: refused })).toEqual({ state: "unavailable" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await store.get(KEY)).toBeNull();
    expect(await lockFree()).toBe(true);
    // Allowed: asked once, after the facts, and the note is written.
    const spend = vi.fn(async () => null);
    expect((await generateNote(REQ, d, "request", { spend })).state).toBe("ok");
    expect(spend).toHaveBeenCalledTimes(1);
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("a store read failure: unavailable, counted as store, no model call, the lock released", async () => {
    const d = deps({ facts: async () => { throw new Error("Upstash down"); } });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await stats()).toEqual({ store: 1 });
    expect(await lockFree()).toBe(true);
  });

  it("takes the singleflight lock for 90 s: the warm's paced wait and two Gate attempts run inside it, with room for the reads (R30, M3)", async () => {
    const lock = vi.spyOn(store, "lock");
    await generateNote(REQ, deps(), "read");
    expect(LOCK_TTL_S).toBe(90);
    // In the lock, at worst: an 8 s paced wait, two attempts at the Gate's 20 s timeout (pacing is
    // start to start, so no wait after a 20 s first call), the reads and the set.
    expect(LOCK_TTL_S * 1000 - (8_000 + 2 * 20_000)).toBeGreaterThanOrEqual(40_000);
    expect(lock).toHaveBeenCalledWith(lockKeyOf(KEY), 90);
  });

  it("a failed note write: unavailable, counted as store, the lock released", async () => {
    vi.spyOn(store, "set").mockRejectedValueOnce(new Error("down"));
    const d = deps();
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(await stats()).toEqual({ store: 1, calls: 1 });
    expect(await lockFree()).toBe(true);
  });

  it("anything else that throws after the lock: unavailable, counted as error, the lock released", async () => {
    // A non-string answer makes `parseAnswer` throw: not the Gate's fault and not the store's.
    const d = deps({ chat: async () => undefined as unknown as string });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(await stats()).toEqual({ error: 1, calls: 1 });
    expect(await lockFree()).toBe(true);

    // Another key: the first failure holds REQ's (R38).
    const d2 = deps({ chat: async () => { throw new TypeError("a bug"); } });
    expect(await generateNote({ ...REQ, span: "30d" }, d2, "read")).toEqual({ state: "unavailable" });
    expect(d2.chat).toHaveBeenCalledTimes(1);
    expect(await stats()).toEqual({ error: 2, calls: 1 });
    expect(await lockFree()).toBe(true);
  });

  it("a lock that cannot be taken is a store outage", async () => {
    vi.spyOn(store, "lock").mockRejectedValueOnce(new Error("down"));
    const d = deps();
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.facts).not.toHaveBeenCalled();
    expect(await stats()).toEqual({ store: 1 });
  });

  it("counts every outcome in one known list", () => {
    expect([...NOTE_STATS]).toEqual(["ok", "gateFail", "rate", "http", "timeout", "empty", "nokey", "store", "error", "capped", "calls", "retried"]);
  });

  it("the notes cache itself failing is a store outage too", async () => {
    vi.spyOn(store, "get").mockRejectedValueOnce(new Error("down"));
    const d = deps();
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await stats()).toEqual({ store: 1 });
  });

  it("testnet gets no note, nor the unlisted set outside History", async () => {
    const d = deps();
    expect(await generateNote({ ...REQ, net: "testnet" }, d, "read")).toEqual({ state: "none" });
    expect(await generateNote({ ...REQ, view: "hyper", subject: "unlisted", span: "day" }, d, "read")).toEqual({ state: "none" });
    expect(await generateNote({ ...REQ, subject: "DAGnotTrackedAnywhere000000000000000000" }, d, "warm")).toEqual({ state: "none" });
    expect(d.facts).not.toHaveBeenCalled();
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("a subject note's facts kind reaches the prompt", async () => {
    const d = deps({ facts: async () => ({ ...FACTS, kind: "country" as const, common: false }) });
    await generateNote({ net: "mainnet", view: "geo", subject: "isp:hetzner", span: "day" }, d, "request");
    expect(d.chat).toHaveBeenCalledTimes(1);
    const [system] = d.chat.mock.calls[0]![0];
    expect(system!.content).toContain(PROMPTS.geo.questions!.country!);
    expect(system!.content).not.toContain(PROMPTS.geo.question);
  });

  it("an on-request kind not yet written answers request on a read, and writes on a request", async () => {
    const d = deps();
    expect(await generateNote({ ...REQ, span: "1h" }, d, "read")).toEqual({ state: "request" });
    const range = `r${NOW - 2 * D}-${NOW - D}` as const;
    expect(await generateNote({ ...REQ, span: range }, d, "read")).toEqual({ state: "request" });
    expect(d.chat).not.toHaveBeenCalled();
    const set = vi.spyOn(store, "set");
    expect((await generateNote({ ...REQ, span: "1h" }, d, "request")).state).toBe("ok");
    expect(set.mock.calls.find(([k]) => k === noteKeyOf("mainnet", "trend", "dag", "1h"))![2]).toBe(KIND_TIMING.trend1h.ttlS);
  });

  it("a stale record is served on a read and rewritten on a warm pass", async () => {
    await store.set(KEY, record({ writtenAt: NOW - 25 * H }), 3600);
    const d = deps();
    expect(await generateNote(REQ, d, "read")).toMatchObject({ state: "ok", text: "A cached note." });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await generateNote(REQ, d, "warm")).toMatchObject({ state: "ok", writtenAt: NOW });
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("a warm pass rewrites the record it was planned for, fresh or not (the planner judges, warm.ts)", async () => {
    await store.set(KEY, record({ writtenAt: NOW - 2 * H }), 3600);
    const d = deps();
    expect(await generateNote(REQ, d, "warm")).toMatchObject({ state: "ok", writtenAt: NOW });
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("a warm item whose record changed since the plan is served, not rewritten (another pass wrote it)", async () => {
    await store.set(KEY, record({ writtenAt: NOW - 10 * 60_000 }), 3600);
    const d = deps();
    const seen = NOW - 25 * H;
    expect(await generateNote(REQ, d, "warm", { seenWrittenAt: seen })).toMatchObject({ state: "ok", writtenAt: NOW - 10 * 60_000 });
    // Planned as missing, found written: served too.
    expect(await generateNote(REQ, d, "warm", { seenWrittenAt: null })).toMatchObject({ state: "ok", writtenAt: NOW - 10 * 60_000 });
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("a warm item re-reads its record once it holds the lock: a write that landed in between is served", async () => {
    const seen = NOW - 25 * H;
    await store.set(KEY, record({ writtenAt: seen }), 3600);
    const lock = store.lock.bind(store);
    vi.spyOn(store, "lock").mockImplementation(async (k, ttl) => {
      await store.set(KEY, record({ writtenAt: NOW - 1000 }), 3600); // the other writer finished first
      return lock(k, ttl);
    });
    const d = deps();
    expect(await generateNote(REQ, d, "warm", { seenWrittenAt: seen })).toMatchObject({ state: "ok", writtenAt: NOW - 1000 });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await lockFree()).toBe(true);
  });

  it("a warm item whose record is still the one planned is rewritten", async () => {
    const seen = NOW - 25 * H;
    await store.set(KEY, record({ writtenAt: seen }), 3600);
    const d = deps();
    expect(await generateNote(REQ, d, "warm", { seenWrittenAt: seen })).toMatchObject({ state: "ok", writtenAt: NOW });
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("a read serves a fresh record without a model call", async () => {
    await store.set(KEY, record({ writtenAt: NOW - 2 * H }), 3600);
    const d = deps();
    expect(await generateNote(REQ, d, "read")).toMatchObject({ state: "ok", writtenAt: NOW - 2 * H });
    expect(await generateNote(REQ, d, "request")).toMatchObject({ state: "ok", writtenAt: NOW - 2 * H });
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("a failing caption drops only that day", async () => {
    const day = (iso: string, value: number): NotableDay => ({ dayMs: Date.parse(`${iso}T00:00:00Z`), kind: "high", networkId: null, value, level: 600, score: 3 });
    const days = [day("2026-10-20", 1200), day("2026-10-22", 1300)];
    const facts = { ...FACTS, days, facts: [...FACTS.facts, fact("Notable day 2 spike, snapshots anchored that day", 1300, "count")] };
    const d = deps({
      facts: async () => facts,
      answers: [`${CLEAN}\nDAY 2026-10-20: Snapshots anchored reached 9,999.\nDAY 2026-10-22: Snapshots anchored reached 1,300.`],
    });
    const res = await generateNote(REQ, d, "read");
    expect(res.state).toBe("ok");
    if (res.state !== "ok") return;
    expect(res.days).toEqual([{ dayMs: days[1]!.dayMs, kind: "high", networkId: null, caption: "Snapshots anchored reached 1,300." }]);
    expect(d.chat.mock.calls[0]![0][1]!.content).toContain("DAY 2026-10-20");
  });

  it("two notable days on one date keep their own captions, in order", async () => {
    const dayMs = Date.parse("2026-10-20T00:00:00Z");
    const days: NotableDay[] = [
      { dayMs, kind: "first", networkId: "foo", value: 1, level: 0, score: Infinity },
      { dayMs, kind: "last", networkId: "bar", value: 2, level: 0, score: Infinity },
    ];
    const d = deps({ facts: async () => ({ ...FACTS, days }), answers: [`${CLEAN}\nDAY 2026-10-20: Foo began.\nDAY 2026-10-20: Bar stopped.`] });
    const res = await generateNote(REQ, d, "read");
    if (res.state !== "ok") throw new Error(res.state);
    expect(res.days.map((x) => [x.networkId, x.caption])).toEqual([["foo", "Foo began."], ["bar", "Bar stopped."]]);
  });

  it("a warm write stores the drift key it was written under", async () => {
    await generateNote(REQ, deps(), "warm", { driftKey: "8" });
    expect(JSON.parse((await store.get(KEY))!).driftKey).toBe("8");
  });

  it("a visitor's write stores none", async () => {
    await generateNote(REQ, deps(), "warm");
    expect(JSON.parse((await store.get(KEY))!).driftKey).toBeUndefined();
  });

  // SAID POSITIVELY, ONE REWRITE (user, 2026-10-31): the prompt alone was ignored ("no changes in
  // layers", live). It is style, not honesty, so the second answer stands: a true note is never lost.
  it("a note saying no or none is asked once more, naming the word", async () => {
    const d = deps({ answers: ["NOTE: Snapshots anchored rose, with no changes in layers.", CLEAN] });
    const res = await generateNote(REQ, d, "read");
    expect(res.state).toBe("ok");
    expect(d.chat).toHaveBeenCalledTimes(2);
    expect(d.chat.mock.calls[1]![0][1]!.content).toMatch(/say what held steady instead of "no"/);
  });

  it("a second answer that still says no stands", async () => {
    const twice = "NOTE: Snapshots anchored rose, with no changes in layers.";
    const d = deps({ answers: [twice, twice] });
    const res = await generateNote(REQ, d, "read");
    if (res.state !== "ok") throw new Error(res.state);
    expect(res.text).toBe("Snapshots anchored rose, with no changes in layers.");
    expect(d.chat).toHaveBeenCalledTimes(2);
  });

  // TO THE POINT, ONE REWRITE (user, 2026-11-01): the prompt alone left the longest notes at 61
  // words (live). Style again: asked once, and the second answer stands.
  const LONG = `NOTE: The hypergraph anchored 1,200 snapshots a day${", up 37% on the span before".repeat(10)}.`;

  it("a note that runs long is asked once more, naming its length", async () => {
    const d = deps({ answers: [LONG, CLEAN] });
    const res = await generateNote(REQ, d, "read");
    expect(res.state).toBe("ok");
    expect(d.chat).toHaveBeenCalledTimes(2);
    expect(d.chat.mock.calls[1]![0][1]!.content).toMatch(/\d+ words: keep the note under forty-five/);
    expect(res.state === "ok" && res.text).toBe(CLEAN.slice("NOTE: ".length));
  });

  it("a second answer that still runs long stands", async () => {
    const d = deps({ answers: [LONG, LONG] });
    const res = await generateNote(REQ, d, "read");
    expect(res.state).toBe("ok");
    expect(d.chat).toHaveBeenCalledTimes(2);
  });

  it("a note at the limit is not asked again", async () => {
    const d = deps({ answers: [`NOTE: The hypergraph anchored 1,200 snapshots a day ${"and it held ".repeat(14)}steady.`] });
    await generateNote(REQ, d, "read");
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("asks again for a note that opens without its capital", async () => {
    const d = deps({ answers: ["NOTE: over the span the hypergraph anchored 1,200 snapshots a day.", "NOTE: Over the span the hypergraph anchored 1,200 snapshots a day."] });
    const res = await generateNote(REQ, d, "read");
    expect(d.chat).toHaveBeenCalledTimes(2);
    expect(res.state === "ok" && res.text).toBe("Over the span the hypergraph anchored 1,200 snapshots a day.");
  });

  it("does not take a word holding those letters for a negative", async () => {
    const d = deps({ answers: ["NOTE: Snapshots anchored saw a notable rise."] });
    const res = await generateNote(REQ, d, "read");
    expect(res.state).toBe("ok");
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("a caption of two sentences is dropped", async () => {
    const day: NotableDay = { dayMs: Date.parse("2026-10-22T00:00:00Z"), kind: "high", networkId: null, value: 1200, level: 600, score: 3 };
    const d = deps({ facts: async () => ({ ...FACTS, days: [day] }), answers: [`${CLEAN}\nDAY 2026-10-22: A busy day. It reached 1,200.`] });
    const res = await generateNote(REQ, d, "read");
    expect(res.state === "ok" && res.days).toEqual([]);
  });

  it("stores the hyper digest's setKey on the record", async () => {
    const key = noteKeyOf("mainnet", "hyper", "all", "day");
    const d = deps({ facts: async () => ({ ...FACTS, label: "the whole network", setKey: "DAGa,dag" }) });
    expect((await generateNote({ net: "mainnet", view: "hyper", subject: "all", span: "day" }, d, "warm")).state).toBe("ok");
    expect(JSON.parse((await store.get(key))!).setKey).toBe("DAGa,dag");
  });

  it("an unreadable cached record is a miss", async () => {
    await store.set(KEY, "not json", 3600);
    const d = deps();
    expect((await generateNote(REQ, d, "read")).state).toBe("ok");
    expect(d.chat).toHaveBeenCalledTimes(1);
  });
});

describe("the span length reaches the model and backs its window (R20)", () => {
  /** An hourly or daily payload over [from, to) with every bucket covered. */
  function covered(stepMs: number, from: number, to: number): TrendsWindowData {
    const buckets: number[] = [];
    for (let t = Math.floor(from / stepMs) * stepMs; t < to; t += stepMs) buckets.push(t);
    return { buckets, stepMs, now: NOW, series: { "g.ticks": buckets.map(() => 12), "g.globals": buckets.map(() => 12) } };
  }
  const reads: NoteReads = {
    span: async (_n, tier, from, to) => covered(tier === "1d" ? D : tier === "1h" ? H : 300_000, from, to),
    geoDays: async () => ({ geoDays: {}, providerNames: {} }),
    chainReads: async () => ({}),
  };

  it("a 7d History note saying \"the last 7 days\" passes the gate", async () => {
    const answer = "NOTE: Over the last 7 days the hypergraph held its pace.";
    const d = deps({ facts: (net, view, subject, span, now) => factsFor(net, view, subject, span, now, reads), answers: [answer] });
    const res = await generateNote(REQ, d, "read");
    expect(d.chat.mock.calls[0]![0][1]!.content).toContain("Span length: 7 days");
    expect(d.chat.mock.calls[0]![0][1]!.content).toContain("Span: the last 7 days");
    expect(res).toMatchObject({ state: "ok", text: "Over the last 7 days the hypergraph held its pace." });
    expect(d.chat).toHaveBeenCalledTimes(1);
    const shown = await factsFor("mainnet", "trend", "dag", "7d", NOW, reads);
    expect(checkNote("Over the last 7 days the hypergraph held its pace.", shown!.facts, shown!.names)).toEqual({ ok: true });
  });

  it("the whole network's Hypergraph note is asked for the global snapshots the DAG produced, not was part of", async () => {
    const d = deps({ facts: async () => ({ ...FACTS, label: "the whole network", common: true, whole: true }), answers: ["NOTE: Over the last 7 days the network held at 97 nodes."] });
    await generateNote({ ...REQ, view: "hyper", subject: "all", span: "day" }, d, "read");
    const sys = d.chat.mock.calls[0]![0][0]!.content;
    expect(sys).toContain("the DAG produced <last week's figure> global snapshots per day last week");
    expect(sys).not.toContain("it was part of per day");
  });
});

describe("a failed note holds its key for a while (no unbounded model calls, R38)", () => {
  const FAIL = `${KEY}:fail`;
  it("a failing read, then a second read: one model attempt in all, both unavailable", async () => {
    const d = deps({ chat: async () => { throw new GateError("rate"); } });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).toHaveBeenCalledTimes(1);
    expect(d.facts).toHaveBeenCalledTimes(1);
    expect(await store.get(FAIL)).not.toBeNull();
  });

  it("a gate failure holds the key too: two answers rejected, then no third call", async () => {
    const d = deps({ answers: [BAD, BAD, BAD] });
    await generateNote(REQ, d, "read");
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).toHaveBeenCalledTimes(2);
  });

  it("the hold is short: once it expires, a read asks the model again", async () => {
    const set = vi.spyOn(store, "set");
    const d = deps({ answers: [BAD, BAD, CLEAN] });
    await generateNote(REQ, d, "read");
    expect(set.mock.calls.find(([k]) => k === FAIL)![2]).toBe(FAIL_TTL_S);
    expect(FAIL_TTL_S).toBe(15 * 60);
    vi.setSystemTime(NOW + FAIL_TTL_S * 1000 + 1);
    expect((await generateNote(REQ, d, "read")).state).toBe("ok");
    expect(d.chat).toHaveBeenCalledTimes(3);
  });

  it("a request (the 1h pill) holds its key, and a read of it then answers unavailable", async () => {
    const d = deps({ chat: async () => { throw new GateError("http"); } });
    const req = { ...REQ, span: "1h" as const };
    expect(await generateNote(req, d, "request")).toEqual({ state: "unavailable" });
    expect(await generateNote(req, d, "request")).toEqual({ state: "unavailable" });
    expect(await generateNote(req, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("the warm pass ignores the hold and writes (it is the scheduled writer)", async () => {
    await store.set(FAIL, "1", FAIL_TTL_S);
    const d = deps();
    expect((await generateNote(REQ, d, "warm", { seenWrittenAt: null })).state).toBe("ok");
    expect(d.chat).toHaveBeenCalledTimes(1);
    // and a warm failure writes no hold: the next pass, or a reader, is not kept out by it
    const k2 = noteKeyOf("mainnet", "trend", "dag", "30d");
    const bad = deps({ chat: async () => { throw new GateError("rate"); } });
    await generateNote({ ...REQ, span: "30d" }, bad, "warm", { seenWrittenAt: null });
    expect(await store.get(`${k2}:fail`)).toBeNull();
  });

  it("a cached note is served even while a hold stands", async () => {
    await store.set(KEY, record(), 3600);
    await store.set(FAIL, "1", FAIL_TTL_S);
    expect((await generateNote(REQ, deps(), "read")).state).toBe("ok");
  });
});

describe("stats count model calls as well as outcomes", () => {
  it("one clean answer: one call", async () => {
    await generateNote(REQ, deps(), "read");
    expect(await stats()).toEqual({ ok: 1, calls: 1 });
  });
  it("a retried note: two calls, one retried", async () => {
    await generateNote(REQ, deps({ answers: [BAD, CLEAN] }), "read");
    expect(await stats()).toEqual({ ok: 1, calls: 2, retried: 1 });
  });
  it("a Gate error is a call; a missing key is not", async () => {
    await generateNote(REQ, deps({ chat: async () => { throw new GateError("timeout"); } }), "read");
    expect(await stats()).toEqual({ timeout: 1, calls: 1 });
    await generateNote({ ...REQ, span: "30d" }, deps({ chat: async () => { throw new GateError("nokey"); } }), "read");
    expect(await stats()).toEqual({ timeout: 1, calls: 1, nokey: 1 });
  });
});

describe("a nameless sentence speaks of the subject (R39), wired from the facts", () => {
  it("a network subject's pronoun sentence cites its own ratio", async () => {
    const own: NoteFacts = {
      ...FACTS,
      facts: [fact("USDC.dag snapshots anchored, ratio to previous span", 1.37, "ratio"), fact("BioFi snapshots anchored, ratio to previous span", 1.5, "ratio")],
      label: "USDC.dag",
      subjectName: "USDC.dag",
    };
    const d = deps({ facts: async () => structuredClone(own), answers: ["NOTE: Its snapshots anchored rose by 37% on the span before."] });
    expect((await generateNote({ ...REQ, subject: "dag" }, d, "read")).state).toBe("ok");
    expect(d.chat).toHaveBeenCalledTimes(1);
  });
});

// R66: a preview never writes. `notesWritable()` (store.ts) is false on a preview deployment, and the
// deps carry it: every mode then serves what is cached and answers `none` for a miss, writing no
// note, no hold, no lock and no stats into the store every deployment shares.
describe("a read-only deployment serves the cache and writes nothing (R66)", () => {
  const ALL_SPANS = [REQ, { ...REQ, span: "1h" as const }, { ...REQ, span: `r${NOW - 2 * D}-${NOW - D}` as const }];

  it("a miss is `none` in every mode, with no model call and nothing written", async () => {
    const set = vi.spyOn(store, "set");
    const lock = vi.spyOn(store, "lock");
    const hincr = vi.spyOn(store, "hincr");
    for (const mode of ["read", "request", "warm"] as const) {
      for (const req of ALL_SPANS) {
        const d = deps({ writable: false });
        expect(await generateNote(req, d, mode, mode === "warm" ? { seenWrittenAt: null } : {})).toEqual({ state: "none" });
        expect(d.chat).not.toHaveBeenCalled();
        expect(d.facts).not.toHaveBeenCalled();
      }
    }
    expect(set).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    expect(hincr).not.toHaveBeenCalled();
  });

  it("a cached note is still served, in every mode", async () => {
    await store.set(KEY, record(), 3600);
    for (const mode of ["read", "request", "warm"] as const) {
      const d = deps({ writable: false });
      expect(await generateNote(REQ, d, mode, mode === "warm" ? { seenWrittenAt: NOW - H } : {})).toMatchObject({ state: "ok", text: "A cached note." });
      expect(d.chat).not.toHaveBeenCalled();
    }
  });

  it("a store outage is `unavailable` and counts nothing: preview traffic never reaches production's stats", async () => {
    const hincr = vi.spyOn(store, "hincr");
    vi.spyOn(store, "get").mockRejectedValue(new Error("down"));
    expect(await generateNote(REQ, deps({ writable: false }), "read")).toEqual({ state: "unavailable" });
    expect(hincr).not.toHaveBeenCalled();
  });
});

describe("the positive rewrite", () => {
  beforeEach(() => { store = memoryNotesStore(); });
  it("keeps the true first note when the rewrite hits a Gate error", async () => {
    const first = "NOTE: The hypergraph anchored 1,200 snapshots a day, with no gaps.";
    let calls = 0;
    const chat = async () => {
      if (calls++ === 0) return first;
      throw new GateError("rate");
    };
    expect(await generateNote(REQ, deps({ chat }), "read")).toMatchObject({ state: "ok" });
  });
  it("keeps the true first note when the rewrite fails the gate", async () => {
    const first = "NOTE: The hypergraph anchored 1,200 snapshots a day, with no gaps.";
    const res = await generateNote(REQ, deps({ answers: [first, BAD] }), "read");
    expect(res).toMatchObject({ state: "ok", text: "The hypergraph anchored 1,200 snapshots a day, with no gaps." });
  });
});

describe("a view note's notable changes", () => {
  beforeEach(() => { store = memoryNotesStore(); });
  it("are stored with the note and served with it", async () => {
    const changes = [{ kind: "lost" as const, size: 2, text: "Germany lost 2 nodes", subject: { kind: "country" as const, cc: "DE" } }];
    const res = await generateNote(REQ, deps({ facts: async () => ({ ...structuredClone(FACTS), changes }) }), "read");
    expect(res).toMatchObject({ state: "ok", changes });
    expect(await generateNote(REQ, deps(), "read")).toMatchObject({ state: "ok", changes }); // from the store
  });
  it("a note with none carries no field", async () => {
    const res = await generateNote(REQ, deps(), "read");
    expect(res).not.toHaveProperty("changes");
  });
});

describe("a note writes its durations out", () => {
  const SPACED: NoteFacts = { ...FACTS, facts: [...FACTS.facts, fact("Mean spacing", 10, "duration")] };

  it("asked once more for a unit written as a letter, in the model's own words", async () => {
    const d = deps({ facts: async () => structuredClone(SPACED), answers: ["NOTE: The hypergraph anchored 1,200 snapshots a day, every 10s.", "NOTE: The hypergraph anchored 1,200 snapshots a day, every 10 seconds."] });
    const r = await generateNote(REQ, d, "read");
    expect(d.chat.mock.calls[1]![0].map((m) => m.content).join("\n")).toContain('"10s": write the unit out');
    expect(r).toMatchObject({ state: "ok", text: "The hypergraph anchored 1,200 snapshots a day, every 10 seconds." });
  });
});

describe("a whole group is said as all of it", () => {
  it("asked once more for \"3 of the 3\", in the model's own words", async () => {
    const r = await generateNote(REQ, deps({ facts: async () => ({ ...structuredClone(FACTS), facts: [...FACTS.facts, fact("Nodes", 3, "count")] }), answers: ["NOTE: The hypergraph anchored 1,200 snapshots a day, and 3 of the 3 nodes held.", "NOTE: The hypergraph anchored 1,200 snapshots a day, and all 3 nodes held."] }), "read");
    expect(r).toMatchObject({ state: "ok", text: "The hypergraph anchored 1,200 snapshots a day, and all 3 nodes held." });
  });
});

describe("the Briefing's line", () => {
  const BRIEF = { net: "mainnet", view: "trend" as const, subject: "dag", span: "30d" as const };
  const stored = async () => JSON.parse((await store.get(noteKeyOf("mainnet", "trend", "dag", "30d")))!) as NoteRecord;
  const answer = (line: string) => [`${CLEAN}\nLINE: ${line}`];
  // The 30-day pill's facts state its own span length, so "the last 30 days" is a backed figure.
  const SPAN30: NoteFacts = { ...FACTS, facts: [...FACTS.facts.filter((f) => f.label !== "Span length"), fact("Span length", 30 * 86_400, "duration")] };
  const bdeps = (answers: string[]) => deps({ facts: async () => structuredClone(SPAN30), answers });

  it("is kept on a note the tour reads, and served", async () => {
    const r = await generateNote(BRIEF, bdeps(answer("Over the last 30 days, the hypergraph anchored 1,200 snapshots a day.")), "read");
    expect(r).toMatchObject({ state: "ok", line: "Over the last 30 days, the hypergraph anchored 1,200 snapshots a day." });
    expect((await stored()).line).toBe("Over the last 30 days, the hypergraph anchored 1,200 snapshots a day.");
  });

  it("is kept in the model's own words", async () => {
    const r = await generateNote(BRIEF, bdeps(answer("Over the last 30 days, the hypergraph anchored 1,200 snapshots a day.")), "read");
    expect(r).toMatchObject({ line: "Over the last 30 days, the hypergraph anchored 1,200 snapshots a day." });
  });

  // user, 2026-11-03: "the geo intro should mention the range".
  it("is dropped when it does not name its span, so the tour reads the note's opening", async () => {
    const r = await generateNote(BRIEF, deps({ answers: answer("The hypergraph anchored 1,200 snapshots a day.") }), "read");
    expect(r).toMatchObject({ state: "ok" });
    expect(r).not.toHaveProperty("line");
  });

  it("is asked of no other note", async () => {
    const d = deps();
    await generateNote(REQ, d, "read");
    expect(d.chat.mock.calls[0]![0]![0]!.content).not.toContain("LINE:");
  });

  it("is dropped when a number fails the gate, and the note stands", async () => {
    const d = deps({ answers: answer("The hypergraph anchored 9,999 snapshots a day.") });
    const r = await generateNote(BRIEF, d, "read");
    expect(r).toMatchObject({ state: "ok" });
    expect(r).not.toHaveProperty("line");
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("is dropped when it says what did not happen", async () => {
    expect(await generateNote(BRIEF, deps({ answers: answer("There were no changes at 1,200 a day.") }), "read")).not.toHaveProperty("line");
  });

  it("may run to two sentences", async () => {
    const two = "Over the last 30 days, the hypergraph anchored 1,200 snapshots a day. That is 37% up on the span before.";
    expect(await generateNote(BRIEF, bdeps(answer(two)), "read")).toMatchObject({ line: two });
  });

  it("is dropped past its length", async () => {
    const long = `The hypergraph anchored 1,200 snapshots a day ${"and it went on saying so ".repeat(7)}in one breath.`;
    expect(long.length).toBeGreaterThan(LINE_MAX);
    expect(await generateNote(BRIEF, deps({ answers: answer(long) }), "read")).not.toHaveProperty("line");
  });
});

describe("an answer with a line gets more room", () => {
  it("so a line never costs its note", async () => {
    const d = deps();
    await generateNote({ net: "mainnet", view: "trend", subject: "dag", span: "30d" }, d, "read");
    expect(d.chat.mock.calls[0]![1 as never]).toMatchObject({ maxTokens: expect.any(Number) });
  });

  it("and no other note asks for it", async () => {
    const d = deps();
    await generateNote(REQ, d, "read");
    expect(d.chat.mock.calls[0]![1 as never]).toBeUndefined();
  });
});

describe("the style slips are asked for once more, never edited", () => {
  const span = (end: "from" | "to") => ({ key: "b", end, span: true }) as const;
  const BLOCKS: NoteFacts = { ...FACTS, facts: [...FACTS.facts, fact("Blocks, per day, this span", 64, "count", undefined, span("to")), fact("Blocks, per day, previous span", 73, "count", undefined, span("from"))] };
  const second = (d: ReturnType<typeof deps>) => d.chat.mock.calls[1]![0].map((m) => m.content).join("\n");

  it("a whole span written as a climb with nothing it is measured against", async () => {
    const d = deps({ facts: async () => structuredClone(BLOCKS), answers: ["NOTE: The hypergraph anchored 1,200 snapshots a day, and blocks fell 12% to 64 per day.", CLEAN] });
    await generateNote(REQ, d, "read");
    expect(second(d)).toContain('"64" is a whole span\'s figure');
  });

  it("but not when the comparison follows it", async () => {
    const d = deps({ facts: async () => structuredClone(BLOCKS), answers: ["NOTE: The hypergraph anchored 1,200 snapshots a day, and blocks fell 12% to 64 per day on the 7 days before."] });
    await generateNote(REQ, d, "read");
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("a change with no current figure beside it, and held beside a change", async () => {
    const d = deps({ facts: async () => structuredClone(BLOCKS), answers: ["NOTE: The hypergraph anchored 1,200 snapshots a day, and blocks held, down 12%.", CLEAN] });
    await generateNote(REQ, d, "read");
    expect(second(d)).toContain('"12%": give the current figure beside its change');
    expect(second(d)).toContain("held means it did not move");
  });
});
