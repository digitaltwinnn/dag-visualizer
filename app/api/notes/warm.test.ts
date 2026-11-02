import { describe, expect, it } from "vitest";
import { CATALOG } from "@/src/engine/config";
import { noteKeyOf } from "./keys";
import { executePass, pacedChat, planPass, warmCandidates, WARM_SLACK_MS, type WarmItem } from "./warm";

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 27, 12, 7);
const [a, b] = CATALOG.mainnet.map((m) => m.id);
const SUBJECTS = [a!, b!];
const SET = "DAGa,dag";

type Rec = { writtenAt: number; setKey?: string; driftKey?: string };
const cacheOf = (records: Record<string, Rec>) => (key: string) => records[key] ?? null;
const keyOf = (i: WarmItem) => noteKeyOf("mainnet", i.view, i.subject, i.span);
/** Every candidate written at `writtenAt` (hyper `all` carrying the current set). */
function allCached(subjects: string[], countries: string[], writtenAt: number): Record<string, Rec> {
  return Object.fromEntries(warmCandidates(subjects, countries).map((i) => [keyOf(i), { writtenAt, setKey: SET }]));
}


// The unlisted set is one more warm subject (user, 2026-10-30), and History alone takes it.
describe("warmCandidates and the unlisted set", () => {
  it("offers it in History only", () => {
    const items = warmCandidates(["unlisted"], []);
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((i) => i.view))).toEqual(new Set(["trend"]));
  });
});

// A NOTE FOLLOWS ITS NUMBERS, NOT ONLY THE CLOCK (user, 2026-10-31: "or do they feel more dynamic?").
// A daily note can disagree with the live card for a day, so a Hypergraph or Geography note whose
// network's held node count moved is due, at most hourly per note.
describe("planPass — a note follows its numbers", () => {
  const NET_ID = a!;
  const item = (view: "hyper" | "geo") => noteKeyOf("mainnet", view, NET_ID, "day");
  const fresh = (rec: Rec, view: "hyper" | "geo" = "hyper") => {
    const all = allCached([NET_ID], ["DE"], NOW - 2 * H);
    return cacheOf({ ...all, [item(view)]: rec });
  };
  const has = (plan: WarmItem[], view: string, subject = NET_ID) => plan.some((i) => i.view === view && i.subject === subject);

  it("plans a Hypergraph and a Geography note whose network's count moved", () => {
    for (const view of ["hyper", "geo"] as const) {
      const plan = planPass(NOW, [NET_ID], ["DE"], SET, fresh({ writtenAt: NOW - 2 * H, driftKey: "8" }, view), { [NET_ID]: "7" });
      expect(has(plan, view), view).toBe(true);
    }
  });
  it("leaves a note whose count held", () => {
    const plan = planPass(NOW, [NET_ID], ["DE"], SET, fresh({ writtenAt: NOW - 2 * H, driftKey: "8" }), { [NET_ID]: "8" });
    expect(has(plan, "hyper")).toBe(false);
  });
  it("rewrites a moved note at most hourly", () => {
    const young = fresh({ writtenAt: NOW - 30 * 60_000, driftKey: "8" });
    expect(has(planPass(NOW, [NET_ID], ["DE"], SET, young, { [NET_ID]: "7" }), "hyper")).toBe(false);
  });
  it("gives a note with no baseline one rewrite, then it compares", () => {
    expect(has(planPass(NOW, [NET_ID], ["DE"], SET, fresh({ writtenAt: NOW - 2 * H }), { [NET_ID]: "8" }), "hyper")).toBe(true);
  });
  it("compares nothing when the counts could not be read, or the subject has none", () => {
    const rec = fresh({ writtenAt: NOW - 2 * H, driftKey: "8" });
    expect(has(planPass(NOW, [NET_ID], ["DE"], SET, rec, null), "hyper")).toBe(false);
    expect(has(planPass(NOW, [NET_ID], ["DE"], SET, rec, {}), "hyper")).toBe(false);
  });
  it("a warmed country and History stay on their clock: the rollout is the two views' networks", () => {
    const cached = cacheOf(allCached([NET_ID], ["DE"], NOW - 2 * H));
    const plan = planPass(NOW, [NET_ID], ["DE"], SET, cached, { [NET_ID]: "7", "cc:DE": "1" });
    expect(has(plan, "geo", "cc:DE")).toBe(false);
    expect(plan.some((i) => i.view === "trend" && i.span !== "24h")).toBe(false);
  });
});

