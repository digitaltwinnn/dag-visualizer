# Shared Live Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the three live feeds (global snapshots, metagraph snapshots, DAG nodes) through our own edge-cached routes, so upstream load stops growing with the number of open tabs.

**Architecture:** New `app/api/live/*` routes read Constellation upstream behind a module-level 4 s memo and answer with `s-maxage` edge caching. `NetworkData` (`src/data/api.ts`) keeps its model and gap guarantees and only changes where it reads from; per-tab catch-up uses cached per-chain and per-limit routes. Beats are stamped with the data's own age from the edge's `Age` header.

**Tech Stack:** Next.js 16 App Router route handlers (Node runtime), TypeScript, Vitest (`node` environment).

**Spec:** `docs/superpowers/specs/2026-10-25-shared-live-feed-design.md`

## Global Constraints

- Poll interval stays `POLL.pollMs` = 5000; nodes `POLL.clusterMs` = 30000.
- `/api/live`: `Cache-Control: public, s-maxage=4, stale-while-revalidate=2`.
- `/api/live/clusters`: `Cache-Control: public, s-maxage=25, stale-while-revalidate=5`.
- `/api/live/meta/[id]` and `/api/live/globals`: `Cache-Control: public, s-maxage=4, stale-while-revalidate=2`.
- Shared answer: 12 globals; per chain the existing tail `POLL.metaSnapTail` (50).
- Catch-up and seed limits: globals `min(gap, POLL.maxSnapshots)` (52); chains as today's self-healing loop (×3, cap 600).
- In-function memo: module-level, per network, 4 s lifetime, checked against its own timestamp; concurrent misses share one in-flight promise. Never `unstable_cache` for it.
- Upstream failure of the global read → 503, nothing cached. A failed chain read → the chain listed in `failed`; the answer still 200.
- Every route resolves `netOf(req)`; every client fetch goes through `netUrl()` (fenced by `src/net/netUrlBoundary.test.ts`).
- No direct-to-Constellation fallback from the browser for these three feeds once a task moves them.
- Beat time = `receivedAt − (Age header s × 1000) − memoAgeMs`; if `Age` is absent, `receivedAt − memoAgeMs` (never the server's `builtAt` against the browser clock).
- User-facing copy is unchanged by this plan.

## Review Focus

1. A tab backgrounded for several minutes wakes with a jump of more than 12 globals and of more than 50 snapshots on a fast chain — expect no hole in either (Task 5 and Task 6 tests).
2. One unlisted or listed chain fails upstream while the rest succeed — expect the metagraph lane to report failure for that cycle, not success (Task 2 and Task 6 tests).
3. Two requests hit a cold function at the same moment — expect one upstream read, not two (Task 1 test).
4. The edge serves an answer that sat in the cache for 3 s — expect the beat stamped 3 s (plus memo age) before receipt, never in the future (Task 4 test).
5. Integrationnet or testnet via `?net=` — expect each route to read that network's hosts and key its memo per network (Task 1 and Task 3 tests).

---

### Task 1: The memo and the upstream readers

**Files:**
- Create: `app/api/live/upstream.ts`
- Test: `app/api/live/upstream.test.ts`

**Interfaces:**
- Produces:
  - `memo<T>(key: string, ttlMs: number, read: () => Promise<T>, now?: () => number): Promise<{ value: T; ageMs: number }>` — returns the cached value while `now() - at < ttlMs`, shares one in-flight promise across concurrent callers, does not cache a rejection.
  - `readGlobals(be: string, limit: number): Promise<GlobalSnapshot[]>` — `${be}/global-snapshots?limit=${limit}`, newest first as upstream returns it, 4000 ms timeout.
  - `readChain(be: string, id: string, limit: number): Promise<RawMetaSnapshot[]>` — `${be}/currency/${id}/snapshots?limit=${limit}`, 4000 ms timeout, `[]` when upstream has `data: []`.
  - `readClusters(l0: string, l1: string): Promise<{ l0: unknown[]; l1: unknown[] }>` — both `/cluster/info` in parallel, 4000 ms timeout each; throws unless both are non-empty arrays.
  - Types: `GlobalSnapshot` is `src/data/types.ts`'s. `RawMetaSnapshot` is today a module-private interface in `src/data/api.ts` (line ~183): move it to `src/data/types.ts`, export it, and import it in both places — one definition.

- [ ] **Step 1: Write the failing tests** in `upstream.test.ts`:
  - `memo` returns the same value inside the ttl and calls `read` once (`read` call count 1 after two calls at t=0 and t=3999).
  - `memo` calls `read` again at t=4000 and returns `ageMs` 0 for the fresh value, 3000 for a value read at t=0 and served at t=3000.
  - two concurrent `memo` calls before `read` resolves → `read` called once.
  - a rejected `read` is not cached: the next call calls `read` again.
  - `readGlobals("https://be.x", 12)` fetches exactly `https://be.x/global-snapshots?limit=12` (mock `fetch` with `vi.stubGlobal`).
  - `readClusters` throws when either side is an empty array.
- [ ] **Step 2: Run** `npx vitest run app/api/live/upstream.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement** the four functions in `app/api/live/upstream.ts`; the timeout via `AbortSignal.timeout(4000)`; `fetch(..., { cache: "no-store" })`.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(live): memo and upstream readers for the shared live feed`.

### Task 2: The shared answer — `/api/live`

**Files:**
- Create: `app/api/live/assemble.ts`, `app/api/live/route.ts`, `app/api/live/quiet.ts`
- Test: `app/api/live/assemble.test.ts`, `app/api/live/quiet.test.ts`

**Interfaces:**
- Consumes: Task 1 `memo`, `readGlobals`, `readChain`; `unlistedChains(net)` (`app/api/network/unlistedChains.ts`); `activeRows`, `sampledIds(net)` (`src/net/lineage.ts`); `RETIRE_QUIET_DAYS` (`src/net/retire.ts`); `netOf(req)` (`src/net/request.ts`); `NETWORKS[net].be`.
- Produces:
  - `type LiveAnswer = { globals: GlobalSnapshot[]; metas: Record<string, RawMetaSnapshot[]>; unlisted: string[]; failed: string[]; memoAgeMs: number }` — `globals` newest first (12), `metas` keyed by chain id, `unlisted` = the unlisted ids included, `failed` = chain ids whose read threw.
  - `isQuiet(list: RawMetaSnapshot[], now: number): boolean` in `quiet.ts` — true for an empty list or a newest `timestamp` at least `RETIRE_QUIET_DAYS` days before `now` (the client's rule in `_refreshOneMeta`, line ~542/550).
  - `assembleLive(read: { globals: () => Promise<GlobalSnapshot[]>; chain: (id: string) => Promise<RawMetaSnapshot[]> }, listed: string[], unlisted: string[]): Promise<Omit<LiveAnswer, "memoAgeMs">>` — pure over its readers: globals read first and allowed to throw; chains in parallel with `Promise.allSettled`; a rejected chain goes to `failed`; a quiet unlisted chain is left out of `metas`.
  - `GET /api/live?net=` → 200 `LiveAnswer` with the Global Constraints header; 503 `{ error }` with `Cache-Control: no-store` when the globals read throws.
  - A module-level quiet set per network in `route.ts`, rebuilt hourly (same `UNLISTED_LIST_MS` = 3_600_000 cadence as the client): a chain found quiet is skipped until the next rebuild.

- [ ] **Step 1: Write the failing tests:**
  - `quiet.test.ts`: `isQuiet([], now)` true; newest 8 days old true; newest 6 days old false.
  - `assemble.test.ts`: two listed chains, one rejects → `failed` equals `["B"]`, `metas.A` present; globals reader throws → `assembleLive` rejects; an unlisted chain whose list is quiet is absent from `metas` and from `failed`.
- [ ] **Step 2: Run** `npx vitest run app/api/live/assemble.test.ts app/api/live/quiet.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `quiet.ts`, `assemble.ts`, then `route.ts`: `export const runtime = "nodejs"; export const maxDuration = 30;` the handler wraps `assembleLive` in `memo(\`live:${net}\`, 4000, …)` and adds `memoAgeMs` from the memo. Listed ids are `sampledIds(net)`.
- [ ] **Step 4: Run** the tests — expect PASS; run `npm run typecheck` — expect no errors.
- [ ] **Step 5: Commit** `feat(live): /api/live — the shared global + metagraph answer`.

### Task 3: Catch-up and node routes

**Files:**
- Create: `app/api/live/globals/route.ts`, `app/api/live/meta/[id]/route.ts`, `app/api/live/clusters/route.ts`
- Test: `app/api/live/routes.test.ts`

**Interfaces:**
- Consumes: Task 1 `memo`, `readGlobals`, `readChain`, `readClusters`; `netOf`; `NETWORKS`; `isTracked(net, id)` (`src/net/lineage.ts`) and `unlistedChains(net)`.
- Produces:
  - `GET /api/live/globals?limit=N&net=` → `{ globals, memoAgeMs }`; `limit` clamped to 1..`POLL.maxSnapshots`; memo key `globals:${net}:${limit}`.
  - `GET /api/live/meta/[id]?limit=N&net=` → `{ snapshots, memoAgeMs }`; `limit` clamped to 1..600; 404 unless `isTracked(net, id)` or `id` is in `unlistedChains(net)` (so the route is not an open proxy); memo key `meta:${net}:${id}:${limit}`.
  - `GET /api/live/clusters?net=` → `{ l0, l1, memoAgeMs }` with the clusters header; memo key `clusters:${net}`, ttl 25000; 503 `no-store` on failure.

- [ ] **Step 1: Write the failing tests** (import each route's `GET`, stub `fetch`): `limit=999` on globals reads `limit=52`; an untracked id on meta → 404 and no upstream fetch; clusters with an empty `l1` → 503 with `Cache-Control: no-store`; `?net=integrationnet` on clusters fetches `https://l0-lb-integrationnet.constellationnetwork.io/cluster/info`.
- [ ] **Step 2: Run** `npx vitest run app/api/live/routes.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the three handlers with the Global Constraints headers.
- [ ] **Step 4: Run** the tests — expect PASS.
- [ ] **Step 5: Commit** `feat(live): catch-up (globals, per chain) and node routes`.

### Task 4: Beats carry the data's own time

**Files:**
- Modify: `src/data/api.ts` (`reportPoll`, `_fetchJson`)
- Create: `src/data/liveAge.ts`
- Test: `src/data/liveAge.test.ts`, `src/data/api.test.ts`

**Interfaces:**
- Produces:
  - `dataTime(receivedAt: number, ageHeader: string | null, memoAgeMs: number | undefined): number` in `liveAge.ts` — `receivedAt − ageS×1000 − (memoAgeMs ?? 0)`, where a missing or non-numeric header counts 0; never later than `receivedAt`.
  - `reportPoll(id: FeedId, ok: boolean, at?: number): void` — `at` defaults to `Date.now()`; sets `lastOkAt`/`lastErrAt` and the beat to `at`; the beat list stays sorted by `at` (insert in order, then trim by `BEAT_KEEP_MS`/`BEAT_CAP` as now).
  - `NetworkData._fetchLive(path: string): Promise<{ json: any; at: number }>` — fetches `netUrl(path)`, returns the body and `dataTime(Date.now(), res.headers.get("age"), json.memoAgeMs)`.

- [ ] **Step 1: Write the failing tests:**
  - `liveAge.test.ts`: `dataTime(10_000, "3", 500)` = 6_500; `dataTime(10_000, null, 0)` = 10_000; `dataTime(10_000, "x", undefined)` = 10_000.
  - `api.test.ts`: `reportPoll("global", true, t0 + 1000)` then `reportPoll("global", true, t0)` → beats ordered `[t0, t0 + 1000]` and `lastOkAt` = `t0 + 1000`.
- [ ] **Step 2: Run** `npx vitest run src/data/liveAge.test.ts src/data/api.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `liveAge.ts`, the `at` parameter (keep `lastOkAt` the max of old and new), and `_fetchLive`.
- [ ] **Step 4: Run** the tests — expect PASS.
- [ ] **Step 5: Commit** `feat(live): beats stamped with the data's own age (edge Age header + memo)`.

### Task 5: Globals through the shared answer, with catch-up and seed

**Files:**
- Modify: `src/data/api.ts` (`init` seed, `_tick`)
- Create: `src/data/liveMerge.ts`
- Test: `src/data/liveMerge.test.ts`

**Interfaces:**
- Consumes: Task 2 `/api/live` (`LiveAnswer`), Task 3 `/api/live/globals`, Task 4 `_fetchLive`, `reportPoll(…, at)`, existing `missedGlobals`.
- Produces:
  - `globalsToAppend(prev: number | null, shared: GlobalSnapshot[]): { append: GlobalSnapshot[]; needCatchUp: number | null }` in `liveMerge.ts` — `append` is `missedGlobals(prev, shared)`; `needCatchUp` is the gap size when the shared window's oldest ordinal is above `prev + 1` (the tab fell behind it), else null. With `prev` null: `append` = `[newest]`, `needCatchUp` null.
  - `_tick` reads `/api/live` once per poll; appends `append`; if `needCatchUp` it reads `/api/live/globals?limit=${min(needCatchUp, POLL.maxSnapshots)}` and appends `missedGlobals(prev, that)` instead; `reportPoll("global", true, at)`; on failure `reportPoll("global", false)` and `_setLive(false)` as now. The `LiveAnswer` is kept on the instance (`this._lastLive`) for Task 6 in the same tick.
  - `init` seeds from `/api/live/globals?limit=${POLL.maxSnapshots}` instead of the direct explorer read.

- [ ] **Step 1: Write the failing tests** in `liveMerge.test.ts`: `prev` 100, shared ordinals 112..101 → append 101..112, `needCatchUp` null; `prev` 80, shared 112..101 → `needCatchUp` 32; `prev` null → append only the newest.
- [ ] **Step 2: Run** `npx vitest run src/data/liveMerge.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `globalsToAppend` and wire `_tick`/`init`; remove the direct `/global-snapshots/latest` and `/global-snapshots?limit=` reads from the browser path.
- [ ] **Step 4: Run** `npx vitest run src/data` and `npm run typecheck` — expect PASS.
- [ ] **Step 5: Verify live:** with `npm run dev`, in a browser tab on `/snapshots` for 30 s, the resource list shows no request to `be-mainnet.constellationnetwork.io/global-snapshots`, and the Snapshots explorer's ordinals run contiguously.
- [ ] **Step 6: Commit** `feat(live): globals through /api/live with cached catch-up and seed`.

### Task 6: Metagraph snapshots through the shared answer

**Files:**
- Modify: `src/data/api.ts` (`_refreshMeta`, `_refreshOneMeta`, `_refreshUnlistedIds`)
- Modify: `src/data/liveMerge.ts`
- Test: `src/data/liveMerge.test.ts`

**Interfaces:**
- Consumes: `this._lastLive` (Task 5), Task 3 `/api/live/meta/[id]`, existing `_recordMetaSnaps`, `cycleOk`.
- Produces:
  - `chainNeedsCatchUp(heldNewest: number, shared: RawMetaSnapshot[] | undefined): boolean` in `liveMerge.ts` — true when `heldNewest < 0` (cold buffer) or the shared list's oldest ordinal is above `heldNewest + 1`.
  - `_refreshMeta` uses `this._lastLive.metas` for every chain in it; for each chain where `chainNeedsCatchUp` is true it runs the existing self-healing loop against `/api/live/meta/${id}?limit=…` (seed depth `POLL.metaSnapSeed` when cold); the cycle verdict is `cycleOk` over all chains, with every id in `this._lastLive.failed` counted as a failure; `reportPoll("metasnaps", ok, at)`.
  - The unlisted ids come from `this._lastLive.unlisted`; `_refreshUnlistedIds` and the client's quiet set are removed (the server owns both).

- [ ] **Step 1: Write the failing tests:** `chainNeedsCatchUp(-1, [...])` true; held 200, shared oldest 201 → false; held 200, shared oldest 260 → true; held 200, shared `undefined` → true.
- [ ] **Step 2: Run** `npx vitest run src/data/liveMerge.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** and wire `_refreshMeta`; remove the browser's direct `/currency/{id}/snapshots` reads.
- [ ] **Step 4: Run** `npx vitest run src/data` and `npm run typecheck` — expect PASS.
- [ ] **Step 5: Verify live:** on `/snapshots` for 60 s, no request to `be-mainnet…/currency/`; the anchor-log under All shows no "unlisted" spike relative to before (compare the vitals' unlisted figure across a minute).
- [ ] **Step 6: Commit** `feat(live): metagraph snapshots through /api/live with per-chain cached catch-up`.

### Task 7: Nodes through the cached route, notes, and the preview check

**Files:**
- Modify: `src/data/api.ts` (`_fetchClusters`), `app/api/CLAUDE.md`, `src/data/CLAUDE.md`
- Test: `src/data/api.test.ts`

**Interfaces:**
- Consumes: Task 3 `/api/live/clusters`, Task 4 `_fetchLive`.
- Produces: `_fetchClusters` reads `/api/live/clusters` and reports `reportPoll("clusters", ok, at)`; no browser request to the L0/L1 load balancers remains.

- [ ] **Step 1: Write the failing test** in `api.test.ts` (stub `fetch`): `_fetchClusters` requests a URL ending `/api/live/clusters` and never one containing `cluster/info`.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` and `npm run typecheck` — expect PASS.
- [ ] **Step 5: Document** the four routes in `app/api/CLAUDE.md` (headers, memo, 503 rule, the open-proxy guard) and replace "each tab polls Constellation" facts in `src/data/CLAUDE.md` with the shared-feed rule, citing the spec.
- [ ] **Step 6: Preview check** (deploy a Vercel preview; record results in the PR): a 30-request burst to `/api/live` within 1 s yields at most one upstream read per warm instance (function logs); `Age` is present on a cached answer; response size of `/api/live` gzipped. If `Age` is absent, note it and confirm `dataTime` degrades to receipt time.
- [ ] **Step 7: Verify live** on the dev server: over 30 s on `/geography`, the browser's resource list shows only `localhost:3000/api/live*` for these three feeds (expected ~6 `/api/live` and ≤1 `/api/live/clusters`).
- [ ] **Step 8: Commit** `feat(live): nodes through /api/live/clusters; notes`.
