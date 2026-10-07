# One List Per Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ladder level's subjects and order are defined once, in `src/data/ladderLevels.ts`; the explorers list them and the rail's next ghost and ‹ › pager step them.

**Architecture:** A new pure module returns each level's ordered subjects (plain data). `GeoExplore`, `HyperExplore` and `LedgerPanel` call it instead of grouping and sorting inline; `railSiblings` (pure) reads the same functions through `SiblingState`, which `useSiblingState` fills — including the ledger's tick networks, which need the polled-buffer singleton the pure module must not read. Two projections stay explicit in `railSiblings`: time levels step oldest → newest, and the node pager steps machines.

**Tech Stack:** Next.js 16, React, TypeScript, Zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-one-list-per-level-design.md`

## Global Constraints

- Rule 4: every VALUE export of `src/data/ladderLevels.ts` must be referenced by `src/data/ladderLevels.test.ts` (`src/data/dataExportCoverage.test.ts` enforces it).
- Rule 2: no new selection writes — every step keeps its existing `pickActions` builder.
- Rule 1: `src/data/` stays pure (no react, no store); `railSiblings.ts` stays store-free.
- "The explorer's list is the one list": the ghost and pager follow the figure picked in the explorer heading.
- Time levels keep the pager's direction: explorer newest first, pager oldest → newest (› = forward in time).
- No row content changes: same labels, glyphs, figures, actions.
- Copy rule: user-facing words say "nodes", never "machines" (internal identifiers may say machine).
- Commit after each task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gate per task: `npx tsc --noEmit` clean and `npx vitest run` all green.

## Review Focus

1. **A stale or partial tick read** (exact read not landed yet, polled buffer aged out): the networks level must list what is known — polled rows alone, or exact rows alone — never throw, and the pager must not point at an index of -1 (pinned in Task 3 and Task 4 tests).
2. **A network with nodes the leaderboard can't place** (`cc` null, country name present): countries and providers must join by country NAME as the explorer does today, so the ghost and the explorer agree (pinned in Task 1).
3. **Measure ties**: two countries / networks with the same figure must keep the tiebreak (node count / fleet size) so the order is stable across renders (pinned in Tasks 1 and 2).
4. **The unlisted network** in a tick: listed last in BOTH the explorer and the pager, its snapshots stepping across several addresses without duplicate keys (pinned in Task 3 and Task 4).
5. **A two-layer node** (same IP, L0 + L1 rows): two explorer rows, one pager stop, and the pager's index still finds the selected node (pinned in Task 4).

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/data/ladderLevels.ts` | Create | Each level's ordered subjects: geo countries / country nodes / providers, hyper networks, ledger tick networks + their snapshots; `machinesOf` projection. |
| `src/data/ladderLevels.test.ts` | Create | Membership + order of every level; rule-4 coverage. |
| `components/GeoExplore.tsx` | Modify | Use `nodesByCountry`, `countriesLevel`, `countryNodes`, `cohortsLevel`. |
| `components/HyperExplore.tsx` | Modify | Use `networksLevel`. |
| `components/LedgerPanel.tsx` | Modify | Use `tickNetworksLevel`; drop local `unionRows` / `groupByMeta` / `MetaGroup`; generalise the page turn. |
| `components/explorer/fitRows.ts` (+ test) | Modify | `pageHolding(index, pageSize)`. |
| `components/railSiblings.ts` | Modify | Read the level functions; delete `cohortsOf`, `nodeSort`, `machineRows`, `tickNetworks`. |
| `components/useSiblingState.ts` | Modify | Fill `geoMeasure`, `hyperMeasure`, `allNodes`, `tickNets`. |
| `components/railSiblings.test.ts` | Modify | New fields in `base()`, ledger fixtures via `tickNetworksLevel`, updated orders, the one-list test. |
| `components/CLAUDE.md` | Modify | Name the one-list rule and its two projections. |

---

### Task 1: Geography levels

**Files:**
- Create: `src/data/ladderLevels.ts`
- Create: `src/data/ladderLevels.test.ts`
- Modify: `components/GeoExplore.tsx` (the `nodesByCountry` memo ~L93-106, `measured` ~L109-115, `drilledRows` + `cohorts` ~L119-133)

**Interfaces:**
- Produces:
  - `nodeOrder(a: NodeRow, b: NodeRow): number` — the node lists' comparator: city (label fallback), then id.
  - `nodesByCountry(selNodes: readonly NodeRow[]): Map<string, NodeRow[]>` — keyed by country NAME (`"Unknown"` fallback), rows sorted by `nodeOrder`.
  - `countriesLevel(countries: readonly CountryStat[], byCountry: ReadonlyMap<string, readonly NodeRow[]>, measure: GeoMeasure): { c: CountryStat; v: number }[]` — figure desc, node count tiebreak.
  - `countryNodes(cc: string, countries: readonly CountryStat[], byCountry: ReadonlyMap<string, readonly NodeRow[]>): NodeRow[]` — the country's rows, joined by NAME through `countries`.
  - `interface Cohort { key: string; city: string | null; isp: string | null; rows: NodeRow[] }`
  - `cohortsLevel(rows: readonly NodeRow[]): Cohort[]` — count desc, then city asc (unlocated last).

- [ ] **Step 1: Write the failing test**

