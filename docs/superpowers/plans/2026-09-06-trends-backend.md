# Trends Timeseries Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist tiered network-metric timeseries in Upstash Redis via a Vercel-Cron-driven sampler route, readable through `/api/trends`.

**Architecture:** A 15-min cron hits `app/api/trends/sample` which pages the block-explorer stream since a Redis cursor, buckets records by their own timestamps into three hash tiers (5m/48h, 1h/90d, 1d/forever), and read-modify-writes one key per tier. `app/api/trends` assembles windows from 2–3 hashes behind CDN caching. Pure logic lives in colocated modules with vitest; routes stay thin.

**Tech Stack:** Next.js 16 route handlers (Node runtime), `@upstash/redis` (REST + pipeline), Vercel Cron, vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-trends-timeseries-design.md`

## Global Constraints

- Upstash free-tier budget: command economy is the design driver — a sampler run touches ONE key per tier (HMGET → merge in memory → HSET), ~10 commands, pipelined.
- Core Redis only: hashes + EXPIRE. No modules, no JSON commands, no global replication.
- Rule 10 in storage: a missing bucket is `null` ("not measured"), never 0 ("measured none"). Coverage marker = presence of the `g.ticks` field. No backfill fabrication.
- `feeFloor`/`kbFloor` naming keeps the floor semantics visible; per-metagraph `fee`/`kb` are exact.
- All bucket labels and keys are UTC (explorer timestamps are ISO-8601 Z).
- Sampler NEVER touches the ~2.5 MB raw L0 snapshot routes; only the tiny explorer list records.
- Env: `UPSTASH_KV_REST_API_URL` + `UPSTASH_KV_REST_API_TOKEN` (sampler), `UPSTASH_KV_REST_API_READ_ONLY_TOKEN` (read route). Auth: `Authorization: Bearer ${CRON_SECRET}`.
- Repo rules: no raw hex colours (n/a here), commit trailer `Co-Authored-By: Claude <noreply@anthropic.com>`, `npx tsc --noEmit` + `npm test` green at every commit.

## Key/field grammar (used by every task — copy exactly)

```
key   t:{net}:5m:{YYYY-MM-DD}   TTL 259200 s (3 d)     bucket label "HH:MM" (minute floored to /5)
key   t:{net}:1h:{YYYY-MM}      TTL 10368000 s (120 d)  bucket label "DD-HH"
key   t:{net}:1d:{YYYY}         no TTL                  bucket label "MM-DD"
key   t:{net}:cursor            hash: v=1, g=<ordinal>, gTs=<ms>, m.{id}=<ordinal>
key   t:{net}:lock              SET NX EX 300
field "{bucket}|{series}"
series  g.ticks g.anchors g.blocks g.gapMax g.gapSum g.feeFloor g.kbFloor
        m.{id}.snaps  m.{id}.fee  m.{id}.kb
        f.nodes  f.nodes.{id}  f.layer.{l0|cl1|dl1}  f.cc.{CC}    (f.cc.* daily tier only)
merge   series starting "f." → set (last write wins) · "g.gapMax" → max · everything else → add
```

---

### Task 1: Pure foundations — `keys.ts` + `merge.ts`

**Files:**
- Create: `app/api/trends/keys.ts`
- Create: `app/api/trends/merge.ts`
- Test: `app/api/trends/keys.test.ts`, `app/api/trends/merge.test.ts`
- Modify: `package.json` (add `@upstash/redis` — folded here so every later task can import it)

**Interfaces:**
- Produces: `type Tier = "5m" | "1h" | "1d"`; `TIERS: Tier[]`; `TTL_S: Record<Tier, number | null>`;
  `slotOf(net: string, tier: Tier, tsMs: number): { key: string; bucket: string }`;
  `fieldOf(bucket: string, series: string): string`;
  `slotsInWindow(net: string, tier: Tier, fromMs: number, toMs: number): { key: string; bucket: string; tsMs: number }[]`;
  `stepMsOf(tier: Tier): number`;
  `cursorKeyOf(net: string): string`; `lockKeyOf(net: string): string`;
  `opOf(series: string): "add" | "max" | "set"`; `mergeVals(series: string, prev: number | undefined, next: number): number`.

- [ ] **Step 1: Install the dependency**

```bash
npm install @upstash/redis
```

- [ ] **Step 2: Write the failing tests**

`app/api/trends/keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slotOf, fieldOf, slotsInWindow, stepMsOf, cursorKeyOf, lockKeyOf, TTL_S } from "./keys";

const T = Date.UTC(2026, 8, 6, 14, 37, 22); // 2026-09-06T14:37:22Z

describe("trends keys", () => {
  it("floors 5m buckets and keys per UTC day", () => {
    expect(slotOf("mainnet", "5m", T)).toEqual({ key: "t:mainnet:5m:2026-09-06", bucket: "14:35" });
  });
  it("keys 1h per month, 1d per year", () => {
    expect(slotOf("mainnet", "1h", T)).toEqual({ key: "t:mainnet:1h:2026-09", bucket: "06-14" });
    expect(slotOf("mainnet", "1d", T)).toEqual({ key: "t:mainnet:1d:2026", bucket: "09-06" });
  });
  it("builds fields and utility keys", () => {
    expect(fieldOf("14:35", "g.ticks")).toBe("14:35|g.ticks");
    expect(cursorKeyOf("mainnet")).toBe("t:mainnet:cursor");
    expect(lockKeyOf("mainnet")).toBe("t:mainnet:lock");
  });
  it("pins the retention contract", () => {
    expect(TTL_S["5m"]).toBe(259200);
    expect(TTL_S["1h"]).toBe(10368000);
    expect(TTL_S["1d"]).toBeNull();
  });
  it("enumerates window slots inclusively and in order, crossing key boundaries", () => {
    const from = Date.UTC(2026, 8, 5, 23, 50);
    const to = Date.UTC(2026, 8, 6, 0, 5);
    const slots = slotsInWindow("mainnet", "5m", from, to);
    expect(slots.map((s) => s.bucket)).toEqual(["23:50", "23:55", "00:00", "00:05"]);
    expect(new Set(slots.map((s) => s.key)).size).toBe(2); // two day keys
    expect(slots[0].tsMs).toBe(from);
    expect(stepMsOf("5m")).toBe(300000);
  });
});
```

`app/api/trends/merge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { opOf, mergeVals } from "./merge";

