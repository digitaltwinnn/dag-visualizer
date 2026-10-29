# DAG node types in the measured history — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The trends sampler stores the DAG core's nodes by layer and by make-up exactly as it does for every metagraph (`f.layer.dag.<role>`, `f.type.dag.<key>`), and History's DAG plane draws the make-up stack from them.

**Architecture:** The DAG's own nodes are the two validator clusters (global L0 and the DAG's currency L1) merged by node id, the rule the live Hypergraph already applies in `NetworkData._buildDagCore`. That merge moves into one pure function (`src/data/dagCore.ts`) both the client and the sampler call. The sampler reads the clusters through the live clusters route's own memoised reader (`app/api/live/upstream.ts` `memo` + `readClusters`, same key, so no extra upstream traffic) and tallies layers and types for the DAG with the same pure tally the metagraphs use (`app/api/trends/fleetTally.ts`). A failed cluster read omits the DAG's layer and type fields for that sample — an honest gap — and writes the rest of the fleet. The fleet-wide `f.layer.<role>` lines keep excluding validators (my call, agreed 2026-10-29: the existing history must not step on the day this ships).

**Tech Stack:** Next.js 16 route handlers, TypeScript, vitest.

**Spec:** agreed in chat 2026-10-29 (brainstorm playback; "go ahead with all of them"). No design document: a small change.

## Global Constraints

- Rule 4: every value export of a `src/data/` module is referenced by its sibling test (`src/data/dataExportCoverage.test.ts`); `src/data/dagCore.ts` is pure and needs no exemption.
- Rule 10: absent data is an absent field, never a zero. A failed cluster read writes NO `f.layer.dag.*` / `f.type.dag.*` for that sample.
- The DAG's L1 role key is `cl1` (the DAG's L1 IS its $DAG currency L1, `_buildDagCore`'s rule); the type key is `roleKey()` (`src/data/composition.ts`), never a new spelling.
- Fleet-wide `layers` (`f.layer.l0|cl1|dl1`) stays metagraph-only.
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- No Upstash writes from local runs; the sampler is exercised by its tests only.

## Review Focus

1. A validator present in both clusters with one id is ONE hybrid node (`l0+cl1`), never two — pinned in Task 1.
2. A cluster read that throws or returns an empty list leaves the DAG's layer/type fields absent and the rest of the fleet written — pinned in Task 2.
3. `layers` (fleet-wide) does not change when the DAG's nodes are tallied — pinned in Task 2.
4. The DAG's types sum to `perNet.dag` for the same node list — pinned in Task 2.
5. History's DAG row gets a stack only when `f.type.dag.*` fields exist (`typeBands` answers `[]` otherwise, already pinned in `trendSeries.test.ts`) — Task 3 removes the guard, no new assertion needed.

---

### Task 1: One merge rule for the DAG's two clusters

**Files:**
- Create: `src/data/dagCore.ts`, `src/data/dagCore.test.ts`
- Modify: `src/data/api.ts` (`_buildDagCore` delegates)

**Interfaces:**
- Produces: `export function mergeDagClusters(l0: readonly ClusterNode[], l1: readonly ClusterNode[]): DagNode[]` where `export interface DagNode { id: string; ip: string; state?: string; roles: string[]; layer: string }`. Roles sorted `l0` first; `layer = roles[0]`; `state` prefers the L0 entry's; `ip` is the first non-empty seen; entries without `id` are skipped; the result is sorted by `id` ascending (the scene places nodes by index).

- [ ] **Step 1: Write the failing test** — `src/data/dagCore.test.ts`: (a) a node in both lists is one node with `roles ["l0","cl1"]`, `layer "l0"`, the L0 `state`; (b) an L1-only node is `roles ["cl1"]`, `layer "cl1"`; (c) an entry without `id` is skipped; (d) output sorted by id regardless of input order; (e) an L0 entry with an empty `ip` takes the L1 entry's ip.
- [ ] **Step 2: Run** `npx vitest run src/data/dagCore.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `mergeDagClusters` by moving the body of `_buildDagCore`'s merge (keep its comments: "the DAG's L1 IS its $DAG currency-L1", the canonical-order rationale).
- [ ] **Step 4: `_buildDagCore`** returns `{ id: "dag", …, nodes: mergeDagClusters(l0, l1) }`.
- [ ] **Step 5: Run** `npx vitest run src/data` — PASS, coverage rule included.
- [ ] **Step 6: Commit** `refactor(data): the DAG's cluster merge is one pure function`.

