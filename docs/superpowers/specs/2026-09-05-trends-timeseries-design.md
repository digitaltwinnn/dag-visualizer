# Trends timeseries backend — design

**Date:** 2026-09-05 · **Status:** approved design, pre-plan
**Scope:** server-side sampling of network metrics into Upstash Redis + a public read API.
UI consumers are a later phase — this scope ends at a verified `/api/trends` response.

## Goal

The app measures everything live but retains ~52 ticks (~24 min) client-side, so it can answer
"what is happening" and nothing about "what has been happening". This feature persists tiered
timeseries server-side so trend readings over hours/days/years become possible — including the
per-metagraph byte rate vital that deliberately stands by today (`src/data/api.ts`
`_metaActivity`: "the honest source is a historical series the app does not keep yet").

## Decisions made in brainstorm (Alexander, 2026-09-05)

- **Four metric families**: anchoring activity, snapshot cadence/health, economics, fleet structure.
- **Three horizons**, tiered: last 24 h (fine), week–month (hourly), months–years (daily, forever).
- **5-minute buckets, 15-minute sampler cadence** (revised 2026-09-06 from 15-min buckets).
  Bucket resolution is independent of run cadence (records are bucketed by their own
  timestamps), so the finer buckets cost ~0.7 MB and zero extra commands or upstream traffic,
  and buy stall localization for the health family; cadence stays the considerate-traffic
  knob — the sampler's upstream traffic ≈ 1–3 % of ONE open browser tab of the app. Known
  trade, accepted: a slow metagraph's fine-tier series reads as a spiky comb of zeros; the
  hourly tier is the smooth reading.
- **Vercel Cron drives it** (account upgraded to Pro during the brainstorm). QStash was the $0
  alternative and remains a drop-in swap; not used.
- **Budget target**: everything inside the Upstash free tier (256 MB, 500 K commands/month).
  Sized: ~6 MB steady + ~1 MB/year, ~30 K commands/month (~6 %), ~0.7 GB of 10 GB bandwidth.
- **Mainnet only scheduled** at launch; the key schema carries `{net}` so integrationnet/testnet
  are one cron entry away, costing nothing until scheduled.

## Sources (audited — all already used by the app)

| Upstream | Fields used | Notes |
|---|---|---|
| `{be}/global-snapshots?limit=N` | `ordinal, timestamp, metagraphSnapshotCount, blocks[]` | tiny newest-first records; `metagraphSnapshotCount` is the AUTHORITATIVE anchor total (unlisted included) |
| `{be}/currency/{id}/snapshots?limit=N` | `ordinal, timestamp, fee, sizeInKB` | fee/size EXACT per snapshot; `timestamp` = the anchoring global's stamp |
| `/api/metagraphs` loader (shared import) | node lists w/ roles, per network | the same `unstable_cache`d function the route uses — zero added upstream traffic |

Never used by the sampler: the ~2.5 MB raw L0 snapshot reads (`/api/snapshot/*`) — those stay
reserved for the two existing surfaces that ask for them.

## What is stored — bucket contents

Buckets are assigned by each record's **own timestamp**, never fetch time. Per bucket:

**Global spine** (per net):
- `ticks` — global snapshots in the bucket
- `anchors` — Σ `metagraphSnapshotCount` (authoritative, unlisted included)
- `blocks` — Σ block counts
- `gapMax`, `gapSum` — seconds between consecutive ticks (mean = `gapSum/ticks`; max shows stalls)
- `feeFloor`, `kbFloor` — Σ over tracked metagraphs (floors by nature, labelled so in any UI)

**Per catalog metagraph** (×11):
- `snaps` — snapshot count
- `fee` — Σ datum (exact)
- `kb` — Σ sizeInKB (exact)

Deliberately absent: distinct-ticks-landed (near-redundant with `snaps`, per the api.ts note),
height/subHeight/epochProgress (counters that answer no trend question — the culled-facts rule).

**Fleet gauges** (hourly + daily tiers only; last-write-wins point samples):
- `nodes` total, `nodes:{id}` per network (12 incl. DAG), `layer:{l0|cl1|dl1}` totals
- per-country `cc:{XX}` — **daily tier only** (cardinality control)

≈ 40 fields per fine bucket (288 buckets/day at 5 min), ~56 hourly, ~90 daily.

## Redis layout

```
t:{net}:5m:{yyyy-mm-dd}    hash, field "{hh:mm}|{series}" → value   TTL 3 d
t:{net}:1h:{yyyy-mm}       hash, field "{dd-hh}|{series}"          TTL 120 d
t:{net}:1d:{yyyy}          hash, field "{mm-dd}|{series}"          no TTL
t:{net}:cursor             hash: last global ordinal + per-meta last ordinals + schema `v`
```

Command economy is the design driver (a naive 58-writes-per-run layout alone would exhaust the
free tier): a run touches ONE key per tier — HMGET the touched fields, merge the newly-seen
records' sums in memory, HSET back, update cursor. ~10 commands/run, pipelined into 1–2 HTTP
round trips. Single writer (one cron) makes read-modify-write race-free; a `SET NX EX` lock
guards against overlapping manual runs.

