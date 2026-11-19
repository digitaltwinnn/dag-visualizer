import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fact } from "@/src/data/noteFacts";
import { sampledIds } from "@/src/net/lineage";
import { liveDeps, liveWarmDeps, RATE_PER_HOUR, readNote, requestNote, WARM_BUDGET_MS, WARM_CONCURRENCY, WARM_SPACING_MS, warmNotes, type WarmDeps } from "./handlers";
import { GateError } from "./gate";
import { capKeyOf, lockKeyOf, noteKeyOf, rateKeyOf, statsKeyOf } from "./keys";
import type { NoteFacts } from "./sources";
import { memoryNotesStore, type NotesStore } from "./store";

// These tests own the route: its parsing, its limits and its answers. Which subjects a view's facts
// cover is `sources.test.ts`'s; the subject notes here are ones the real rows accept, and the
// limits on them are tested on their own.

const H = 3_600_000;
const D = 86_400_000;
const NOW = Date.UTC(2026, 9, 27, 12, 30);
const FACTS: NoteFacts = {
  kind: "view",
  facts: [fact("Snapshots anchored, per day, this span", 1200, "count"), fact("Span length", 604_800, "duration")],
  names: ["DAG"],
  blurbs: [],
  days: [],
  changes: [],
  spanFrom: NOW - 7 * D,
  spanTo: NOW,
  label: "the hypergraph",
};
const CLEAN = "NOTE: The hypergraph anchored 1,200 snapshots a day.";
const PUBLIC = "public, s-maxage=300, stale-while-revalidate=600";
const RANGE = { fromMs: NOW - 2 * D, toMs: NOW - D };
const RANGE_SPAN = `r${RANGE.fromMs}-${RANGE.toMs}` as const;
/** A mainnet network the catalog tracks, as a subject note's scope. */
const anId = sampledIds()[0]!;
/** The i-th of many distinct countries (each its own subject note, so each a miss). */
const country = (i: number) => `${anId}/cc:${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(90 - Math.floor(i / 26))}`;
/** The i-th of many distinct brushes (each its own note, so each a miss). */
const brush = (i: number) => ({ fromMs: RANGE.fromMs - i * H, toMs: RANGE.toMs - i * H });

