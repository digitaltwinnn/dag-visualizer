# Shared live feed — design

Date: 2026-10-25. Status: approved by the user, 2026-10-25.

## Why

Three of the app's seven data feeds are fetched by every open browser tab straight from
Constellation's public servers, with nothing shared between tabs:

| feed | upstream | per tab |
|---|---|---|
| Global snapshots | block explorer `/global-snapshots/latest` | 1 request per 5s poll |
| Metagraph snapshots | block explorer `/currency/{id}/snapshots?limit=50`, one per metagraph and per unlisted chain | ~11 requests per poll |
| DAG nodes | L0 and L1 load balancers `/cluster/info` | 2 requests per 30s |

Measured on one tab (2026-10-25, mainnet, 30 s): 74 requests, about 2.5 per second. Upstream
load therefore grows linearly with the audience: 100 tabs is about 250 requests per second
against an API we do not control. The likely failure is rate-limiting, which every tab would see
at once as failing lanes in the pulse strip, and there is no layer on our side that could absorb it.

The other four feeds already go through our own routes with edge caching (directory 5 min, geo
map 1 h, trends 5 min, snapshot reads a day). This design brings the three live feeds into the
same shape.

## Goal

Upstream load that stays flat as the audience grows: each Vercel region asks Constellation about
once per poll interval, whatever the number of tabs, and every tab reads the region's cached
answer.

## Non-goals