## The sampler — `app/api/trends/sample/route.ts`

Vercel Cron `*/15 * * * *` (entry in `vercel.json`), auth = `Authorization: Bearer ${CRON_SECRET}`.

Per run:
1. Read cursor.
2. Global list: grow-until-cursor (limit 60 → ×3 → cap 600 — the `_refreshOneMeta` self-healing
   pattern, `src/data/api.ts:414-451`). Beyond the cap the gap is ACCEPTED and stays a gap.
3. Each catalog metagraph in parallel (`allSettled`): same grow-until-cursor. A failed metagraph
   skips WITHOUT moving its cursor — self-heals next run.
4. Fleet gauge on runs crossing an hour boundary, via the shared `/api/metagraphs` loader.
5. Bucket, merge, write, advance cursor.

`export const maxDuration = 60` + per-fetch AbortController timeouts (the `/api/metagraphs`
precedent).

## The read API — `app/api/trends/route.ts`

`GET /api/trends?net=mainnet&window=24h|7d|30d|1y` → `{ v, net, window, buckets[], series{} }`.
2–3 HGETALLs per cache miss; `Cache-Control: public, s-maxage=300` (the `/api/metagraphs` CDN
idiom — route stays ƒ Dynamic, CDN caches per URL). Uses the READ-ONLY Upstash token.

**Honesty rules (rule 10 applied to storage):**
- A missing bucket is `null`, never 0 — zero means "measured none", null means "not measured".
  Sampler downtime renders as gaps, not as a flat zero line.
- `feeFloor`/`kbFloor` keep the floor label through every surface, as the cards do today.
- No backfill fabrication: history before the feature's deploy simply doesn't exist.

## Upstash usage contract

- **REST SDK** (`@upstash/redis`) + **pipelining** — serverless-native, no TCP pooling.
- **Core Redis only**: hashes + `EXPIRE`. No RedisTimeSeries (unsupported on Upstash — the
  tiered-hash layout IS the substitute), no RedisJSON (flat numerics), no Global replication
  (each replicated write bills as a command).
- **Single region**, co-located with the Vercel functions (iad1).
- **Eviction stays OFF** — an evicting trends store silently deletes the forever tier, which
  violates rule 10 (absent must mean "not measured", never "quietly deleted").
- **Env** (already injected by the Vercel-native marketplace integration, 69 days ago):
  `UPSTASH_KV_REST_API_URL` + `UPSTASH_KV_REST_API_TOKEN` (sampler, write) and
  `UPSTASH_KV_REST_API_READ_ONLY_TOKEN` (read route). `UPSTASH_REDIS_URL` (TCP) unused.
  Locally: `vercel env pull`.

## Next.js usage

Route Handlers on the default Node runtime; the read route's CDN caching via response headers;
`maxDuration` on the sampler; header auth. Deliberately NOT used: Cache Components / `use cache`
(requires the project-wide `cacheComponents` opt-in — a separate decision; the repo's existing
`unstable_cache` idiom stays), Edge runtime, Server Actions, ISR, `after()`.

## Where it lives + testing

`app/api/trends/` — `route.ts`, `sample/route.ts`, and PURE modules (`bucketing.ts`, `merge.ts`,
`keys.ts`) with colocated vitest (the `fetchGlobal.ts`/`probe.ts` precedent). Pure-module tests
cover: record→bucket assignment (timestamp bucketing, tier keys/fields), merge math (sums,
gauges' last-write-wins, gap/null semantics), cursor advance + grow-limit ladder, TTL selection.
Route behaviour verified against the dev server; a manual sampler run + read round-trip is the
end-of-scope acceptance check.

## Out of scope (explicitly)

- UI consumers beyond the /trends doc page (vitals wiring, in-view trend surfaces) — next phase.
- Scheduling integrationnet/testnet.
- Migrating `/api/metagraphs` off `unstable_cache`.

## Revision 2026-09-06 — rebuild tool, 90d window, /trends doc page (Alexander)

The original "no backfill" line is REVISED: it barred *fabrication*, and a backfill from the
explorer's own records is real measured history. `scripts/rebuild-trends.ts` is the recovery
tool ("useful when there is a bug"): it always wipes `t:{net}:*` first (merge-based writes
would double-count otherwise), walks the explorer's `meta.next` cursor paging (probed live —
`?limit=&next=`; `offset` is ignored) for the global chain and every catalog metagraph over
`--days` (default 90), feeds the SAME bucketing/merge modules the sampler uses, prunes 5m-tier
fields older than that tier's own retention, writes chunked `applyWrites` transactions, and
leaves the cursor at the newest backfilled ordinals so the cron resumes seamlessly. FLEET
gauges are not backfillable — no historical fleet record exists upstream — so f.* series begin
at the first live sampler run; the doc page says so.

Additions: a `90d` read window (daily tier, 91 points) and the `/trends` DOC OVERLAY page
(`components/docs/TrendsDoc.tsx` + `TrendChart.tsx` — hand-rolled SVG small multiples in the
app's token system; null buckets draw as GAPS, floors stay labelled). /about's "no database
behind this site" claim was amended — the trends store is a database, and the copy now says
exactly what it holds.