describe("planPass", () => {
  it("with nothing cached, the hourly kinds come first: ledger and trend24h before hyper", () => {
    const plan = planPass(NOW, SUBJECTS, [], SET, () => null);
    const kinds = plan.map((i) => `${i.view}:${i.span}`);
    expect(kinds.slice(0, 4)).toEqual(["ledger:hours", "ledger:hours", "trend:24h", "trend:24h"]);
    expect(kinds.slice(4, 6)).toEqual(["hyper:day", "hyper:day"]);
    expect(plan.slice(0, 2).map((i) => i.subject)).toEqual(SUBJECTS);
    // Every warmable kind, and no on-request one.
    expect(new Set(kinds)).toEqual(new Set(["ledger:hours", "trend:24h", "hyper:day", "geo:day", "trend:7d", "trend:30d", "trend:90d", "trend:1y", "trend:all"]));
  });

  it("lists only what a note exists for: History has no `all` subject", () => {
    const plan = planPass(NOW, ["all", "dag"], [], SET, () => null);
    expect(plan.filter((i) => i.view === "trend").every((i) => i.subject === "dag")).toBe(true);
    expect(plan.filter((i) => i.view === "hyper").map((i) => i.subject)).toEqual(["all", "dag"]);
  });

  it("the ledger's whole network is warmed once, as `all` (its `dag` is the same note)", () => {
    const plan = planPass(NOW, ["all", "dag", ...SUBJECTS], [], SET, () => null);
    expect(plan.filter((i) => i.view === "ledger").map((i) => i.subject)).toEqual(["all", ...SUBJECTS]);
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

  it("the slack stays under the cron step: a note written at :07 is not due at :52, even late, but is at the next :07 (M2)", () => {
    expect(WARM_SLACK_MS).toBeLessThan(15 * 60_000);
    const writtenAt = NOW - H + 5_000; // the first item of the previous :07 pass, 5 s in
    const ledgerOf = (at: number) => planPass(at, SUBJECTS, [], SET, cacheOf(allCached(SUBJECTS, [], writtenAt))).filter((i) => i.view === "ledger");
    const at52 = NOW - 15 * 60_000;
    expect(ledgerOf(at52)).toEqual([]);
    expect(ledgerOf(at52 + 5 * 60_000)).toEqual([]); // a :52 run that starts five minutes late
    expect(ledgerOf(NOW)).toHaveLength(2);
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
    }, { now: () => 0, start: 0, budgetMs: 240_000, concurrency: 4 });
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
    }, { now: () => t, start: 0, budgetMs: 240_000, concurrency: 1 });
    expect(started).toEqual(["s0", "s1", "s2"]);
    expect(res).toEqual({ planned: 10, done: 3, failed: 0 });
  });

  it("the budget counts from the handler's start, not the executor's", async () => {
    const started: string[] = [];
    let t = 230_000; // the prefetch and planning took 230 s
    const res = await executePass(items(10), async (i) => {
      started.push(i.subject);
      t += 6_000;
      return { state: "ok", text: "", writtenAt: 0, spanFrom: 0, spanTo: 0, days: [] };
    }, { now: () => t, start: 0, budgetMs: 240_000, concurrency: 1 });
    expect(started).toEqual(["s0", "s1"]);
    expect(res.done).toBe(2);
  });
});

describe("pacedChat", () => {
  it("waits out the spacing since the previous call's start, and only then", async () => {
    let t = 0;
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
      t += ms;
    };
    const chat = pacedChat(async (x: string) => x.toUpperCase(), 3500, () => t, sleep);
    expect(await chat("a")).toBe("A");
    expect(waits).toEqual([]);
    t += 1000;
    await chat("b");
    expect(waits).toEqual([2500]);
    t += 5000;
    await chat("c");
    expect(waits).toEqual([2500]);
  });
});
