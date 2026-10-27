import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fact } from "@/src/data/noteFacts";
import { sampledIds } from "@/src/net/lineage";
import { readNote, requestNote, warmNotes, type WarmDeps } from "./handlers";
import { capKeyOf, lockKeyOf, noteKeyOf, rateKeyOf, statsKeyOf } from "./keys";
import type { NoteFacts } from "./sources";
import { memoryNotesStore, type NotesStore } from "./store";

const H = 3_600_000;
const D = 86_400_000;
const NOW = Date.UTC(2026, 9, 27, 12, 30);
const FACTS: NoteFacts = {
  facts: [fact("Snapshots anchored, per day, this span", 1200, "count"), fact("Span length", 604_800, "duration")],
  names: ["DAG"],
  blurbs: [],
  days: [],
  spanFrom: NOW - 7 * D,
  spanTo: NOW,
  label: "the hypergraph",
};
const CLEAN = "NOTE: The hypergraph anchored 1,200 snapshots a day.";
const PUBLIC = "public, s-maxage=300, stale-while-revalidate=600";
const RANGE = { fromMs: NOW - 2 * D, toMs: NOW - D };
const RANGE_SPAN = `r${RANGE.fromMs}-${RANGE.toMs}` as const;

let store: NotesStore;
function deps(over: Partial<WarmDeps> = {}): WarmDeps {
  return {
    store,
    facts: vi.fn(async (_n: string, view: string, subject: string) => ({ ...FACTS, ...(view === "hyper" && subject === "all" ? { setKey: "DAGa,dag" } : {}) })),
    chat: vi.fn(async () => CLEAN),
    now: () => NOW,
    countries: async () => ["DE"],
    setKey: async () => "DAGa,dag",
    ...over,
  };
}
const get = (q: string) => new Request(`http://localhost/api/notes?${q}`);
const post = (body: unknown, headers: Record<string, string> = {}, q = "") =>
  new Request(`http://localhost/api/notes/request${q}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const hash16 = (ip: string) => createHash("sha256").update(ip).digest("hex").slice(0, 16);
async function stats(): Promise<Record<string, number>> {
  const raw = await store.get(statsKeyOf("mainnet", "2026-10-27"));
  return raw ? JSON.parse(raw) : {};
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
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

  it("answers `request` for an on-request kind, cacheable, with no model call", async () => {
    const d = deps();
    const res = await readNote(get(`view=trend&subject=dag&from=${RANGE.fromMs}&to=${RANGE.toMs}`), () => d);
    expect(await res.json()).toEqual({ state: "request" });
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC);
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("`none` is cacheable: another network than mainnet", async () => {
    const res = await readNote(get("view=trend&subject=dag&span=7d&net=testnet"), () => deps());
    expect(await res.json()).toEqual({ state: "none" });
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC);
  });

  it("`pending` is never cached", async () => {
    await store.lock(lockKeyOf(noteKeyOf("mainnet", "trend", "dag", "7d")), 60);
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
      rateKeyOf("mainnet", hash16("1.2.3.4"), "2026-10-27T12"),
      capKeyOf("mainnet", "2026-10-27"),
    ]);
    expect(incr.mock.calls.flat().join(" ")).not.toContain("1.2.3.4");
    expect(await store.get(noteKeyOf("mainnet", "trend", "dag", RANGE_SPAN))).not.toBeNull();
  });

  it("falls back to x-real-ip, then to one shared unknown visitor", async () => {
    const incr = vi.spyOn(store, "incr");
    await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-real-ip": "5.6.7.8" }), () => deps());
    await requestNote(post({ view: "trend", subject: "dag", ...RANGE }), () => deps());
    expect(incr.mock.calls[0]![0]).toBe(rateKeyOf("mainnet", hash16("5.6.7.8"), "2026-10-27T12"));
    expect(incr.mock.calls[2]![0]).toBe(rateKeyOf("mainnet", hash16("unknown"), "2026-10-27T12"));
  });

  it("a visitor's 21st brushed range in an hour is a 429, and another visitor is not held to it", async () => {
    const d = deps();
    for (let i = 0; i < 20; i++) {
      const res = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-forwarded-for": "1.2.3.4" }), () => d);
      expect(res.status).toBe(200);
    }
    const over = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-forwarded-for": "1.2.3.4" }), () => d);
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ state: "unavailable" });
    const other = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-forwarded-for": "9.9.9.9" }), () => d);
    expect(other.status).toBe(200);
  });

  it("past the day's 2,000 brushed ranges, answers unavailable and counts `capped`", async () => {
    for (let i = 0; i < 2000; i++) await store.incr(capKeyOf("mainnet", "2026-10-27"), 86_400);
    const d = deps();
    const res = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, { "x-forwarded-for": "1.2.3.4" }), () => d);
    expect(await res.json()).toEqual({ state: "unavailable" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(d.chat).not.toHaveBeenCalled();
    expect((await stats()).capped).toBe(1);
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

  it("another network than mainnet is `none` and counts nothing", async () => {
    const incr = vi.spyOn(store, "incr");
    const res = await requestNote(post({ view: "trend", subject: "dag", ...RANGE }, {}, "?net=testnet"), () => deps());
    expect(await res.json()).toEqual({ state: "none" });
    expect(incr).not.toHaveBeenCalled();
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
    expect(await store.get(noteKeyOf("mainnet", "geo", "cc:DE", "day"))).not.toBeNull();
    expect(await store.get(noteKeyOf("mainnet", "ledger", sampledIds("mainnet")[0]!, "hours"))).not.toBeNull();
    expect(await store.get(noteKeyOf("mainnet", "trend", "dag", "all"))).not.toBeNull();
    expect(JSON.parse((await store.get(noteKeyOf("mainnet", "hyper", "all", "day")))!).setKey).toBe("DAGa,dag");
    const again = await (await warmNotes(warmReq("Bearer s3cret"), () => d)).json();
    expect(again).toEqual({ planned: 0, done: 0, failed: 0 });
  });

  it("an hour on, rewrites the hourly kinds only", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    await warmNotes(warmReq("Bearer s3cret"), () => deps());
    const d = deps({ now: () => NOW + H });
    vi.setSystemTime(NOW + H);
    const body = await (await warmNotes(warmReq("Bearer s3cret"), () => d)).json();
    const facts = d.facts as unknown as { mock: { calls: [string, string, string, string][] } };
    const kinds = new Set(facts.mock.calls.map(([, view, , span]) => `${view}:${span}`));
    expect(kinds).toEqual(new Set(["ledger:hours", "trend:24h"]));
    expect(body.done).toBe(body.planned);
  });

  it("a network set that changed rewrites the hyper digest", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    await warmNotes(warmReq("Bearer s3cret"), () => deps());
    const d = deps({ setKey: async () => "dag" });
    const body = await (await warmNotes(warmReq("Bearer s3cret"), () => d)).json();
    expect(body).toEqual({ planned: 1, done: 1, failed: 0 });
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
