import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fact } from "@/src/data/noteFacts";
import { checkNote } from "@/src/data/noteHonesty";
import type { NotableDay } from "@/src/data/noteTypes";
import type { TrendsWindowData } from "@/src/data/trendWindow";
import { generateNote, type NoteRecord } from "./generate";
import { GateError, type GateMessage } from "./gate";
import { KIND_TIMING, lockKeyOf, noteKeyOf, statsKeyOf } from "./keys";
import { factsFor, type NoteFacts, type NoteReads } from "./sources";
import { memoryNotesStore, type NotesStore } from "./store";

const H = 3_600_000;
const D = 86_400_000;
const NOW = Date.UTC(2026, 9, 27, 12, 30);
const DAY_ISO = "2026-10-27";

const FACTS: NoteFacts = {
  facts: [
    fact("Snapshots anchored, per day, this span", 1200, "count"),
    fact("Snapshots anchored, ratio to previous span", 1.37, "ratio"),
    fact("Span length", 604_800, "duration"),
  ],
  names: ["USDC.dag", "BioFi", "DAG"],
  blurbs: [],
  days: [],
  spanFrom: NOW - 7 * D,
  spanTo: NOW,
  label: "the hypergraph",
};

const CLEAN = "NOTE: The hypergraph anchored 1,200 snapshots a day, up 37% on the span before.";
const BAD = "NOTE: The hypergraph anchored 9,999 snapshots a day.";

const REQ = { net: "mainnet", view: "trend" as const, subject: "dag", span: "7d" as const };
const KEY = noteKeyOf("mainnet", "trend", "dag", "7d");

let store: NotesStore;

function deps(over: { facts?: typeof factsFor; chat?: (m: GateMessage[]) => Promise<string>; answers?: string[] } = {}) {
  const answers = [...(over.answers ?? [CLEAN])];
  const chat = vi.fn(over.chat ?? (async () => answers.shift() ?? CLEAN));
  const facts = vi.fn(over.facts ?? (async () => structuredClone(FACTS)));
  return { store, facts, chat, now: () => NOW };
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
    expect(await stats()).toEqual({ ok: 1 });
    expect(await lockFree()).toBe(true);
  });

  it("the model is shown the facts and the subject", async () => {
    const d = deps();
    await generateNote(REQ, d, "read");
    const [system, user] = d.chat.mock.calls[0]![0];
    expect(system!.content).toContain("Subject: the hypergraph.");
    expect(user!.content).toContain("Span length: 7d");
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
    expect(await stats()).toEqual({ gateFail: 1 });
    expect(await lockFree()).toBe(true);
  });

  it("a Gate error: unavailable, its kind counted, the lock released", async () => {
    const d = deps({ chat: async () => { throw new GateError("rate"); } });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).toHaveBeenCalledTimes(1);
    expect(await stats()).toEqual({ rate: 1 });
    expect(await lockFree()).toBe(true);
  });

  it("a Gate error on the retry counts that error, not a gate failure", async () => {
    const answers = [BAD];
    const d = deps({ chat: async () => { const a = answers.shift(); if (a) return a; throw new GateError("timeout"); } });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(await stats()).toEqual({ timeout: 1 });
  });

  it("no facts: none, no model call, nothing stored", async () => {
    const d = deps({ facts: async () => null });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "none" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await store.get(KEY)).toBeNull();
    expect(await lockFree()).toBe(true);
  });

  it("a store read failure: unavailable, counted as store, no model call, the lock released", async () => {
    const d = deps({ facts: async () => { throw new Error("Upstash down"); } });
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await stats()).toEqual({ store: 1 });
    expect(await lockFree()).toBe(true);
  });

  it("the notes cache itself failing is a store outage too", async () => {
    vi.spyOn(store, "get").mockRejectedValueOnce(new Error("down"));
    const d = deps();
    expect(await generateNote(REQ, d, "read")).toEqual({ state: "unavailable" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await stats()).toEqual({ store: 1 });
  });

  it("testnet and unlisted subjects get no note", async () => {
    const d = deps();
    expect(await generateNote({ ...REQ, net: "testnet" }, d, "read")).toEqual({ state: "none" });
    expect(await generateNote({ ...REQ, subject: "unlisted" }, d, "read")).toEqual({ state: "none" });
    expect(await generateNote({ ...REQ, subject: "DAGnotTrackedAnywhere000000000000000000" }, d, "warm")).toEqual({ state: "none" });
    expect(d.facts).not.toHaveBeenCalled();
    expect(d.chat).not.toHaveBeenCalled();
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

  it("a fresh record is not rewritten by a warm pass", async () => {
    await store.set(KEY, record({ writtenAt: NOW - 2 * H }), 3600);
    const d = deps();
    expect(await generateNote(REQ, d, "warm")).toMatchObject({ state: "ok", writtenAt: NOW - 2 * H });
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
  };

  it("a 7d History note saying \"the last 7 days\" passes the gate", async () => {
    const answer = "NOTE: Over the last 7 days the hypergraph held its pace.";
    const d = deps({ facts: (net, view, subject, span, now) => factsFor(net, view, subject, span, now, reads), answers: [answer] });
    const res = await generateNote(REQ, d, "read");
    expect(d.chat.mock.calls[0]![0][1]!.content).toContain("Span length: 7d");
    expect(res).toMatchObject({ state: "ok", text: "Over the last 7 days the hypergraph held its pace." });
    expect(d.chat).toHaveBeenCalledTimes(1);
    const shown = await factsFor("mainnet", "trend", "dag", "7d", NOW, reads);
    expect(checkNote("Over the last 7 days the hypergraph held its pace.", shown!.facts, shown!.names)).toEqual({ ok: true });
  });
});