- The four feeds that are already cached do not change.
- No push channel (WebSocket or SSE). Polling stays; only its target changes.
- No change to what the app shows or how the pulse strip reads a feed.
- No fallback to direct Constellation reads when our route fails (the repo's "no complex fallback
  logic" ruling, 2026-09-09). A failing route is a failing feed, stated honestly.

## Anti-goals (what would make this a failure even if it worked)

- **A shared answer that silently drops data.** The current metagraph poll is provably gap-free
  (it widens its request until it reaches what the tab already holds). A shared, fixed answer
  cannot do that per tab. Losing that guarantee would mislabel listed anchors as "unlisted" in
  the Snapshots chamber — the exact bug the self-healing catch-up was built to fix.
- **Stale data presented as live.** If the edge serves an old answer, the strip's ages and the
  live counters must still be true.

## Design

### One route for the live snapshot feeds: `/api/live`

A dynamic route (it reads `?net=`), cached at the edge per URL:

- `Cache-Control: public, s-maxage=4, stale-while-revalidate=2`. Four seconds sits under the 5 s
  poll, so consecutive polls from one tab never get the same answer twice; the short
  stale-while-revalidate keeps a burst of tabs from all missing at once.
- On a miss it reads upstream in parallel, each fetch with its own timeout, under a `maxDuration`:
  - the newest global snapshots: `/global-snapshots?limit=12` (a minute of chain at the fastest
    measured cadence, so the client's gap fill — `missedGlobals` — has what it needs);
  - every active listed metagraph and every unlisted chain: `/currency/{id}/snapshots?limit=50`,
    the same tail the client asks for today, so a Dor-sized burst still fits.
- Answers `{ builtAt, globals: [...], metas: { [id]: [...] }, failed: [ids] }`. `builtAt` is when
  the answer was read upstream, so the client can measure the edge's age honestly. `failed` lists
  any chain whose read failed, so the strip's metagraph lane fails for that cycle exactly as
  `cycleOk` makes it fail today (one failing chain may not hide behind its healthy siblings).
- When the global read itself fails, the route answers 503 and caches nothing.

The unlisted chain list is already cached server-side (`app/api/network/unlistedChains.ts`, 1 h);
the route reuses it rather than having every tab fetch it. **The route reads only the chains a tab
reads today**: the client skips "quiet" unlisted chains (an empty list, or no snapshot for
`RETIRE_QUIET_DAYS`) and re-checks them hourly. The server keeps the same quiet set, built by the
same rule and cached an hour, so a miss does not fan out to every dead chain the explorer lists.
*(Builder check: my call.)*

**Behind the edge, an in-function memo is core, not a contingency.** The edge caches per location,
and the function runs in one region, so without a memo every edge location with a viewer would
read upstream separately. The memo is a module-level promise per network with a 4 s lifetime,
checked against its own timestamp — deliberately not `unstable_cache`, which this repo has seen
stop revalidating over a long-lived process (`app/api/metagraphs/route.ts`). Concurrent misses
share one in-flight read. With Fluid Compute an instance serves many requests, so upstream reads
are about one per instance per 4 s; a handful of instances is the honest ceiling, not "one".
*(Builder check: my call.)*

### The globals have their own catch-up and seed: `/api/live/globals?limit=N`

The shared answer carries 12 globals, about a minute of chain. A background tab is throttled to
roughly one timer a minute, so it can wake more than 12 behind. When the jump in the newest
ordinal exceeds what the shared answer covers, the tab reads `/api/live/globals?limit=min(gap, 52)`
(cached a few seconds per `limit`, so tabs waking together share it) and fills with
`missedGlobals` as today. The boot seed (`init()`, today a direct `/global-snapshots?limit=52`)
reads the same route, so after this change no live read goes to Constellation from the browser.
*(Builder check: my call.)*

### One route for the nodes: `/api/live/clusters`

The L0 and L1 `/cluster/info` pair, cached `s-maxage=25, stale-while-revalidate=5` under the 30 s
poll. Same 503-on-failure rule.

### The client keeps its guarantees

`NetworkData` (`src/data/api.ts`) changes its fetch targets, not its model:

- `_tick` reads `/api/live` once per poll (one request instead of about twelve) and feeds the
  answer into the paths it already has: the newest global plus `missedGlobals`, then each chain's
  records into `_recordMetaSnaps`.
- **The gap guarantee stays per tab.** For each chain, if the shared answer's oldest record is
  newer than `heldNewest + 1`, the tab has fallen behind the shared window (a background tab woken
  up, a slow network). Only then does it run today's self-healing catch-up for that one chain,
  against a per-chain route `/api/live/meta/[id]?limit=N` cached a few seconds, so even catch-ups
  from many tabs share. An empty buffer (boot) is seeded the same way, through the per-chain
  route at the seed depth.
- `_fetchClusters` reads `/api/live/clusters`.
- `reportPoll` keeps its meaning: `global` reports the route's answer, `metasnaps` reports
  `cycleOk` over the chains (a chain in `failed` counts as a failure), `clusters` the cluster route.
- Every new fetch goes through `netUrl()` (the `netUrlBoundary` fence already enforces it).

### Honesty of the ages

The pulse strip's ages measure when the tab last got a good answer. With a cache in between, the
data can be up to one cache period older than that. Two options, to be decided:

1. Keep the age as "when this tab last heard", and accept up to ~4 s of hidden extra age.
2. Use the answer's `builtAt` for the global and metagraph lanes, so the age is the data's own.

Option 2 is more honest. It must not use the server's `builtAt` against the browser's clock: a
viewer's clock can be minutes off, which is why `/api/metagraphs` sends an age, not a timestamp.
And an age computed in the body is frozen at ~0 once the edge caches it. The skew-free reading
is the edge's own **`Age` header** (seconds the answer has sat in the cache): the beat is recorded
at `receivedAt − Age`, with the in-function memo's own age (sent as `memoAgeMs`, computed when the
answer is built) added. `reportPoll` gains an optional "landed at" time for this; the beat ring's
time-ordering already tolerates it. **Recommended: option 2, via `Age`.**

## Effect

| | today | after |
|---|---|---|
| requests per tab per minute | ~150 | ~14 (12 live + 2 nodes), plus rare catch-ups |
| upstream requests per minute | ~150 × tabs | ~180 per warm function instance (15 answers × ~12 reads, plus 2 node reads), whatever the tab count |
| worst-case delay of a new snapshot | 5 s | ~9 s (4 s edge + 5 s poll) |

The upstream figure applies only while someone is watching, and scales with the number of warm
function instances (a handful), not with the number of tabs.

## Risks and things to verify before building

- **Request collapsing at the edge.** Whether Vercel's CDN collapses concurrent misses decides how
  many requests reach the function; the in-function memo bounds what reaches Constellation either
  way. Measure both on a preview deployment with a burst of requests.
- **The `Age` header.** Confirm on the preview that Vercel sets it on cached answers to this route;
  if it does not, option 2 falls back to option 1 rather than to `builtAt`.
- **Function cost.** About one invocation per region every 4 s while anyone is watching — roughly
  20,000 per region per day at full use. Within the Pro plan; worth one look at the usage page
  after a day.
- **Payload.** The shared answer carries every chain's 50-record tail, about what a tab downloads
  today across its eleven requests, now in one response. Compression applies; measure it on the
  preview.
- **Tests in a `node` environment.** The route's assembly and the client's merge decisions (behind
  the window → catch-up, `failed` → cycle failure, `builtAt` → beat time) are pure functions with
  their own tests; the route itself gets a test with a mocked upstream.

## Decided in this design (Claude's calls, open to review)

- Edge cache 4 s for the live route, 25 s for clusters.
- 12 globals and the existing 50-record tail per chain in the shared answer.
- Per-tab catch-up through a per-chain cached route, only when a tab falls behind.
- No direct-to-Constellation fallback.
- The server applies the client's quiet-chain rule, cached an hour.
- An in-function memo (module-level, 4 s, timestamp-checked) is part of the first build.
- Globals get their own catch-up and seed route; the boot seed moves behind it.
- Option 2's clock is the edge's `Age` header plus the memo's own age, never `builtAt` against the
  browser clock.

## Decided by the user (2026-10-25)

- **Poll interval: 5 s.** The live route's edge cache is 4 s; worst-case delay ~9 s.
- **Ages are the data's own age** (option 2, via the edge's `Age` header plus the memo's age).