Create `src/data/ladderLevels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cohortsLevel, countriesLevel, countryNodes, nodeOrder, nodesByCountry } from "./ladderLevels";
import type { CountryStat, NodeRow } from "./types";

// A node row with just what the levels read. `meta` names its network (networkOfRow).
const node = (o: { ip: string; id?: string; cc?: string | null; country?: string | null; city?: string; isp?: string; meta?: string; layer?: string }): NodeRow =>
  ({
    pick: {
      kind: "metanode",
      meta: o.meta ? { id: o.meta } : undefined,
      node: { ip: o.ip, id: o.id ?? `id-${o.ip}` },
      geo: { cc: o.cc ?? undefined, city: o.city, isp: o.isp },
    },
    label: o.ip,
    id: o.id ?? `id-${o.ip}`,
    cc: o.cc ?? null,
    country: o.country ?? null,
    city: o.city ?? null,
    layer: o.layer ?? "l0",
  }) as unknown as NodeRow;

const de1 = node({ ip: "1", id: "b", cc: "de", country: "Germany", city: "Falkenstein", isp: "Hetzner", meta: "dor" });
const de2 = node({ ip: "2", id: "a", cc: "de", country: "Germany", city: "Falkenstein", isp: "Hetzner", meta: "ded" });
const de3 = node({ ip: "3", id: "c", cc: "de", country: "Germany", city: "Berlin", isp: "AWS", meta: "dor" });
const fi1 = node({ ip: "4", id: "d", cc: "fi", country: "Finland", city: "Helsinki", isp: "Hetzner", meta: "dor" });
const fi2 = node({ ip: "5", id: "e", cc: "fi", country: "Finland", city: "Helsinki", isp: "OVH", meta: "ded" });
const fi3 = node({ ip: "6", id: "f", cc: "fi", country: "Finland", city: "Espoo", isp: "UpCloud", meta: "tbc" });
// A node the lookup placed in a country but gave no code (Review Focus 2).
const fiNoCc = node({ ip: "7", id: "g", cc: null, country: "Finland", city: "Oulu", isp: "Elisa", meta: "dor" });
const sel = [de1, de2, de3, fi1, fi2, fi3, fiNoCc];
const countries: CountryStat[] = [
  { cc: "de", country: "Germany", count: 3 },
  { cc: "fi", country: "Finland", count: 3 },
];

describe("nodeOrder", () => {
  it("orders by city, then id", () => {
    expect([de1, de3, de2].sort(nodeOrder).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

describe("nodesByCountry", () => {
  it("joins by country NAME and sorts by city, then id", () => {
    const by = nodesByCountry(sel);
    expect(by.get("Germany")!.map((r) => r.id)).toEqual(["c", "a", "b"]); // Berlin, then Falkenstein a < b
    expect(by.get("Finland")!.map((r) => r.id)).toEqual(["f", "d", "e", "g"]); // Espoo, Helsinki d < e, Oulu
  });
});

describe("countriesLevel", () => {
  const by = nodesByCountry(sel);
  it("orders by the picked figure", () => {
    // providers: Germany 2 (Hetzner, AWS), Finland 4 (Hetzner, OVH, UpCloud, Elisa)
    expect(countriesLevel(countries, by, "providers").map((x) => x.c.cc)).toEqual(["fi", "de"]);
  });
  it("breaks a tie on node count, so the order is stable (Review Focus 3)", () => {
    // metagraphs: Germany {dor, ded} = 2, Finland (two rows only) {dor, ded} = 2 — tied; Finland
    // has the larger node count, so it leads.
    const tieBy = new Map([["Germany", [de1, de2, de3]], ["Finland", [fi1, fi2]]]);
    const tie: CountryStat[] = [
      { cc: "de", country: "Germany", count: 3 },
      { cc: "fi", country: "Finland", count: 5 },
    ];
    expect(countriesLevel(tie, tieBy, "metagraphs").map((x) => x.c.cc)).toEqual(["fi", "de"]);
  });
});

describe("countryNodes", () => {
  it("returns a country's rows by NAME, including a node with no country code (Review Focus 2)", () => {
    expect(countryNodes("fi", countries, nodesByCountry(sel)).map((r) => r.id)).toEqual(["f", "d", "e", "g"]);
    expect(countryNodes("xx", countries, nodesByCountry(sel))).toEqual([]);
  });
});

describe("cohortsLevel", () => {
  it("groups by city × provider, count desc then city", () => {
    const rows = countryNodes("de", countries, nodesByCountry(sel));
    const cs = cohortsLevel(rows);
    expect(cs.map((c) => `${c.isp}|${c.city}|${c.rows.length}`)).toEqual(["Hetzner|Falkenstein|2", "AWS|Berlin|1"]);
    expect(cs[0]!.rows.map((r) => r.id)).toEqual(["a", "b"]); // keeps the input (sorted) order
  });
  it("sorts an unlocated cohort last", () => {
    const loose = node({ ip: "9", country: "Germany", isp: "X" }); // no city
    const cs = cohortsLevel([de3, loose]);
    expect(cs.map((c) => c.city)).toEqual(["Berlin", null]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/ladderLevels.test.ts`
Expected: FAIL — `Failed to resolve import "./ladderLevels"`.

- [ ] **Step 3: Write the module**

Create `src/data/ladderLevels.ts`:

```ts
// ONE LIST PER LADDER LEVEL (user, 2026-10-07 — `docs/superpowers/specs/2026-10-07-one-list-per-level-design.md`).
// Each function answers one level's question: which subjects it holds, in which order. The
// explorer lists that list, the rail's next ghost opens its first item, and the card's ‹ › pager
// steps through it — so the three can never disagree about what is under a card. They did: the
// rail kept its own copies, and four had drifted (countries by node count while the explorer
// sorted by the picked figure, …).
//
// Pure: plain values in, plain subjects out — no React, no store, no singleton reads. A level's
// ROW (glyph, bar, click) is the explorer's business; a level's STEP (label, actions) is the
// rail's. Only membership and order live here.
import { countryMeasure, networkOfRow, type GeoMeasure } from "./geoMeasure";
import type { CountryStat, NodeRow } from "./types";

// ── Geography ───────────────────────────────────────────────────────────────────────────────

/** A node list's order: city (label fallback), then id. */
export const nodeOrder = (a: NodeRow, b: NodeRow): number =>
  (a.city || a.label).localeCompare(b.city || b.label, undefined, { sensitivity: "base" }) || (a.id || "").localeCompare(b.id || "");

/** The selection's nodes by country NAME — the key both the leaderboard and the node list derive
 *  from `geo.country` (`cc` can be absent, the name can't) — each country's rows in node-list order. */
export function nodesByCountry(selNodes: readonly NodeRow[]): Map<string, NodeRow[]> {
  const m = new Map<string, NodeRow[]>();
  for (const r of selNodes) {
    const key = r.country || "Unknown";
    (m.get(key) ?? m.set(key, []).get(key)!).push(r);
  }
  for (const rows of m.values()) rows.sort(nodeOrder);
  return m;
}

/** THE COUNTRIES under the network, by the picked figure, node count breaking a tie. */
export function countriesLevel(
  countries: readonly CountryStat[],
  byCountry: ReadonlyMap<string, readonly NodeRow[]>,
  measure: GeoMeasure,
): { c: CountryStat; v: number }[] {
  return countries
    .map((c) => ({ c, v: countryMeasure(measure, c.count, byCountry.get(c.country) ?? []) }))
    .sort((a, b) => b.v - a.v || b.c.count - a.c.count);
}

/** One country's nodes, joined by NAME through the leaderboard (a node can carry a country and no code). */
export function countryNodes(cc: string, countries: readonly CountryStat[], byCountry: ReadonlyMap<string, readonly NodeRow[]>): NodeRow[] {
  const name = countries.find((c) => c.cc === cc)?.country;
  return name ? [...(byCountry.get(name) ?? [])] : [];
}

/** A country's city × provider group. */
export interface Cohort {
  key: string;
  city: string | null;
  isp: string | null;
  rows: NodeRow[];
}

/** THE PROVIDERS in a country: city × provider, most nodes first, then city (unlocated last).
 *  `|| null` on both fields — `sameCohort`'s strict === needs an unresolved value to be null. */
export function cohortsLevel(rows: readonly NodeRow[]): Cohort[] {
  const by = new Map<string, Cohort>();
  for (const r of rows) {
    const geo = "geo" in r.pick ? r.pick.geo : undefined;
    const city = r.city || null;
    const isp = geo?.isp || null;
    const key = `${city ?? ""}|${isp ?? ""}`;
    (by.get(key) ?? by.set(key, { key, city, isp, rows: [] }).get(key)!).rows.push(r);
  }
  return [...by.values()].sort((a, b) => b.rows.length - a.rows.length || (a.city ?? "￿").localeCompare(b.city ?? "￿"));
}
```

