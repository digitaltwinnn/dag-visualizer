# app/api — working notes

The server-side routes.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the eleven rules, run & test,
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
- **`/api/geo`** serves the validator IP→geo map live (cached 1h, 503 on failure) so the globe plots
  from one request; the client-side resolver fills any misses.
- **`/api/global/at`** answers BOTH directions between a global ordinal and its timestamp, and the
  asymmetry between them is the point. `?ts=` binary-searches ~23 tiny per-ordinal records to find the
  global carrying that exact stamp (the anchor join is timestamp EQUALITY). `?ordinal=` (2026-09-01)
  is the cheap direction — the ordinal IS the address, so it is one ~320 B cached read with no search
  at all. That is what makes the raw log's "anchored into" column affordable: the alternative was
  `/api/snapshot/[ordinal]`, which decompresses ~2.5 MB to reach the same field. Both results are
  immutable and cached for a day. ⚠️ `?ordinal=` is the FALLBACK for the raw log's anchored-into
  search, not its primary path: a global snapshot's own manifest already lists what anchored into it
  (`/api/snapshot/[ordinal]`'s `rows`), so that is the exact one-request answer wherever the payload
  host still serves the ordinal — this route covers the older ones it 404s.
- **`/api/snapshot/[ordinal]`** reads the raw L0 global snapshot (~2.5 MB) and returns a tiny exact
  summary plus one row per anchored channel entry. **An `ordinal: 0` marks a payload the decoder
  couldn't read, which the UI must show as undecoded rather than as zero.** Cached per ordinal
  (immutable; a transient upstream failure throws so it retries). It's called for the live and
  selected tick only — never the whole chain, never a poll loop — plus a one-time paced backfill on a
  cold load, because the trail otherwise opens with its unmeasured rows drawing no bars. Each ordinal
  is immutable and cached, so the backfill costs at most once per ordinal ever.
- **`/api/snapshot/[ordinal]/channel/[address]`** is the deep read behind the metagraph-snapshot card's
  third tier: it re-downloads the same ~2.5 MB global to reach ONE channel entry. The cost is accepted
  deliberately — cached immutably and run only from the two surfaces that ask for it (the card's
  `Read this snapshot` button, and arrival in the raw layer), never on a
  poll, never across the chain. The key includes **the snapshot's own ordinal**, because a fast
  metagraph batches dozens into one tick and a (tick, address) key would make every row share one
  decode. **A deterministic miss (the channel provably isn't in this immutable global) is cached
  like a success** — throwing it made every repeat of the same bad `(ordinal, address)` re-download
  the whole global, an anonymous amplification loop; only transient failures throw and retry.

⚠️ **The snapshot routes' PAST bound is DROPPED** (user, 2026-08-14 — the anchor log pages a
network's whole history and the payload follows the rows; "if abused I'll switch to Pro for DDoS
protection"). `app/api/snapshot/ordinalWindow.ts` remains the one home and still bounds the FUTURE
(+5, nonsense is not history) and **fails open** when its reference read fails. The accepted cost:
any historical ordinal is a valid anonymous ~2.5 MB pull + decode + cache write — once per ordinal
ever, since they're immutable. (The LB's serving depth varies per request — see the payload-depth
note above — so the band is no cost bound.) Re-tighten here when the plan changes.
- The client fetches `/api/metagraphs` on mount **and re-pulls every 5 min** — Vercel never restarts
  and ISR only freshens the *server* cache, so an idle tab must re-pull. Snapshot and cluster feeds are
  live client polling.

⚠️ **Adding geo FIELDS does not invalidate `unstable_cache`/localStorage** — bump the cache keys when
the field set changes.

⚠️ **`ip-api.com` is free-tier: HTTP-only, rate-limited per source IP, non-commercial use only.** Fine
at one batched call per 5-minute regeneration; **for a commercial product switch to a licensed HTTPS
provider.**

**There is intentionally no `$DAG` price networking** — don't add a market-data fetch unless something
in the UI actually consumes it.

**`data/` holds only baked BUILD artifacts.** `brand-hues.json` is baked offline by
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
