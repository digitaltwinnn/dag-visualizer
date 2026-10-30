# The trends fill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/rebuild-trends.ts` has three commands — `fill` (one walk that completes a span of days, resilient by default, `--recompute` for fixes), `rebuild` and `wipe` (the disaster path, asking first) — and none of its one-off modes.

**Architecture:** The pure decisions (command parsing with the old-flag redirects, the span and its rules, the cursor pre-flight, the fine-tier floor) move into `app/api/trends/fillPlan.ts` with a colocated test, since `scripts/` has no test harness. The script keeps its crash-safe walk machinery (`walkChain`, `walkMetaCkpt`, `walkGlobalCkpt`, `flushFinal`, `writeFloorsAndFinish`, `seekBoundary`, `retrying`) and loses every mode branch but the three commands. One chain loop walks catalog and unlisted chains alike, three at a time; the spine walks last; no sampler lock is ever taken by `fill`.

**Tech Stack:** TypeScript (tsx), vitest for the pure module, `tsc -p tsconfig.scripts.json` for the script.

**Spec:** `docs/superpowers/specs/2026-10-30-trends-fill-design.md`

## Global Constraints

- Rule 10: only complete days are written; today never; an unread unlisted chain suppresses `u.cov` for the span; no field is invented.
- `fill` never writes a cron cursor and never takes the sampler lock; it refuses while a cursor is inside the span.
- Fine tiers (`1h`, `5m`) exist only for days ≥ `TIER_SINCE` (2025-07-01, `src/data/trendWindow.ts`); pruned in `flushFinal` alone.
- Writes go through `bucketing.ts` / `merge.ts` exactly as the sampler's do; HSET of whole complete days.
- Every page read and store write goes through `retrying` (PR #81's helper, already on this branch).
- No Upstash writes from this work until the user starts the 2023-11-13 fill; verification uses `--dry-run` and the tests.
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Review Focus

1. A `fill --recompute --from=X --to=Y` run twice writes identical fields (idempotent whole-day HSETs) — pinned by the span test plus the existing bucketing tests; the second run must not refuse on its own finished checkpoint (the directory is cleared at the end).
2. A cursor inside the span refuses with the cursor named; a cursor exactly at the span's end passes — Task 1.
3. An old flag (`--extend-to=…`, `--backfill-unlisted`, `--recompute-from=…`) prints the `fill` command that replaces it and exits 1 — Task 1.
4. A `--chain` prefix matching zero or two chains refuses; a match writes that chain's `m.<id>.*` only — Task 1 (parse) and Task 2 (walk).
5. A checkpoint for another span refuses and names `--fresh`; the same span resumes silently — Task 2.

---

### Task 1: The pure plan of a fill

**Files:**
- Create: `app/api/trends/fillPlan.ts`, `app/api/trends/fillPlan.test.ts`

**Interfaces (produces):**
```ts
export type Command =
  | { kind: "fill"; fromMs: number; toMs: number | null; recompute: boolean; chain: string | null; fresh: boolean; dryRun: boolean }
  | { kind: "rebuild"; days: number; yes: boolean }
  | { kind: "wipe"; yes: boolean };
export interface Parsed { net: "mainnet" | "integrationnet" | "testnet"; command: Command }
/** argv after `--net` handling; throws `UsageError` (message = what to run instead) on an old flag or a bad combination. */
export function parseCommand(argv: readonly string[]): Parsed;
export class UsageError extends Error {}
/** The cursor fields (`gTs`, `mTs.<id>`) whose timestamp is < spanEndMs — the cron is still inside the span. */
export function cursorsInsideSpan(cursor: Readonly<Record<string, string | number>>, ids: readonly string[], spanEndMs: number, withSpine: boolean): string[];
/** Whether a bucket of this tier may exist at this instant (the fine-tier floor). */
export function tierExistsAt(tier: "5m" | "1h" | "1d", bucketStartMs: number): boolean;
/** The one chain a prefix names, or an error: none, or more than one. */
export function resolveChain(prefix: string, ids: readonly string[]): { id: string } | { error: string };
export const FILL_POOL = 3;
```
Rules in `parseCommand`: `fill` needs `--from`; `--to` only with `--recompute` (else "the extension derives its own --to"); `--recompute` needs `--to`; `--chain` needs `--recompute`; dates `YYYY-MM-DD` UTC midnight; `--to` ≥ `--from`; `--to` ≤ yesterday is checked by the caller (it knows `now`). Old flags: `--extend-to=D` → "use: fill --from=D"; `--recompute-from=D` → "use: fill --from=D --to=<yesterday> --recompute"; `--backfill-gaps=…`, `--backfill-blocks=…`, `--backfill-unlisted`, `--no-unlisted`, `--resume`, `--gaps-from-chain=…` → "folded into fill: …"; `--wipe-only` → "use: wipe"; `--days=N` alone → "use: rebuild --days=N".

- [ ] **Step 1: Write the failing tests** — `fillPlan.test.ts`: (a) `fill --from=2023-11-13` parses with `toMs: null`, `recompute: false`; (b) `fill --from=A --to=B --recompute --chain=DAG0Cy` parses; (c) `fill --to=B` without `--recompute` throws naming the derived `--to`; (d) `--recompute` without `--to` throws; (e) `--chain` without `--recompute` throws; (f) `--to` before `--from` throws; (g) each old flag throws with a message containing `fill` (or `wipe`/`rebuild`); (h) `rebuild --days=90 --yes` and `wipe` parse; (i) `cursorsInsideSpan({ gTs: end - 1, "mTs.a": end, "mTs.b": end + 5 }, ["a","b"], end, true)` is `["gTs"]`; without the spine it is `[]`; a missing cursor is not inside (the chain is skipped elsewhere); (j) `tierExistsAt("1h", TIER_SINCE - 1)` false, `("1h", TIER_SINCE)` true, `("1d", 0)` true; (k) `resolveChain("DAG0", ["DAG0a","DAG0b"])` errors "2 chains", `("ZZZ", …)` errors "no chain", `("DAG0a", …)` resolves.
- [ ] **Step 2: Run** `npx vitest run app/api/trends/fillPlan.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** the module; `tierExistsAt` reads `TIER_SINCE` from `@/src/data/trendWindow`.
- [ ] **Step 4: Run** the test and `npx vitest run app/api/trends` — PASS.
- [ ] **Step 5: Commit** `feat(trends): the fill's pure plan — commands, span rules, cursor pre-flight, tier floor`.

### Task 2: `fill` in the script

**Files:**
- Modify: `scripts/rebuild-trends.ts` (everything from `parseArgs` through the mode branches; the walk machinery stays)

**Interfaces:**
- Consumes: Task 1's exports; the existing `walkChain`, `walkMetaCkpt`, `walkGlobalCkpt`, `flushFinal`, `writeFloorsAndFinish`, `seekBoundary`, `craftCurrencyCursor`, `craftGlobalCursor`, `probeCursorShape`, `retrying`, `readJson`/`writeJson`, `lineageIds`, `untrackedIds`, `fetchChainIds`, `bucketMetas` (`floors` argument), `TIER_SINCE`.
- Produces: a working `fill` command; `_meta.json` shape `{ mode: "fill", fromMs, toMs, recompute, chain, unlisted: string[] }`.

- [ ] **Step 1: Replace `parseArgs`** with `parseCommand(process.argv.slice(2))`; a `UsageError` prints its message and exits 1.
- [ ] **Step 2: Remove** the mode branches: `--backfill-unlisted` (the phase function too), `--backfill-blocks`, `--backfill-gaps`, `--recompute-from`, `--extend-to`, the `--resume` machinery (`ensureCkptMeta`'s resume argument, `takeSamplerLock`, the signal handlers' lock release stays for `rebuild` only). Keep the wipe + rebuild path for Task 3.
- [ ] **Step 3: The span.** Extension: scan the daily year hashes for the oldest `g.ticks` day as today's extend does → `toMs` = that day; `fromMs` must be < `toMs` else refuse "already covered — add --recompute". Recompute: `toMs` ≤ `dayFloor(now) - 1 day` else refuse. `spanEndMs = toMs + 1 day` (exclusive).
- [ ] **Step 4: Checkpoint pin.** `_meta` = `{ mode: "fill", fromMs, toMs, recompute, chain, unlisted }` where `unlisted = untrackedIds(net, await fetchChainIds(be0))` (pinned). On start: no `_meta` → write it; a matching `_meta` → continue (log "resuming the fill …"); a different one → refuse naming `--fresh`; `--fresh` deletes the directory first.
- [ ] **Step 5: Cursor pre-flight.** `cur = hgetall(cursorKeyOf(net))`; `inside = cursorsInsideSpan(cur, idsToWalk, spanEndMs, !chain)`; non-empty → refuse "the sampler has not finished <toMs day> yet (cursor <name> at <iso>) — rerun once it passes" and exit 1, writing nothing (not even `_meta`).
- [ ] **Step 6: `--dry-run`.** Print net, span, mode, the chains (catalog + unlisted, or the one `--chain`), the tiers (daily; hourly+5m where the span reaches ≥ TIER_SINCE), the floors/spine/`u.cov` decision, and "no lock"; exit 0 before any write or checkpoint.
- [ ] **Step 7: The predecessor at the oldest edge.** Extend `walkChain`'s `onPage` to `(recs, older)` where `older` is the page's records below `cutoffMs` (newest first). `walkMetaCkpt` and `walkGlobalCkpt` take `pred: number | null` from the first non-empty `older` (its newest timestamp) and use it at the drain: metas thread `stamps` through `stampRun(run, pred, …)` for the final run (replacing the inline `i > 0` loop with the shared helper for the drain round only, keeping the cut rounds as they are), globals pass `pred` as `prevTs` to `bucketGlobals` when the residual is empty. For an extension (`fromMs` at genesis) `older` never comes: `pred` null, as now.
- [ ] **Step 8: One chain loop.** `ids = chain ? [chain] : [...lineageIds(net), ...unlisted]`; for each id (pool of `FILL_POOL`, `Promise.all` over slices as the full rebuild does): the checkpoint-done skip, the seek from `cur["m.<id>"]` (a chain with no cursor: log "no cursor — skipped" and record done, and if it is an unlisted chain set `coverageSuppressed = true`), `walkMetaCkpt(id, fromMs, spanEndMs, seed, { floors: !unlistedSet.has(id) && !chain })` — pass `floors` through to `bucketMetas` and to the divert (`cfloors` null when false). Then, unless `chain`: `walkGlobalCkpt(fromMs, spanEndMs, seedG)` with its own seek, then `writeFloorsAndFinish(catalogIds)`.
- [ ] **Step 9: `u.cov`.** Unless `chain` or `coverageSuppressed`: for every day in `[fromMs, toMs]`, every bucket of every tier that `tierExistsAt` for it, set `<bucket>|u.cov = 0` into one IncMap and write it through `store.applyWrites` in 400-field slices (no SCAN: the span's buckets are generated). When suppressed, print which chain and that the span's unlisted figure stays "not measured".
- [ ] **Step 10: Tier floor in `flushFinal`.** Skip (and drop from the residual) any `1h`/`5m` field whose bucket start fails `tierExistsAt`; remove the separate 5m-expiry guard if `TTL_S["5m"]` is null (keep-forever) — read `TTL_S` and keep the guard inert otherwise.
- [ ] **Step 11: Summary.** Per chain as today; last line `filled <from> → <to>: <fields> fields, <n> chains, <u> unlisted[, floors untouched (--chain)][, coverage suppressed: <chain>]`; `rmSync` the checkpoint directory at the very end (after `u.cov`).
- [ ] **Step 12: Verify** `npx tsc -p tsconfig.scripts.json`; `npx tsx scripts/rebuild-trends.ts --net=mainnet fill --from=2023-11-13 --dry-run` prints the span `2023-11-13 → 2024-07-01`, 6 catalog + 5 unlisted chains, daily tier only, no lock; `… fill --from=2026-10-01 --to=2026-10-02 --recompute --dry-run` prints all three tiers; `… --extend-to=2023-11-13` prints the redirect and exits 1.
- [ ] **Step 13: Commit** `feat(scripts): fill — one walk that completes a span of days, resilient by default`.

### Task 3: `rebuild`, `wipe`, the header and the docs

**Files:**
- Modify: `scripts/rebuild-trends.ts` (the wipe/rebuild path, the header), `app/api/CLAUDE.md`, `CLAUDE.md` (root), the memory runbook is the session's (not in the repo).

- [ ] **Step 1: `rebuild --days=N` / `wipe`.** The existing wipe + N-day rebuild path (lock, cursors, unlisted ride-along, `markUnlistedCoverage`) runs under `kind: "rebuild"`; `kind: "wipe"` is the wipe alone. Both print `about to delete every t:<net>:* key (<count> keys) — type yes to continue` and read one line from stdin; `--yes` skips it; `!process.stdin.isTTY && !yes` refuses. `--days` stays capped at 400.
- [ ] **Step 2: The header** (lines 1–100): rewrite around the three commands, keeping the CRASH SAFETY, HONESTY and "mechanics" paragraphs and folding the learnings: one walk, no lock and why, the cursor pre-flight, the span edge, the tier floor, what cannot be filled (`f.*`), the redirects for old flags.
- [ ] **Step 3: Docs.** `app/api/CLAUDE.md`: the deploying paragraph's `scripts/rebuild-trends.ts --recompute-from` repairs → `fill --from=<day> --to=<day> --recompute`; root `CLAUDE.md` "Deploying" paragraph likewise (`--recompute-from` appears there). Grep both for `extend-to`, `backfill-`, `recompute-from` and fix every mention.
- [ ] **Step 4: Verify** `npm run typecheck`, `npx vitest run`, and `grep -rn -E "recompute-from|extend-to|backfill-(gaps|blocks|unlisted)" --include=*.md --include=*.ts . | grep -v node_modules` shows only the script's redirect table and this plan/spec.
- [ ] **Step 5: Commit** `feat(scripts): rebuild and wipe ask first; the header and docs speak fill`.

### Not in this plan

- Running the 2023-11-13 fill (the user starts it after merge — it is one to two days against the production store).
- Closing PR #81 in favour of the fill PR (the retry commit is on this branch).
