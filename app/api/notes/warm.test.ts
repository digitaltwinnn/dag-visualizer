import { describe, expect, it } from "vitest";
import { CATALOG } from "@/src/engine/config";
import { noteKeyOf } from "./keys";
import { executePass, latestCountries, planPass, warmCandidates, WARM_SLACK_MS, type WarmItem } from "./warm";

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 27, 12, 7);
const [a, b] = CATALOG.mainnet.map((m) => m.id);
const SUBJECTS = [a!, b!];
const SET = "DAGa,dag";

type Rec = { writtenAt: number; setKey?: string };
const cacheOf = (records: Record<string, Rec>) => (key: string) => records[key] ?? null;
const keyOf = (i: WarmItem) => noteKeyOf("mainnet", i.view, i.subject, i.span);
/** Every candidate written at `writtenAt` (hyper `all` carrying the current set). */
function allCached(subjects: string[], countries: string[], writtenAt: number): Record<string, Rec> {
  return Object.fromEntries(warmCandidates(subjects, countries).map((i) => [keyOf(i), { writtenAt, setKey: SET }]));
}

describe("planPass", () => {
  it("with nothing cached, the hourly kinds come first: ledger and trend24h before hyper", () => {
    const plan = planPass(NOW, SUBJECTS, [], SET, () => null);
    const kinds = plan.map((i) => `${i.view}:${i.span}`);
    expect(kinds.slice(0, 4)).toEqual(["ledger:hours", "ledger:hours", "trend:24h", "trend:24h"]);
    expect(kinds.slice(4, 6)).toEqual(["hyper:day", "hyper:day"]);
    expect(plan.slice(0, 2).map((i) => i.subject)).toEqual(SUBJECTS);
    // Every warmable kind, and no on-request one.
    expect(new Set(kinds)).toEqual(new Set(["ledger:hours", "trend:24h", "hyper:day", "geo:day", "trend:7d", "trend:30d", "trend:1y", "trend:all"]));
  });

  it("lists only what a note exists for: History has no `all` subject", () => {
    const plan = planPass(NOW, ["all", "dag"], [], SET, () => null);
    expect(plan.filter((i) => i.view === "trend").every((i) => i.subject === "dag")).toBe(true);
    expect(plan.filter((i) => i.view === "hyper").map((i) => i.subject)).toEqual(["all", "dag"]);
  });

  it("a hyper record written 2 h ago is not re-planned; a ledger one is", () => {
    const plan = planPass(NOW, SUBJECTS, [], SET, cacheOf(allCached(SUBJECTS, [], NOW - 2 * H)));
    expect(plan.some((i) => i.view === "hyper")).toBe(false);
    expect(plan.filter((i) => i.view === "ledger").map((i) => i.subject)).toEqual(SUBJECTS);
    expect(plan.filter((i) => i.view === "trend").map((i) => i.span)).toEqual(["24h", "24h"]);
  });

  it("an hourly record the previous pass wrote is due on this one, whatever the pass's jitter", () => {
    // Written a few minutes into the last :07 pass, read at the top of this one: under an hour old.
    const justUnder = planPass(NOW, SUBJECTS, [], SET, cacheOf(allCached(SUBJECTS, [], NOW - H + 4 * 60_000)));
    expect(justUnder.filter((i) => i.view === "ledger")).toHaveLength(2);
    const fresh = planPass(NOW, SUBJECTS, [], SET, cacheOf(allCached(SUBJECTS, [], NOW - H + WARM_SLACK_MS + 1)));
    expect(fresh).toEqual([]);
  });

  it("a daily record is due a day later, within the same slack", () => {
    const plan = planPass(NOW, SUBJECTS, [], SET, cacheOf(allCached(SUBJECTS, [], NOW - 24 * H + 4 * 60_000)));
    expect(plan.some((i) => i.view === "hyper")).toBe(true);
    expect(plan.some((i) => i.span === "7d")).toBe(true);
  });

  it("countries add Geography `cc:` items, after the networks' own", () => {
    const plan = planPass(NOW, SUBJECTS, ["DE", "US"], SET, () => null);
    const geo = plan.filter((i) => i.view === "geo").map((i) => i.subject);
    expect(geo).toEqual([...SUBJECTS, "cc:DE", "cc:US"]);
  });

  it("a fresh hyper `all` record with a different setKey is re-planned", () => {
    const subjects = ["all", ...SUBJECTS];
    const records = allCached(subjects, [], NOW - 2 * H);
    const allKey = noteKeyOf("mainnet", "hyper", "all", "day");
    expect(planPass(NOW, subjects, [], SET, cacheOf(records)).some((i) => i.view === "hyper")).toBe(false);
    records[allKey] = { writtenAt: NOW - 2 * H, setKey: "dag" };
    expect(planPass(NOW, subjects, [], SET, cacheOf(records)).filter((i) => i.view === "hyper")).toEqual([
      { view: "hyper", subject: "all", span: "day" },
    ]);
    // An unknown current set (its read failed) compares nothing.
    expect(planPass(NOW, subjects, [], null, cacheOf(records)).some((i) => i.view === "hyper")).toBe(false);
  });
});

describe("latestCountries", () => {
  it("reads the whole fleet's countries from the newest measured day", () => {
    const days = {
      "2026-10-26": { "f.cc.FR": 3, "f.cc.DE": 1 },
      "2026-10-27": { "f.cc.US": 4, "f.cc.DE": 2, "f.cc.DAGabc.DE": 1, "f.isp.hetzner": 3, "f.cc.NL": 0 },
    };
    expect(latestCountries(days)).toEqual(["DE", "US"]);
    expect(latestCountries({})).toEqual([]);
  });
});

describe("executePass", () => {
  const items = (n: number): WarmItem[] => Array.from({ length: n }, (_, i) => ({ view: "trend", subject: `s${i}`, span: "7d" }));

  it("runs every item with at most four at once, counting done and failed", async () => {
    let running = 0;
    let peak = 0;
    const res = await executePass(items(10), async (i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      if (i.subject === "s3") throw new Error("boom");
      return i.subject === "s4" ? { state: "unavailable" } : i.subject === "s5" ? { state: "none" } : { state: "ok", text: "", writtenAt: 0, spanFrom: 0, spanTo: 0, days: [] };
    }, { now: () => 0, budgetMs: 240_000, concurrency: 4 });
    expect(peak).toBe(4);
    expect(res).toEqual({ planned: 10, done: 8, failed: 2 });
  });

  it("stops scheduling new items once the budget is spent", async () => {
    let t = 0;
    const started: string[] = [];
    const res = await executePass(items(10), async (i) => {
      started.push(i.subject);
      t += 100_000;
      return { state: "ok", text: "", writtenAt: 0, spanFrom: 0, spanTo: 0, days: [] };
    }, { now: () => t, budgetMs: 240_000, concurrency: 1 });
    expect(started).toEqual(["s0", "s1", "s2"]);
    expect(res).toEqual({ planned: 10, done: 3, failed: 0 });
  });
});