Remove the unused `networkOfRow` import if tsc flags it (it is used in Task 2).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/ladderLevels.test.ts`
Expected: PASS (6 describe blocks).

- [ ] **Step 5: Use it in `GeoExplore.tsx`**

Add the import:

```ts
import { cohortsLevel, countriesLevel, countryNodes, nodesByCountry } from "@/src/data/ladderLevels";
```

Replace the `nodesByCountry` memo (the block starting `// The selection's nodes grouped by country NAME`) with:

```ts
  // The level functions are the ONE list (src/data/ladderLevels.ts) — the rail's ghost and pager
  // read the same ones, so this list and the card's ‹ › can never disagree about order.
  const byCountry = useMemo(() => nodesByCountry(selNodes), [selNodes]);
```

Replace the `measured` memo with:

```ts
  const measured = useMemo(() => countriesLevel(list, byCountry, geoMeasure), [list, byCountry, geoMeasure]);
```

Replace `drilledRows` and the `cohorts` memo (and the local `type Cohort`) with:

```ts
  const drilledRows = useMemo(() => (drilled ? countryNodes(drilled.cc, list, byCountry) : []), [drilled, list, byCountry]);
  const cohorts = useMemo(() => cohortsLevel(drilledRows), [drilledRows]);
```

Then rename any remaining `nodesByCountry.get(…)` reference in the file to `byCountry.get(…)` (grep: `grep -n "nodesByCountry" components/GeoExplore.tsx` must print only the import).

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass (the data export-coverage test includes the new module).

- [ ] **Step 7: Commit**

```bash
git add src/data/ladderLevels.ts src/data/ladderLevels.test.ts components/GeoExplore.tsx
git commit -m "Ladder levels: Geography's countries, providers and nodes defined once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Hypergraph networks level

**Files:**
- Modify: `src/data/ladderLevels.ts`, `src/data/ladderLevels.test.ts`
- Modify: `components/HyperExplore.tsx` (the `measured` memo, ~L73-85)

**Interfaces:**
- Consumes: Task 1's module.
- Produces: `networksLevel(metaList: readonly MetaInfo[], allNodes: readonly NodeRow[], measure: HyperMeasure): { m: MetaInfo; v: number }[]` — figure desc, fleet size (`m.nodes.length`) tiebreak.

Compositions, a composition's nodes and the validators are already ONE function each (`compositionGroups`, its `rows`, `snapshotSignerRows`) shared by both surfaces — they are not wrapped.

- [ ] **Step 1: Write the failing test** — append to `src/data/ladderLevels.test.ts`:

```ts
import { networksLevel } from "./ladderLevels";
import type { MetaInfo } from "./types";

describe("networksLevel", () => {
  const net = (id: string, n: number) => ({ id, name: id, nodes: Array.from({ length: n }, () => ({})) }) as unknown as MetaInfo;
  // dor: 3 nodes in 2 countries; ded: 2 nodes in 2 countries; tbc: 1 node, 1 country
  const all = [de1, de3, fi1, de2, fi2, fi3];
  const metas = [net("ded", 2), net("dor", 3), net("tbc", 1)];
  it("orders by the picked figure", () => {
    expect(networksLevel(metas, all, "nodes").map((x) => x.m.id)).toEqual(["dor", "ded", "tbc"]);
  });
  it("breaks a tie on fleet size (Review Focus 3)", () => {
    // countries: dor 2 (DE, FI), ded 2 (DE, FI) — tied; dor has the larger fleet
    expect(networksLevel(metas, all, "countries").map((x) => x.m.id)).toEqual(["dor", "ded", "tbc"]);
  });
});
```

(Move the new imports to the file's top import lines.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/ladderLevels.test.ts`
Expected: FAIL — `networksLevel` is not exported.

- [ ] **Step 3: Implement** — append to `src/data/ladderLevels.ts` (and add the imports `import { networkMeasure, type HyperMeasure } from "./hyperMeasure";` and `MetaInfo` to the types import):

```ts
// ── Hypergraph ──────────────────────────────────────────────────────────────────────────────

/** THE NETWORKS, by the picked figure, fleet size breaking a tie — the explorer's root list and the
 *  Metagraph card's pager in this view. Counted over the whole fleet (`allNodes`), not the selection. */
export function networksLevel(metaList: readonly MetaInfo[], allNodes: readonly NodeRow[], measure: HyperMeasure): { m: MetaInfo; v: number }[] {
  const byNet = new Map<string, NodeRow[]>();
  for (const r of allNodes) {
    const n = networkOfRow(r);
    if (n) (byNet.get(n) ?? byNet.set(n, []).get(n)!).push(r);
  }
  return metaList
    .map((m) => ({ m, v: networkMeasure(measure, m, byNet.get(m.id) ?? []) }))
    .sort((a, b) => b.v - a.v || b.m.nodes.length - a.m.nodes.length);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/data/ladderLevels.test.ts` — Expected: PASS.

- [ ] **Step 5: Use it in `HyperExplore.tsx`** — import `networksLevel` from `@/src/data/ladderLevels` and replace the whole `measured` memo body with:

```ts
  // The ONE list (src/data/ladderLevels.ts) — the Metagraph card's ‹ › steps the same order.
  const measured = useMemo(() => networksLevel(metaList, allNodes, hyperMeasure), [metaList, allNodes, hyperMeasure]);
```

