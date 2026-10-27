# app/api — working notes

The server-side routes.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the twelve rules, run & test,
the architecture map and the dev workflow; **its rules govern this file too**.

## Data — server-side routes

Metagraph cluster endpoints are plain HTTP on custom ports with **no CORS**, so the browser can't fetch
them — but the Next Node server can.

- **`/api/metagraphs`** lists the directory, fetches each cluster's info server-side, geolocates IPs,
  computes identity hues, and returns `{ metagraphs, geo }`. **On failure it answers an honest 503** —
  no pre-baked fallback; the client keeps its last good data and re-pulls next cycle. The inner fetches
  are `no-store`, which alone would make the route dynamic, so the live fetch is wrapped in
  `unstable_cache` at a 5-minute revalidate (was 10 — halved 2026-08-14: a node-set restart read as "unknown node" for most of a cycle) (throwing on an empty result keeps a blip from being
  cached). A `maxDuration` and a per-fetch timeout keep a slow cluster LB from blowing the function
  budget.
- **`/api/live`, `/api/live/globals`, `/api/live/meta/[id]`, `/api/live/clusters`** (2026-10-25) are the
  shared live feed: one upstream read serves every tab (design:
  `docs/superpowers/specs/2026-10-25-shared-live-feed-design.md`). `/api/live` is the assembled
  answer (12 globals, each chain's newest `POLL.metaSnapTail`, the unlisted chain ids, `failed`) at
  `public, s-maxage=4, stale-while-revalidate=2`; `/globals` and `/meta/[id]` are the catch-up reads at
  the same header; `/clusters` is the L0 + L1 node lists at `s-maxage=25, stale-while-revalidate=5`.
  Each body carries `memoAgeMs`, which with the edge `Age` header dates the data (the client's
  `dataTime`). **Every window is derived from the client's poll in ONE home**, `windows.ts`
  (2026-10-25 — the routes held a second copy of the cadence, and the cluster poll moved 25 → 30s
  under them): the edge a little under the poll (4s for the 5s feeds, 25s for the 30s one), the
  memo at most 5s, because the two caches STACK — the oldest answer a tab can get is memo + edge +
  stale-while-revalidate, 10s and 35s today (`worstAgeMs`, tested). Each route holds a **module-level memo** (`upstream.ts`, per network) that checks its own
  timestamp and shares one in-flight promise between concurrent misses;
  never `unstable_cache`, whose revalidate is too coarse for a 4 s window. The memo drops an expired
  entry when it is read and sweeps expired entries once it holds more than 256. **`?limit=` rounds UP
  to a fixed ladder** (`limit.ts`'s `clampLimit` — the client's own limits, `META_LADDER` derived from
  `POLL` and the catch-up's growth, `GLOBALS_LADDER` = {12, `POLL.maxSnapshots`}), so an odd caller
  costs a few extra records, never a fresh upstream read and a memo entry of its own. **A miss runs
  its reads in parallel** — globals, the unlisted list and the listed chains at once, the unlisted
  chains as soon as their list lands — so its worst case is two 4 s upstream timeouts, under the
  client's 10 s abort. An upstream failure of the
  global read (or an empty cluster list) is a **503 with `no-store`**, so a blip is never cached; a
  failed chain read leaves the answer 200 and lists the chain in `failed`, and a failed unlisted-list
  read marks it with the `"@unlisted"` entry. `/api/live/meta/[id]` is **not an open proxy**: the id
  must be a tracked chain or a listed unlisted one, else 404 with no upstream read (503 when the
  unlisted list itself cannot be read).
- **`/api/geo`** serves the validator IP→geo map live (cached 1h, 503 on failure) so the globe plots
  from one request; the client-side resolver fills any misses.
- **`/api/trends`** serves tiered timeseries windows (`?window=24h|7d|30d|1y|all`) assembled
  from Upstash Redis; **`/api/trends/tile/[tier]/[unit]`** (2026-09-10) serves one calendar
  unit of a fine tier — a day of 5m buckets (`/tile/5m/2026-09-08`) or a month of hourly ones
  (`/tile/1h/2026-08`) — the range zoom's map-tile reads: user ranges are snowflakes, their
  units are shared, and a COMPLETE unit is immutable history shipped with a year of s-maxage
  (one Upstash read per CDN region ever — how keep-forever retention stays readable without
  touching the read-bandwidth watch-item). **Every tier keeps forever since 2026-09-10**
  (TTL_S all-null; the finite era's pending expiries were PERSISTed away one-time); history's
  FLOORS — where fine grain begins to exist — live in `src/data/trendWindow.ts` TIER_SINCE; **`/api/trends/sample`** is the Vercel-Cron sampler (15 min,
  `CRON_SECRET` auth) that pages the explorer stream since a Redis cursor and
  merge-writes 5m/1h/1d hash tiers. It also samples the UNLISTED chains — the explorer's `/currency`
  list less every tracked address — for their own counts, outside the fee/size floors, marking the
  buckets it measured them in with `u.cov` (History's unlisted figure is measured, not derived).
  **Where the fleet runs has its own key family** (2026-10-27): once an hour, beside the fleet
  gauges, the sampler stores the whole fleet and each network by country and by hosting provider
  into `geo:{net}:{YYYY}` (day buckets, `f.cc.*` / `f.isp.*`, `fleetGeo.ts`), with provider names
  in `geo:{net}:isp`. ⚠️ **It lives outside `t:{net}:*` on purpose:** a rebuild wipes that prefix
  and a location gauge can never be re-derived, and `/api/trends` ships every series a tier hash
  holds, so ~50 location series a day would ride every History payload undrawn. Nothing reads it
  yet; it exists so Geography has a past when something does (the AI notes design).
  ⚠️ **A PRESENCE MARKER MUST NOT BE A COUNTER.** The read route zero-fills an absent ADD field in
  every covered bucket (an honest "measured, none"), so a marker classed as a counter reads 0 where
  it is missing — the same value it has where it is present. `u.cov` is classed `set` in
  `merge.ts` `opOf` for exactly that reason; any new marker must be too. Spec:
  `docs/superpowers/specs/2026-09-05-trends-timeseries-design.md` — the key/field grammar,
  command budget, honesty rules (null = not measured, 0 = measured none; `g.ticks` is the
  coverage marker) and the Upstash usage contract (single region, eviction OFF, read-only
  token on the read route) live there. The pure modules beside the routes are the
  specification-by-test (keys/merge/bucketing/fetchSince/runSample/assemble).
  **`scripts/rebuild-trends.ts` is the recovery tool — and the ONLY store-repair route**
  (user, 2026-09-10: "use existing sweep functionality … even if it replays a day"): a
  whole-day replay through `--recompute-from` beats any surgical write, because the sweep
  rebuilds the day from the chain's own records and is authoritative over whatever it
  overwrites. Never hand-write store fields. Three modes: full wipe-and-rebuild
  (`--days`; always wipes first — merge-based writes double-count otherwise), wipeless backward
  extension (`--extend-to`; disjoint older records, the partial boundary day recomputed whole —
  ⚠️ the explorer's cursors are CRAFTABLE but two-dialected: global `{created_at, ordinal}`,
  currency `{hash}`, and a crafted cursor lands ON its record where server-issued ones are
  exclusive), and day repair (`--recompute-from`; for days a capped catch-up left as floors).
  Fleet gauges aren't backfillable (no upstream history exists). **Cron fires on the production
  deployment only; previews share the store read-only** — `CRON_SECRET` is deliberately absent
  from the Preview scope and the sampler fails closed. Self-heal: the cursor lives in Redis, a
  catch-up reaches 30K records per chain (~a day of DOR); beyond that the gap is ACCEPTED
  (rule 10) and `--recompute-from` repairs. A chain the store has never read (a new network, or a
  network's new address) is read back to its FIRST snapshot within the same depth
  (`fetchSince.ts`), not just its newest page. The History view (`/trends`) is the read route's
  consumer.
- **`/api/notes`, `/api/notes/request`, `/api/notes/warm`** (2026-10-27) are the AI notes: a few
  sentences a free model (the Constellation Gate, `GATE_API_KEY`, `GATE_MODEL`) writes about the
  figures a view is showing. **Mainnet only**; any other `?net=` answers `none`, before the subject
  is parsed (it is checked against mainnet's catalog, so a testnet network would otherwise 400). Notes live in
  their OWN key family, `ai:{net}:v{NOTES_VERSION}:{view}:{subject}:{span}` (`keys.ts`), never under
  `t:` (a rebuild wipes that prefix) or `geo:`: a note is a losable cache entry, and the families
  must not share a fate. ⚠️ **A prompt or a facts change bumps `NOTES_VERSION`**, which orphans every
  stored note at once (their TTLs reap them). Timing is `KIND_TIMING` in `keys.ts`: hyper and
  geography refresh daily (3-day TTL), the ledger and History's 24-hour note hourly (6 hours),
  History's daily pills daily, the 1-hour pill and a brushed range only when asked (15 minutes and
  30 days). `GET /api/notes` reads: `ok`, `none` and `request` are `public, s-maxage=300,
  stale-while-revalidate=600`; `pending`, `unavailable` and a 400 are `no-store` (a well-formed
  brush with no whole bucket in it is `none`, not a 400). The ledger's `dag` is folded into `all`
  (the same facts: one note). `POST /api/notes/request` writes the two on-request kinds, and
  `GET /api/notes/warm` is the quarter-hourly cron (about 26 Gate calls a pass, spaced 8 s — the free
  model's burst limit, measured 2026-10-27). **The honesty gate (rule 10) is mechanical**
  (`src/data/noteHonesty.ts`, the colocated test is its specification): every number the note
  states must match a fact the model was shown, within the precision it was written to, and a
  failing note is asked for once more with the reasons, then dropped and counted. Nothing is ever
  stored unchecked, and the model's text is untrusted (a plain string, never markup). **A failure
  holds its key** (`failKeyOf`, `FAIL_TTL_S` = 15 minutes): a read or request whose write failed
  leaves a marker, and the next read or request of that key answers `unavailable` without a model
  call, so a cache-buster or a 429 run cannot turn visitors into unbounded calls; the warm pass
  ignores the marker and never writes one. **Limits
  apply to brushed ranges only** (the one unbounded key space): 20 an hour per visitor, keyed by
  the first 16 hex characters of HMAC-SHA256(`CRON_SECRET`, ip), plain sha256(ip) where no secret
  is set (the raw address and the secret are never stored or logged; on Vercel
  `x-forwarded-for` is set by the platform, which is why the hash can be trusted there), and a
  2,000 a day tripwire; a cached range is served without counting. Every other kind is bounded by
  its key and a singleflight lock. **The warm pass is paced**: one item at a time, at least 8 s
  between Gate calls, no new item after 210 s (the worst item, two attempts at the 20 s timeout,
  still ends inside the 300 s `maxDuration`), because the free model answered 429 at about five
  calls in 15 s on 2026-10-27, and still refused 20 of 71 at 3.5 s. The cron fails closed without
  `CRON_SECRET`, like the sampler (and a preview has none). ⚠️ **Notes are written by production
  only** (R66, `notesWritable()` in `notes/store.ts`, tested per `VERCEL_ENV`): a preview shares the
  store, so there every route serves what is cached and answers a miss `none` — no note, no
  failure hold, no stats, and the warm pass writes nothing even with the secret. A local server (no
  `VERCEL_ENV`) writes. `NOTES_STORE=memory` (dev only, ignored in production) keeps a local dev
  server's notes out of the shared store. **Each UTC day's outcomes are counted** in
  `ai:mainnet:stats:{day}` (`NOTE_STATS` in `generate.ts`: `ok`, `gateFail`, `rate`, `http`,
  `timeout`, `empty`, `nokey`, `store`, `error`, `capped`, then the volumes `calls`, every Gate
  call, and `retried`, every note that needed its second attempt), and
  `npx tsx scripts/notes-stats.ts` prints the last 14 days on the read-only token: it is the
  go/no-go instrument for keeping the free model.
- **`/api/global/at?ts=`** binary-searches ~23 tiny per-ordinal records to find the global carrying
  that exact stamp (the anchor join is timestamp EQUALITY — which has exceptions: see the
  timestamp note in `src/data/CLAUDE.md`; such a row answers 404 here, honestly). Its one consumer is the anchor log's
  ANCHORED INTO column resolution. ⚠️ An `?ordinal=` mode was added and then **removed** the same day
  (2026-09-01): it existed only to let the raw log's anchored-into search fall back to a timestamp
  walk for globals the payload host no longer serves, and that fallback was cut as a second mechanism
  for a case two other columns already cover. Don't re-add it without a consumer.
- **`/api/snapshot/[ordinal]`** reads the raw L0 global snapshot (~2.5 MB) and returns a tiny exact
  summary plus one row per anchored channel entry. **An `ordinal: 0` marks a payload the decoder
  couldn't read, which the UI must show as undecoded rather than as zero.** Cached per ordinal
  (immutable; a transient upstream failure throws so it retries). The pull (`fetchGlobal.ts`) tries the L0 LB first and falls back to the archival nodes on ANY LB failure — a 404, a CDN block, a 5xx or a timeout (2026-10-04: the LB's CDN 403'd one source IP while the archives served) — and after a non-404 failure skips the LB for `LB_BACKOFF_MS` (10 min), so a blocked source stops knocking on the shut door every tick. It's called for the live and
  selected tick only — never the whole chain, never a poll loop — plus a one-time paced backfill on a
  cold load, because the trail otherwise opens with its unmeasured rows drawing no bars. Each ordinal
  is immutable and cached, so the backfill costs at most once per ordinal ever. **The fallback asks
  the nodes whose MEASURED FLOOR covers the ordinal** (2026-10-18, user: "we do know the depth a
  node serves … can't we query the nodes that we know actually have the snapshot?"): the census
  (`/api/archive`) records every global node's floor..latest, and the fallback used only its
  "archival" subset — on a day no node reached the 2023 floor (archivalCount 0 while three nodes
  served from Aug 2024) a year-old snapshot failed although nodes held it. Shallowest sufficient
  floor first; the shuffled archival list is the last resort. The route also sends `s-maxage` now:
  the live tip and the backfill are the same ordinals for every visitor.
- **`/api/snapshot/[ordinal]/channel/[address]`** is the deep read behind the metagraph-snapshot card's
  third tier: it reads the same ~2.5 MB global to reach ONE channel entry. **The pull is shared with
  the exact read** (2026-10-19, user: "I feel we're always pulling the snapshots already"): the data
  cache cannot hold the parsed global, so `fetchGlobal.ts` keeps the last few per instance for two
  minutes (`GLOBAL_KEEP_MS`) and shares an in-flight pull — a deep read on the live or just-pinned
  tick costs no second trip to the L0 nodes when it lands on the instance that pulled it; a failed
  pull is forgotten at once. Beyond that the cost is accepted
  deliberately — cached immutably and run only from the two surfaces that ask for it (the card's
  `Read this snapshot` button, and arrival in the raw layer), never on a
  poll, never across the chain. The key includes **the snapshot's own ordinal**, because a fast
  metagraph batches dozens into one tick and a (tick, address) key would make every row share one
  decode. **A deterministic miss (the channel provably isn't in this immutable global) is cached
  like a success** — throwing it made every repeat of the same bad `(ordinal, address)` re-download
  the whole global, an anonymous amplification loop; only transient failures throw and retry.
- **`/api/network/unlisted`** lists the UNLISTED chains — the explorer's `/currency` list less every
  tracked address — cached an hour (`app/api/network/unlistedChains.ts`, also the gate below).
- **`/api/network/[address]/snapshots`** pages one CATALOG chain (retired networks and former
  addresses included) or one of those unlisted chains — never an arbitrary address — for the anchor log: no params is the live tip, fetched fresh; `?before=N` is
  the ~25 ordinals below N as individual records, cached immutably (a day). Under All the client
  merges these chains itself (`components/datasection/useMergedLog.ts`), and under the Unlisted
  lens it merges the unlisted chains the same way.
  **`/api/network/[address]/snapshots/[ordinal]`** is one record of ANY currency chain, catalog or
  not (immutable, a day), and **`/api/network/[address]/chain`** is any chain's span — genesis date
  and newest ordinal (5 min); those two are gated by address shape only.
- **`/api/archive`** is the archive census behind the node card's Archive fact (1h,
  stale-while-revalidate 6h); **`/api/node-names`** is the Global L0's delegated-staking registry —
  validator names and opt-in (1h, `s-maxage`); **`/api/dev/css-stamp`** is the dev CSS canary's
  source hash (404 in production). All answer 503 on upstream failure.

⚠️ **The snapshot routes' PAST bound is DROPPED** (user, 2026-08-14 — the anchor log pages a
network's whole history and the payload follows the rows; "if abused I'll switch to Pro for DDoS
protection"). `app/api/snapshot/ordinalWindow.ts` remains the one home and still bounds the FUTURE
(+5, nonsense is not history) and **fails open** when its reference read fails. The accepted cost:
any historical ordinal is a valid anonymous ~2.5 MB pull + decode + cache write — once per ordinal
ever, since they're immutable. (The LB's serving depth varies per request — see the payload-depth
note above — so the band is no cost bound.) Re-tighten here when the plan changes.
- The client fetches `/api/metagraphs` on mount **and re-pulls every 5 min** — Vercel never restarts
  and ISR only freshens the *server* cache, so an idle tab must re-pull. Snapshot and cluster feeds are
  polled by the client through the `/api/live*` routes above.

⚠️ **Adding geo FIELDS does not invalidate `unstable_cache`/localStorage** — bump the cache keys when
the field set changes.

⚠️ **`ip-api.com` is free-tier: HTTP-only, rate-limited per source IP, non-commercial use only.** Fine
at one batched call per 5-minute regeneration; **for a commercial product switch to a licensed HTTPS
provider.**

**There is intentionally no `$DAG` price networking** — don't add a market-data fetch unless something
in the UI actually consumes it.

**`data/` holds only baked BUILD artifacts.** `retired.json` is written by the same brand bake
(see `src/net/CLAUDE.md`, retirement). `brand-hues.json` is baked offline by
`scripts/bake-brand-hues.ts` (run manually whenever the metagraph set changes) — it extracts each
metagraph's hue from its real brand, snapped into the palette's allowed zones, with
`brand-hue-overrides.json` as the manual escape hatch. `country-codes.json` is baked by
`scripts/bake-country-codes.ts` and effectively never needs re-running.

### Metagraph reality worth knowing

It drives the dossier and inspector text:

- Nodes are **hybrid** (several layers on one machine) or **dedicated**. On mainnet most metagraphs are
  3 hybrid nodes; DOR is the outlier with 3 hybrid + 19 dedicated dL1 nodes.
- ⚠️ **A peer id belongs to a LAYER, not to a machine** — each layer process runs its own keypair, so a
  hybrid answers with a different id on its l0 port than on its dl1 port (verified live 2026-08-09).
  `/api/metagraphs` therefore emits **`NodeInfo.ids`**, every layer's id for that IP in LAYERS order
  (`ids[0] === id`, the primary), and **signer matching reads `ids`, never `id` alone** — one matcher in
  `src/data/network.ts`, kept the only one by `src/data/signerMatchBoundary.test.ts`, because a local
  prefix compare looks like an ordinary string test and reintroduces the blind spot for that surface
  alone. Matching the primary only left every hybrid data-block signer rendering as `not in live set`
  while the machine sat right there in the list — the id set is per layer and so are the signatures.
- **cL1 is never a standalone node** — every cL1 node is also an L0 node, so the outer cL1
  shell is effectively always empty.
- **A metagraph has a real token only if it runs a cL1 cluster.** The `symbol` field is
  *always* set, so it is not a token signal (DED has a "DED" symbol but no token). The dossier's type
  descriptor derives from node roles, and a 0-node metagraph says just "metagraph" — type is unknowable
  without nodes.
- **The directory API lists l0/cl1/dl1 URLs for every metagraph whether or not that layer runs**, so
  URL presence means nothing. Only node presence does.
- Keep `config.METAGRAPHS` in sync with what the route returns, matched by `id`.
