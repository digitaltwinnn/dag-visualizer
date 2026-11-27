# Data submitters (DED organisations, Dor devices) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show who submits each network's data — Digital Evidence's organisations (named, broken down) and Dor's devices (counted) — live in Snapshots › Data blocks, over time in a History rail card, on the Metagraph card, and in the AI notes.

**Architecture:** One pure function reads a data update's submitter per network (`src/data/submitters.ts`). The global-snapshot decoder uses it for the live exact row; a new quarter-hourly sampler (`/api/submitters/sample`) and a back-fill script use it over each network's own L0 snapshots, writing a NEW store family `sub:mainnet:…` (1h and 1d tiers) that one read route (`/api/submitters`) serves to the History card, the Metagraph card and the notes.

**Tech Stack:** Next.js 16 App Router routes (Node runtime), TypeScript, vitest, Upstash Redis via the existing `TrendsStore` interface, React + Zustand HUD, vanilla Three.js `InstancedMesh`, `TrendChart` (recharts).

**Spec:** `docs/superpowers/specs/2026-11-27-ded-organisations-design.md` (approved 2026-11-27).

## Global Constraints

- Networks: DED `DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M` (submitter field `MetagraphBatchMessage.orgId`, kind `organisation`, unit "batches"); Dor `DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM` (field `publicId`, kind `device`, unit "check-ins", counted, never broken down or named).
- Copy: "batches" (never documents/fingerprints), "organisations", "devices", "Org <first 8 of id>" for an unnamed organisation, "nodes" never "machines", "$DAG" for amounts; no hover-only text (`title=`); no emoji.
- Store keys carry the fixed `mainnet` segment via `STORE_NS` (`app/api/trends/keys.ts`); the new family is `sub:` and NEVER the `t:` tiers.
- Rule 10: a bucket outside a network's measured span is null (not measured), never 0; Dor's device counts are EXACT (union of ids), never estimated.
- Rule 3: no raw hex in `scene/` or `components/`; colours come from `src/palette/`. Rule 4: every new value export of a `domain/` or `src/data/` module is referenced by its sibling test. Rule 5: no `new THREE.*`/`.clone()` per frame. Convention 9: hovers preview, never commit.
- Crons run on production only; the sampler fails closed without `CRON_SECRET` (the trends sampler's rule).
- `snapshot-exact` cache key v11 → v12; `NOTES_VERSION` 85 → 86.
- Commit per task; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A data block with updates of mixed or unknown shape** (a DED update without `orgId`, a Dor update without `publicId`, a non-object value) — counts only what has a submitter, and the block's other figures are unchanged. Pinned in Task 1.
2. **An L0 read that fails mid-run** — the sampler stops at that ordinal, commits only what it read, and the measured span ends there, so the next run resumes with no hole and no double count. Pinned in Task 4.
3. **A History range reaching before the measured span** (Dor before its 90-day back-fill, any network before the sampler's first run) — buckets before `measuredFrom` are null and the card says "not measured before <date>", never a drop to 0. Pinned in Tasks 6 and 10.
4. **An organisation with no known name**, everywhere it is shown — "Org c9834e11", the same string in card, chart legend, chamber hover and notes. Pinned in Tasks 6, 8 and 12.
5. **A network in History scope that carries no data blocks** (e.g. USDC.dag) — the card states "<network> carried no data blocks in this range, so there is no one to show", and the read route is not called for it. Pinned in Task 10.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/submitters.ts` (create) | The per-network submitter table, `submitterOf`, `tallySubmitters`, `submitterLabel`. Pure. |
| `app/api/snapshot/decodeChannel.ts` (modify) | Split a sync `decodeSnapshotRoot(root, metaId)` out of `decodeChannelContent`; each `DataBlockSummary` gains `submitters`. |
| `src/data/types.ts` (modify) | `DataBlockSummary.submitters`. |
| `app/api/snapshot/cachedExact.ts` (modify) | Cache key v12. |
| `app/api/submitters/keys.ts` (create) | The `sub:` key family. |
| `app/api/submitters/bucket.ts` (create) | Tally → store increments; the measured span. Pure. |
| `app/api/submitters/readL0.ts` (create) | Read a network's L0 snapshots for a list of explorer records, polite concurrency, stop at first failure. |
| `app/api/submitters/runSubmitters.ts` (create) | The sampler core (deps injected): cursor, lock, records → L0 → tallies → writes, names step. |
| `app/api/submitters/sample/route.ts` (create) | The cron route. |
| `app/api/submitters/names.ts` (create) | DED name answers → name-hash writes. Pure parse + merge. |
| `app/api/submitters/assemble.ts` (create) | Store hashes → `SubmittersWindow`. Pure. |
| `app/api/submitters/route.ts` (create) | The read route. |
| `scripts/walk-submitters.ts` (create) | The resumable back-fill; reuses `runSubmitters`' core. |
| `scripts/seed-ded-names.ts` (create) | One-off dagscan name seed. |
| `components/useSubmitters.ts` (create) | Client hook + feed `api-submitters`. |
| `src/palette/submitterHue.ts` (create) | Organisation hues clear of network hues. |
| `components/inspector/DataBlockPane.tsx` (modify) | "By organisation" / "Checked in by N devices". |
| `src/engine/domain/dataMark.ts`, `src/engine/scene/views/LedgerView.ts` (modify) | Banded data boxes. |
| `components/inspector/TrendSubmittersPane.tsx` (create), `components/railCards.ts`, `components/Inspector.tsx` (modify) | History's card. |
| `components/inspector/cards.tsx` (modify) | Metagraph card: Active organisations / Active devices. |
| `src/data/noteFactsTrend.ts`, `src/data/noteFactsData.ts`, `app/api/notes/sources.ts`, `app/api/notes/prompts.ts`, `app/api/notes/keys.ts` (modify) | Notes. |
| `app/api/CLAUDE.md`, `src/data/CLAUDE.md`, `components/CLAUDE.md`, `src/engine/scene/CLAUDE.md`, `vercel.json` (modify) | Docs + cron. |

---

### Task 1: The submitter table

**Files:**
- Create: `src/data/submitters.ts`
- Test: `src/data/submitters.test.ts`

**Interfaces:**
- Produces:
  - `type SubmitterKind = "organisation" | "device"`
  - `interface SubmitterSpec { kind: SubmitterKind; unit: string; read: (update: unknown) => string | null }`
  - `const SUBMITTERS: Readonly<Record<string, SubmitterSpec>>` keyed by catalog id (DED, Dor ids above)
  - `submitterOf(netId: string, update: unknown): string | null`
  - `tallySubmitters(netId: string, updates: readonly unknown[]): { id: string; updates: number }[]` (busiest first, ties by id)
  - `submitterLabel(id: string, names: Readonly<Record<string, string>>): string` — the name, else `Org ${id.slice(0, 8)}`
  - `DEVICE_ID_LEN = 16` — Dor ids are stored truncated to this
  - `DED_ID`, `DOR_ID` — the two catalog ids, as literal constants

- [ ] **Step 1: Write the failing tests** — `describe("submitterOf")`:
  - DED `{ MetagraphBatchMessage: { orgId: "c9834e11-36ca-436f-8954-6b304e13ac6b", batchId: "x" } }` → `"c9834e11-36ca-436f-8954-6b304e13ac6b"`;
  - Dor `{ publicId: "8e25d1c3a0a6d54be2c3719750d210185bacfe3b", dts: 1 }` → `"8e25d1c3a0a6d54b"` (16 chars);
  - missing field, `null`, a string, an array → `null`; an unlisted network id → `null`.
  - `tallySubmitters(DED, [a, a, b, junk])` → `[{ id: a, updates: 2 }, { id: b, updates: 1 }]`.
  - `submitterLabel("c9834e11-…", {})` → `"Org c9834e11"`; with `{ "c9834e11-…": "Open Poker" }` → `"Open Poker"`.
  - `SUBMITTERS[DED].kind === "organisation"`, `.unit === "batches"`; `SUBMITTERS[DOR].kind === "device"`, `.unit === "check-ins"`.
- [ ] **Step 2: Run** `npx vitest run src/data/submitters.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module with the signatures above, the ids as the literal constants `DED_ID` / `DOR_ID` (no lookup by name in the catalog).
- [ ] **Step 4: Run** the test and `npx vitest run src/data/dataExportCoverage.test.ts` — Expected: PASS (every export referenced).
- [ ] **Step 5: Commit** `git add src/data/submitters.ts src/data/submitters.test.ts && git commit -m "Who submitted a data update: one table per network (DED orgId, Dor publicId)"`

### Task 2: The live row carries submitters

**Files:**
- Modify: `app/api/snapshot/decodeChannel.ts`, `src/data/types.ts`, `app/api/snapshot/exactRow.ts`, `app/api/snapshot/cachedExact.ts`, `app/api/snapshot/[ordinal]/channel/[address]/route.ts`
- Test: `app/api/snapshot/decodeChannel.test.ts`, `app/api/snapshot/exactRow.test.ts`

**Interfaces:**
- Consumes: `tallySubmitters` (Task 1).
- Produces:
  - `DataBlockSummary.submitters?: { id: string; updates: number }[]` (absent for a network with no `SUBMITTERS` row and for an `unread` block)
  - `decodeSnapshotRoot(root: Record<string, unknown>, metaId: string): DecodedChannel` (sync; the L0 sampler calls it on `/snapshots/<n>` JSON, which has the same `{ value: { dataApplication: { blocks } } }` shape as the inflated content)
  - `decodeChannelContent(content: unknown, metaId: string): Promise<DecodedChannel | null>` (now takes the id)

- [ ] **Step 1: Write the failing tests:**
  - `decodeSnapshotRoot` on a fixture DED root with one data block of 3 updates (orgs a, a, b) → `dataBlockRows[0].submitters` equals `[{ id: a, updates: 2 }, { id: b, updates: 1 }]`, `updates === 3` unchanged;
  - the same block under a non-submitter network id → `submitters` undefined;
  - an unreadable block → `unread: true` and no `submitters`;
  - `exactRow` passes the row's `metaId` (assert a DED row from the existing fixture now carries `submitters`).
  - `cachedExact` key string is `snapshot-exact-v12`.
- [ ] **Step 2: Run** `npx vitest run app/api/snapshot` — Expected: FAIL.
- [ ] **Step 3: Implement.** Move the body after `JSON.parse(inflate(...))` into `decodeSnapshotRoot`; `decodeChannelContent` inflates, parses and delegates. Inside the block loop, after `own` is built: `const subs = tallySubmitters(metaId, own); if (subs.length) row.submitters = subs;`. Bump the key and add a line to `cachedExact.ts`'s key history comment ("v12 each data block's submitters").
- [ ] **Step 4: Run** `npx vitest run app/api/snapshot && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** "The exact row counts each data block's submitters (snapshot-exact-v12)".

### Task 3: The `sub:` store family and its bucketing

**Files:**
- Create: `app/api/submitters/keys.ts`, `app/api/submitters/bucket.ts`
- Test: `app/api/submitters/keys.test.ts`, `app/api/submitters/bucket.test.ts`

**Interfaces:**
- Consumes: `STORE_NS`, `stepMsOf` from `app/api/trends/keys.ts`.
- Produces:
  - `type SubTier = "1h" | "1d"` (my call: no 5m tier; the 1h and 24h History ranges chart hourly here)
  - `subSlotOf(netId: string, tier: SubTier, tsMs: number): { key: string; bucket: string }` — `sub:mainnet:<netId>:1h:YYYY-MM` bucket `DD-HH`; `sub:mainnet:<netId>:1d:YYYY` bucket `MM-DD`
  - `subField(bucket: string, submitter: string): string` → `${bucket}|${submitter}`
  - `subSpanKeyOf(netId)` → `sub:mainnet:<netId>:span` (fields `from`, `to`: epoch ms of the measured span, `cursor`: last ordinal read)
  - `subNamesKeyOf(netId)` → `sub:mainnet:<netId>:names` (field = id, value = JSON `{ name, source: "ded" | "dagscan", namedAt }`)
  - `subLockKeyOf()` → `sub:mainnet:lock`
  - `bucketSubmitters(inc: Map<string, Map<string, number>>, netId: string, tsMs: number, tally: { id: string; updates: number }[]): void` — adds the tally into BOTH tiers' fields (counts sum; Dor's per-bucket field value is check-ins, distinctness is read from field presence). **Invariant: a day's 1d fields equal the sum (and, for devices, the union) of its 1h fields** — the walk relies on it (Task 7).
  - `nextSpan(prev: { from?: number; to?: number } | null, readFromMs: number, readToMs: number): { from: number; to: number }` — extends only when contiguous (`readFromMs <= prev.to`), else starts a new span at `readFromMs` (an outage before it is then not measured)

- [ ] **Step 1: Write the failing tests:** `keys.test.ts` pins every string above for `DED` at `2026-11-27T14:05Z` (`sub:mainnet:DAG0eQr…:1h:2026-11` / `27-14`, `…:1d:2026` / `11-27`). `bucket.test.ts`: two tallies in one hour sum per field; a Dor tally writes one field per device; `nextSpan(null, a, b)` → `{a,b}`; contiguous extends; a gap restarts.
- [ ] **Step 2: Run** `npx vitest run app/api/submitters` — FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** "The sub: store family for who submits data (1h and 1d tiers)".

### Task 4: The sampler core

**Files:**
- Create: `app/api/submitters/readL0.ts`, `app/api/submitters/runSubmitters.ts`, `app/api/submitters/names.ts`
- Test: `app/api/submitters/readL0.test.ts`, `app/api/submitters/runSubmitters.test.ts`, `app/api/submitters/names.test.ts`

**Interfaces:**
- Consumes: `decodeSnapshotRoot` (Task 2), `bucketSubmitters`/`nextSpan`/keys (Task 3), `listSince` and `ChainPage` from `app/api/trends/fetchSince.ts`, `MetaRec` from `app/api/trends/bucketing.ts`, `TrendsStore`/`TrendsWrite` from `app/api/trends/store.ts`.
- Produces:
  - `readL0Snapshots(recs: MetaRec[], fetchSnap: (ordinal: number) => Promise<unknown>, pool: number): Promise<{ read: { rec: MetaRec; root: Record<string, unknown> }[]; failedAt: number | null }>` — keeps record order; the result holds only the contiguous prefix before the first failure.
  - `interface SubmittersDeps { store: TrendsStore; nets: string[]; pageMeta(id: string, limit: number, next?: string): Promise<ChainPage<MetaRec>>; fetchSnap(netId: string, ordinal: number): Promise<unknown>; dedLatest?(): Promise<unknown>; now(): number; pool?: number; maxRecs?: number }`
  - `runSubmitters(deps: SubmittersDeps): Promise<{ skipped?: "locked"; read: Record<string, number>; failed: Record<string, number | null>; names: number }>`
  - `parseDedLatest(body: unknown): Record<string, string>` (orgId → orgName from `{ data: [{ orgId, orgName }] }`) and `mergeNames(prev: Record<string, string>, seen: Record<string, string>, source: "ded" | "dagscan", nowMs: number): Record<string, string>` (writes the JSON values; adds or updates, never deletes; a `ded` name replaces a `dagscan` one).

- [ ] **Step 1: Write the failing tests** (in-memory store, fake pages and snapshots):
  - first run with an empty span reads from the START OF THE PREVIOUS UTC HOUR (my call: an hour boundary, so the walk can end exactly there — Task 7), buckets by each record's `timestamp`, writes fields, span and cursor in ONE `applyWrites`;
  - a `fetchSnap` that throws at the 3rd record: only records 1–2 are counted, `cursor` = record 2's ordinal, span `to` = record 2's time, `failed[net] === rec3.ordinal`; the next run resumes at record 3 and the total equals a clean run's (no double count);
  - a held lock → `{ skipped: "locked" }` and no writes;
  - `parseDedLatest` on `{ data: [{ orgId: "c98…", orgName: "Open Poker" }, { orgId: "x" }] }` → `{ "c98…": "Open Poker" }`; `mergeNames` never drops a key and a `ded` source overwrites `dagscan`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Pool default 8, `maxRecs` default 4000 per network per run (≈ a 2.5 h catch-up at today's rate; beyond it the span stays contiguous because the cursor only advances over what was read). Lock via the store's existing lock calls with `subLockKeyOf()`. Names: when `deps.dedLatest` is given, read once per run and add `mergeNames` output to the same transaction.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** "Submitters sampler core: L0 reads since a cursor, a measured span, DED names".

### Task 5: The cron route

**Files:**
- Create: `app/api/submitters/sample/route.ts`
- Modify: `vercel.json`, `app/api/CLAUDE.md`
- Test: `app/api/submitters/sample/route.test.ts`

**Interfaces:**
- Consumes: `runSubmitters` (Task 4), `cachedL0Url` from `app/api/network/metaL0.ts`, `writeStore` from `app/api/trends/store.ts`, the trends sample route's explorer paging (`pageMeta`'s URL builder — extract it to `app/api/trends/explorerPages.ts` if it is inline, and import it from both routes).
- Produces: `GET /api/submitters/sample` → 401 without `Authorization: Bearer ${CRON_SECRET}` (and 401 when `CRON_SECRET` is unset — fail closed), else `200 { read, failed, names }`. DED names from `https://lb-mainnet.ded-ingestion.constellationnetwork.net/v1/fingerprints/latest?limit=500`.

- [ ] **Step 1: Write the failing tests:** unset secret → 401; wrong bearer → 401; right bearer → 200 with `runSubmitters` called once with `nets = [DED_ID, DOR_ID]`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** (`runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 300`). Add the cron `{ "path": "/api/submitters/sample", "schedule": "3,18,33,48 * * * *" }` (off the trends sampler's minute). Add the route to `app/api/CLAUDE.md`'s route list (its store family, its lock, its fail-closed rule, the DED names source).
- [ ] **Step 4: Run** `npx vitest run app/api/submitters && npm run typecheck` — PASS.
- [ ] **Step 5: Commit** "Submitters cron route, quarter-hourly, fails closed without CRON_SECRET".

### Task 6: The read route

**Files:**
- Create: `app/api/submitters/assemble.ts`, `app/api/submitters/route.ts`
- Test: `app/api/submitters/assemble.test.ts`, `app/api/submitters/route.test.ts`

**Interfaces:**
- Consumes: keys (Task 3), `readStore`.
- Produces:
  - `interface SubmittersWindow { net: string; kind: SubmitterKind; unit: string; tier: SubTier; stepMs: number; buckets: number[]; measured: { from: number; to: number } | null; names: Record<string, string>; series: { id: string; points: (number | null)[] }[]; distinct: (number | null)[]; rangeDistinct: number | null; totals: { id: string; updates: number }[]; seenTotal: number; firstSeenMs: number | null }`
    - `series`: per submitter (organisations only; empty for devices), points null outside `measured`, 0 inside where the submitter sent nothing;
    - `distinct`: submitters per bucket (both kinds), null outside `measured`;
    - `rangeDistinct`: distinct ids across the measured part of the range; null if none of it is measured;
    - `totals`: the range's per-submitter sums, busiest first (organisations; devices give `[]`);
    - `seenTotal` / `firstSeenMs`: from the names hash plus every id ever seen in the 1d tier (organisations), for "N seen since <month year>".
  - `assembleSubmitters(input: { net: string; tier: SubTier; fromMs: number; toMs: number; hashes: Record<string, Record<string, string>>; span: Record<string, string> | null; names: Record<string, string> | null; yearHashes?: Record<string, Record<string, string>> }): SubmittersWindow`
  - `GET /api/submitters?net=<id>&from=<ms>&to=<ms>` (tier: 1h when `to − from ≤ 30 days`, else 1d) or `&window=24h` (the last 24 h at 1h). 400 for a net not in `SUBMITTERS` or a bad range. `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.

- [ ] **Step 1: Write the failing tests:**
  - buckets before `measured.from` are null in `series` and `distinct` (Review Focus 3); inside, a quiet organisation is 0;
  - Dor: two buckets with devices {a,b} and {b,c} → `distinct = [2, 2]`, `rangeDistinct = 3` (exact union);
  - `names` carries only the label map (parsed `name`), and an id absent from it is still in `series`/`totals`;
  - route: `?net=USDC` → 400; `?window=24h` reads the 1h hashes covering the last 24 h; the header is set.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** "Submitters read route: a range's organisations or devices, honest outside the measured span".

### Task 7: Back-fill and the name seed

**Files:**
- Create: `scripts/walk-submitters.ts`, `scripts/seed-ded-names.ts`
- Modify: `app/api/CLAUDE.md` (a "Back-filling submitters" paragraph)
- Test: `app/api/submitters/runSubmitters.test.ts` (the walk mode)

**Interfaces:**
- Consumes: `runSubmitters`' internals — extract `walkRange(deps: SubmittersDeps, net: string, fromMs: number, toMs: number, onProgress: (p: { ordinal: number; tsMs: number; read: number }) => void): Promise<void>` into `runSubmitters.ts` and have the sampler call it too; `listBetween` from `fetchSince.ts`; `mergeNames` (Task 4).
- Produces:
  - `npx tsx scripts/walk-submitters.ts --net=ded|dor --from=YYYY-MM-DD [--pool=8]` — walks hour by hour OLDEST first up to the span's `from` (an hour boundary, Task 4) and never past it, so it never touches an hour the sampler wrote. It writes each hour's 1h fields as SETS of that hour's full tally (never increments, so a rerun is idempotent), then, per completed day, writes that day's 1d fields as the sum/union of its 1h fields (the Task 3 invariant; the boundary day's 1d is recomputed from all its 1h fields, the sampler's included). When the walk reaches `from` contiguously it lowers the span's `from` to the walk's start. Progress per day on stdout; resumable from `--state=<path>` (default `./.walk-submitters.<net>.json`, gitignored). Defaults per spec: DED `--from=2025-09-15`, Dor `--from=<today − 90 days>`.
  - `npx tsx scripts/seed-ded-names.ts` — reads `https://api.dagscan.io/metagraphs/<DED>/evidence/summary` once, `mergeNames(..., "dagscan", now)` into `sub:mainnet:<DED>:names`. Never imported by app code.

- [ ] **Step 1: Write the failing test:** `walkRange` over two days run twice writes identical field values (idempotent); a run interrupted after day 1 and resumed equals one uninterrupted run; with the sampler already holding the boundary day's later hours, the walk leaves those 1h fields untouched and the day's 1d equals the sum of all its 1h fields; the span's `from` moves to the walk's start only once the walk reaches it.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** both scripts (env: the Upstash write token, as `rebuild-trends.ts` reads it). Add `.walk-submitters.*.json` to `.gitignore`.
- [ ] **Step 4: Run** `npx vitest run app/api/submitters && npm run typecheck` — PASS.
- [ ] **Step 5: Commit** "Back-fill walk and one-off dagscan name seed for submitters".

### Task 8: Client hook and organisation hues

**Files:**
- Create: `components/useSubmitters.ts`, `src/palette/submitterHue.ts`
- Modify: `src/data/api.ts` (FEEDS row)
- Test: `src/palette/submitterHue.test.ts`

**Interfaces:**
- Consumes: `SubmittersWindow` (Task 6), `src/palette/identity.ts` (`HUD_L`, `SCENE_L`, chroma constants), `src/palette/brand.ts` (`snapToAllowedZone`).
- Produces:
  - FEEDS `"api-submitters": { label: "Data submitters", everyMs: null, when: "while shown", tempoMs: POLL.trendsMs }`
  - `useSubmitters(q: { net: string; fromMs: number; toMs: number } | { net: string; window: "24h" } | null, who: string): { data: SubmittersWindow | null; error: boolean }` — `useTrendsWindow`'s cache/inflight pattern, `useFeedRead(["api-submitters"], who, q != null)`.
  - `submitterHue(id: string, networkHues: readonly number[]): number` (hue degrees, deterministic from the id, at least `MIN_HUE_GAP = 18`° from every network hue) and `submitterColor(id: string, networkHues: readonly number[], surface: "hud" | "scene"): string` (an `oklch(...)` string at the palette's L/C for that surface).

- [ ] **Step 1: Write the failing tests:** same id → same hue; for the catalog's network hues every result is ≥ 18° from each; `submitterColor` returns `oklch(` strings with `HUD_L` / `SCENE_L`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/palette components/feedReadBoundary.test.ts` — PASS.
- [ ] **Step 5: Commit** "Submitters feed hook and organisation hues clear of network hues".

### Task 9: Snapshots › Data blocks — the card and the banded columns

**Files:**
- Modify: `components/inspector/DataBlockPane.tsx`, `src/store/store.ts` (hover channel), `src/engine/domain/dataMark.ts`, `src/engine/scene/views/LedgerView.ts`, `components/cardHoverBoundary.test.ts`, `components/CLAUDE.md`, `src/engine/scene/CLAUDE.md`
- Test: `src/engine/domain/dataMark.test.ts`

**Interfaces:**
- Consumes: `DataBlockSummary.submitters` (Task 2), `submitterLabel` (Task 1), `submitterColor` (Task 8), names from `useSubmitters({ net: DED_ID, window: "24h" })` (its `names`).
- Produces:
  - store `hoverSubmitter: string | null` + `setHoverSubmitter`, added to convention 9's channel list in root `CLAUDE.md` and to `cardHoverBoundary.test.ts` for `DataBlockPane.tsx` (`["hoverDataBlock", "hoverSubmitter"]`).
  - `DATA_BANDS: Readonly<{ max: number }> = { max: 4 }` and `dataBoxBands(block: DataBlockSummary): { id: string | null; share: number }[]` — top `max − 1` submitters by updates, the rest as one `id: null` band; shares sum to 1; `[]` for a block with no submitters (it draws as today).

- [ ] **Step 1: Write the failing tests:** `dataBoxBands` on `{ submitters: [{a,93},{b,7}] }` → `[{a,0.93},{b,0.07}]`; five submitters → 4 bands, the last `id: null` holding the remainder; no submitters → `[]`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - Card: DED — a "By organisation" table (dot in `submitterColor(id, hues, "hud")`, `submitterLabel`, updates right-aligned mono) under updates by kind; hovering a row sets `hoverSubmitter` (preview only). Dor — one fact row "Checked in by N devices" (`submitters.length`). Unread blocks keep their unread wording.
  - Scene: each box becomes up to `DATA_BANDS.max` stacked sub-boxes, heights ∝ share, in the packed pool (grow `_dataMarkMesh`'s capacity to `META_TRAIL_MAX × DATA_BANDS.max`; colours set at event time). Colour follows the approved column rule: neutral down the trail; the submitter colours on the active row, while `hoverDataBlock` or `hoverSubmitter` points into it, or while DED is committed. No per-frame allocation.
  - Docs: the Data block card paragraph in `components/CLAUDE.md`, the data-mark paragraph in `src/engine/scene/CLAUDE.md`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`, then check live on `/data-blocks` with the dev server: a DED column shows Open Poker / Gate AI bands on the live row and neutral down the trail; hovering a card row lights its bands. Reload after the LedgerView edit (singleton).
- [ ] **Step 5: Commit** "Data blocks: a block's organisations on its card and in its column's bands".

### Task 10: History — the submitters card

**Files:**
- Create: `components/inspector/TrendSubmittersPane.tsx`
- Modify: `components/railCards.ts` (+ `railCards.test.ts`), `components/Inspector.tsx`, `components/docs/TrendChart.tsx` (band hue), `components/CLAUDE.md`
- Test: `components/railCards.test.ts`, `components/inspector/trendSubmitters.test.ts` (pure helper)

**Interfaces:**
- Consumes: `useSubmitters` (Task 8), `SUBMITTERS`/`submitterLabel` (Task 1), the History scope rule `trendStack.cardNetwork`, the range on screen (the same `fromMs/toMs` `TrendRangePane` reads).
- Produces:
  - lane `trend: ["notes", "context", "range", "submitters", "instant"]`; `RailCardKind` gains `"submitters"`; the slot is a card slot with no rung (the `range`/`instant` precedent), always present in History.
  - `TrendBand.hue?: string` (a band in its own colour; absent keeps the opacity ramp).
  - `submittersCardState(scope: string | null, carriesData: (id: string) => boolean): { mode: "all" } | { mode: "none"; net: string } | { mode: "organisations" | "devices"; net: string }` in `components/inspector/trendSubmitters.ts`.

- [ ] **Step 1: Write the failing tests:** `submittersCardState(null, …)` → `all`; USDC → `none`; DED → `organisations`; Dor → `devices`. `railCards.test.ts`: the trend lane order above.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the pane:
  - `organisations`: `TrendChart` with `stack` bands (top 5 by the range's `totals`, the rest one "Other (n)" band), each band `hue = submitterColor(id, hues, "hud")`; beneath, each organisation's share of the range (bar + percent) and "N active of M seen" (`rangeDistinct`, `seenTotal`).
  - `devices`: `TrendChart` with one line (`distinct`) and the fact "N devices checked in" (`rangeDistinct`).
  - Before `measured.from` inside the range: the chart's buckets are null and a line under it says "Not measured before <date>" (`src/util/localTime.ts`'s day label).
  - `none`: no fetch; the sentence "<network> carried no data blocks in this range, so there is no one to show". `carriesData` is decided by the network having a `SUBMITTERS` row — a network with a row that sent nothing in the range shows its chart at 0 instead.
  - `all`: one row per `SUBMITTERS` network ("Digital Evidence — 5 organisations", "Dor — N devices", from each's `rangeDistinct`), the row committing History's plane focus through `setTrendFocus` (the one executor, rule 2).
- [ ] **Step 4: Run** `npm test && npm run typecheck`; live on `/trends`: All lists two rows; DED focus shows the stack (Open Poker's surge on 26 Nov in 7D); USDC focus says no data blocks.
- [ ] **Step 5: Commit** "History: one card for who submits a network's data".

### Task 11: The Metagraph card

**Files:**
- Modify: `components/inspector/cards.tsx`, `components/CLAUDE.md`
- Test: `components/inspector/parts.test.ts` (a pure row builder)

**Interfaces:**
- Consumes: `useSubmitters({ net, window: "24h" })` (Task 8), `submitterLabel`, `submitterColor`.
- Produces: `activeSubmitterRows(w: SubmittersWindow): { id: string; label: string; updates: number; share: number }[]` in `components/inspector/parts.tsx`.

- [ ] **Step 1: Write the failing test:** rows busiest first, shares of the 24 h total, unnamed → "Org …".
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** in `MetaCard`, only for a network with a `SUBMITTERS` row:
  - DED: a `ScheduleGroup label="Active organisations"` after Online nodes (header count = `rangeDistinct` of the 24 h window), rows = dot, label, batches, share bar; beneath, "N seen since <Mon YYYY>" (`seenTotal`, `firstSeenMs`).
  - Dor: one `Fact label="Active devices"` = `rangeDistinct`.
  - Acquiring: the group's existing acquiring idiom; a failed read: nothing (rule 10).
- [ ] **Step 4: Run** `npm test`; live: the Metagraph card in all four views for DED and Dor.
- [ ] **Step 5: Commit** "Metagraph card: active organisations (DED) and active devices (Dor), last 24 hours".

### Task 12: AI notes

**Files:**
- Modify: `src/data/noteFactsTrend.ts`, `src/data/noteFactsData.ts`, `app/api/notes/sources.ts`, `app/api/notes/prompts.ts`, `app/api/notes/keys.ts`
- Test: `src/data/noteFactsTrend.test.ts`, `src/data/noteFactsData.test.ts`, `app/api/notes/sources.test.ts`, `app/api/notes/keys.test.ts`, `app/api/notes/prompts.test.ts`

**Interfaces:**
- Consumes: `SubmittersWindow` + `assembleSubmitters` (Task 6; `sources.ts` reads the store directly through `NoteReads`, not the HTTP route), `DataBlockSummary.submitters` (Task 2), `edgeLevels`-style start/end (`noteFactsTrend.ts`).
- Produces:
  - `TrendFactsInput.submitters?: SubmittersWindow | null`;
  - History DED facts: per top-3 organisation by the range's total, `"<label> batches, per day, at the start of the span" / "…at the end of the span"` (a `FactPair`, so `withChangeFacts` gives the change), and `"<label>, share of the span's batches"` (`share`); the labels join `names` so the gate scopes them. Dor: `"Active devices, this span"` (`count`) and its start/end pair from `distinct`'s edges.
  - Data blocks facts: per organisation in the window, `"<label> batches in the window"`; Dor `"Devices that checked in, in the window"`.
  - `NOTES_VERSION = 86` with its comment.
  - One prompt line in the trend and data prompts: an organisation is named as the facts name it, and a device is never named.

- [ ] **Step 1: Write the failing tests:** a DED trend input whose Open Poker doubles start→end yields the pair and a 100% change fact, and `checkNote("Open Poker's batches rose 100% to …")` passes while naming an organisation the facts do not hold fails; Dor yields the active-devices count; no `submitters` → no new facts (other networks unchanged); keys test pins 86; prompts contain no digits (R59).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` — PASS; then one local Gate call (`NOTES_STORE=memory`, `next dev`) for DED 7d.
- [ ] **Step 5: Commit** "Notes name who submitted the data (NOTES_VERSION 86)".

### Task 13: Docs and the ledger

**Files:**
- Modify: root `CLAUDE.md` (the Snapshots/History paragraphs: one line each naming the submitters card and the `sub:` family; convention 9's channel list), `src/data/CLAUDE.md` (a "Who submits the data" section: the table, the units, why Dor is counted), `.superpowers/sdd/progress.md`

- [ ] **Step 1:** Write the sections in present tense, naming the tests that pin each rule.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npx next build` (dev stopped or alongside; `/api/submitters` must be `ƒ` with the cache header).
- [ ] **Step 3: Commit** "Docs: who submits the data".

---

## After merge (production, the user's call)

1. Deploy; the cron starts writing from its first run.
2. `npx tsx scripts/seed-ded-names.ts` once.
3. `npx tsx scripts/walk-submitters.ts --net=ded --from=2025-09-15` (≈ a day), then `--net=dor` with the 90-day default. Post progress while it runs.
