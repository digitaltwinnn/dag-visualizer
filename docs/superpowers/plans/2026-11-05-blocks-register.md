# The Blocks Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Snapshots view a second register, Blocks, that draws the block DAG on the same chamber: a block on the snapshot that accepted it, links block to block across the plane's lanes, open tips lit, over a trail of only the block-bearing ticks with the silent runs compressed.

**Architecture:** The register is a store setting (`ledgerRegister`), not a Mode. It swaps one ledger SOURCE (the block window, beside the live buffer and the past window), adds one tier to `LedgerView` (an instanced block mesh and one line geometry, behind a keyed register dispatch), and keys four HUD surfaces by register (the explorer's root level and measures, the band's cells, the RAW table, the rail's block card). The braid's arithmetic is a pure domain module; the block data rides the feed the app already polls (the explorer's snapshot records carry each snapshot's block hashes) plus one full read per tick in the trail window for parents, transactions and tips.

**Tech Stack:** Next.js 16 App Router (server routes), React + Zustand, vanilla Three.js (instanced meshes, `LineSegments`), vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-block-dag-view-design.md`

## Global Constraints

- Rule 1 (`src/engine/layerBoundaries.test.ts`): `domain/` is pure; `scene/` never touches the store; only the engine layer's allow-list reads it.
- Rule 2 (`components/selectionBoundary.test.ts`): the block selection is written only through `pickActions` + `applyClickActions`. `setLedgerRegister` is a SETTING (like `setTrendMetric`) and stays outside the table.
- Rule 3 (`src/engine/noHardcodedColors.test.ts`): no raw hex in `scene/` or `components/`; the block mark takes the lane's identity colour the tiles already resolve.
- Rule 4: every value export of a new `domain/` or `src/data/` module is referenced by its sibling test (`domainExportCoverage.test.ts`, `dataExportCoverage.test.ts`).
- Rule 5 (`src/engine/noFrameAllocations.test.ts`): no `new THREE.*`/`.clone()` in a per-frame body; links and silent stretches are rewritten at event time and marked `event-time`.
- Rule 6: `LedgerView` keeps the `SceneView` contract; no scene module compares `Mode` strings; the register dispatch is one keyed map in the engine layer.
- Rule 10: a block with no landed read has no links (never invented); tips come from a snapshot's own `tips`, never inferred; a failed read is the chamber's failed-read state.
- Convention 7: new per-view behaviour is a `viewPolicy` row field (`registers`), never `mode === "ledger"`.
- Convention 9: the hover channel `hoverBlock` previews, never commits; `.subject-paired` and the marker classes survive.
- Words (spec): a block is **accepted** into a snapshot; a metagraph snapshot is **anchored**; **height**, **sub-height**, **open tip**. Copy says "nodes", never "machines"; an ordinal is written bare.
- `src/net/netUrlBoundary.test.ts`: every own-server fetch goes through `netUrl()`.
- `components/feedReadBoundary.test.ts`: a HUD surface reading a feed's data holds that feed (`useFeedRead`).
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Review Focus

Inputs the spec implies that no task's tests would otherwise exercise, most likely to bite first:

1. A block whose parent references name hashes the trail does not hold (both parents older than the window): the block draws, its links do not, and the band's "open tips" is unaffected. Pinned in Task 1's `linkEndpoints` test.
2. A global that is a block tick for two reasons at once (its own DAG block AND an anchored DOR snapshot with a token block): one slot, both blocks, both lit. Pinned in Task 5's `foldBlockWindow` test.
3. A block-bearing metagraph snapshot whose accepting global is OUTSIDE the trail window (the transfer list names it, the window does not hold the global): the block is not drawn and the tick is not invented. Pinned in Task 5.
4. The explorer's metagraph snapshot record with `blocks` absent (an old cached record from before the field) versus `[]`: both mean "no block hashes known", neither throws. Pinned in Task 2.
5. Switching the register while a metagraph snapshot (`metaSnap`) or a block is committed: the committed subject that the other register cannot show is released, never left standing on a card the chamber does not draw. Pinned in Task 8's `registerSwitchActions` test.

---

### Task 1: The braid's arithmetic (`domain/blockBraid.ts`)

**Files:**
- Create: `src/engine/domain/blockBraid.ts`
- Test: `src/engine/domain/blockBraid.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BlockRead { hash: string; height: number; parents: { hash: string; height: number }[];
    txCount: number; amount: number; fee: number; signers: number }
  export interface TipRead { active: { hash: string; height: number; usage: number; introducedAt: number }[];
    deprecated: { hash: string; height: number; deprecatedAt: number }[] }
  export const BRAID_LANES = 5;
  export function laneOf(height: number, minHeight: number, lanes?: number): number        // 0..lanes-1, (height - minHeight) mod lanes
  export function laneZ(lane: number, lanes: number, width: number): number                // centred: (lane - (lanes-1)/2) * width/lanes
  export type TipState = "open" | "retired";
  export function tipStateOf(hash: string, tips: TipRead | null): TipState | null          // null when tips unknown
  export function linkEndpoints(blocks: readonly BlockRead[], at: (hash: string) => readonly [x: number, y: number, z: number] | null): Float32Array
  export function silentRun(prevOrd: number, ord: number, prevTs: number, ts: number): { snapshots: number; ms: number } | null // null when ord - prevOrd <= 1
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { BRAID_LANES, laneOf, laneZ, tipStateOf, linkEndpoints, silentRun } from "./blockBraid";

describe("laneOf", () => {
  it("cycles heights across the lanes from the window's lowest height", () => {
    expect(laneOf(61633, 61633)).toBe(0);
    expect(laneOf(61637, 61633)).toBe(4);
    expect(laneOf(61638, 61633)).toBe(0);
    expect(BRAID_LANES).toBe(5);
  });
});
describe("laneZ", () => {
  it("centres the lanes on the plane and spreads them across its width", () => {
    expect(laneZ(2, 5, 10)).toBe(0);
    expect(laneZ(0, 5, 10)).toBe(-4);
    expect(laneZ(4, 5, 10)).toBe(4);
  });
});
describe("tipStateOf", () => {
  const tips = { active: [{ hash: "a", height: 1, usage: 1, introducedAt: 10 }], deprecated: [{ hash: "b", height: 1, deprecatedAt: 12 }] };
  it("is open for an active tip, retired for a deprecated one or one in neither list", () => {
    expect(tipStateOf("a", tips)).toBe("open");
    expect(tipStateOf("b", tips)).toBe("retired");
    expect(tipStateOf("c", tips)).toBe("retired");
  });
  it("is null with no tips read — never inferred", () => { expect(tipStateOf("a", null)).toBeNull(); });
});
describe("linkEndpoints", () => {
  const b = (hash: string, parents: string[]) => ({ hash, height: 1, parents: parents.map((p) => ({ hash: p, height: 0 })), txCount: 1, amount: 1, fee: 0, signers: 3 });
  const at = (h: string) => (h === "p1" ? [0, 0, 0] as const : h === "c" ? [2, 0, 1] as const : null);
  it("emits one segment per parent the window holds, child first", () => {
    expect(Array.from(linkEndpoints([b("c", ["p1", "p2"])], at))).toEqual([2, 0, 1, 0, 0, 0]);
  });
  it("emits nothing for a block whose parents are both outside the window", () => {
    expect(linkEndpoints([b("c", ["x", "y"])], at).length).toBe(0);
  });
});
describe("silentRun", () => {
  it("states the snapshots and time between two block ticks, and nothing for adjacent ticks", () => {
    expect(silentRun(100, 859, 0, 7_920_000)).toEqual({ snapshots: 758, ms: 7_920_000 });
    expect(silentRun(100, 101, 0, 10_000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engine/domain/blockBraid.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/domain/blockBraid.ts`** with the signatures above. Header comment: the braid's three rules (lanes by height across the plane's width; links block to block, only where both ends are held; tips read from a snapshot's own list, never inferred — the mock over-counted by half when it inferred). `linkEndpoints` returns a `Float32Array` of `6 × segments` so the scene can hand it to a `BufferAttribute` at event time.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engine/domain/blockBraid.test.ts src/engine/domainExportCoverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/domain/blockBraid.ts src/engine/domain/blockBraid.test.ts
git commit -m "Block braid: lanes by height, links held both ends, tips read never inferred"
```

---

### Task 2: The feed keeps each snapshot's block hashes

**Files:**
- Modify: `src/data/types.ts` (`GlobalSnapshot.blocks`, `RawMetaSnapshot.blocks` → `string[]`)
- Modify: `src/data/api.ts:174-200` (`MetaSnapRecord.blockHashes`, `metaSnapRecord`)
- Test: `src/data/api.test.ts` (it already imports `api.ts`; add the case there)

**Interfaces:**
- Produces: `MetaSnapRecord.blockHashes: string[]` (the count field `blocks` stays); `GlobalSnapshot.blocks?: string[]`; `export const blockHashesOf = (r: { blocks?: unknown }): string[]` in `src/data/api.ts` (exempt module; the pure helper is tested where `metaSnapRecord` is).

- [ ] **Step 1: Write the failing test** in `src/data/api.test.ts`

```ts
it("keeps a snapshot's block hashes, and reads an absent or empty list as none", () => {
  const base = { ordinal: 1, hash: "h", lastSnapshotHash: "p", timestamp: "2026-11-05T00:00:00Z" };
  expect(metaSnapRecord({ ...base, blocks: ["abc", "def"] }).blockHashes).toEqual(["abc", "def"]);
  expect(metaSnapRecord({ ...base, blocks: ["abc", "def"] }).blocks).toBe(2);
  expect(metaSnapRecord({ ...base, blocks: [] }).blockHashes).toEqual([]);
  expect(metaSnapRecord(base).blockHashes).toEqual([]);
  expect(blockHashesOf({ blocks: ["x", 7, null] })).toEqual(["x"]); // only strings are hashes
});
```

- [ ] **Step 2: Run to verify it fails.** Expected: `blockHashes` undefined.

- [ ] **Step 3: Implement.** `blockHashesOf` filters `Array.isArray(blocks) ? blocks.filter((b) => typeof b === "string") : []`. Type `blocks` as `string[]` on both raw types (the explorer lists hashes; verified 2026-11-05). `metaSnapRecord` sets `blockHashes: blockHashesOf(s)`.

- [ ] **Step 4: Run** `npx vitest run src/data` — PASS, and `npm run typecheck` clean (the `unknown[]` → `string[]` change may surface callers; fix them to read strings).

- [ ] **Step 5: Commit** — `"Live feed: keep each snapshot's block hashes (the explorer lists them)"`.

---

### Task 3: The full read answers with blocks and tips (server)

**Files:**
- Create: `app/api/snapshot/decodeBlocks.ts`, `app/api/snapshot/decodeBlocks.test.ts`
- Modify: `app/api/snapshot/[ordinal]/route.ts` (add `blocks`, `tips` to the answer), `src/data/types.ts` (`SnapshotExact.blocks?: BlockRead[]; tips?: TipRead`)
- Create: `app/api/network/[address]/snapshots/[ordinal]/blocks/route.ts`
- Modify: `app/api/CLAUDE.md` (two route lines)

**Interfaces:**
- Consumes: `BlockRead`, `TipRead` from Task 1 (import type from `@/src/engine/domain/blockBraid`).
- Produces: `export function decodeBlocks(value: unknown): { blocks: BlockRead[]; tips: TipRead | null }` — reads a snapshot VALUE (global or metagraph: both carry `blocks[].block.{value:{parent,transactions},proofs}` and `tips.{remainedActive,deprecated}`). The DAG amounts are datum (÷1e8 to DAG) — `amount` is returned in DAG; `fee` in DAG. The block's own hash is NOT in the value: `decodeBlocks` returns blocks in list order with `hash: ""`, and the route fills hashes from the explorer record's `blocks` list IN THE SAME ORDER (verified: one block per record today; the route pairs by index and leaves `hash: ""` where the explorer lists fewer).
- `GET /api/network/[address]/snapshots/[ordinal]/blocks?net=` → `{ ordinal, blocks: BlockRead[], tips: TipRead | null }`, read from the metagraph's L0 (`${urls.l0}/snapshots/${ordinal}`, the directory's `urls` as `app/api/metagraphs/live.ts` reads them), `Cache-Control: public, max-age=86400, s-maxage=86400, immutable`, 404 for an address outside the catalog + unlisted list (the existing `[address]` gate), 503 `no-store` on upstream failure.

- [ ] **Step 1: Write the failing test** with a fixture cut from a real snapshot (save `value` of global 7,241,523's `blocks` + `tips` as `app/api/snapshot/__fixtures__/global-7241523.json` — the scratch copy from the brainstorm is under `/tmp/claude-1000/…/dagprobe/snaps/7241523.json`; trim to `blocks`, `tips`, `ordinal`, `height`, `subHeight`):

```ts
import { describe, it, expect } from "vitest";
import fixture from "./__fixtures__/global-7241523.json";
import { decodeBlocks } from "./decodeBlocks";

describe("decodeBlocks", () => {
  it("reads each block's two parents by height and hash, its transfers and signatures", () => {
    const { blocks, tips } = decodeBlocks(fixture);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].parents).toEqual([{ height: 61635, hash: expect.stringMatching(/^8352a78d04/) }, { height: 61635, hash: expect.stringMatching(/^edc6373927/) }]);
    expect(blocks[0].height).toBe(61636);
    expect(blocks[0].txCount).toBe(1);
    expect(blocks[0].amount).toBeCloseTo(8450.12, 2);
    expect(blocks[0].signers).toBe(3);
    expect(tips?.active.map((t) => t.introducedAt)).toContain(7241162);
    expect(tips?.deprecated.length).toBe(13);
  });
  it("answers no blocks and null tips for a value that carries neither", () => {
    expect(decodeBlocks({ ordinal: 1 })).toEqual({ blocks: [], tips: null });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run app/api/snapshot/decodeBlocks.test.ts` — FAIL.

- [ ] **Step 3: Implement `decodeBlocks`**; `height` = `max(parent.height) + 1`; `amount`/`fee` summed over transactions, datum → DAG.

- [ ] **Step 4: Wire the global route**: in `app/api/snapshot/[ordinal]/route.ts`, after the existing decode, add `blocks` (hashes paired from the explorer record the route already reads for the ordinal — if it does not read one, add one `${be}/global-snapshots/${ordinal}` read, cached with the rest) and `tips` to the `SnapshotExact` answer. Keep the existing fields byte-identical.

- [ ] **Step 5: Add the metagraph route** at `app/api/network/[address]/snapshots/[ordinal]/blocks/route.ts`: resolve the address's L0 URL from the directory (`${NETWORKS[net].directory}/metagraphs/${address}?v=v2` → `data.urls.l0`, cached 5 min like `live.ts`), fetch `${l0}/snapshots/${ordinal}`, `decodeBlocks(json.value)`, pair hashes from `${be}/currency/${address}/snapshots/${ordinal}`'s `blocks`. `unstable_cache` keyed by net+address+ordinal, revalidate 86400.

- [ ] **Step 6: Verify live**: `curl -s "http://localhost:3000/api/snapshot/7241523" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.blocks?.length, j.blocks?.[0]?.hash?.slice(0,8), j.tips?.active?.length)})'` → `1 d8dd0bba 9`. And `curl -s "http://localhost:3000/api/network/DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM/snapshots/29649865/blocks"` → one block with two parents.

- [ ] **Step 7: Run** `npx vitest run app/api` and `npm run typecheck` — PASS.

- [ ] **Step 8: Commit** — `"Snapshot reads carry blocks and tips; a metagraph snapshot's blocks route"`.

---

### Task 4: The store: register, block selection, block reads, hover channel

**Files:**
- Modify: `src/store/store.ts` (fields + setters), `src/store/store.test.ts`
- Modify: `src/engine/domain/viewPolicy.ts` (`registers` field), `src/engine/domain/viewPolicy.test.ts`
- Modify: `src/data/ledgerMeasure.ts` → add `src/data/blockMeasure.ts` + test
- Modify: `components/selectionBoundary.test.ts` header (scope note: `setBlock` IN scope, `setLedgerRegister` OUT)

**Interfaces:**
- Produces (store):
  ```ts
  export type LedgerRegister = "snapshots" | "blocks";
  ledgerRegister: LedgerRegister;            // default "snapshots"
  setLedgerRegister(r: LedgerRegister): void; // a SETTING; stamps motionCause { kind: "register", id: r }
  export interface BlockSel { chain: string; hash: string; ordinal: number; anchorOrd: number } // chain "dag" or a metagraph id; ordinal = the accepting snapshot's own; anchorOrd = the global
  block: BlockSel | null;  setBlock(b: BlockSel | null): void;   // SELECTION (executor only)
  hoverBlock: string | null; setHoverBlock(hash: string | null): void; // hover channel
  blockReads: Record<string, { blocks: BlockRead[]; tips: TipRead | null }>; // keyed `${chain}:${ordinal}`; "dag:<ord>" mirrors snapshotExact
  setBlockRead(key: string, v: { blocks: BlockRead[]; tips: TipRead | null }): void; // data bridge
  blockMeasure: BlockMeasure; setBlockMeasure(m: BlockMeasure): void;
  ```
- `viewPolicy.registers: readonly LedgerRegister[]` — `["snapshots", "blocks"]` on `ledger`, `["snapshots"]` elsewhere (the default row). `motionCause` union gains `{ kind: "register"; id: LedgerRegister }` and `domain/motionHint.ts` words it: "Showing the blocks" / "Showing the snapshots".
- `src/data/blockMeasure.ts`: `export type BlockMeasure = "amount" | "fee" | "height"`, `BLOCK_MEASURE_ORDER`, `BLOCK_MEASURE_LABELS`, `BLOCK_MEASURE_OPTIONS` (same shape as `LEDGER_MEASURE_OPTIONS`), `blockMeasureValue(m, b: BlockRead): number | null`, `blockMeasureText(m, b): string` (amount/fee via `formatDag`, height `toLocaleString`).

- [ ] **Step 1: Write the failing tests**

```ts
// store.test.ts
it("holds the ledger register as a setting with a motion cause, and a block selection", () => {
  useStore.getState().setLedgerRegister("blocks");
  expect(useStore.getState().ledgerRegister).toBe("blocks");
  expect(useStore.getState().motionCause).toEqual({ kind: "register", id: "blocks" });
  useStore.getState().setBlock({ chain: "dag", hash: "h", ordinal: 7241523, anchorOrd: 7241523 });
  expect(useStore.getState().block?.hash).toBe("h");
  useStore.getState().setBlockRead("dag:7241523", { blocks: [], tips: null });
  expect(useStore.getState().blockReads["dag:7241523"]).toEqual({ blocks: [], tips: null });
});
it("leaving the Snapshots view clears the block, as it clears the pin", () => {
  useStore.getState().setBlock({ chain: "dag", hash: "h", ordinal: 1, anchorOrd: 1 });
  useStore.getState().setMode("geo");
  expect(useStore.getState().block).toBeNull();
});
// viewPolicy.test.ts
it("only the Snapshots view offers the Blocks register", () => {
  expect(VIEW_POLICIES.ledger.registers).toEqual(["snapshots", "blocks"]);
  for (const m of ["hyper", "geo", "trend", "soon"] as const) expect(VIEW_POLICIES[m].registers).toEqual(["snapshots"]);
});
// blockMeasure.test.ts
it("orders amount · fee · height and formats each", () => {
  expect(BLOCK_MEASURE_ORDER).toEqual(["amount", "fee", "height"]);
  const b = { hash: "h", height: 61636, parents: [], txCount: 1, amount: 8450.12, fee: 0.01, signers: 3 };
  expect(blockMeasureValue("height", b)).toBe(61636);
  expect(blockMeasureText("amount", b)).toBe(formatDag(8450.12));
});
```

- [ ] **Step 2: Run** the three test files — FAIL.
- [ ] **Step 3: Implement.** Follow `trendMetric`/`setTrendMetric` and `metaSnap`/`setMetaSnap`'s shapes exactly; `setMode` clears `block` where it clears `metaSnap`. Add `setBlock` to `selectionBoundary.test.ts`'s in-scope setters and `setLedgerRegister` to its out-of-scope note.
- [ ] **Step 4: Run** `npx vitest run src/store src/engine/domain/viewPolicy.test.ts src/data/blockMeasure.test.ts components/selectionBoundary.test.ts src/data/dataExportCoverage.test.ts` — PASS; `npm run typecheck` clean.
- [ ] **Step 5: Commit** — `"Store: the ledger register, the block selection and reads, block measures"`.

---

### Task 5: The block window — the register's ledger source (pure)

**Files:**
- Create: `src/data/blockWindow.ts`, `src/data/blockWindow.test.ts`
- Modify: `src/data/pastWindow.ts` (`ledgerSource` takes the register; `pastWanted` gains `register`)
- Test: `src/data/pastWindow.test.ts`

**Interfaces:**
- Consumes: `LedgerSource`, `PastWindow` (`src/data/pastWindow.ts`), `GlobalSnapshot`, `RawMetaSnapshot`, `Anchor`, `SnapshotExact`.
- Produces:
  ```ts
  export interface BlockTick { ord: number; ts: string; hash: string; blocks: string[];                 // the global's own block hashes
    metaSnaps: Record<string, RawMetaSnapshot[]> }                                                          // block-bearing metagraph snapshots anchored into it, by chain id
  export interface BlockWindowAnswer { ticks: BlockTick[]; chains: string[] }                             // newest first from the route
  export interface BlockWindow extends LedgerSource { ticks: BlockTick[]; from: number; to: number; holds(ordinal: number): boolean;
    blockTick(ord: number): BlockTick | null }
  export function foldBlockWindow(answer: BlockWindowAnswer, exact: Readonly<Record<number, SnapshotExact>>): BlockWindow
  export function blockWanted(s: { ledger: boolean; register: LedgerRegister; pin: number | null; held: { from: number; to: number } | null; liveNewest: number | null }):
    { kind: "clear" } | { kind: "keep" } | { kind: "fetch"; around: number | null }   // around = the pin, or null for the live edge
  export const BLOCK_WINDOW_TICKS = 52;
  ```
  `ledgerSource(live, register)`: `register === "blocks" ? (heldBlockWindow ?? null) : (held ?? live)` — the Blocks register never falls back to the live buffer (its ticks are the wrong set); with no window yet the chamber draws nothing and the HUD says "reading…". `getPastWindow`/`setPastWindow` gain siblings `getBlockWindow`/`setBlockWindow`/`onBlockWindow`.
  `getAnchor(ts)` in a block window: from `exact[ord].perMeta` when landed, else the floor folded from the tick's block-bearing `metaSnaps` (count per chain), `touched: 0`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("foldBlockWindow", () => {
  const tick = (ord: number, blocks: string[], meta: Record<string, RawMetaSnapshot[]> = {}) => ({ ord, ts: new Date(ord * 10_000).toISOString(), hash: "g" + ord, blocks, metaSnaps: meta });
  const dor = (ordinal: number, blocks: string[]) => ({ ordinal, hash: "m" + ordinal, lastSnapshotHash: "", timestamp: "", blocks });
  it("one slot for a global that holds a DAG block AND an anchored token block", () => {
    const w = foldBlockWindow({ ticks: [tick(200, ["d1"], { dor: [dor(5, ["t1"])] }), tick(100, ["d0"])], chains: ["dag", "dor"] }, {});
    expect(w.globalSnapshots.map((g) => g.ordinal)).toEqual([100, 200]); // oldest → newest, as the live buffer holds them
    expect(w.blockTick(200)?.blocks).toEqual(["d1"]);
    expect(w.metaSnaps.get("dor")?.[0].blockHashes).toEqual(["t1"]);
    expect(w.holds(200)).toBe(true); expect(w.holds(150)).toBe(false);
  });
  it("anchors read the exact fold where it landed, else the block-bearing floor", () => {
    const w = foldBlockWindow({ ticks: [tick(200, [], { dor: [dor(5, ["t1"]), dor(6, ["t2"])] })], chains: ["dag", "dor"] },
      { 200: { ordinal: 200, perMeta: { dor: { count: 13, fee: 0, bytes: 0 } } } as unknown as SnapshotExact });
    expect(w.getAnchor(w.globalSnapshots[0].timestamp)?.metaCounts.get("dor")).toBe(13);
    const floor = foldBlockWindow({ ticks: [tick(200, [], { dor: [dor(5, ["t1"]), dor(6, ["t2"])] })], chains: ["dag", "dor"] }, {});
    expect(floor.getAnchor(floor.globalSnapshots[0].timestamp)?.metaCounts.get("dor")).toBe(2);
  });
});
describe("blockWanted", () => {
  it("fetches around the live edge on entering the register, keeps a held window that holds the pin, re-centres on a pin outside it", () => {
    expect(blockWanted({ ledger: true, register: "blocks", pin: null, held: null, liveNewest: 900 })).toEqual({ kind: "fetch", around: null });
    expect(blockWanted({ ledger: true, register: "blocks", pin: 500, held: { from: 400, to: 900 }, liveNewest: 900 })).toEqual({ kind: "keep" });
    expect(blockWanted({ ledger: true, register: "blocks", pin: 50, held: { from: 400, to: 900 }, liveNewest: 900 })).toEqual({ kind: "fetch", around: 50 });
    expect(blockWanted({ ledger: true, register: "snapshots", pin: 50, held: null, liveNewest: 900 })).toEqual({ kind: "clear" });
    expect(blockWanted({ ledger: false, register: "blocks", pin: null, held: null, liveNewest: 900 })).toEqual({ kind: "clear" });
  });
});
// pastWindow.test.ts additions
it("pastWanted never fetches a past window in the Blocks register", () => {
  expect(pastWanted({ ledger: true, following: false, pin: 5, liveOldest: 100, held: null, register: "blocks" })).toEqual({ kind: "clear" });
});
it("ledgerSource answers the block window alone in the Blocks register, never the live buffer", () => {
  setBlockWindow(null);
  expect(ledgerSource(LIVE_STUB, "blocks")).toBeNull();
  expect(ledgerSource(LIVE_STUB, "snapshots")).toBe(LIVE_STUB);
});
```
(`Anchor` is `src/data/types.ts:136`: `fee`, `count`, `metaIds: Set<string>`, `metaCounts: Map<string, number>`, `touched`.)

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `blockWindow.ts`; extend `pastWindow.ts` (`pastWanted` returns `clear` when `s.register === "blocks"`; `ledgerSource(live, register = "snapshots")`). Update the Engine's one `ledgerSource(getNetwork())` call site (`src/engine/Engine.ts:719`) and `useLedgerSource` to pass `useStore.getState().ledgerRegister`; the executor's and bridges' `pastWanted` callers pass `register`.
- [ ] **Step 4: Run** `npx vitest run src/data` + `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** — `"Block window: the Blocks register's ledger source, folded pure"`.

---

### Task 6: The trail route and the bridge that fills the block window

**Files:**
- Create: `app/api/blocks/trail/route.ts`, `app/api/blocks/trail.ts` (pure assembly, testable), `app/api/blocks/trail.test.ts`
- Create: `components/BlockWindowBridge.tsx`
- Modify: `components/AppShell.tsx` (mount the bridge beside `PastWindowBridge`), `src/data/feedUse.ts` (feed id `"api-blocks"`), `src/data/sceneFeeds.ts` (the chamber holds it in the Blocks register), `components/feedReadBoundary.test.ts` EXEMPT (`BlockWindowBridge.tsx`: "the block window's FETCHER, draws nothing")

**Interfaces:**
- Route: `GET /api/blocks/trail?net=&around=<ordinal|live>&n=52` → `BlockWindowAnswer` (Task 5). Assembly (`trail.ts`): `export async function assembleTrail(deps: TrailDeps, around: number | null, n: number): Promise<BlockWindowAnswer>` where `TrailDeps = { transfers(chain: "dag" | string, next?: string): Promise<{ rows: { snapshotOrdinal: number; globalSnapshotOrdinal?: number; blockHash: string }[]; next?: string }>; global(ordinal: number): Promise<GlobalSnapshot>; metaSnap(chain: string, ordinal: number): Promise<RawMetaSnapshot>; chains(): Promise<string[]> }`. Pages each chain's transfer list from the tip (or from the first page at/below `around`, by the explorer cursor the sampler already crafts — `app/api/trends/fetchSince.ts`'s `listBetween` is the precedent) until `n` distinct block ticks are gathered across chains; a token row's tick is `globalSnapshotOrdinal`; reads each tick's global record and each block-bearing metagraph snapshot's record. `Cache-Control: public, s-maxage=30, stale-while-revalidate=30` for `around=live`; a day for an explicit ordinal (the past is immutable). 503 `no-store` on any failed read (a hole must not be cached as "no blocks").
- Bridge: subscribes to `mode`, `ledgerRegister`, `snapOrd`, `following`; runs `blockWanted`; fetches through `netUrl("/api/blocks/trail?…")`; `setBlockWindow(foldBlockWindow(answer, getState().snapshotExact))` and re-folds on `snapshotExact` change (cheap: the fold is O(ticks)); on `"clear"` sets null; retries on `pastRetryDelay`'s schedule; reports `reportPoll("api-blocks", ok)`; refreshes `around=live` every `POLL.metaSnapTail`-style interval (30 s) while following, appending new block ticks the live feed announced (a global whose `blocks` is non-empty or whose anchored records carry hashes → the bridge adds the tick from the feed at once and lets the next refresh fill its records).

- [ ] **Step 1: Write the failing test** for `assembleTrail` with stub deps: two chains, DAG rows at ticks 300, 200, 100; DOR rows anchored at 250 and 200 → ticks `[300, 250, 200, 100]` newest first, tick 200 holding both a DAG block and a DOR snapshot; `n = 3` stops at `[300, 250, 200]`; a DOR row whose `globalSnapshotOrdinal` is absent is skipped (not invented).

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** route + bridge. **Step 4:** `npx vitest run app/api/blocks components/feedReadBoundary.test.ts src/net/netUrlBoundary.test.ts` — PASS; live: `curl -s "http://localhost:3000/api/blocks/trail?net=mainnet&around=live&n=10" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.ticks.length, j.ticks[0].ord, j.ticks.map(t=>t.blocks.length+"+"+Object.keys(t.metaSnaps).length).join(" "))})'` → 10 ticks.
- [ ] **Step 5: Commit** — `"Block trail route and the bridge that holds the block window"`.

---

### Task 7: The chamber draws the register — blocks, links, tips, silent stretches

**Files:**
- Create: `src/engine/scene/objects/BlockTier.ts` (instanced blocks + links + tip pulse), `src/engine/scene/objects/SilentStretch.ts` (the gap marks between slots)
- Modify: `src/engine/scene/views/LedgerView.ts` (`setRegister`, `setBlockWindow`, `setBlockReads`, `setHoveredBlock`, `setSelectedBlock`; a `tileAnchorOf(metaId, tickTs, k, out)` method extracted from the `_selTilePos` arithmetic; the register dispatch in `update`)
- Modify: `src/engine/Engine.ts` (store subscriptions → the four setters; `sceneFeeds`), `src/engine/Picking.ts` (block pick → `hoverBlock` / click), `src/engine/domain/pickActions.ts` + test (`blockSelectActions`, `blockClearActions`), `src/store/applyClickActions.ts` + test (`"block"` action kind)
- Modify: `src/engine/scene/CLAUDE.md` (a "The Blocks register" subsection)

**Interfaces:**
- `LedgerView.setRegister(r: LedgerRegister)`, `setBlockWindow(w: BlockWindow | null)`, `setBlockReads(r: Record<string, { blocks: BlockRead[]; tips: TipRead | null }>)`, `setHoveredBlock(hash: string | null)`, `setSelectedBlock(hash: string | null)`.
- `BlockTier`: `constructor(ctx, maxBlocks = 600)`; `rebuild(items: { hash: string; chain: string; x: number; y: number; z: number; state: TipState | null; hue: number }[], links: Float32Array)` (event-time); `setEmphasis(hovered: string | null, selected: string | null)`; `update(dt, alpha)` writes every instance slot or zero-scales it (the chamber's discipline); the open-tip breath rides the calm beat the live edge uses.
- Block placement (in `LedgerView`): a DAG block stands on its tick's slot at the floor (`LEAD_X − slot·SLOT_SP`, `FLOOR_Y.gl0 + lift`, `laneZ(laneOf(height, minHeight), BRAID_LANES, LANE_HALF_Z·2)`); a token block on its metagraph snapshot's tile — `tileAnchorOf(chain, tickTs, k, out)` with `k` the tile index of that snapshot within the tick's lane block, z then nudged by lane — the tile is still drawn under it. `minHeight` per chain = the lowest height in the window.
- `pickActions`: `blockSelectActions(b: BlockSel, current: { block: BlockSel | null; snapOrd: number | null }): ClickAction[]` → toggles the block and pins its accepting global (`snap` select with the existing action, so the tick is the card above); `blockClearActions(current)` releases the block alone. `clickActions` dispatches `kind: "block"` picks. Executor: `{ type: "block", sel }` → `setBlock`; `motionCauseOf` names it (`finestRung` "block" → hint "the block").
- Honesty: a tick whose read has not landed shows its blocks (from the feed's hashes) with no links; `tipStateOf(hash, tips)` with the chain's frontier read (Task 9) — `null` draws the resting block look, never "open".

- [ ] **Step 1: Write the failing tests** — `pickActions.test.ts`: `blockSelectActions` on a new block emits `[snapshot select 7241523, block select]` in that order; on the same block emits `[block clear]`; `applyClickActions.test.ts`: `block` writes `store.block` and nothing else; `sceneView.test.ts`/`sceneViewContract.test.ts` still pass with the new objects (no `Mode` compares, no root `visible` writes).
- [ ] **Step 2: Run** — FAIL on the new builders.
- [ ] **Step 3: Implement** the builders, the executor case, `BlockTier`, `SilentStretch` (one `LineSegments` of dashed stretches between adjacent slots whose `silentRun` is non-null, plus a sprite label per stretch over 200 snapshots, rebuilt event-time on `setBlockWindow`), the `LedgerView` setters and the dispatch: `update()` calls `this._blocks.update(dt, alpha)` only in the Blocks register; `setData` in the Blocks register takes the block window's globals. Engine subscriptions mirror the `metaSnap` ones.
- [ ] **Step 4: Run** `npx vitest run src/engine src/store` — PASS (including `noFrameAllocations`, `rowBoundary`, `sceneViewContract`). `npm run typecheck`.
- [ ] **Step 5: Verify live** (full reload — singleton edit): `window.__dagStore.getState().setMode("ledger"); setLedgerRegister("blocks")`; after the window lands, `__dagEngine.ledger` has blocks visible, links present on ticks with landed reads, a `[CSS canary]`-free console; screenshot at 1600×950.
- [ ] **Step 6: Commit** — `"Snapshots chamber: the Blocks register's tier — blocks on their snapshots, links, tips, silent stretches"`.

---

### Task 8: Switching registers — the executor's one rule, the URL, the tour

**Files:**
- Modify: `src/engine/domain/pickActions.ts` + test (`registerSwitchActions`), `src/store/store.ts` (`setLedgerRegister` releases through the executor's rule), `components/views.ts` + test (`REGISTER_PATHS`: `/blocks` → `{ mode: "ledger", register: "blocks" }`; `pathFor(mode, register)`), `components/RouteSync.tsx` (seed + publish the register; `track("view-switch", { to: "/blocks" })`), `app/[view]/page.tsx` + `app/sitemap.ts` + `components/FooterViewLinks.tsx` (the `/blocks` entry: name "Blocks", desc "The Constellation Network's block DAG in 3D: every transfer's block built on two before it, accepted into the snapshot chain."), `src/engine/domain/briefing.ts` + test (`BRIEFING_STOPS` entries become `{ mode, register? }`; a `blocks` stop after `ledger`), `components/Briefing.tsx`, `components/notes/briefingNote.ts`
- Test: `components/views.test.ts` (new), `src/engine/domain/briefing.test.ts`

**Interfaces:**
- `registerSwitchActions(to: LedgerRegister, current: { block: BlockSel | null; metaSnap: MetaSnapSel | null }): ClickAction[]` — leaving Blocks releases `block`; leaving Snapshots releases `metaSnap` (the other register cannot draw it; the pin and `tickNet` stay). `setLedgerRegister` applies them through `applyClickActions` BEFORE setting the field (a setting that releases subjects does so through the one executor, the `setTrendRange`/focus precedent).
- `BRIEFING_STOPS: readonly { mode: Mode; register?: LedgerRegister }[]` = geo, ledger, ledger+blocks, hyper, trend; `briefingReq(stop)` maps the blocks stop to note kind `"blocks"` (Task 10).

- [ ] **Step 1: Write the failing tests** — `registerSwitchActions("blocks", { block: null, metaSnap: M })` → `[metaSnap clear]`; `("snapshots", { block: B, metaSnap: null })` → `[block clear]`; `pathFor("ledger", "blocks")` → `"/blocks"`; `modeForPath("/blocks")` → `"ledger"` and `registerForPath("/blocks")` → `"blocks"`; `BRIEFING_STOPS[2]` → `{ mode: "ledger", register: "blocks" }`; `nextStop`/`prevStop` unchanged in shape.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** `RouteSync` publishes `/blocks` when `mode === "ledger" && ledgerRegister === "blocks"`, `/snapshots` otherwise; seeding `/blocks` sets both. `generateStaticParams` includes `blocks`. The Briefing's stop switch calls `setMode` then `setLedgerRegister`.
- [ ] **Step 4: Run** `npx vitest run components/views.test.ts src/engine/domain/briefing.test.ts src/engine/domain/pickActions.test.ts components/selectionBoundary.test.ts` — PASS. Live: open `http://localhost:3000/blocks` → Snapshots in the Blocks register; the address bar follows the toggle.
- [ ] **Step 5: Commit** — `"Register switch: one release rule, /blocks deep link, a Briefing stop"`.

---

### Task 9: The HUD — register control, explorer, block card, band, RAW

**Files:**
- Create: `components/explorer/RegisterSwitch.tsx` (two cells in the control band's segmented grammar, above the measure tiles; `aria-pressed`; icons from `components/icons.tsx` — add `blocks: Boxes` or the lucide glyph the view uses, keyed in `MEASURE_ICONS`'s sibling map `REGISTER_ICONS`)
- Modify: `components/LedgerPanel.tsx` (levels keyed by register: Blocks root = block rows; measure control keyed by register), `components/railCards.ts` (+ test: `block` slot after `metaSnap` in `ledger`'s lane; ghost hint "Click a block in the chamber or its row in the explorer"), `components/Inspector.tsx` / `components/InspectorCard.tsx` (the `block` slot → `BlockPane`), `components/railCollapse.ts` (+ test: a block commit opens its card)
- Create: `components/inspector/BlockPane.tsx` (six slots: head "Block" + height chip; lead "Moved N DAG in M transfers" / "Accepted into global N"; breakdown rows per transfer (from → to, amount, fee) when several; facts: height, sub-height, parents (two hashes, short), children (count built on it), signatures; doors: "Snapshot records" (the anchor log at its tick, through `trendDoors`' sibling `ledgerDoors`), foot: hash, parents' hashes)
- Modify: `components/vitals/viewCells.tsx` (ledger cells keyed by register: Blocks = BLOCKS LAST HOUR (count + sparkline over the window), OPEN TIPS (per chain, identity dots), HEIGHT (the DAG's, with sub-height), FRONTIER AGE), `src/data/blockStats.ts` + test (`blocksPerHour(ticks, nowMs)`, `openTipsByChain(reads)`, `frontierAge(read, nowMs)`)
- Modify: `components/datasection/RecordsSurface.tsx` (ledger table keyed by register → `datasection/BlocksTable.tsx`: one row per block, grouped by accepting global with `GroupToggle`, columns CHAIN · BLOCK · AMOUNT · FEE · HEIGHT · ACCEPTED INTO; the selected block says PINNED), `components/rawSurfaceBoundary.test.ts` (unchanged policy row; the register compare lives INSIDE the records surface, as the mode compare does)
- Modify: `src/data/feedUse.ts` readers; `components/feedReadBoundary.test.ts` passes (each surface holds `api-blocks`)
- Modify: `components/CLAUDE.md` (the register paragraph under the Snapshots explorer rules)

**Interfaces:**
- Consumes: store fields (Task 4), `BlockWindow` (Task 5), `blockMeasure*` (Task 4), `blockSelectActions` (Task 7).
- Produces: `blockStats.ts` exports above; `BlocksTable` default export; `BlockPane` default export.

- [ ] **Step 1: Write the failing tests** — `railCards.test.ts`: `ledger` lane is `["notes", "snap", "context", "metaSnap", "block", "node"]`, `block` has no rung, its hint names the gesture; `blockStats.test.ts`: `blocksPerHour` counts blocks whose tick is within the last hour of `nowMs`; `openTipsByChain` reads `tips.active.length` per chain and `null` where no frontier read; `frontierAge` returns the ms since the read's snapshot timestamp; `LedgerPanel` test (if one exists; else `explorer` tests): in the Blocks register the root level's rows are the window's blocks newest first and the measure control is `BLOCK_MEASURE_OPTIONS`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** each surface. `RegisterSwitch` writes `setLedgerRegister` directly (a setting). Rows run `blockSelectActions` through the executor. The band's ledger branch in `ViewCells` reads `ledgerRegister` and renders the Blocks cells in `RollSwap` keyed by register so the swap rolls.
- [ ] **Step 4: Run** `npx vitest run components src/data` + `npm run typecheck` — PASS.
- [ ] **Step 5: Verify live** at 1600×950, 1000×800 (tablet sheet) and 390×844 (phone dock): the control band shows "Snapshots | Blocks"; Blocks lists blocks; a row click pins the tick and opens the Block card under the Global snapshot card; the band shows the four cells; RAW shows the blocks table. Screenshots into the scratchpad.
- [ ] **Step 6: Commit** — `"Blocks register HUD: the control, the explorer's blocks, the block card, the band, RAW"`.

---

### Task 10: The frontier read, the hover pairing and the block's AI note

**Files:**
- Modify: `components/BlockWindowBridge.tsx` (frontier: the DAG's from the live tick's exact read — `snapshotExact[liveOrd].tips`; each token chain's from `/api/network/[address]/snapshots/latest/blocks` once a minute while the register is on; stored in `blockReads` under `${chain}:frontier`), `app/api/network/[address]/snapshots/[ordinal]/blocks/route.ts` (accept `latest`: resolve through the L0's `/snapshots/latest`, `s-maxage=25`)
- Modify: `components/useSubjectPairing.ts` + test (the `hoverBlock` channel: explorer row ↔ chamber block ↔ RAW row ↔ card, `.subject-paired`), `src/engine/Picking.ts` (hover writes `setHoverBlock` on a block pick)
- Modify: `app/api/notes/keys.ts` (`NoteKind` + `"blocks"`, `KIND_TIMING.blocks` = the ledger's hourly timing), `app/api/notes/prompts.ts` (`PROMPTS.blocks`: the question "What has the block DAG been doing?" in the ledger prompt's voice), `src/data/noteFactsBlocks.ts` + test (facts: blocks in the last 24 h per chain from History's `g.tx`/`m.<id>.tx` daily buckets — the sampler's own series — plus the frontier's open tips, the DAG's height and sub-height; every figure a fact the gate can check), `app/api/notes/sources.ts` (the facts' reads), `app/api/notes/warm.ts` (the blocks note is warmed with the ledger's), `components/notes/briefingNote.ts` (`blocks` → `NoteReq { view: "blocks" }`), `NOTES_VERSION` +1 (`app/api/notes/keys.ts` + its test)
- Modify: `app/api/CLAUDE.md` (the note kind, the frontier read)

**Interfaces:**
- `noteFactsBlocks(input: { txDaily: Record<string, (number | null)[]>; frontier: Record<string, TipRead | null>; height: number | null; subHeight: number | null; nowMs: number }): { facts: Fact[]; names: string[]; lead: NoteLead } | null` — null when no transfer series exists (rule 10: no note rather than a note about nothing).

- [ ] **Step 1: Write the failing tests** — `useSubjectPairing.test.ts`: hovering a block row writes `hoverBlock` and releases on leave; `noteFactsBlocks.test.ts`: with DAG 40/day and DOR 35/day and 12 + 12 open tips the facts name both chains and both counts, and null frontier yields no tip facts; `keys.test.ts`: `NOTES_VERSION` bumped and `"blocks"` has a timing.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run app/api/notes components src/data` — PASS. Live: in the Blocks register the band's OPEN TIPS fills within a minute; hovering an explorer row lights the block in the chamber; `NOTES_STORE=memory` dev run writes a blocks note for the tour stop.
- [ ] **Step 5: Commit** — `"Blocks register: the frontier read, the hover pairing, the block DAG's AI note"`.

---

### Task 11: Docs, boundary counts and the whole-branch gate

**Files:**
- Modify: `CLAUDE.md` (the Snapshots view paragraph: "with a second register, Blocks (2026-11-xx) …"; the `/blocks` route in the deep-link gotcha; `components/views.ts`'s register vocabulary), `src/engine/scene/CLAUDE.md`, `src/data/CLAUDE.md` (the block window as the third ledger source), `app/api/CLAUDE.md` (the three routes), `components/CLAUDE.md` (the register control; the block card's slots), `src/engine/domain/CLAUDE.md` (the block selection and the register switch's release rule)
- Modify: `.superpowers/sdd/progress.md` (the ledger entry)

- [ ] **Step 1:** Write the doc paragraphs (present tense; name the tests that pin each rule: `blockBraid.test.ts`, `blockWindow.test.ts`, `pickActions.test.ts`'s block block, `railCards.test.ts`).
- [ ] **Step 2:** `npm run typecheck && npx vitest run` — all green; `npx next build` clean with the dev server stopped (`/api/metagraphs` still `ƒ` with `s-maxage=300`).
- [ ] **Step 3:** Live pass: dark and paper (`data-theme`), reduced motion, 1600×950 / 1000×800 / 390×844; the tour from `/` plays five stops; `/blocks` deep link; a register switch with a metagraph snapshot pinned releases it and keeps the tick; the pulse strip's `api-blocks` lane lights only in the Blocks register.
- [ ] **Step 4:** Commit — `"Docs: the Blocks register"`; then the whole-branch review (`superpowers:requesting-code-review`) before the PR.

---

## Self-review notes

- Spec coverage: every "What the visitor gets" item maps to a task (1–2 → T7, 3 → T6+T7, 4 → T9, 5 → T7 lens via existing `setFilter`, 6 → T9, 7 → T9, 8 → T9, 9 → T8+T10). The "Decisions" section: third source → T5; pin follows → T5/T6; live token block via feed → T2/T6; frontier from newest snapshot → T10; lens → T7 (existing dim) + T9; control above tiles → T9; unlisted floor → T6 (`chains()` lists the DAG + listed currencies; the explorer's hint in T9 says so); block tier in the chamber → T7; keyed maps → T7/T9; one snapshot selection → T7.
- Type consistency: `BlockRead`/`TipRead` defined once (T1) and imported as types everywhere; `BlockSel` (T4) used by T7/T8/T9; `BlockWindow`/`foldBlockWindow`/`blockWanted` (T5) used by T6/T7; `LedgerRegister` (T4) used by T5/T8/T9.
- Names left to the implementer are those the spec lists as the builder's (route caching details, the frontier cadence constant, hover channel wiring inside Picking).