Remove the now-unused `networkOfRow`, `networkMeasure` and `NodeRow` imports if tsc / eslint flag them (`NodeRow` is still used by `selectNode`'s signature — keep it if so).

- [ ] **Step 6: Verify** — `npx tsc --noEmit && npx vitest run` — clean / all pass.

- [ ] **Step 7: Commit**

```bash
git add src/data/ladderLevels.ts src/data/ladderLevels.test.ts components/HyperExplore.tsx
git commit -m "Ladder levels: Hypergraph's networks defined once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Snapshots — a global snapshot's networks and their snapshots

**Files:**
- Modify: `src/data/ladderLevels.ts`, `src/data/ladderLevels.test.ts`
- Modify: `components/LedgerPanel.tsx` (delete `MetaGroup`, `unionRows`, `groupByMeta` ~L96-133; replace the level-1 `groups` / `unlistedCount` / `netRows` block ~L414-424 and the level-2 `leaves` block ~L492-511; drop `exactChannelRows` and `unlistedEntries` ~L208-209 if nothing else reads them)

**Interfaces:**
- Produces:
  - `interface TickSnap { metaId: string; ordinal: number; hash: string; ts: string; fee: number; sizeInKB: number }`
  - `interface TickNetwork { id: string; name: string; hue: string; unlisted: boolean; snaps: TickSnap[] }` — `snaps` newest first (ordinal desc); the network's count is `snaps.length`.
  - `tickNetworksLevel(tick: GlobalSnapshot, polled: readonly AnchorLogRow[], exactRows: readonly { metaId: string; ordinal: number; fee: number; bytes: number }[] | null | undefined, isListed: (metaId: string) => boolean): TickNetwork[]` — listed networks by snapshot count desc then name, the unlisted set LAST (one entry for every uncatalogued address).

Data rule (moved verbatim from `LedgerPanel`'s `unionRows`): polled rows first — they carry the snapshot's `hash` — and exact rows fill in what the polled buffer has aged out; the exact read alone is the complete answer for unlisted channels.

- [ ] **Step 1: Write the failing test** — append to `src/data/ladderLevels.test.ts` (imports at the top):

```ts
import { tickNetworksLevel } from "./ladderLevels";
import type { AnchorLogRow } from "./anchorLog";
import type { GlobalSnapshot } from "./types";

describe("tickNetworksLevel", () => {
  const tick = { ordinal: 42, timestamp: "T42" } as unknown as GlobalSnapshot;
  const other = { ordinal: 41, timestamp: "T41" } as unknown as GlobalSnapshot;
  const listed = (id: string) => id === "dor" || id === "ded";
  const polledRow = (metaId: string, ordinal: number, g = tick): AnchorLogRow => ({ metaId, ordinal, hash: `h${ordinal}`, fee: 1, sizeInKB: 1, ts: g.timestamp, global: g });
  const ex = (metaId: string, ordinal: number) => ({ metaId, ordinal, fee: 2, bytes: 2048 });

  it("unions polled and exact rows, polled first, and lists listed networks by count then name", () => {
    const nets = tickNetworksLevel(
      tick,
      [polledRow("ded", 5), polledRow("dor", 900, other)], // dor's polled row is another tick's
      [ex("dor", 901), ex("dor", 902), ex("ded", 5), ex("ded", 6)],
      listed,
    );
    expect(nets.map((n) => `${n.id}:${n.snaps.length}`)).toEqual(["ded:2", "dor:2"]); // tie → name: "ded" < "dor"
    expect(nets[0]!.snaps.map((s) => `${s.ordinal}:${s.hash}`)).toEqual(["6:", "5:h5"]); // newest first; polled keeps its hash
  });
  it("puts the unlisted set LAST, whatever its count (Review Focus 4)", () => {
    const nets = tickNetworksLevel(tick, [], [ex("X1", 1), ex("X1", 2), ex("X2", 7), ex("dor", 900)], listed);
    expect(nets.map((n) => n.id)).toEqual(["dor", "unlisted"]);
    expect(nets[1]!.unlisted).toBe(true);
    expect(nets[1]!.snaps.map((s) => `${s.metaId}:${s.ordinal}`)).toEqual(["X2:7", "X1:2", "X1:1"]);
  });
  it("lists what is known while a read is missing (Review Focus 1)", () => {
    expect(tickNetworksLevel(tick, [polledRow("dor", 900)], null, listed).map((n) => n.id)).toEqual(["dor"]);
    expect(tickNetworksLevel(tick, [], undefined, listed)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/ladderLevels.test.ts` — Expected: FAIL, `tickNetworksLevel` not exported.

- [ ] **Step 3: Implement** — append to `src/data/ladderLevels.ts`, with imports `import { buildChannelLog, type AnchorLogRow } from "./anchorLog";`, `import { metagraphById } from "./network";`, `import { UNLISTED_HUE, UNLISTED_ID, UNLISTED_LABEL } from "./unlisted";`, `import { identityHudCss } from "@/src/palette/identity";`, and `GlobalSnapshot` in the types import:

```ts
// ── Snapshots ───────────────────────────────────────────────────────────────────────────────

/** One metagraph snapshot anchored into a global snapshot. */
export interface TickSnap {
  metaId: string;
  ordinal: number;
  hash: string;
  ts: string;
  fee: number;
  sizeInKB: number;
}

/** One network that anchored into a global snapshot, with its snapshots there, NEWEST FIRST. */
export interface TickNetwork {
  id: string;
  name: string;
  hue: string;
  unlisted: boolean;
  snaps: TickSnap[];
}

const newestFirst = (a: TickSnap, b: TickSnap) => (a.metaId === b.metaId ? b.ordinal - a.ordinal : a.ts === b.ts ? b.ordinal - a.ordinal : a.ts < b.ts ? 1 : -1);
const snapOf = (r: AnchorLogRow): TickSnap => ({ metaId: r.metaId!, ordinal: r.ordinal, hash: r.hash, ts: r.ts, fee: r.fee, sizeInKB: r.sizeInKB });

/** THE NETWORKS IN A GLOBAL SNAPSHOT — the explorer's level under a tick, the Metagraph card's
 *  pager under it, and the tick ghost's first child.
 *
 *  ONE TICK'S ROWS, from both sources, POLLED FIRST: the polled row wins where both hold the same
 *  (metaId, ordinal) — it carries the snapshot's own `hash`, which the exact read lacks — and the
 *  exact read supplies everything the per-network buffer has aged out. ⚠️ THE BREAKDOWN IS THE
 *  UNION, and only the exact read makes it COMPLETE (user, 2026-09-14: "DED is missing"): the
 *  polled buffers hold `POLL.metaSnapBuffer` rows PER NETWORK — a depth in rows, not ticks.
 *  Listed networks by snapshot count, then name; the UNLISTED set last, one entry for every
 *  uncatalogued address (the exact read is its only source). */
export function tickNetworksLevel(
  tick: GlobalSnapshot,
  polled: readonly AnchorLogRow[],
  exactRows: readonly { metaId: string; ordinal: number; fee: number; bytes: number }[] | null | undefined,
  isListed: (metaId: string) => boolean,
): TickNetwork[] {
  const byOrd = exactRows ? { [tick.ordinal]: { rows: exactRows } } : {};
  const mine = polled.filter((r) => r.metaId != null && r.global.ordinal === tick.ordinal);
  const seen = new Set(mine.map((r) => `${r.metaId}|${r.ordinal}`));
  const extra = buildChannelLog([tick], byOrd, isListed).filter((r) => !seen.has(`${r.metaId}|${r.ordinal}`));
  const by = new Map<string, TickNetwork>();
  for (const r of [...mine, ...extra]) {
    const id = r.metaId!;
    let n = by.get(id);
    if (!n) {
      n = { id, name: metagraphById(id)?.name ?? id, hue: identityHudCss(id), unlisted: false, snaps: [] };
      by.set(id, n);
    }
    n.snaps.push(snapOf(r));
  }
  const listed = [...by.values()].sort((a, b) => b.snaps.length - a.snaps.length || a.name.localeCompare(b.name));
  for (const n of listed) n.snaps.sort(newestFirst);
  const unl = buildChannelLog([tick], byOrd, (id) => !isListed(id)).map(snapOf).sort(newestFirst);
  return unl.length ? [...listed, { id: UNLISTED_ID, name: UNLISTED_LABEL, hue: UNLISTED_HUE, unlisted: true, snaps: unl }] : listed;
}
```

Note `newestFirst` across several unlisted addresses in ONE tick: same `ts`, so it orders by ordinal desc — the test's `X2:7, X1:2, X1:1`.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/data/ladderLevels.test.ts` — PASS.

- [ ] **Step 5: Use it in `LedgerPanel.tsx`**

1. Delete `interface MetaGroup`, `function unionRows`, `function groupByMeta` (and their comments).
2. Import `tickNetworksLevel` from `@/src/data/ladderLevels`.
3. Replace the level-1 opening (`let groups … ];` through the `netRows` array) with:

```ts
  // ---- level 1: the networks that anchored into the open tick ---------------------------------
  // The ONE list (src/data/ladderLevels.ts): the Metagraph card's ‹ › and the tick's ghost step the
  // same networks in the same order.
  const tickNets = tick ? tickNetworksLevel(tick, rows, exact?.rows, (id) => LISTED_IDS.has(id)) : [];
  if (tick) {
    const netRows: { id: string; name: string; hue: string; count: number; italic?: boolean }[] = tickNets.map((n) => ({
      id: n.id,
      name: n.name,
      hue: n.hue,
      count: n.snaps.length,
      ...(n.unlisted ? { italic: true } : {}),
    }));
```

(the rest of the level — `measured`, `maxNet`, `levels.push({…})` — is unchanged.)

4. Replace the level-2 `leaves` derivation with:

```ts
  // ---- level 2: one network's snapshots in the open tick ---------------------------------------
  type SnapLeaf = { metaId: string; ordinal: number; hash: string; ts: string; fee: number; sizeInKB?: number };
  const openTickNet = openNet ? (tickNets.find((n) => n.id === openNet) ?? null) : null;
  const leaves: SnapLeaf[] = openTickNet?.snaps ?? [];
  const leafHue = openTickNet?.hue ?? accent;
  const leafName = openTickNet?.name ?? "";
```

5. Remove `exactChannelRows`, `unlistedEntries` and the `groups` / `unlistedCount` variables wherever still referenced (grep each; tsc will list leftovers). Remove imports that become unused (`buildChannelLog`, `unlistedLog`, `UNLISTED_HUE`, `UNLISTED_LABEL`, `metagraphById`, `identityHudCss`, `AnchorLogRow`) — only those tsc/eslint actually flag.

- [ ] **Step 6: Verify** — `npx tsc --noEmit && npx vitest run` — clean / all pass.

- [ ] **Step 7: Commit**

```bash
git add src/data/ladderLevels.ts src/data/ladderLevels.test.ts components/LedgerPanel.tsx
git commit -m "Ladder levels: a global snapshot's networks and their snapshots defined once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The rail reads the levels

**Files:**
- Modify: `src/data/ladderLevels.ts`, `src/data/ladderLevels.test.ts` (add `machinesOf`)
- Modify: `components/railSiblings.ts`
- Modify: `components/useSiblingState.ts`
- Modify: `components/railSiblings.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `machinesOf(rows: readonly NodeRow[]): NodeRow[]` (in `ladderLevels.ts`) — the node pager's projection: one stop per machine, deduped by `hoverKeyOf`, first occurrence kept, rows without a key dropped.
  - `SiblingState` gains `geoMeasure: GeoMeasure`, `hyperMeasure: HyperMeasure`, `allNodes: NodeRow[]`, `tickNets: TickNetwork[] | null` (null outside the ledger or with no tick shown).

- [ ] **Step 1: `machinesOf` test** — append to `src/data/ladderLevels.test.ts`:

```ts
import { machinesOf } from "./ladderLevels";

describe("machinesOf — the node pager steps nodes, not layer rows (Review Focus 5)", () => {
  it("keeps one row per node, first occurrence, dropping rows with no key", () => {
    const l0 = node({ ip: "8", id: "m", layer: "l0" });
    const l1 = node({ ip: "8", id: "m", layer: "l1" });
    const keyless = { ...node({ ip: "" }), pick: { kind: "metanode", node: null } } as unknown as NodeRow;
    expect(machinesOf([l0, l1, de1, keyless]).map((r) => r.layer + r.id)).toEqual(["l0m", "l0b"]);
  });
});
```

Run `npx vitest run src/data/ladderLevels.test.ts` → FAIL (`machinesOf` not exported). Then append to `ladderLevels.ts` (import `hoverKeyOf` from `./hoverSubject`):

```ts
/** THE NODE PAGER'S PROJECTION: a node that runs two layers is two explorer rows (one per layer) but
 *  ONE pager stop — deduped by the shared hover key, the rule `hoverKeyOf` encodes for pairing.
 *  A row without a key is neither pairable nor steppable. */
export function machinesOf(rows: readonly NodeRow[]): NodeRow[] {
  const seen = new Set<string>();
  const out: NodeRow[] = [];
  for (const r of rows) {
    const k = hoverKeyOf(r.pick);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
```

Run again → PASS. (If `hoverKeyOf` keys a `metanode` by something other than IP+id, adjust the fixture's expectation to what `hoverKeyOf` actually returns for two rows of one machine — read `src/data/hoverSubject.ts` first.)

- [ ] **Step 2: Extend `SiblingState`** in `components/railSiblings.ts`:

```ts
import { cohortsLevel, countriesLevel, countryNodes, machinesOf, networksLevel, nodeOrder, nodesByCountry, type TickNetwork } from "@/src/data/ladderLevels";
import type { GeoMeasure } from "@/src/data/geoMeasure";
import type { HyperMeasure } from "@/src/data/hyperMeasure";
```

and add to the interface:

```ts
  /** The explorers' picked figures — a level's ORDER follows them (one list per level, 2026-10-07). */
  geoMeasure: GeoMeasure;
  hyperMeasure: HyperMeasure;
  /** The whole fleet — Hypergraph's networks level counts over it, not the selection. */
  allNodes: NodeRow[];
  /** The shown global snapshot's networks (`tickNetworksLevel`), filled by the caller because the
   *  polled half lives in the network singleton. Null outside the ledger or with no tick shown. */
  tickNets: TickNetwork[] | null;
```

- [ ] **Step 3: Update the test fixture first** — in `components/railSiblings.test.ts`, `base()` gains:

```ts
  geoMeasure: "nodes",
  hyperMeasure: "nodes",
  allNodes: [deA, deB, deC, fiA],
  tickNets: null,
```

and add a ledger helper right after `base` (import `tickNetworksLevel` from `@/src/data/ladderLevels` and `GlobalSnapshot` is already imported):

```ts
// A ledger state whose tick networks are built by the SAME level function the hook calls, from the
// fixture's exact rows (no polled rows: the tests' ids are not in the app catalog, so `isListed`
// is the fixture's metaList, as `keyOf` already assumes).
const isListed = (id: string) => metaList.some((m) => m.id === id);
const ledger = (over: Partial<SiblingState>): SiblingState => {
  const s = base({ mode: "ledger", ...over });
  const t = s.snap ?? null;
  const tickNets = t ? tickNetworksLevel(t.data, [], (s.exactRows ?? null) as never, isListed) : null;
  return { ...s, isListed, tickNets };
};
```

Then convert every `base({ mode: "ledger", … })` call to `ledger({ … })` (drop the now-redundant `mode: "ledger"`), and every `{ ...s, exactRows: X }` spread on a ledger state to `ledger({ ...s, exactRows: X })` so `tickNets` is rebuilt. Exact rows in fixtures that lack `fee` / `bytes` (`{ metaId, ordinal }` casts) are fine — `buildChannelLog` reads them as `undefined`.

- [ ] **Step 4: Update the expectations the spec changes** (run `npx vitest run components/railSiblings.test.ts` first to see them fail, then edit):

  - `"siblingSet — context (network) rung" › "steps the picker's located-desc order…"` becomes the explorer's order. Rename it to `"steps the explorer's network order (the picked figure), with the committed network at index"`, run in `mode: "hyper"`, and assert against the level function rather than a literal:

    ```ts
    const s = base({ mode: "hyper", filter: "ded" });
    const set = siblingSet("context", s)!;
    expect(set.items.map((i) => i.key)).toEqual(networksLevel(metaList, s.allNodes, "nodes").map((x) => x.m.id));
    expect(set.items[set.index]!.key).toBe("ded");
    ```

    The two following tests in that block (`a step to a DIFFERENT network…`, `the CURRENT item…`) index by key, not position — change `set.items[0]` to `set.items.find((i) => i.key !== "ded")!` and keep their `filterToggleActions` expectations.
  - `"siblingSet — context rung under a ledger tick" › "steps the tick's own networks, busiest first — the unlisted set included…"` → expected keys `["dor", "ded", "unlisted"]` (listed by count, unlisted last) and `set.index` `1`. Rename it to `"…busiest first, the unlisted set LAST…"`.
  - `"an unlisted leader is a network like any other — the tick opens it"` → the tick now opens the explorer's top row: `step.key` is `"ded"` and the action builder is `tickNetSelectActions("ded", snapPick, { metaSnap: null })`. Rename to `"an unlisted leader is listed last, as the explorer lists it — the tick opens the top listed network"`.
  - `"siblingSet — metaSnap rung"` keeps `["100", "101"]` (oldest → newest is the declared projection). Its "no exact read → no set" assertion (`{ ...s, exactRows: null }`) becomes `ledger({ ...over, exactRows: null })` and still expects `null`.

- [ ] **Step 5: Rewrite the builders in `railSiblings.ts`**

  1. Delete `interface CohortGroup`, `function cohortsOf`, `const nodeSort`, `function machineRows`, `function tickNetworks`. Keep `cohortLabel` (GeoExplore imports it).
  2. `cohortItem` takes a `Cohort` (from ladderLevels) instead of `CohortGroup` — same fields.
  3. Geography:

     ```ts
     // The explorer's own lists (src/data/ladderLevels.ts) — so a step, a ghost and a row agree.
     const byCountryOf = (s: SiblingState) => nodesByCountry(s.selNodes);
     const countriesOf = (s: SiblingState) => countriesLevel(s.countries, byCountryOf(s), s.geoMeasure).map((x) => x.c);
     const cohortsIn = (s: SiblingState, cc: string) => cohortsLevel(countryNodes(cc, s.countries, byCountryOf(s)));
     ```

     `countryChildren`: `return countriesOf(s).slice(0, n).map((c) => countryItem(c, s));`
     `cohortChildren`: `return cohortsIn(s, cc).slice(0, n).map((g) => cohortItem(cc, g, s));`
     `nodeOfCohortChildren`: `const g = cohortsIn(s, c.cc).find((x) => sameCohort(c, { cc: c.cc, city: x.city, isp: x.isp })); return g ? machinesOf(g.rows).slice(0, n).map((r) => nodeItem(r, s)) : [];`
     `siblingSet` `"country"`: `const cs = countriesOf(s); const items = cs.map((c) => countryItem(c, s)); return finish(slot, items, cs.findIndex((c) => c.cc === s.country), networkLabel(s));`
     `"cohort"`: `const groups = cohortsIn(s, cc);` (rest unchanged).
     `"node"` cohort branch: `rows = machinesOf(cohortsIn(s, c.cc).find((g) => sameCohort(c, { cc: c.cc, city: g.city, isp: g.isp }))?.rows ?? []);`
     `"node"` country branch: `rows = machinesOf(countryNodes(s.country, s.countries, byCountryOf(s)));`
     `"node"` final else (a network-wide node list — no explorer level, today's order kept): `rows = machinesOf([...s.selNodes].sort(nodeOrder));` (import `nodeOrder` too).

  4. Hypergraph context pager (the non-ledger branch of `case "context"`):

     ```ts
     // Hypergraph steps its explorer's network list, in the picked figure's order; elsewhere the
     // Metagraph card has no explorer level above it and keeps the filter strip's located order.
     const nets =
       s.mode === "hyper"
         ? networksLevel(s.metaList, s.allNodes, s.hyperMeasure).map((x) => x.m)
         : [...s.metaList].sort((a, b) => (b.located ?? 0) - (a.located ?? 0));
     ```

  5. Ledger — every `tickNetworks(s)` becomes `s.tickNets`:
     - `case "context"` ledger branch: `const nets = s.tickNets; if (!nets?.length) return null;` — items as today (`key: m.id, label: m.name`).
     - `anchoringNetworkChildren`: `return (s.tickNets ?? []).slice(0, n).map((meta) => ({ key: meta.id, label: meta.name, actions: … }))`.
     - `metaSnapOfTickChildren`: replace the `s.exactRows.filter(…)` body with

       ```ts
       const tn = s.tickNets?.find((x) => x.id === net);
       if (!tn) return [];
       return tn.snaps.slice(0, n).map((r) => {
         const sel = { metaId: r.metaId, ordinal: r.ordinal, hash: r.hash, globalOrdinal: snap.data.ordinal, ts: r.ts };
         return { key: `${r.metaId}:${r.ordinal}`, label: r.ordinal > 0 ? r.ordinal.toLocaleString() : "undecoded", actions: metaSnapSelectActions(sel, snap, { metaSnap: s.metaSnap, inspect: s.inspect }) };
       });
       ```

       and drop its `!s.exactRows` guard (keep `net === "all" || !s.snap`).
     - `case "metaSnap"`: replace the `rows` derivation with the level reversed:

       ```ts
       // THE ONE LIST, REVERSED: the explorer lists newest first, the pager steps OLDEST → NEWEST so
       // `›` means forward in time (user, 2026-09-01) — a declared projection, not a second order.
       const tn = s.tickNets?.find((x) => x.id === keyOf(s, cur.metaId));
       if (!tn) return null;
       const rows = [...tn.snaps].reverse();
       ```

       keep the rest (items with `${r.metaId}:${r.ordinal}:${i}` keys, `metaSnapSelectActions(metaSnapSelOf…)` — change `metaSnapSelOf(r, …)` to build from the `TickSnap`: `{ metaId: r.metaId, ordinal: r.ordinal, hash: r.hash, globalOrdinal: cur.globalOrdinal, ts: cur.ts }`), and remove the `!s.exactRows` guard (the `tn` guard replaces it). `ordinalLabel` takes `{ ordinal: number }`.
     - `metaSnapSelOf` and `ChannelSnapRow` imports go if unused. `exactRows` stays in `SiblingState`: the signer steps (`snapshotSignerRows`) still read it.

- [ ] **Step 6: Fill the state in `useSiblingState.ts`**

```ts
import { buildAnchorLog } from "@/src/data/anchorLog";
import { getNetwork } from "@/src/data/network";
import { tickNetworksLevel } from "@/src/data/ladderLevels";
```

Read the new store fields (`geoMeasure`, `hyperMeasure`, `allNodes`), and in the memo:

```ts
    // THE SHOWN TICK'S NETWORKS — the ledger explorer's own level, so the Metagraph card's ‹ › and
    // the tick's ghost step what the explorer lists. The polled half lives in the network singleton
    // (read at derivation time, as the tick window's live reads are); the exact read is the store's.
    const tickGlobal = mode === "ledger" ? (snap?.data ?? null) : null;
    const net = tickGlobal ? getNetwork() : null;
    const tickNets = tickGlobal
      ? tickNetworksLevel(
          tickGlobal,
          net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, "all") : [],
          snapshotExact[tickGlobal.ordinal]?.rows,
          (id) => LISTED_IDS.has(id),
        )
      : null;
```

return `geoMeasure, hyperMeasure, allNodes, tickNets` alongside the existing fields, and add `geoMeasure, hyperMeasure, allNodes` to the memo deps.

- [ ] **Step 7: The one-list test** — append to `components/railSiblings.test.ts`:

```ts
import { CHILD_OF } from "@/components/railSiblings";
import { countriesLevel, nodesByCountry, cohortsLevel, countryNodes } from "@/src/data/ladderLevels";

// ONE LIST PER LEVEL (2026-10-07): the next ghost opens the FIRST row the explorer lists, and the
// pager steps the explorer's list in the explorer's order. A future copy cannot drift silently.
describe("one list per level — the rail steps the explorer's own lists", () => {
  it("geo: the network's ghost opens the explorer's top country, under a non-default figure too", () => {
    for (const geoMeasure of ["nodes", "metagraphs", "providers"] as const) {
      const s = base({ mode: "geo", filter: "ded", geoMeasure });
      const top = countriesLevel(s.countries, nodesByCountry(s.selNodes), geoMeasure)[0]!.c.cc;
      expect(childStep("context", s)!.key).toBe(top);
    }
  });
  it("geo: the country pager steps the explorer's countries in order", () => {
    const s = base({ mode: "geo", country: "de", geoMeasure: "providers" });
    expect(siblingSet("country", s)!.items.map((i) => i.key)).toEqual(
      countriesLevel(s.countries, nodesByCountry(s.selNodes), "providers").map((x) => x.c.cc),
    );
  });
  it("geo: the country's ghost opens its top provider", () => {
    const s = base({ mode: "geo", country: "de" });
    const g = cohortsLevel(countryNodes("de", s.countries, nodesByCountry(s.selNodes)))[0]!;
    expect(childStep("country", s)!.key).toBe(`de|${g.city}|${g.isp}`);
  });
  it("ledger: the tick's ghost and the Metagraph card's pager step the explorer's networks", () => {
    const rows = [
      { metaId: "dor", ordinal: 1 },
      { metaId: "unlisted-x", ordinal: 1 },
      { metaId: "ded", ordinal: 9 },
      { metaId: "dor", ordinal: 2 },
    ] as unknown as SiblingState["exactRows"];
    const s = ledger({ snap: snapPick, exactRows: rows });
    const ids = s.tickNets!.map((n) => n.id);
    expect(childStep("snap", s)!.key).toBe(ids[0]);
    const under = ledger({ snap: snapPick, exactRows: rows, tickNet: { metaId: "ded", globalOrdinal: snapPick.data.ordinal } });
    expect(siblingSet("context", under)!.items.map((i) => i.key)).toEqual(ids);
  });
  it("ledger: the Metagraph card's ghost opens the explorer's newest snapshot; its pager steps the same list oldest first", () => {
    const rows = [
      { metaId: "ded", ordinal: 100 },
      { metaId: "ded", ordinal: 102 },
      { metaId: "ded", ordinal: 101 },
    ] as unknown as SiblingState["exactRows"];
    const s = ledger({ filter: "ded", snap: snapPick, exactRows: rows });
    expect(childStep("context", s)!.key).toBe("ded:102");
    const cur = { metaId: "ded", ordinal: 101, hash: "", globalOrdinal: 42, ts: "T" };
    const set = siblingSet("metaSnap", ledger({ filter: "ded", snap: snapPick, exactRows: rows, metaSnap: cur }))!;
    expect(set.items.map((i) => i.label)).toEqual(["100", "101", "102"]);
  });
  it("every parent with a child step is covered above or by the per-rung tests", () => {
    // A tripwire: a new CHILD_OF entry must earn a one-list assertion here.
    const pairs = Object.entries(CHILD_OF).flatMap(([mode, m]) => Object.keys(m ?? {}).map((k) => `${mode}:${k}`));
    expect(pairs.sort()).toEqual(
      ["geo:context", "geo:country", "geo:cohort", "hyper:context", "hyper:composition", "ledger:snap", "ledger:context", "ledger:metaSnap"].sort(),
    );
  });
});
```

(Move the imports to the top of the file. `childStep("context", …)` for geo requires a committed filter, hence `filter: "ded"`.)

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all pass. If a pre-existing `railSiblings` test fails, decide per test: an ORDER it pinned that the spec changes → update it to the level function (as in Step 4); anything else → the refactor broke behaviour, fix the code.

Also run: `grep -n "cohortsOf\|nodeSort\|machineRows\|tickNetworks(" components/railSiblings.ts` → no output.

- [ ] **Step 9: Commit**

```bash
git add src/data/ladderLevels.ts src/data/ladderLevels.test.ts components/railSiblings.ts components/useSiblingState.ts components/railSiblings.test.ts
git commit -m "Rail: the ghost and the pager step the explorer's own lists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Snapshots — opening a global snapshot turns to its page

**Files:**
- Modify: `components/explorer/fitRows.ts`, `components/explorer/fitRows.test.ts`
- Modify: `components/LedgerPanel.tsx` (the path-sync block, ~L283-295)

**Interfaces:**
- Produces: `pageHolding(index: number, pageSize: number): number | null` — the 1-based page holding a 0-based row index; null for a negative index.

- [ ] **Step 1: Failing test** — append to `components/explorer/fitRows.test.ts` (add `pageHolding` to its import):

```ts
describe("pageHolding", () => {
  it("is the 1-based page holding a 0-based row", () => {
    expect(pageHolding(0, 15)).toBe(1);
    expect(pageHolding(14, 15)).toBe(1);
    expect(pageHolding(15, 15)).toBe(2);
  });
  it("a row that is not in the list holds no page", () => {
    expect(pageHolding(-1, 15)).toBeNull();
  });
});
```

Run `npx vitest run components/explorer/fitRows.test.ts` → FAIL (not exported).

- [ ] **Step 2: Implement** — append to `components/explorer/fitRows.ts`:

```ts
/** The 1-based page holding a 0-based row, or null when the row is not in the list. */
export function pageHolding(index: number, pageSize: number): number | null {
  return index < 0 ? null : Math.floor(index / pageSize) + 1;
}
```

Run → PASS.

- [ ] **Step 3: Generalise the page turn in `LedgerPanel.tsx`** — import `pageHolding` beside `pageKeepingRow`, and replace

```ts
      else if (pathView.metaSnap && next.tick === pathView.metaSnap.globalOrdinal && next.tick !== path.tick) {
        const at = orderedSnaps.findIndex((d) => d.ordinal === next.tick);
        if (at >= 0) setTickPage(Math.floor(at / pageSize) + 1);
      }
```

with

```ts
      // WHENEVER THE PATH OPENS A GLOBAL SNAPSHOT the list turns to the page holding it (user,
      // 2026-10-07) — a pin from the card's ‹ ›, a bar or a tile, not only a metagraph snapshot's —
      // so going back up via the crumb finds the pinned row on screen.
      else if (next.tick != null && next.tick !== path.tick) {
        const page = pageHolding(orderedSnaps.findIndex((d) => d.ordinal === next.tick), pageSize);
        if (page != null) setTickPage(page);
      }
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npx vitest run` — clean / pass.

- [ ] **Step 5: Commit**

```bash
git add components/explorer/fitRows.ts components/explorer/fitRows.test.ts components/LedgerPanel.tsx
git commit -m "Snapshots explorer: opening a global snapshot turns to its page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Notes and live verification

**Files:**
- Modify: `components/CLAUDE.md`

- [ ] **Step 1: Notes** — in `components/CLAUDE.md`, in the paragraph beginning `**The ladder pair is RETIRED; the plank is ONE AXIS**`, replace the sentence `…a click commits that rung's first child in the explorer's own order (\`childStep\` in railSiblings.ts, read through the pager's own state builder \`useSiblingState\`)…` so it names the source:

```
a click commits that rung's first child — the first row of the explorer's own list for that
level (`src/data/ladderLevels.ts`, read by `childStep` through `useSiblingState`)
```

and add, after the paragraph beginning `**The box can carry a SIBLING PAGER**`:

```
**ONE LIST PER LEVEL** (user, 2026-10-07 — `docs/superpowers/specs/2026-10-07-one-list-per-level-design.md`):
a level's subjects and order are defined once, in `src/data/ladderLevels.ts`, and the explorer,
the next ghost and the pager all read it — including the figure picked in the explorer's heading.
Two projections are declared where they are applied, never re-sorted: time levels step oldest →
newest in the pager (› = forward), and the node pager steps nodes, not layer rows (`machinesOf`).
`railSiblings.test.ts`' one-list block pins it; a new `CHILD_OF` entry trips it until it is covered.
```

- [ ] **Step 2: Live check (dev server on :3000, chrome-devtools MCP, 1600×950)** — reload the page first (`NetworkData` and module singletons need a full reload, CLAUDE.md):
  1. Geography, filter BioFi → Countries heading → pick **Providers**. The Country ghost (`[data-ghost] button[title^="Open"]`) title names the explorer's top row; click it, then › on the Country card steps to the explorer's second row.
  2. Hypergraph, filter Dor → **Countries** figure → the Metagraph card's › steps to the explorer's next network row.
  3. Snapshots, no filter, pin a global snapshot (explorer tick row) → Metagraph ghost names the explorer's top network in that snapshot; a snapshot whose only extra network is unlisted shows unlisted LAST in both.
  4. Snapshots, BioFi: open the Metagraph card → the Metagraph snapshot ghost opens the explorer's top (newest) snapshot.
  5. Snapshots, no filter: pin a tick on page 2 via the Global snapshot card's ‹ (step back past the page size), click the ⌂ crumb → page 2 is showing with the pinned row highlighted.

- [ ] **Step 3: Commit**

```bash
git add components/CLAUDE.md
git commit -m "Notes: one list per ladder level

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