### Task 2: The sampler tallies the DAG like a metagraph

**Files:**
- Create: `app/api/trends/fleetTally.ts`, `app/api/trends/fleetTally.test.ts`
- Modify: `app/api/trends/sample/route.ts` (`fleetCounts`)

**Interfaces:**
- Consumes: `mergeDagClusters` (Task 1); `memo`, `readClusters` from `app/api/live/upstream.ts`; `CLUSTER_WINDOW` from `app/api/live/windows.ts`; `roleKey` from `src/data/composition.ts`.
- Produces: `export function fleetTallies(metagraphs: readonly { id: string; nodes: readonly RoleNode[] }[], dagNodes: readonly RoleNode[] | null): { layers: Record<string, number>; perNetLayers: Record<string, Record<string, number>>; perNetTypes: Record<string, Record<string, number>> }` with `type RoleNode = { roles?: string[]; layer?: string | null }`. `layers` sums metagraph roles only; `perNetLayers`/`perNetTypes` carry every metagraph and, when `dagNodes` is non-null, `dag`.

- [ ] **Step 1: Write the failing test** — `fleetTally.test.ts`: (a) with `dagNodes` of one hybrid and two `cl1`-only, `perNetTypes.dag` is `{ "l0+cl1": 1, cl1: 2 }`, `perNetLayers.dag` is `{ l0: 1, cl1: 3 }`, and the types sum to 3; (b) `layers` is identical with `dagNodes` null and with those nodes; (c) with `dagNodes` null there is no `dag` key in either per-network record; (d) a metagraph's tally is unchanged from today (hybrid `l0+cl1+dl1` ×1 and `dl1` ×2 → `perNetLayers.m = { l0: 1, cl1: 1, dl1: 3 }`, `perNetTypes.m = { "l0+cl1+dl1": 1, dl1: 2 }`).
- [ ] **Step 2: Run** `npx vitest run app/api/trends/fleetTally.test.ts` — FAIL.
- [ ] **Step 3: Implement** `fleetTallies` (the loop now in `fleetCounts`, generalised; DAG appended when non-null).
- [ ] **Step 4: Wire the route**: in `fleetCounts`, read the clusters beside the two existing reads — `memo(`clusters:${net}`, CLUSTER_WINDOW.memoMs, () => readClusters(NETWORKS[net].l0, NETWORKS[net].l1))` inside its own try/catch answering `null` — then `const dagNodes = clusters ? mergeDagClusters(clusters.l0 as ClusterNode[], clusters.l1 as ClusterNode[]) : null;` and `const { layers, perNetLayers, perNetTypes } = fleetTallies(metagraphs, dagNodes)`. Update the comment that said per-layer validator attribution was not derivable (it is now, from the clusters; the FLEET-WIDE lines still exclude validators, by decision). `perNet.dag` stays `dagIps.length` (the geo map's count, the long-standing gauge).
- [ ] **Step 5: Run** `npm run typecheck && npx vitest run app/api/trends` — PASS.
- [ ] **Step 6: Commit** `feat(trends): the sampler stores the DAG's nodes by layer and make-up`.

### Task 3: History draws the DAG's make-up stack

**Files:**
- Modify: `components/useTrendRoster.ts:211` (drop `id !== "dag"` from the `stack` condition; keep the `UNLISTED_ID` exclusion and the `anchors` line as they are)
- Modify: `app/api/CLAUDE.md` (the trends sampler paragraph: `f.layer.<id>.*` and `f.type.<id>.*` now include `dag`, read from the clusters; fleet-wide layers remain metagraph-only; a failed cluster read is an absent field), `components/CLAUDE.md` if it states the DAG row has no stack (grep `stack` near "DAG").

- [ ] **Step 1: Edit** the condition and the docs.
- [ ] **Step 2: Run** `npm run typecheck && npx vitest run` — PASS (2199+ tests).
- [ ] **Step 3: Live check** on the worktree's dev server: `/trends` Nodes measure, the DAG plane shows no stack yet (no stored `f.type.dag.*`), no console error; `/hypergraph` DAG core unchanged (same node count as before Task 1).
- [ ] **Step 4: Commit** `feat(history): the DAG plane draws its make-up stack once sampled`.

### Not in this plan

- Lifting the two `dag/type:*` guards on PR #79 (`components/notes/subjectNote.ts` `typeNoteReq`, `app/api/notes/sources.ts` `hyperSelectionOf`) — after the sampler has written a day of `f.type.dag.*`, so the Composition card never shows a note it cannot write.