let store: NotesStore;
function deps(over: Partial<WarmDeps> = {}): WarmDeps {
  return {
    store,
    facts: vi.fn(async (view: string, subject: string) => ({ ...FACTS, ...(view === "hyper" && subject === "all" ? { setKey: "DAGa,dag" } : {}) })),
    chat: vi.fn(async () => CLEAN),
    now: () => NOW,
    writable: true,
    countries: async () => ["DE"],
    digest: async () => ({ setKey: "DAGa,dag", driftKeys: { all: "dag:66" } }),
    sleep: vi.fn(async () => {}),
    ...over,
  };
}
const get = (q: string) => new Request(`http://localhost/api/notes?${q}`);
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/notes/request", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const hash16 = (ip: string) => createHash("sha256").update(ip).digest("hex").slice(0, 16);
async function stats(): Promise<Record<string, number>> {
  const raw = await store.get(statsKeyOf("2026-10-27"));
  return raw ? JSON.parse(raw) : {};
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubEnv("CRON_SECRET", ""); // the plain-hash tests must not depend on the shell's env
  store = memoryNotesStore();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/notes (read)", () => {
  it("400s bad params with a short error, uncached, never echoing the input", async () => {
    const res = await readNote(get("view=<b>&subject=all"), () => deps());
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(await res.json())).not.toContain("<b>");
  });

  it("serves a written note publicly cached", async () => {
    const d = deps();
    const res = await readNote(get("view=trend&subject=dag&span=7d"), () => d);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC);
    expect(await res.json()).toMatchObject({ state: "ok", text: "The hypergraph anchored 1,200 snapshots a day." });
  });

  it("answers `request` for an on-request kind, never cached (a CDN copy would outlive the write), with no model call", async () => {
    const d = deps();
    const res = await readNote(get(`view=trend&subject=dag&from=${RANGE.fromMs}&to=${RANGE.toMs}`), () => d);
    expect(await res.json()).toEqual({ state: "request" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("`pending` is never cached", async () => {
    await store.lock(lockKeyOf(noteKeyOf("trend", "dag", "7d")), 60);
    const res = await readNote(get("view=trend&subject=dag&span=7d"), () => deps());
    expect(await res.json()).toEqual({ state: "pending" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("anything that throws answers `unavailable`, never cached and never a dump", async () => {
    const res = await readNote(get("view=trend&subject=dag&span=7d"), () => {
      throw new Error("Upstash env missing");
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "unavailable" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("POST /api/notes/request", () => {
  it("writes the 1h pill without touching the limits", async () => {
    const d = deps();
    const incr = vi.spyOn(store, "incr");
    const res = await requestNote(post({ view: "trend", subject: "dag", span: "1h" }, { "x-forwarded-for": "1.2.3.4" }), () => d);
    expect(await res.json()).toMatchObject({ state: "ok" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(incr).not.toHaveBeenCalled();
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("writes a brushed range, counting the visitor by a hash of the first forwarded address", async () => {
    const incr = vi.spyOn(store, "incr");
    const res = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }), () => deps());
    expect(await res.json()).toMatchObject({ state: "ok" });
    expect(incr.mock.calls.map(([k]) => k)).toEqual([
      rateKeyOf(hash16("1.2.3.4"), "2026-10-27T12"),
      capKeyOf("2026-10-27"),
    ]);
    expect(incr.mock.calls.flat().join(" ")).not.toContain("1.2.3.4");
    expect(await store.get(noteKeyOf("trend", "dag", RANGE_SPAN))).not.toBeNull();
  });

  it("falls back to x-real-ip, then to one shared unknown visitor", async () => {
    const incr = vi.spyOn(store, "incr");
    await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-real-ip": "5.6.7.8" }), () => deps());
    await requestNote(post({ view: "trend", subject: "dag", ...brush(1) }), () => deps());
    expect(incr.mock.calls[0]![0]).toBe(rateKeyOf(hash16("5.6.7.8"), "2026-10-27T12"));
    expect(incr.mock.calls[2]![0]).toBe(rateKeyOf(hash16("unknown"), "2026-10-27T12"));
  });

  it("a visitor's brushed range past the hour's limit is a 429, and another visitor is not held to it", async () => {
    const d = deps();
    for (let i = 0; i < RATE_PER_HOUR; i++) {
      const res = await requestNote(post({ view: "trend", subject: "dag", ...brush(i) }, { "x-forwarded-for": "1.2.3.4" }), () => d);
      expect(res.status).toBe(200);
    }
    const over = await requestNote(post({ view: "trend", subject: "dag", ...brush(RATE_PER_HOUR) }, { "x-forwarded-for": "1.2.3.4" }), () => d);
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ state: "unavailable" });
    const other = await requestNote(post({ view: "trend", subject: "dag", ...brush(RATE_PER_HOUR) }, { "x-forwarded-for": "9.9.9.9" }), () => d);
    expect(other.status).toBe(200);
  });

  it("writes a subject note on request, counting the visitor like a brushed range; a read of it answers `request`", async () => {
    const d = deps();
    const read = await readNote(get(`view=geo&subject=${anId}/cc:FI`), () => d);
    expect(await read.json()).toEqual({ state: "request" });
    expect(d.chat).not.toHaveBeenCalled();
    const incr = vi.spyOn(store, "incr");
    const res = await requestNote(post({ view: "geo", subject: `${anId}/cc:FI` }, { "x-forwarded-for": "1.2.3.4" }), () => d);
    expect(await res.json()).toMatchObject({ state: "ok" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(incr.mock.calls.map(([k]) => k)).toEqual([
      rateKeyOf(hash16("1.2.3.4"), "2026-10-27T12"),
      capKeyOf("2026-10-27"),
    ]);
    expect(d.chat).toHaveBeenCalledTimes(1);
    expect(await store.get(noteKeyOf("geo", `${anId}/cc:FI`, "day"))).not.toBeNull();
    // Written: the next request is the cached note, and counts nothing.
    const again = await requestNote(post({ view: "geo", subject: `${anId}/cc:FI` }, { "x-forwarded-for": "1.2.3.4" }), () => d);
    expect(await again.json()).toMatchObject({ state: "ok" });
    expect(incr).toHaveBeenCalledTimes(2);
    expect(d.chat).toHaveBeenCalledTimes(1);
  });

  it("a subject with nothing measured answers none and spends no count; a write already in flight answers pending and spends none (review 2026-10-29)", async () => {
    const incr = vi.spyOn(store, "incr");
    const bare = deps({ facts: vi.fn(async () => null) });
    const none = await requestNote(post({ view: "geo", subject: `${anId}/cc:FI` }, { "x-forwarded-for": "1.2.3.4" }), () => bare);
    expect(await none.json()).toEqual({ state: "none" });
    expect(bare.chat).not.toHaveBeenCalled();
    await store.lock(lockKeyOf(noteKeyOf("trend", "dag", RANGE_SPAN)), 60);
    const pending = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-forwarded-for": "1.2.3.4" }), () => deps());
    expect(await pending.json()).toEqual({ state: "pending" });
    expect(incr).not.toHaveBeenCalled();
  });

  it("a visitor's subject note past the hour's limit is a 429", async () => {
    const d = deps();
    for (let i = 0; i < RATE_PER_HOUR; i++) {
      const res = await requestNote(post({ view: "geo", subject: country(i) }, { "x-forwarded-for": "1.2.3.4" }), () => d);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ state: "ok" });
    }
    const over = await requestNote(post({ view: "geo", subject: country(RATE_PER_HOUR) }, { "x-forwarded-for": "1.2.3.4" }), () => d);
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ state: "unavailable" });
  });

  it("past the day's 2,000 brushed ranges, answers unavailable and counts `capped`", async () => {
    for (let i = 0; i < 2000; i++) await store.incr(capKeyOf("2026-10-27"), 86_400);
    const d = deps();
    const res = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-forwarded-for": "1.2.3.4" }), () => d);
    expect(await res.json()).toEqual({ state: "unavailable" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(d.chat).not.toHaveBeenCalled();
    expect((await stats()).capped).toBe(1);
  });

  it("a cached brush is served without counting: 25 POSTs from one visitor never 429 and never touch the cap", async () => {
    await store.set(noteKeyOf("trend", "dag", RANGE_SPAN), JSON.stringify({ text: "A cached range.", writtenAt: NOW - H, spanFrom: RANGE.fromMs, spanTo: RANGE.toMs, days: [] }), 3600);
    const incr = vi.spyOn(store, "incr");
    const d = deps();
    for (let i = 0; i < 25; i++) {
      const res = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-forwarded-for": "1.2.3.4" }), () => d);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ state: "ok", text: "A cached range." });
    }
    expect(incr).not.toHaveBeenCalled();
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("a subject no note exists for is `none` and counts nothing", async () => {
    const incr = vi.spyOn(store, "incr");
    const res = await requestNote(post({ view: "trend", subject: "all", ...RANGE }, { "x-forwarded-for": "1.2.3.4" }), () => deps());
    expect(await res.json()).toEqual({ state: "none" });
    expect(incr).not.toHaveBeenCalled();
  });

  it("a limiter outage answers unavailable", async () => {
    vi.spyOn(store, "incr").mockRejectedValue(new Error("down"));
    const res = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }), () => deps());
    expect(await res.json()).toEqual({ state: "unavailable" });
  });

  it("400s a bad body: malformed JSON, a pill that is not on request, an untracked subject", async () => {
    for (const body of ["{nope", { view: "trend", subject: "dag", span: "7d" }, { view: "trend", subject: "DAGnotTracked", span: "1h" }]) {
      const res = await requestNote(post(body), () => deps());
      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});

describe("a brush with no span in it is `none`, not a 400 (no card)", () => {
  it("GET: a brush inside the still-filling bucket at the live edge", async () => {
    const res = await readNote(get(`view=trend&subject=dag&from=${NOW}&to=${NOW + 1000}`), () => deps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "none" });
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC);
  });
  it("POST: counts nothing and calls nothing", async () => {
    const d = deps();
    const incr = vi.spyOn(store, "incr");
    const res = await requestNote(post({ view: "trend", subject: "dag", fromMs: NOW - D, toMs: NOW - D }), () => d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "none" });
    expect(incr).not.toHaveBeenCalled();
    expect(d.chat).not.toHaveBeenCalled();
  });
  it("a malformed brush is still a 400", async () => {
    const res = await readNote(get(`view=trend&subject=dag&from=abc&to=${NOW}`), () => deps());
    expect(res.status).toBe(400);
  });
});

describe("a failed note is not retried by every visitor (R38)", () => {
  it("two reads of a failing note, a cache-buster on the second: one model attempt", async () => {
    const d = deps({ chat: vi.fn(async () => { throw new GateError("rate"); }) });
    expect(await (await readNote(get("view=trend&subject=dag&span=7d"), () => d)).json()).toEqual({ state: "unavailable" });
    const again = await readNote(get("view=trend&subject=dag&span=7d&x=1"), () => d);
    expect(await again.json()).toEqual({ state: "unavailable" });
    expect(again.headers.get("Cache-Control")).toBe("no-store");
    expect(d.chat).toHaveBeenCalledTimes(1);
  });
  it("the 1h pill's POST, repeated after a failure: one model attempt", async () => {
    const d = deps({ chat: vi.fn(async () => { throw new GateError("http"); }) });
    for (let i = 0; i < 3; i++) {
      const res = await requestNote(post({ view: "trend", subject: "dag", span: "1h" }), () => d);
      expect(await res.json()).toEqual({ state: "unavailable" });
    }
    expect(d.chat).toHaveBeenCalledTimes(1);
  });
});

describe("the visitor hash is keyed when the server holds a secret", () => {
  it("HMAC-SHA256 with CRON_SECRET, first 16 hex characters; the raw address never appears", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const incr = vi.spyOn(store, "incr");
    await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-forwarded-for": "1.2.3.4" }), () => deps());
    const keyed = createHmac("sha256", "s3cret").update("1.2.3.4").digest("hex").slice(0, 16);
    expect(incr.mock.calls[0]![0]).toBe(rateKeyOf(keyed, "2026-10-27T12"));
    expect(keyed).not.toBe(hash16("1.2.3.4"));
    expect(incr.mock.calls.flat().join(" ")).not.toContain("1.2.3.4");
  });
});

describe("the warm budget leaves the worst item room inside maxDuration 300 s", () => {
  it("is 210 s: two paced Gate attempts at their 20 s timeout and the reads still finish before 300 s", () => {
    expect(WARM_BUDGET_MS).toBe(210_000);
    expect(WARM_BUDGET_MS + WARM_SPACING_MS + 2 * 20_000).toBeLessThan(300_000);
  });

  it("is paced for the paid model: a cold store of 123 notes fills in one pass", () => {
    expect(WARM_SPACING_MS).toBe(500);
    expect(WARM_CONCURRENCY).toBe(3);
    const secondsAWrite = 2.7; // measured on the model, 2026-11-01
    const callsAPass = Math.min(WARM_BUDGET_MS / WARM_SPACING_MS, (WARM_BUDGET_MS / 1000 / secondsAWrite) * WARM_CONCURRENCY);
    expect(callsAPass).toBeGreaterThan(123 * 1.3); // a third of the notes take a second attempt
  });
});

describe("GET /api/notes/warm (cron)", () => {
  const warmReq = (auth?: string) => new Request("http://localhost/api/notes/warm", { headers: auth ? { authorization: auth } : {} });

  it("fails closed without CRON_SECRET, even for `Bearer undefined`", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const d = deps();
    expect((await warmNotes(warmReq("Bearer undefined"), () => d)).status).toBe(401);
    expect((await warmNotes(warmReq(), () => d)).status).toBe(401);
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("401s a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await warmNotes(warmReq("Bearer nope"), () => deps())).status).toBe(401);
  });

  it("warms every planned note, then finds nothing due on the next pass", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const d = deps();
    const res = await warmNotes(warmReq("Bearer s3cret"), () => d);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.planned).toBeGreaterThan(0);
    expect(body).toEqual({ planned: body.planned, done: body.planned, failed: 0 });
    expect(await store.get(noteKeyOf("geo", "cc:DE", "day"))).not.toBeNull();
    expect(await store.get(noteKeyOf("ledger", sampledIds()[0]!, "hours"))).not.toBeNull();
    expect(await store.get(noteKeyOf("trend", "dag", "all"))).not.toBeNull();
    expect(JSON.parse((await store.get(noteKeyOf("hyper", "all", "day")))!).setKey).toBe("DAGa,dag");
    const again = await (await warmNotes(warmReq("Bearer s3cret"), () => d)).json();
    expect(again).toEqual({ planned: 0, done: 0, failed: 0 });
  });

  it("an hour on, rewrites the hourly kinds only", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    await warmNotes(warmReq("Bearer s3cret"), () => deps());
    const d = deps({ now: () => NOW + H });
    vi.setSystemTime(NOW + H);
    const body = await (await warmNotes(warmReq("Bearer s3cret"), () => d)).json();
    const facts = d.facts as unknown as { mock: { calls: [string, string, string][] } };
    const kinds = new Set(facts.mock.calls.map(([view, , span]) => `${view}:${span}`));
    expect(kinds).toEqual(new Set(["ledger:hours", "blocks:hours", "data:hours", "trend:24h"]));
    expect(body.done).toBe(body.planned);
  });

  it("a network set that changed rewrites the hyper digest", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    await warmNotes(warmReq("Bearer s3cret"), () => deps());
    const d = deps({ digest: async () => ({ setKey: "dag", driftKeys: null }) });
    const body = await (await warmNotes(warmReq("Bearer s3cret"), () => d)).json();
    expect(body).toEqual({ planned: 1, done: 1, failed: 0 });
  });

  // A note follows its numbers (user, 2026-10-31): one read of the digest, one rewrite of the note
  // whose count moved, a good hour after it was written, and the new count stored for the next pass.
  it("a network's held count that moved rewrites its Hypergraph and Geography notes, an hour on", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const id = sampledIds()[0]!;
    const keys = (n: string) => ({ all: "x", [id]: n });
    const first = deps({ digest: async () => ({ setKey: "DAGa,dag", driftKeys: keys("8") }) });
    await warmNotes(warmReq("Bearer s3cret"), () => first);
    expect(JSON.parse((await store.get(noteKeyOf("hyper", id, "day")))!).driftKey).toBe("8");
    const sameHour = deps({ digest: async () => ({ setKey: "DAGa,dag", driftKeys: keys("7") }) });
    expect((await (await warmNotes(warmReq("Bearer s3cret"), () => sameHour)).json()).planned).toBe(0);
    vi.advanceTimersByTime(55 * 60_000);
    const later = deps({ digest: async () => ({ setKey: "DAGa,dag", driftKeys: keys("7") }), now: () => Date.now() } as never);
    await warmNotes(warmReq("Bearer s3cret"), () => later);
    expect(JSON.parse((await store.get(noteKeyOf("geo", id, "day")))!).driftKey).toBe("7");
    expect(JSON.parse((await store.get(noteKeyOf("hyper", id, "day")))!).driftKey).toBe("7");
  });

  it("waits WARM_SPACING_MS before every Gate call but the first, and runs no more than WARM_CONCURRENCY at once", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const d = deps();
    let running = 0;
    let peak = 0;
    d.chat = vi.fn(async () => {
      running++;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running--;
      return CLEAN;
    });
    await warmNotes(warmReq("Bearer s3cret"), () => d);
    const calls = (d.chat as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(WARM_CONCURRENCY);
    // The clock stands still here, so each call's reserved slot sits one spacing past the last.
    expect((d.sleep as unknown as { mock: { calls: number[][] } }).mock.calls).toEqual(Array.from({ length: calls - 1 }, (_, i) => [(i + 1) * WARM_SPACING_MS]));
  });

  it("two overlapping passes write each due note once", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const d = deps();
    const [a, b] = await Promise.all([warmNotes(warmReq("Bearer s3cret"), () => d), warmNotes(warmReq("Bearer s3cret"), () => d)]);
    const planned = (await a.json()).planned;
    expect((await b.json()).planned).toBe(planned);
    expect((d.chat as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(planned);
  });

  it("a due note another writer refreshed after the prefetch is served, not paid for twice", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    await warmNotes(warmReq("Bearer s3cret"), () => deps()); // everything written, fresh
    const key = noteKeyOf("trend", "dag", "7d");
    const note = (writtenAt: number) => JSON.stringify({ text: "A note.", writtenAt, spanFrom: NOW - 7 * D, spanTo: NOW, days: [] });
    await store.set(key, note(NOW - 25 * H), 72 * 3600); // due
    const mget = store.mget.bind(store);
    vi.spyOn(store, "mget").mockImplementation(async (keys) => {
      const seen = await mget(keys);
      await store.set(key, note(NOW - 60_000), 72 * 3600); // a visitor's read rewrote it meanwhile
      return seen;
    });
    const d = deps();
    const body = await (await warmNotes(warmReq("Bearer s3cret"), () => d)).json();
    expect(body).toEqual({ planned: 1, done: 1, failed: 0 });
    expect(d.chat).not.toHaveBeenCalled();
    expect(JSON.parse((await store.get(key))!).writtenAt).toBe(NOW - 60_000);
  });

  it("a pass whose planning ate the budget starts nothing", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    let t = NOW;
    const d = deps({
      now: () => t,
      countries: async () => {
        t += 211_000; // a slow geo read
        return ["DE"];
      },
    });
    const body = await (await warmNotes(warmReq("Bearer s3cret"), () => d)).json();
    expect(body.planned).toBeGreaterThan(0);
    expect(body).toMatchObject({ done: 0, failed: 0 });
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("a store outage answers unavailable, uncached", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await warmNotes(warmReq("Bearer s3cret"), () => {
      throw new Error("Upstash env missing");
    });
    expect(await res.json()).toEqual({ state: "unavailable" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// R66: PREVIEWS NEVER WRITE NOTES. A PR preview shares production's Upstash store (the marketplace
// env vars span every scope), so a miss there would write notes from the preview's code, draw on
// the Gate's quota and count into production's go/no-go stats. Generation runs only where
// `notesWritable()` holds (store.ts); elsewhere a cached note is served and a miss is `none`.
describe("a warm pass reads the store once", () => {
  it("sends every note of the pass, the digest and the countries through one read client", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NOTES_STORE", "memory");
    const span = vi.fn(async () => { throw new Error("stop here"); });
    const geoDays = vi.fn(async () => { throw new Error("stop here"); });
    const d = liveWarmDeps({ span, geoDays, chainReads: async () => ({}) });
    await d.facts("ledger", "all", "hours", 1).catch(() => null);
    expect(span).toHaveBeenCalledTimes(2); // this note's two windows
    await d.digest(1).catch(() => null);
    expect(span.mock.calls.length).toBeGreaterThan(2);
    await d.countries(1).catch(() => null);
    expect(geoDays).toHaveBeenCalled();
  });
});

describe("a preview deployment writes no notes (R66)", () => {
  it("the live deps carry `notesWritable()`: false on a preview", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NOTES_STORE", "memory");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(liveDeps().writable).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(liveDeps().writable).toBe(true);
  });

  it("GET: a missing warmable note is `none`, with no model call and nothing stored", async () => {
    const d = deps({ writable: false });
    const res = await readNote(get("view=trend&subject=dag&span=7d"), () => d);
    expect(await res.json()).toEqual({ state: "none" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await store.get(noteKeyOf("trend", "dag", "7d"))).toBeNull();
    expect(await stats()).toEqual({});
  });

  it("GET: an on-request kind is `none`, not `request` (the request route would not write it)", async () => {
    const res = await readNote(get(`view=trend&subject=dag&from=${RANGE.fromMs}&to=${RANGE.toMs}`), () => deps({ writable: false }));
    expect(await res.json()).toEqual({ state: "none" });
  });

  it("GET: a cached note is still served", async () => {
    await deps().store.set(noteKeyOf("trend", "dag", "7d"), JSON.stringify({ text: "Cached.", writtenAt: NOW - H, spanFrom: NOW - 7 * D, spanTo: NOW, days: [] }), 3600);
    const res = await readNote(get("view=trend&subject=dag&span=7d"), () => deps({ writable: false }));
    expect(await res.json()).toMatchObject({ state: "ok", text: "Cached." });
  });

  it("POST: the request route answers `none` and counts no limit", async () => {
    const d = deps({ writable: false });
    const incr = vi.spyOn(store, "incr");
    for (const body of [{ view: "trend", subject: "dag", span: "1h" }, { view: "trend", subject: "dag", ...RANGE }]) {
      const res = await requestNote(post(body, { "x-forwarded-for": "1.2.3.4" }), () => d);
      expect(await res.json()).toEqual({ state: "none" });
    }
    expect(incr).not.toHaveBeenCalled();
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("warm: even an authorised pass writes nothing", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const d = deps({ writable: false });
    const res = await warmNotes(new Request("http://localhost/api/notes/warm", { headers: { authorization: "Bearer s3cret" } }), () => d);
    expect(await res.json()).toEqual({ state: "none" });
    expect(d.chat).not.toHaveBeenCalled();
    expect(await store.get(noteKeyOf("hyper", "all", "day"))).toBeNull();
  });
});