describe("trends merge ops", () => {
  it("classifies series by the grammar", () => {
    expect(opOf("g.ticks")).toBe("add");
    expect(opOf("m.abc.fee")).toBe("add");
    expect(opOf("g.gapMax")).toBe("max");
    expect(opOf("f.nodes")).toBe("set");
    expect(opOf("f.cc.DE")).toBe("set");
  });
  it("merges by op with undefined prev as identity", () => {
    expect(mergeVals("g.ticks", undefined, 3)).toBe(3);
    expect(mergeVals("g.ticks", 2, 3)).toBe(5);
    expect(mergeVals("g.gapMax", 40, 28)).toBe(40);
    expect(mergeVals("g.gapMax", undefined, 28)).toBe(28);
    expect(mergeVals("f.nodes", 190, 195)).toBe(195);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run app/api/trends` — Expected: FAIL (modules not found).

- [ ] **Step 4: Implement**

`app/api/trends/keys.ts`:

```ts
// The trends store's key/field grammar — the ONE home for tier names, TTLs, bucket labels
// and window enumeration (spec: docs/superpowers/specs/2026-09-05-trends-timeseries-design.md).
// Everything is UTC: explorer timestamps are ISO-8601 Z, and a bucket label must mean the
// same instant regardless of which server derives it.

export type Tier = "5m" | "1h" | "1d";
export const TIERS: Tier[] = ["5m", "1h", "1d"];

// TTL IS the retention mechanism (Upstash usage contract): 5m lives 3 days, 1h 120 days
// (covers the 90-day horizon for every bucket in a month key), 1d forever.
export const TTL_S: Record<Tier, number | null> = { "5m": 259200, "1h": 10368000, "1d": null };

const STEP_MS: Record<Tier, number> = { "5m": 300000, "1h": 3600000, "1d": 86400000 };
export function stepMsOf(tier: Tier): number {
  return STEP_MS[tier];
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** The (redis key, bucket label) a timestamp lands in, per tier. */
export function slotOf(net: string, tier: Tier, tsMs: number): { key: string; bucket: string } {
  const d = new Date(Math.floor(tsMs / STEP_MS[tier]) * STEP_MS[tier]);
  const y = d.getUTCFullYear(), mo = p2(d.getUTCMonth() + 1), da = p2(d.getUTCDate());
  const h = p2(d.getUTCHours()), mi = p2(d.getUTCMinutes());
  if (tier === "5m") return { key: `t:${net}:5m:${y}-${mo}-${da}`, bucket: `${h}:${mi}` };
  if (tier === "1h") return { key: `t:${net}:1h:${y}-${mo}`, bucket: `${da}-${h}` };
  return { key: `t:${net}:1d:${y}`, bucket: `${mo}-${da}` };
}

export function fieldOf(bucket: string, series: string): string {
  return `${bucket}|${series}`;
}

/** Every slot from `fromMs` to `toMs` inclusive, oldest first — the read side's enumeration. */
export function slotsInWindow(
  net: string, tier: Tier, fromMs: number, toMs: number,
): { key: string; bucket: string; tsMs: number }[] {
  const step = STEP_MS[tier];
  const out: { key: string; bucket: string; tsMs: number }[] = [];
  for (let t = Math.floor(fromMs / step) * step; t <= toMs; t += step) {
    out.push({ ...slotOf(net, tier, t), tsMs: t });
  }
  return out;
}

export function cursorKeyOf(net: string): string {
  return `t:${net}:cursor`;
}
export function lockKeyOf(net: string): string {
  return `t:${net}:lock`;
}
```

`app/api/trends/merge.ts`:

```ts
// Per-series merge semantics (spec grammar): counters ADD across runs, the gap maximum
// takes MAX, fleet gauges are point samples and the LAST WRITE WINS. The series NAME
// carries the op, so bucketing and the read side can never disagree about a field's kind.

export type MergeOp = "add" | "max" | "set";

export function opOf(series: string): MergeOp {
  if (series.startsWith("f.")) return "set";
  if (series === "g.gapMax") return "max";
  return "add";
}

export function mergeVals(series: string, prev: number | undefined, next: number): number {
  const op = opOf(series);
  if (prev === undefined) return next;
  if (op === "add") return prev + next;
  if (op === "max") return Math.max(prev, next);
  return next;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/trends` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/trends/keys.ts app/api/trends/keys.test.ts app/api/trends/merge.ts app/api/trends/merge.test.ts package.json package-lock.json
git commit -m "feat(trends): key/field grammar and merge ops for the tiered store

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Bucketing — records → per-tier increments

**Files:**
- Create: `app/api/trends/bucketing.ts`
- Test: `app/api/trends/bucketing.test.ts`

**Interfaces:**
- Consumes: `slotOf`, `fieldOf`, `TIERS`, `mergeVals` from Task 1.
- Produces:
  `interface GlobalRec { ordinal: number; timestamp: string; metagraphSnapshotCount?: number; blocks?: unknown[] }`;
  `interface MetaRec { ordinal: number; timestamp: string; fee?: number; sizeInKB?: number }`;
  `interface FleetCounts { total: number; perNet: Record<string, number>; layers: Record<string, number>; countries: Record<string, number> }`;
  `type IncMap = Map<string, Map<string, number>>` (redis key → field → value, already merge-folded within the run);
  `addInc(inc: IncMap, net: string, tsMs: number, series: string, value: number, tiers?: Tier[]): void`;
  `bucketGlobals(inc: IncMap, net: string, recs: GlobalRec[], prevTickTsMs: number | null): void`;
  `bucketMetas(inc: IncMap, net: string, id: string, recs: MetaRec[]): void`;
  `bucketFleet(inc: IncMap, net: string, tsMs: number, fleet: FleetCounts): void`.

- [ ] **Step 1: Write the failing test**

`app/api/trends/bucketing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { addInc, bucketGlobals, bucketMetas, bucketFleet, type IncMap } from "./bucketing";

const ts = (h: number, m: number, s = 0) => new Date(Date.UTC(2026, 8, 6, h, m, s)).toISOString();
const get = (inc: IncMap, key: string, field: string) => inc.get(key)?.get(field);

describe("bucketGlobals", () => {
  it("sums ticks/anchors/blocks into every tier and computes gaps incl. the cross-run boundary", () => {
    const inc: IncMap = new Map();
    const prev = Date.UTC(2026, 8, 6, 13, 59, 40); // last tick of the PREVIOUS run
    bucketGlobals(inc, "mainnet", [
      { ordinal: 101, timestamp: ts(14, 0, 8), metagraphSnapshotCount: 3, blocks: [] },
      { ordinal: 102, timestamp: ts(14, 0, 36), metagraphSnapshotCount: 0, blocks: [{}, {}] },
      { ordinal: 103, timestamp: ts(14, 6, 2), metagraphSnapshotCount: 24 },
    ], prev);
    const day = "t:mainnet:5m:2026-09-06";
    expect(get(inc, day, "14:00|g.ticks")).toBe(2);
    expect(get(inc, day, "14:05|g.ticks")).toBe(1);
    expect(get(inc, day, "14:00|g.anchors")).toBe(3);
    expect(get(inc, day, "14:05|g.anchors")).toBe(24);
    expect(get(inc, day, "14:00|g.blocks")).toBe(2);
    // gaps: 28s (prev→101), 28s (101→102) land in 14:00; 326s (102→103) lands in 14:05
    expect(get(inc, day, "14:00|g.gapMax")).toBe(28);
    expect(get(inc, day, "14:00|g.gapSum")).toBe(56);
    expect(get(inc, day, "14:05|g.gapMax")).toBe(326);
    // hourly + daily tiers fold the same sums
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|g.ticks")).toBe(3);
    expect(get(inc, "t:mainnet:1d:2026", "09-06|g.ticks")).toBe(3);
  });
  it("zero-fills g.ticks across the covered range so coverage is distinguishable from absence", () => {
    const inc: IncMap = new Map();
    bucketGlobals(inc, "mainnet", [
      { ordinal: 1, timestamp: ts(14, 1) },
      { ordinal: 2, timestamp: ts(14, 14) }, // nothing lands in 14:05
    ], null);
    const day = "t:mainnet:5m:2026-09-06";
    expect(get(inc, day, "14:05|g.ticks")).toBe(0); // covered, empty — an honest zero
    expect(get(inc, day, "14:10|g.ticks")).toBe(1);
  });
  it("with no prev cursor the first record opens the gap chain without inventing one", () => {
    const inc: IncMap = new Map();
    bucketGlobals(inc, "mainnet", [
      { ordinal: 1, timestamp: ts(14, 0, 0) },
      { ordinal: 2, timestamp: ts(14, 0, 30) },
    ], null);
    expect(get(inc, "t:mainnet:5m:2026-09-06", "14:00|g.gapSum")).toBe(30); // one gap, not two
  });
});

describe("bucketMetas", () => {
  it("sums snaps/fee/kb per metagraph into every tier", () => {
    const inc: IncMap = new Map();
    bucketMetas(inc, "mainnet", "abc", [
      { ordinal: 9, timestamp: ts(14, 2), fee: 400000, sizeInKB: 12.5 },
      { ordinal: 10, timestamp: ts(14, 3), fee: 100000, sizeInKB: 2.5 },
    ]);
    const day = "t:mainnet:5m:2026-09-06";
    expect(get(inc, day, "14:00|m.abc.snaps")).toBe(2);
    expect(get(inc, day, "14:00|m.abc.fee")).toBe(500000);
    expect(get(inc, day, "14:00|m.abc.kb")).toBe(15);
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|m.abc.snaps")).toBe(2);
  });
  it("also feeds the global floors", () => {
    const inc: IncMap = new Map();
    bucketMetas(inc, "mainnet", "abc", [{ ordinal: 9, timestamp: ts(14, 2), fee: 400000, sizeInKB: 12.5 }]);
    expect(get(inc, "t:mainnet:5m:2026-09-06", "14:00|g.feeFloor")).toBe(400000);
    expect(get(inc, "t:mainnet:5m:2026-09-06", "14:00|g.kbFloor")).toBe(12.5);
  });
});

describe("bucketFleet", () => {
  it("writes gauges to hourly+daily only, countries daily only", () => {
    const inc: IncMap = new Map();
    bucketFleet(inc, "mainnet", Date.UTC(2026, 8, 6, 14, 30), {
      total: 195, perNet: { dag: 160, abc: 16 }, layers: { l0: 177, cl1: 150, dl1: 23 },
      countries: { DE: 60, US: 40 },
    });
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|f.nodes")).toBe(195);
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|f.nodes.dag")).toBe(160);
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|f.layer.l0")).toBe(177);
    expect(get(inc, "t:mainnet:1d:2026", "09-06|f.cc.DE")).toBe(60);
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|f.cc.DE")).toBeUndefined(); // daily only
    expect(inc.get("t:mainnet:5m:2026-09-06")).toBeUndefined(); // no fine-tier gauges
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/trends/bucketing.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`app/api/trends/bucketing.ts`:

```ts
// Records → per-tier bucket increments. Buckets are assigned by each record's OWN timestamp
// (never fetch time), which is what makes bucket resolution independent of run cadence.
// The IncMap folds repeats WITHIN a run through the same merge ops the store applies
// ACROSS runs, so both layers speak one semantics (merge.ts).
import { TIERS, slotOf, fieldOf, type Tier } from "./keys";
import { mergeVals } from "./merge";

export interface GlobalRec { ordinal: number; timestamp: string; metagraphSnapshotCount?: number; blocks?: unknown[] }
export interface MetaRec { ordinal: number; timestamp: string; fee?: number; sizeInKB?: number }
export interface FleetCounts {
  total: number;
  perNet: Record<string, number>;
  layers: Record<string, number>;
  countries: Record<string, number>;
}

/** redis key → field → value (merge-folded within this run). */
export type IncMap = Map<string, Map<string, number>>;

export function addInc(inc: IncMap, net: string, tsMs: number, series: string, value: number, tiers: Tier[] = TIERS): void {
  for (const tier of tiers) {
    const { key, bucket } = slotOf(net, tier, tsMs);
    const field = fieldOf(bucket, series);
    let m = inc.get(key);
    if (!m) { m = new Map(); inc.set(key, m); }
    m.set(field, mergeVals(series, m.get(field), value));
  }
}

/** Global spine: ticks/anchors/blocks sums, gap stats, and the g.ticks COVERAGE zero-fill.
 *  `prevTickTsMs` is the previous run's newest tick — the cross-run gap boundary; null on
 *  a cold cursor (first gap starts at the first in-batch pair, nothing is invented). */
export function bucketGlobals(inc: IncMap, net: string, recs: GlobalRec[], prevTickTsMs: number | null): void {
  let prev = prevTickTsMs;
  for (const r of recs) {
    const t = Date.parse(r.timestamp);
    addInc(inc, net, t, "g.ticks", 1);
    addInc(inc, net, t, "g.anchors", typeof r.metagraphSnapshotCount === "number" ? r.metagraphSnapshotCount : 0);
    addInc(inc, net, t, "g.blocks", Array.isArray(r.blocks) ? r.blocks.length : 0);
    if (prev != null) {
      const gap = Math.max(0, Math.round((t - prev) / 1000));
      addInc(inc, net, t, "g.gapMax", gap);
      addInc(inc, net, t, "g.gapSum", gap);
    }
    prev = t;
  }
  // COVERAGE (rule 10): every 5m bucket the batch spans gets a g.ticks field even when no
  // tick landed in it, so the read side can tell "measured, empty" from "not measured".
  if (recs.length >= 2) {
    const from = Date.parse(recs[0].timestamp);
    const to = Date.parse(recs[recs.length - 1].timestamp);
    for (let t = from; t <= to; t += 300000) addInc(inc, net, t, "g.ticks", 0, ["5m"]);
  }
}

/** One metagraph's snapshots: exact per-net sums plus the tracked-total floors. */
export function bucketMetas(inc: IncMap, net: string, id: string, recs: MetaRec[]): void {
  for (const r of recs) {
    const t = Date.parse(r.timestamp);
    addInc(inc, net, t, `m.${id}.snaps`, 1);
    addInc(inc, net, t, `m.${id}.fee`, r.fee || 0);
    addInc(inc, net, t, `m.${id}.kb`, r.sizeInKB || 0);
    addInc(inc, net, t, "g.feeFloor", r.fee || 0);
    addInc(inc, net, t, "g.kbFloor", r.sizeInKB || 0);
  }
}

/** Fleet gauges: hourly + daily tiers only (point samples), per-country daily only
 *  (cardinality control — spec). */
export function bucketFleet(inc: IncMap, net: string, tsMs: number, fleet: FleetCounts): void {
  const tiers: Tier[] = ["1h", "1d"];
  addInc(inc, net, tsMs, "f.nodes", fleet.total, tiers);
  for (const [id, n] of Object.entries(fleet.perNet)) addInc(inc, net, tsMs, `f.nodes.${id}`, n, tiers);
  for (const [layer, n] of Object.entries(fleet.layers)) addInc(inc, net, tsMs, `f.layer.${layer}`, n, tiers);
  for (const [cc, n] of Object.entries(fleet.countries)) addInc(inc, net, tsMs, `f.cc.${cc}`, n, ["1d"]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/trends` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/trends/bucketing.ts app/api/trends/bucketing.test.ts
git commit -m "feat(trends): timestamp bucketing with gap stats, floors and coverage zero-fill

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Upstream fetch — grow-until-cursor

**Files:**
- Create: `app/api/trends/fetchSince.ts`
- Test: `app/api/trends/fetchSince.test.ts`

**Interfaces:**
- Produces: `listSince<T extends { ordinal: number }>(page: (limit: number) => Promise<T[]>, sinceOrdinal: number): Promise<{ recs: T[]; gap: boolean }>` — `recs` oldest→newest, all `ordinal > sinceOrdinal`; `gap: true` when the ladder capped out before reaching the cursor (the gap is ACCEPTED, per spec).
- Consumed by: Task 4's `runSample` with pages built over the explorer endpoints.

- [ ] **Step 1: Write the failing test**

`app/api/trends/fetchSince.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { listSince } from "./fetchSince";

// A fake chain served newest-first, the explorer's shape.
const chain = (n: number) => Array.from({ length: n }, (_, i) => ({ ordinal: n - i }));
const pager = (all: { ordinal: number }[], calls: number[]) => async (limit: number) => {
  calls.push(limit);
  return all.slice(0, limit);
};

describe("listSince", () => {
  it("returns only records past the cursor, oldest first", async () => {
    const { recs, gap } = await listSince(pager(chain(50), []), 45);
    expect(recs.map((r) => r.ordinal)).toEqual([46, 47, 48, 49, 50]);
    expect(gap).toBe(false);
  });
  it("grows 60 → 180 → 540 until the batch reaches the cursor", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(500), calls), 100);
    expect(calls).toEqual([60, 180, 540]);
    expect(recs[0].ordinal).toBe(101);
    expect(recs.length).toBe(400);
    expect(gap).toBe(false);
  });
  it("caps at 600 and reports the accepted gap", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(2000), calls), 100);
    expect(calls).toEqual([60, 180, 540, 600]);
    expect(gap).toBe(true);
    expect(recs.length).toBe(600); // what it could get, still bucketed honestly
  });
  it("a cold cursor (-1) takes one page and reports no gap", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(500), calls), -1);
    expect(calls).toEqual([60]);
    expect(recs.length).toBe(60);
    expect(gap).toBe(false);
  });
  it("an empty page is empty, not a gap", async () => {
    const { recs, gap } = await listSince(async () => [], 100);
    expect(recs).toEqual([]);
    expect(gap).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/trends/fetchSince.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`app/api/trends/fetchSince.ts`:

```ts
// The sampler's grow-until-cursor pager — the same self-healing pattern the client's
// _refreshOneMeta uses (src/data/api.ts:414-451): grow the page until it provably reaches
// back to the cursor, capped. Past the cap the gap is ACCEPTED and stays a gap in the
// series (rule 10: an honest hole beats a fabricated bridge). A COLD cursor (-1) takes one
// page — history before the feature's deploy simply doesn't exist (no backfill, per spec).
export async function listSince<T extends { ordinal: number }>(
  page: (limit: number) => Promise<T[]>,
  sinceOrdinal: number,
): Promise<{ recs: T[]; gap: boolean }> {
  const CAP = 600;
  let limit = 60;
  let list: T[] = [];
  for (;;) {
    list = await page(limit); // newest-first, the explorer's order
    if (!list.length) return { recs: [], gap: false };
    const oldest = list[list.length - 1].ordinal;
    if (sinceOrdinal < 0 || oldest <= sinceOrdinal + 1 || list.length < limit) break;
    if (limit >= CAP) {
      return { recs: list.filter((r) => r.ordinal > sinceOrdinal).reverse(), gap: true };
    }
    limit = Math.min(CAP, limit * 3);
  }
  return { recs: list.filter((r) => r.ordinal > sinceOrdinal).reverse(), gap: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/trends` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/trends/fetchSince.ts app/api/trends/fetchSince.test.ts
git commit -m "feat(trends): grow-until-cursor pager with accepted-gap semantics

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Shared loader extraction (metagraphs + geo)

**Files:**
- Create: `app/api/metagraphs/live.ts` (moved code, no behaviour change)
- Modify: `app/api/metagraphs/route.ts` (imports from `./live`)
- Create: `app/api/geo/live.ts` (moved code, no behaviour change)
- Modify: `app/api/geo/route.ts` (imports from `./live`)

**Interfaces:**
- Produces: `getLive(net: NetworkId): Promise<{ metagraphs: Metagraph[]; geo: GeoMap; builtAt: number }>` (from `app/api/metagraphs/live.ts`, with `Metagraph`/`MetaNode` types exported); `getLiveGeo(net: NetworkId): Promise<GeoMap>` (from `app/api/geo/live.ts`). Both keep their `unstable_cache` wrappers and cache keys BYTE-IDENTICAL — the sampler must share the routes' cache entries, not warm parallel ones.
- Consumed by: Task 5's fleet gauge.

This is a pure move: cut `getJson`, `clusterNodes`, `fetchLive`, `getLive`, `LAYERS`, and the `Metagraph`/`MetaNode` interfaces from `route.ts` into `live.ts` (exporting `getLive`, `Metagraph`, `MetaNode`); `route.ts` keeps `withHues` + `GET` and its `revalidate`/`maxDuration` exports (define `const revalidate = 300` inside `live.ts` too — the cache option can't import a route's export). Same for geo: move `clusterIps` + `getLiveGeo` into `app/api/geo/live.ts`, exporting `getLiveGeo`. Move comments WITH the code (repo norm: comments are load-bearing).

- [ ] **Step 1: Move the metagraphs loader into `live.ts`, re-import in the route**
- [ ] **Step 2: Move the geo loader into `live.ts`, re-import in the route**
- [ ] **Step 3: Verify no behaviour change**

Run: `npx tsc --noEmit && npm test` — Expected: both green (the suite covers route-adjacent modules; no route test exists to update).
Run: `curl -s localhost:3000/api/metagraphs | head -c 200 && curl -s localhost:3000/api/geo | head -c 200` (dev server up) — Expected: normal JSON payloads from both.

- [ ] **Step 4: Commit**

```bash
git add app/api/metagraphs/live.ts app/api/metagraphs/route.ts app/api/geo/live.ts app/api/geo/route.ts
git commit -m "refactor(api): extract metagraphs/geo cached loaders for shared server use

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: The store + the sampler

**Files:**
- Create: `app/api/trends/store.ts` (TrendsStore over `@upstash/redis`)
- Create: `app/api/trends/runSample.ts` (orchestration, dependency-injected)
- Create: `app/api/trends/sample/route.ts` (thin route)
- Create: `vercel.json` (cron entry)
- Test: `app/api/trends/runSample.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 (`keys`, `merge`, `bucketing`, `fetchSince`, `getLive`, `getLiveGeo`).
- Produces:
  `interface TrendsStore { hgetall(key: string): Promise<Record<string, string> | null>; hmget(key: string, fields: string[]): Promise<(string | null)[]>; hset(key: string, map: Record<string, string | number>): Promise<void>; expire(key: string, s: number): Promise<void>; acquireLock(key: string, ttlS: number): Promise<boolean>; releaseLock(key: string): Promise<void> }`;
  `writeStore(): TrendsStore` and `readStore(): TrendsStore` (env-validated factories);
  `runSample(deps: SampleDeps): Promise<SampleResult>` where
  `interface SampleDeps { net: string; metaIds: string[]; store: TrendsStore; pageGlobals(limit: number): Promise<GlobalRec[]>; pageMeta(id: string, limit: number): Promise<MetaRec[]>; fleet(): Promise<FleetCounts | null>; now(): number }` and
  `interface SampleResult { skipped?: "locked"; wroteFields: number; gap: boolean; metaErrors: string[] }`.

- [ ] **Step 1: Write the failing test**

`app/api/trends/runSample.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runSample, type SampleDeps } from "./runSample";
import type { TrendsStore } from "./store";

// In-memory TrendsStore — hash semantics only, enough for the orchestration contract.
function memStore(): TrendsStore & { data: Map<string, Map<string, string>>; ttls: Map<string, number>; locked: boolean } {
  const data = new Map<string, Map<string, string>>();
  const ttls = new Map<string, number>();
  const s = {
    data, ttls, locked: false,
    async hgetall(key: string) {
      const h = data.get(key);
      return h ? Object.fromEntries(h) : null;
    },
    async hmget(key: string, fields: string[]) {
      const h = data.get(key);
      return fields.map((f) => h?.get(f) ?? null);
    },
    async hset(key: string, map: Record<string, string | number>) {
      let h = data.get(key);
      if (!h) { h = new Map(); data.set(key, h); }
      for (const [f, v] of Object.entries(map)) h.set(f, String(v));
    },
    async expire(key: string, ttl: number) { ttls.set(key, ttl); },
    async acquireLock() { if (s.locked) return false; s.locked = true; return true; },
    async releaseLock() { s.locked = false; },
  };
  return s;
}

const iso = (h: number, m: number, sec = 0) => new Date(Date.UTC(2026, 8, 6, h, m, sec)).toISOString();

function deps(store: TrendsStore, over: Partial<SampleDeps> = {}): SampleDeps {
  return {
    net: "mainnet",
    metaIds: ["abc"],
    store,
    pageGlobals: async () => [
      { ordinal: 102, timestamp: iso(14, 0, 36), metagraphSnapshotCount: 2 },
      { ordinal: 101, timestamp: iso(14, 0, 8), metagraphSnapshotCount: 3 },
    ],
    pageMeta: async () => [{ ordinal: 9, timestamp: iso(14, 0, 8), fee: 500, sizeInKB: 10 }],
    fleet: async () => ({ total: 5, perNet: { dag: 5 }, layers: { l0: 5 }, countries: { DE: 5 } }),
    now: () => Date.UTC(2026, 8, 6, 14, 10),
    ...over,
  };
}

describe("runSample", () => {
  it("writes buckets, advances the cursor, sets TTLs, releases the lock", async () => {
    const store = memStore();
    const res = await runSample(deps(store));
    expect(res.skipped).toBeUndefined();
    expect(res.gap).toBe(false);
    const day = store.data.get("t:mainnet:5m:2026-09-06")!;
    expect(day.get("14:00|g.ticks")).toBe("2");
    expect(day.get("14:00|g.anchors")).toBe("5");
    expect(day.get("14:00|m.abc.snaps")).toBe("1");
    expect(day.get("14:00|g.feeFloor")).toBe("500");
    const cursor = store.data.get("t:mainnet:cursor")!;
    expect(cursor.get("g")).toBe("102");
    expect(cursor.get("m.abc")).toBe("9");
    expect(cursor.get("v")).toBe("1");
    expect(store.ttls.get("t:mainnet:5m:2026-09-06")).toBe(259200);
    expect(store.ttls.has("t:mainnet:1d:2026")).toBe(false); // forever tier: no TTL
    expect(store.locked).toBe(false);
  });
  it("merges across runs: counters add, gauges last-write-win", async () => {
    const store = memStore();
    await runSample(deps(store));
    await runSample(deps(store, {
      pageGlobals: async () => [
        { ordinal: 103, timestamp: iso(14, 1, 4), metagraphSnapshotCount: 4 },
        { ordinal: 102, timestamp: iso(14, 0, 36), metagraphSnapshotCount: 2 }, // pre-cursor, filtered
      ],
      pageMeta: async () => [],
    }));
    const day = store.data.get("t:mainnet:5m:2026-09-06")!;
    expect(day.get("14:00|g.ticks")).toBe("3");     // 2 + 1
    expect(day.get("14:00|g.anchors")).toBe("9");   // 5 + 4
    expect(store.data.get("t:mainnet:cursor")!.get("g")).toBe("103");
  });
  it("samples the fleet only when the current hour has no gauge yet", async () => {
    const store = memStore();
    let fleetCalls = 0;
    const d = deps(store, { fleet: async () => { fleetCalls++; return { total: 5, perNet: {}, layers: {}, countries: {} }; } });
    await runSample(d);
    await runSample({ ...d, pageGlobals: async () => [], pageMeta: async () => [] });
    expect(fleetCalls).toBe(1);
    expect(store.data.get("t:mainnet:1h:2026-09")!.get("06-14|f.nodes")).toBe("5");
  });
  it("a failed metagraph leaves its cursor unmoved and is reported", async () => {
    const store = memStore();
    const res = await runSample(deps(store, { pageMeta: async () => { throw new Error("503"); } }));
    expect(res.metaErrors).toEqual(["abc"]);
    expect(store.data.get("t:mainnet:cursor")!.get("m.abc")).toBeUndefined();
    expect(store.data.get("t:mainnet:cursor")!.get("g")).toBe("102"); // global still advanced
  });
  it("skips when locked", async () => {
    const store = memStore();
    store.locked = true;
    const res = await runSample(deps(store));
    expect(res.skipped).toBe("locked");
  });
  it("a fleet failure writes no gauge and does not spend the hour slot", async () => {
    const store = memStore();
    await runSample(deps(store, { fleet: async () => null }));
    expect(store.data.get("t:mainnet:1h:2026-09")?.get("06-14|f.nodes")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/trends/runSample.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement the store**

`app/api/trends/store.ts`:

```ts
// The Upstash client behind ONE narrow interface, so runSample tests against an in-memory
// fake and the command budget stays auditable here. REST + per-call pipelining is the
// Upstash usage contract (spec): no TCP pooling, hashes + EXPIRE only.
import { Redis } from "@upstash/redis";

export interface TrendsStore {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hmget(key: string, fields: string[]): Promise<(string | null)[]>;
  hset(key: string, map: Record<string, string | number>): Promise<void>;
  expire(key: string, s: number): Promise<void>;
  acquireLock(key: string, ttlS: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
}

function client(token: string | undefined): Redis {
  const url = process.env.UPSTASH_KV_REST_API_URL;
  if (!url || !token) throw new Error("Upstash env missing");
  return new Redis({ url, token });
}

function wrap(r: Redis): TrendsStore {
  return {
    async hgetall(key) {
      return (await r.hgetall<Record<string, string>>(key)) ?? null;
    },
    async hmget(key, fields) {
      if (!fields.length) return [];
      const res = await r.hmget<Record<string, string | null>>(key, ...fields);
      return fields.map((f) => (res ? (res[f] ?? null) : null));
    },
    async hset(key, map) {
      if (Object.keys(map).length) await r.hset(key, map);
    },
    async expire(key, s) {
      await r.expire(key, s);
    },
    async acquireLock(key, ttlS) {
      return (await r.set(key, "1", { nx: true, ex: ttlS })) === "OK";
    },
    async releaseLock(key) {
      await r.del(key);
    },
  };
}

/** The sampler's client — the WRITE token. */
export function writeStore(): TrendsStore {
  return wrap(client(process.env.UPSTASH_KV_REST_API_TOKEN));
}
/** The public read route's client — the READ-ONLY token (least privilege, spec). */
export function readStore(): TrendsStore {
  return wrap(client(process.env.UPSTASH_KV_REST_API_READ_ONLY_TOKEN));
}
```

- [ ] **Step 4: Implement the orchestration**

`app/api/trends/runSample.ts`:

```ts
// One sampler run: cursor → grow-until-cursor fetches → bucket → merge-write one key per
// tier → advance cursor. Dependency-injected so the whole contract is unit-tested; the
// route provides the real deps. Command budget per run: 1 lock + 1 hgetall (cursor) +
// ≤1 hmget/hset pair per touched tier key + ≤3 expire + 1 cursor hset + 1 del ≈ 12.
import { TTL_S, cursorKeyOf, lockKeyOf, slotOf, fieldOf, type Tier } from "./keys";
import { mergeVals } from "./merge";
import {
  bucketGlobals, bucketMetas, bucketFleet,
  type FleetCounts, type GlobalRec, type IncMap, type MetaRec,
} from "./bucketing";
import { listSince } from "./fetchSince";
import type { TrendsStore } from "./store";

export interface SampleDeps {
  net: string;
  metaIds: string[];
  store: TrendsStore;
  pageGlobals(limit: number): Promise<GlobalRec[]>;
  pageMeta(id: string, limit: number): Promise<MetaRec[]>;
  /** Fleet counts, or null when the loaders failed — null writes NOTHING (an absent gauge
   *  is an honest gap; a zeroed fleet would be a fabricated reading). */
  fleet(): Promise<FleetCounts | null>;
  now(): number;
}

export interface SampleResult {
  skipped?: "locked";
  wroteFields: number;
  gap: boolean;
  metaErrors: string[];
}

const tierOfKey = (key: string): Tier => key.split(":")[2] as Tier;

export async function runSample(deps: SampleDeps): Promise<SampleResult> {
  const { net, store } = deps;
  if (!(await store.acquireLock(lockKeyOf(net), 300))) {
    return { skipped: "locked", wroteFields: 0, gap: false, metaErrors: [] };
  }
  try {
    const cursorKey = cursorKeyOf(net);
    const cur = (await store.hgetall(cursorKey)) ?? {};
    const gSince = cur.g != null ? Number(cur.g) : -1;
    const gTs = cur.gTs != null ? Number(cur.gTs) : null;

    const inc: IncMap = new Map();
    const cursorNext: Record<string, string | number> = { v: 1 };

    // Global spine.
    const g = await listSince(deps.pageGlobals, gSince);
    if (g.recs.length) {
      bucketGlobals(inc, net, g.recs, g.gap ? null : gTs); // an accepted gap breaks the gap chain too
      const newest = g.recs[g.recs.length - 1];
      cursorNext.g = newest.ordinal;
      cursorNext.gTs = Date.parse(newest.timestamp);
    }

    // Per-metagraph, in parallel; a failure moves nothing for that id (self-heals next run).
    const metaErrors: string[] = [];
    const settled = await Promise.allSettled(
      deps.metaIds.map(async (id) => {
        const since = cur[`m.${id}`] != null ? Number(cur[`m.${id}`]) : -1;
        const r = await listSince((limit) => deps.pageMeta(id, limit), since);
        return { id, r };
      }),
    );
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === "rejected") { metaErrors.push(deps.metaIds[i]); continue; }
      const { id, r } = s.value;
      if (r.recs.length) {
        bucketMetas(inc, net, id, r.recs);
        cursorNext[`m.${id}`] = r.recs[r.recs.length - 1].ordinal;
      }
    }

    // Fleet gauge, once per hour: sample only when the CURRENT hour slot has no reading yet
    // (idempotent across runs and restarts — no boundary bookkeeping).
    const hourSlot = slotOf(net, "1h", deps.now());
    const [hasFleet] = await store.hmget(hourSlot.key, [fieldOf(hourSlot.bucket, "f.nodes")]);
    if (hasFleet == null) {
      const fleet = await deps.fleet();
      if (fleet) bucketFleet(inc, net, deps.now(), fleet);
    }

    // Merge-write: one hmget + hset per touched tier key.
    let wroteFields = 0;
    for (const [key, fields] of inc) {
      const names = [...fields.keys()];
      const prev = await store.hmget(key, names);
      const out: Record<string, number> = {};
      names.forEach((f, i) => {
        const p = prev[i] == null ? undefined : Number(prev[i]);
        out[f] = mergeVals(f.split("|")[1], p, fields.get(f)!);
      });
      await store.hset(key, out);
      const ttl = TTL_S[tierOfKey(key)];
      if (ttl != null) await store.expire(key, ttl);
      wroteFields += names.length;
    }

    if (Object.keys(cursorNext).length > 1) await store.hset(cursorKeyOf(net), cursorNext);
    return { wroteFields, gap: g.gap, metaErrors };
  } finally {
    await store.releaseLock(lockKeyOf(net));
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/trends` — Expected: PASS.

- [ ] **Step 6: The route + cron entry**

`app/api/trends/sample/route.ts`:

```ts
import { NextResponse } from "next/server";
import { NETWORKS, CATALOG } from "@/src/engine/config";
import { netOf } from "@/src/net/request";
import { getLive } from "@/app/api/metagraphs/live";
import { getLiveGeo } from "@/app/api/geo/live";
import { runSample } from "../runSample";
import { writeStore } from "../store";
import type { FleetCounts, GlobalRec, MetaRec } from "../bucketing";

// The trends SAMPLER — Vercel Cron hits this every 15 min (vercel.json). It pages the tiny
// explorer list records since the Redis cursor (never the ~2.5 MB raw snapshot routes) and
// merge-writes the tiered hashes. Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}`
// automatically once the env var exists.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getJson(url: string, ms = 7000): Promise<unknown> {
  const r = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(ms),
    headers: { "User-Agent": "dag-visualizer" },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// Fleet counts from the SAME cached loaders the /api/metagraphs and /api/geo routes serve —
// shared unstable_cache entries, so sampling the fleet adds no upstream traffic. Null on
// failure: an absent gauge is an honest gap (rule 10), a zeroed fleet is a fabrication.
async function fleetCounts(net: ReturnType<typeof netOf>): Promise<FleetCounts | null> {
  try {
    const [{ metagraphs }, geo] = await Promise.all([getLive(net), getLiveGeo(net)]);
    const dagIps = Object.keys(geo);
    const perNet: Record<string, number> = { dag: dagIps.length };
    const layers: Record<string, number> = {};
    const countries: Record<string, number> = {};
    for (const ip of dagIps) {
      const cc = geo[ip]?.cc;
      if (cc) countries[cc] = (countries[cc] || 0) + 1;
    }
    let total = dagIps.length;
    for (const m of metagraphs) {
      perNet[m.id] = m.nodes.length;
      total += m.nodes.length;
      for (const n of m.nodes) for (const role of n.roles) layers[role] = (layers[role] || 0) + 1;
    }
    return total > 0 ? { total, perNet, layers, countries } : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const net = netOf(req);
  const be = NETWORKS[net].be;
  try {
    const res = await runSample({
      net,
      metaIds: CATALOG[net].map((m) => m.id).filter((id): id is string => !!id),
      store: writeStore(),
      pageGlobals: async (limit) =>
        (((await getJson(`${be}/global-snapshots?limit=${limit}`)) as { data?: GlobalRec[] }).data ?? []),
      pageMeta: async (id, limit) =>
        (((await getJson(`${be}/currency/${id}/snapshots?limit=${limit}`)) as { data?: MetaRec[] }).data ?? []),
      fleet: () => fleetCounts(net),
      now: () => Date.now(),
    });
    return NextResponse.json(res);
  } catch (e) {
    // A run that failed wholesale left the cursor unmoved — the next run covers this span.
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

`vercel.json`:

```json
{
  "crons": [{ "path": "/api/trends/sample", "schedule": "*/15 * * * *" }]
}
```

- [ ] **Step 7: Add the CRON_SECRET env var**

```bash
openssl rand -hex 24 | tr -d '\n' | vercel env add CRON_SECRET production
vercel env pull   # refresh .env.local so local runs can authenticate too
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm test` — Expected: green.
With the dev server running and `.env.local` pulled:

```bash
curl -s -H "Authorization: Bearer $(grep ^CRON_SECRET .env.local | cut -d= -f2 | tr -d '\"')" localhost:3000/api/trends/sample
```

Expected: `{"wroteFields":N,"gap":false,"metaErrors":[]}` with N > 0, and a second immediate call returns a small N (only new ticks). An unauthorized curl returns 401.

- [ ] **Step 9: Commit**

```bash
git add app/api/trends/store.ts app/api/trends/runSample.ts app/api/trends/runSample.test.ts app/api/trends/sample/route.ts vercel.json
git commit -m "feat(trends): sampler route — cursor-paged, merge-written, cron-driven

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: The read API — window assembly + route

**Files:**
- Create: `app/api/trends/assemble.ts`
- Create: `app/api/trends/route.ts`
- Test: `app/api/trends/assemble.test.ts`

**Interfaces:**
- Consumes: `slotsInWindow`, `stepMsOf`, `fieldOf` (Task 1).
- Produces:
  `type WindowId = "24h" | "7d" | "30d" | "1y"`; `WINDOWS: Record<WindowId, { tier: Tier; ms: number }>`;
  `assemble(net: string, window: WindowId, nowMs: number, hashes: Record<string, Record<string, string>>): TrendsPayload`;
  `interface TrendsPayload { v: 1; net: string; window: WindowId; tier: Tier; stepMs: number; buckets: number[]; series: Record<string, (number | null)[]> }`.

- [ ] **Step 1: Write the failing test**

`app/api/trends/assemble.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assemble, WINDOWS } from "./assemble";

describe("assemble", () => {
  const now = Date.UTC(2026, 8, 6, 14, 12);
  it("pins the window→tier contract", () => {
    expect(WINDOWS["24h"].tier).toBe("5m");
    expect(WINDOWS["7d"].tier).toBe("1h");
    expect(WINDOWS["30d"].tier).toBe("1h");
    expect(WINDOWS["1y"].tier).toBe("1d");
  });
  it("null for uncovered buckets, 0 for covered-but-absent counters, null for absent gauges", () => {
    const p = assemble("mainnet", "24h", now, {
      "t:mainnet:5m:2026-09-06": {
        "14:00|g.ticks": "2", "14:00|g.anchors": "5", "14:00|m.abc.snaps": "1",
        "14:05|g.ticks": "0", // covered, empty
      },
    });
    const i = p.buckets.indexOf(Date.UTC(2026, 8, 6, 14, 0));
    const j = p.buckets.indexOf(Date.UTC(2026, 8, 6, 14, 5));
    const k = p.buckets.indexOf(Date.UTC(2026, 8, 6, 13, 55)); // never sampled
    expect(p.series["g.anchors"][i]).toBe(5);
    expect(p.series["m.abc.snaps"][i]).toBe(1);
    expect(p.series["g.anchors"][j]).toBe(0);      // covered → honest zero
    expect(p.series["m.abc.snaps"][j]).toBe(0);    // covered → honest zero
    expect(p.series["g.anchors"][k]).toBeNull();   // not measured → null
    expect(p.series["g.ticks"][k]).toBeNull();
  });
  it("gauges are value-or-null, never zero-filled", () => {
    const p = assemble("mainnet", "7d", now, {
      "t:mainnet:1h:2026-09": { "06-14|g.ticks": "120", "06-14|f.nodes": "195", "06-13|g.ticks": "118" },
    });
    const i14 = p.buckets.indexOf(Date.UTC(2026, 8, 6, 14, 0));
    const i13 = p.buckets.indexOf(Date.UTC(2026, 8, 6, 13, 0));
    expect(p.series["f.nodes"][i14]).toBe(195);
    expect(p.series["f.nodes"][i13]).toBeNull(); // covered hour, but the gauge wasn't sampled
  });
  it("spans window length at tier resolution with the newest bucket last", () => {
    const p = assemble("mainnet", "24h", now, {});
    expect(p.tier).toBe("5m");
    expect(p.stepMs).toBe(300000);
    expect(p.buckets.length).toBe(24 * 12 + 1);
    expect(p.buckets[p.buckets.length - 1]).toBe(Date.UTC(2026, 8, 6, 14, 10));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/trends/assemble.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`app/api/trends/assemble.ts`:

```ts
// Window assembly — hashes → the /api/trends payload. The honesty split (rule 10 in
// storage, spec): a bucket is COVERED iff its g.ticks field exists. Covered + absent
// counter = an honest 0 (the sampler looked, nothing was there). Covered + absent GAUGE
// (f.*) = null — gauges are hourly/daily point samples, not sums, and a missing sample is
// "not measured". Uncovered bucket = null across every series.
import { fieldOf, slotsInWindow, stepMsOf, type Tier } from "./keys";
import { opOf } from "./merge";

export type WindowId = "24h" | "7d" | "30d" | "1y";
export const WINDOWS: Record<WindowId, { tier: Tier; ms: number }> = {
  "24h": { tier: "5m", ms: 86400000 },
  "7d": { tier: "1h", ms: 604800000 },
  "30d": { tier: "1h", ms: 2592000000 },
  "1y": { tier: "1d", ms: 31536000000 },
};

export interface TrendsPayload {
  v: 1;
  net: string;
  window: WindowId;
  tier: Tier;
  stepMs: number;
  /** Bucket START instants, epoch ms UTC, oldest → newest. */
  buckets: number[];
  series: Record<string, (number | null)[]>;
}

export function assemble(
  net: string, window: WindowId, nowMs: number,
  hashes: Record<string, Record<string, string>>,
): TrendsPayload {
  const { tier, ms } = WINDOWS[window];
  const slots = slotsInWindow(net, tier, nowMs - ms, nowMs);

  // Collect every series name present in any hash of this window.
  const names = new Set<string>();
  for (const h of Object.values(hashes)) {
    for (const f of Object.keys(h)) {
      const bar = f.indexOf("|");
      if (bar > 0) names.add(f.slice(bar + 1));
    }
  }

  const buckets = slots.map((s) => s.tsMs);
  const series: Record<string, (number | null)[]> = {};
  for (const name of names) series[name] = new Array(slots.length).fill(null);

  slots.forEach((slot, i) => {
    const h = hashes[slot.key];
    const covered = h?.[fieldOf(slot.bucket, "g.ticks")] != null;
    if (!covered) return; // every series stays null — not measured
    for (const name of names) {
      const raw = h[fieldOf(slot.bucket, name)];
      if (raw != null) series[name][i] = Number(raw);
      else if (opOf(name) !== "set") series[name][i] = 0; // covered counter → honest zero
      // covered but unsampled gauge stays null
    }
  });

  return { v: 1, net, window, tier, stepMs: stepMsOf(tier), buckets, series };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/trends` — Expected: PASS.

- [ ] **Step 5: The route**

`app/api/trends/route.ts`:

```ts
import { NextResponse } from "next/server";
import { netOf } from "@/src/net/request";
import { assemble, WINDOWS, type WindowId } from "./assemble";
import { slotsInWindow } from "./keys";
import { readStore } from "./store";

// The trends READ route: 2–3 HGETALLs assembled into one compact window payload, cached by
// the CDN per URL (the /api/metagraphs idiom — reading searchParams keeps it ƒ Dynamic,
// s-maxage does the caching). Runs on the READ-ONLY Upstash token: the public surface
// holds a credential that structurally cannot write or delete history.
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: Request) {
  const net = netOf(req);
  const w = new URL(req.url).searchParams.get("window") ?? "24h";
  if (!(w in WINDOWS)) {
    return NextResponse.json({ error: `window must be one of ${Object.keys(WINDOWS).join(", ")}` }, { status: 400 });
  }
  const window = w as WindowId;
  try {
    const store = readStore();
    const now = Date.now();
    const { tier, ms } = WINDOWS[window];
    const keys = [...new Set(slotsInWindow(net, tier, now - ms, now).map((s) => s.key))];
    const hashes: Record<string, Record<string, string>> = {};
    await Promise.all(keys.map(async (k) => {
      const h = await store.hgetall(k);
      if (h) hashes[k] = h;
    }));
    return NextResponse.json(assemble(net, window, now, hashes), {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "trends store unavailable" }, { status: 503 });
  }
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm test` — Expected: green. With the dev server up and at least one sampler run recorded:

```bash
curl -s "localhost:3000/api/trends?window=24h" | head -c 400   # payload with buckets + series
curl -s "localhost:3000/api/trends?window=2h" -o /dev/null -w "%{http_code}"   # 400
```

- [ ] **Step 7: Commit**

```bash
git add app/api/trends/assemble.ts app/api/trends/assemble.test.ts app/api/trends/route.ts
git commit -m "feat(trends): read API — window assembly with covered/uncovered honesty

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification + docs

**Files:**
- Modify: `app/api/CLAUDE.md` (new trends section)
- Modify: `CLAUDE.md` (Deploying section: the "KV/Postgres/Blob (no persistence)" not-applicable line is now stale; note Pro + cron + Upstash)
- Modify: `.superpowers/sdd/progress.md` (ledger entry — NOT committed, it's gitignored)

- [ ] **Step 1: Full local verification**

```bash
npx tsc --noEmit && npm test
npm run build            # clean; /api/trends and /api/trends/sample both ƒ (Dynamic)
```

With the dev server and pulled `.env.local`: one authorized sample call, wait ~5 min, a second one (expect a small `wroteFields`), then `curl "localhost:3000/api/trends?window=24h"` and check: recent buckets populated, `g.ticks` ≈ 10–11 per 5-min bucket, per-metagraph `m.{id}.snaps` plausible against the app's live vitals, pre-deploy history all `null`.

- [ ] **Step 2: Docs**

`app/api/CLAUDE.md` — add under "Data — server-side routes":

```markdown
- **`/api/trends`** serves tiered timeseries windows (`?window=24h|7d|30d|1y`) assembled
  from Upstash Redis; **`/api/trends/sample`** is the Vercel-Cron sampler (15 min,
  `CRON_SECRET` auth) that pages the explorer stream since a Redis cursor and
  merge-writes 5m/1h/1d hash tiers. Spec:
  `docs/superpowers/specs/2026-09-05-trends-timeseries-design.md` — the key/field grammar,
  command budget, honesty rules (null = not measured, 0 = measured none; `g.ticks` is the
  coverage marker) and the Upstash usage contract (single region, eviction OFF, read-only
  token on the read route) live there. The pure modules beside the routes are the
  specification-by-test (keys/merge/bucketing/fetchSince/runSample/assemble).
```

`CLAUDE.md` Deploying section — replace the stale not-applicable clause: KV is now applicable (Upstash Redis via the Vercel-native marketplace integration holds the trends timeseries; the account is Pro, which the cron rides).

- [ ] **Step 3: Ledger + commit**

Append the per-task outcomes to `.superpowers/sdd/progress.md`, then:

```bash
git add app/api/CLAUDE.md CLAUDE.md
git commit -m "docs(trends): route docs + deploy notes for the trends backend

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 4: Deploy + live check (after merge, or on a preview)**

```bash
vercel deploy            # preview: cron does NOT run on previews — hit the sample route manually once
curl -s -H "Authorization: Bearer <secret>" "https://<preview>/api/trends/sample"
curl -s "https://<preview>/api/trends?window=24h" | head -c 400
```

After production deploy: confirm the cron appears in the Vercel dashboard (Project → Settings → Cron Jobs), let two runs pass, then re-check `/api/trends?window=24h` on production and the Upstash console's command/storage counters against the sizing (~10–15 commands/run).

---

## Self-review notes

- Spec coverage: families/tiers/grammar (T1–T2), grow-until-cursor + accepted gap (T3), shared loaders (T4), command economy + lock + cron + env split (T5), read API + honesty (T6), verification + docs (T7). The spec's "pure modules `bucketing.ts`, `merge.ts`, `keys.ts`" naming is honoured with `fetchSince.ts`/`runSample.ts`/`assemble.ts` added at the same standard.
- Type consistency: `GlobalRec`/`MetaRec`/`FleetCounts`/`IncMap` defined once in `bucketing.ts` and imported everywhere; `TrendsStore` once in `store.ts`; window/tier vocabulary once in `keys.ts`/`assemble.ts`.
- Explorer field names (`metagraphSnapshotCount`, `fee`, `sizeInKB`, `timestamp`, `ordinal`) match `src/data/api.ts`'s verified raw shapes.
