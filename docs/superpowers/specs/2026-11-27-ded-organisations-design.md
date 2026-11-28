# Who submits the data: Digital Evidence's organisations, Dor's devices — design

Branch `feat/ded-tenants`, from master at `cedcb989` (2026-11-27).

## Why

On 26 Nov Digital Evidence's (DED) fees rose about twelvefold in a day. The History note said so,
correctly, but nothing in the app could say WHO: the chain only showed more and larger snapshots.
Every DED data update is a `MetagraphBatchMessage` carrying an `orgId`, the organisation that
submitted it. Read that way, the surge was Open Poker (about 90% of the batches), with Gate AI
second. The user wants both readings the app is built on:

- **live** — who is writing into DED right now (spotting who drove a surge as it happens);
- **measured history** — a running picture of who uses DED, over any History range.

**Dor too** (user, 2026-11-27: "include the work for DOR as well (count active devices)"). Dor
Technologies (DOR) is the only other network that carries data updates (a day of sampled globals,
2026-11-27: DED and Dor only). Each Dor update is a device check-in signed by the device's
`publicId` (a public key), with no name and no public directory, so Dor's reading is a COUNT —
active devices — never a breakdown by device.

The user's ruling on privacy (2026-11-27): an organisation id that is on chain unencrypted is a
public record; publishing it is the snapshot producer's concern, not ours.

## What is true on the chain and off it (recon, 2026-11-27)

- A DED data block holds up to ~150 `MetagraphBatchMessage`s:
  `{ batchId, batchRoot, orgId, timestamp, version }`. One batch commits a group of an
  organisation's fingerprints as one hash; how many fingerprints a batch covers is NOT on chain.
  **The unit we count is the batch**, and every surface says "batches", never "documents" or
  "fingerprints".
- The chain carries the organisation's id only. Names come from **Digital Evidence's own public
  API**: `GET https://lb-mainnet.ded-ingestion.constellationnetwork.net/v1/fingerprints/latest?limit=500`
  returns the newest fingerprints, each with `orgId`, `orgName` (and `tenantId`/`tenantName`, a level
  below the organisation that the chain never shows — out of scope). An organisation appears there
  only while it is submitting, so names ACCUMULATE over time. dagscan.io does the same ("names are
  added by DagScan where known"); it has named 31 of the 47 organisations seen since DED's genesis
  (`https://api.dagscan.io/metagraphs/<DED>/evidence/summary`).
- Known today: `c9834e11…` Open Poker, `ff591af5…` Gate AI, `d61768f8…` Lotto Works,
  `567332a1…` DAGDaily.com, `dd8bec70…` Digital Evidence Labs.
- **DED's own L0 serves every snapshot by ordinal**, back to genesis (ordinal 1 =
  2025-09-15T10:16Z): `<urls.l0>/snapshots/<ordinal>` (the directory's `urls.l0`, already read by
  `app/api/network/metaL0.ts`). An empty snapshot is ~4 KB, one with data up to ~200 KB (the data
  blocks are JSON byte arrays), 0.2–0.7 s each. DED is at ordinal ~3.31M and currently seals
  ~1,500 snapshots an hour.
- **Dor's data updates** are `{ publicId, signature, dts, dtmCheckInHash, maybeDorAPIResponse }`
  check-ins; a sample of 33 check-ins held 14 distinct devices. Dor's L0
  (`http://l0-lb-mainnet.getdor.com:7000`) serves `/snapshots/<n>` deep (ordinal 25M answered), but
  Dor is at ordinal ~30.4M since 2023-11-13 and seals ~35,000 snapshots a day, so a walk to its
  genesis (~30M reads) is out of reach.
- The global snapshot route already decodes each DED data block it reads
  (`app/api/snapshot/decodeChannel.ts` → `DataBlockSummary`, the Data block card's facts).

## Goals

1. **Snapshots › Data blocks, live.**
   - DED: each data block's column of boxes in the chamber is BANDED by organisation share (the box
     split by who filled it), and the Data block card lists "By organisation" (name, batches) under
     its updates by kind.
   - Dor: the Data block card states how many devices checked in ("Checked in by N devices"); no
     banding (anonymous, many).
2. **History: ONE rail card for who submits a network's data** (user, 2026-11-27: "add a card and
   mention if there [is] no data block and therefore nothing to show"). NOT a deck-wide measure —
   History's one picker is untouched. It reads History's committed scope (the plane brought forward,
   else the filter) and the range on screen:
   - DED: **Organisations** — a small stacked chart of batches by organisation over the range, and
     each organisation's share of the range (bar + percent), "N active of M seen".
   - Dor: **Devices** — active devices per bucket over the range as a line, and the range's own
     distinct count ("N devices checked in").
   - Any other network: the card stands and SAYS so — "<network> carried no data blocks in this
     range, so there is no one to show" — never an empty chart.
   - The whole network (no network in scope): the card lists the networks that carried data in the
     range with their reading (DED "5 organisations", Dor "N devices"), each row committing that
     network's focus.
3. **The Metagraph card (dossier)**, last 24 hours in every view (user, 2026-11-27):
   - DED: a folded group **Active organisations** in the "Online nodes" grammar — header = the count
     with ≥ 1 batch in the last 24 hours; opening it lists each with its batches and a share bar;
     beneath, "N seen since <month year>".
   - Dor: one fact, **Active devices** — distinct devices that checked in in the last 24 hours.
4. **AI notes** say who: History's DED note can name the organisations that moved (start → end inside
   the range, the existing `edgeLevels` grammar), Dor's can state its active devices and their move;
   the Data blocks note can name who wrote the window's data (DED's organisations, Dor's device count).
5. **Names** for DED's organisations: seeded ONCE from dagscan (offline, the source recorded per
   name; user 2026-11-27: "Yes, seed once"), then kept current from DED's own API. An unnamed one
   reads "Org <first 8 of its id>" (dagscan's convention) everywhere, the scene included.

## Non-goals

- The Hypergraph view (option C, organisations orbiting the hub) — rejected by the user.
- DED's tenants (below organisations): not on chain.
- Fingerprint counts: not on chain; DED's own `/v1/fingerprints/stats` is a different quantity and is
  not shown beside ours.
- Naming Dor's devices, or breaking Dor down by device.
- Networks beyond DED and Dor. But who submitted a data update is read by ONE function that knows
  each network's field (`orgId` for DED, `publicId` for Dor), so a future network is one entry.
- Dor's history before the sampler starts, beyond the bounded back-fill below.

## Anti-goals

- A fabricated or interpolated count. A bucket whose DED snapshots were not all read is NOT
  MEASURED (null), never 0 (rule 10). A missing name is "Org c9834e11", never a guess.
- A second chart implementation: the stacked chart is `TrendChart`'s (rule 12 / one chart).
- Depending on dagscan for anything at runtime (the one-off name seed is offline).

## Constraints

- **Reader first** (root CLAUDE.md, the store is shared by every deployment): ship the code that
  READS the new store fields and tolerates their absence before the backfill writes them.
- Store keys keep the fixed `mainnet` segment (`STORE_NS`).
- Rule 4 (every export covered by its sibling test), rule 3 (organisation colours through the
  palette/tokens, no raw hex in `scene/` or `components/`), rule 5 (no per-frame allocation in the
  banding), rule 10 (honest gaps), the hover pairing (convention 9: a hovered organisation row
  previews its bands; a new hover channel if one is added is named in `cardHoverBoundary`).
- `snapshot-exact` cache key bumps (v11 → v12) when the row gains organisations; `NOTES_VERSION`
  bumps when the facts change.
- Crons run on production only; the names writer and the sampler leg fail closed without
  `CRON_SECRET`, like the rest.

## Approaches considered

1. **From the chain, names from DED (picked — "your pick", user 2026-11-27).** Live: the server's
   existing decode counts batches per `orgId` per data block. History: a new sampler leg reads DED's
   own L0 snapshots since its cursor and stores batches per organisation per bucket; a one-off walk
   back-fills to genesis. Names: a cron collects DED's API answers into the store. Most work; every
   number is ours, checkable, and fits History's tiers and ranges.
2. **dagscan's API** (`/evidence/summary|daily|hourly`). Quick, no walk — but a third-party
   dependency whose figures we cannot check, at its own grain. Rejected.
3. **Live from the chain, history from dagscan.** Two sources that can disagree on one screen.
   Rejected.

## The design

### Data: one count, three places it is read

- **Who submitted a data update** is read by ONE pure function in `src/data/` (beside
  `payloadKinds.ts`): per network, its submitter field (DED `MetagraphBatchMessage.orgId`, Dor
  `publicId`). The global-snapshot decoder, the sampler leg and the walk all call it, so the three
  can never count differently.
- **Live (exact row).** `DataBlockSummary` gains `submitters: { id: string; updates: number }[]`
  (busiest first; DED's ids are organisations, Dor's devices). `snapshot-exact-v12`.
- **History — its OWN key family, not the `t:` tiers** (builder check, my call): `sub:mainnet:…`
  (the `STORE_NS` segment), like geo and stake. So `rebuild-trends.ts rebuild|wipe` never deletes
  what only a multi-day walk restores, and `/api/trends` payloads do not grow by ~50 series for every
  plane. Its own read route serves the card and the dossier.
  - DED: batches per organisation per bucket, 5m / 1h / 1d.
  - Dor: active devices are DISTINCT counts, which do not sum across buckets, so the store keeps the
    set of device ids per bucket (exact, small: hundreds of devices) and answers a count for any
    bucket or range by union. Exact, never an estimate (rule 10).
  - A coverage marker per bucket per network: a bucket the leg did not fully read is NOT MEASURED
    for that network, never 0.
  - Written by a new leg of `/api/trends/sample` that reads each network's L0 `/snapshots/<n>` from
    its own cursor (in Redis, like the others) to the chain's latest — today ~375 DED and ~365 Dor
    snapshots a run.
- **Back-fill**, its own command (not every `fill`), resumable (rerun the same command):
  - DED from ordinal 1 (2025-09-15, its genesis): ~3.3M snapshots.
  - Dor for the last 90 days (my call: ~3.2M snapshots, the same order as DED's whole walk); older
    History ranges read not measured for Dor's card, said so.
  - The builder bounds concurrency (each L0 is one public load balancer — be a polite client) and
    may skip snapshots the explorer's records already show carry no data blocks, if that is exact.
- **Names.** A store hash (`sub:mainnet:ded:names`) of `orgId → { name, source: "ded" | "dagscan",
  namedAt }`:
  - seeded once, offline, from dagscan's `/evidence/summary` (source `dagscan`);
  - then a step of the quarter-hourly cron reads DED's `/v1/fingerprints/latest?limit=500` and adds or
    updates names (source `ded`; a name is never deleted).

### Surfaces

- **Snapshots › Data blocks.**
  - The data-mark column's boxes are banded by organisation share, each band in its organisation's
    colour (the mockup `placement.html` A; `.superpowers/brainstorm/44815-1795797729/content/`).
    How the band is drawn (sub-instances or a shader split) is the builder's, within rule 5 and the
    packed pool.
  - The Data block card: a "By organisation" list (dot, name, batches) under updates by kind.
  - Hovering an organisation row previews (lights) its bands; it never commits.
- **History** — the one card in Goals 2. It is a new rail card slot in History's lane (manifest
  `components/railCards.ts`, its hint pinned by `railCards.test.ts`):
  - its chart is `TrendChart` (stacked for DED: the top organisations by the range's total each a
    layer, the rest one "Other (n)"; a line for Dor);
  - counter rules apply: trimmed edges, null where not measured.
- **The Metagraph card (dossier)** — DED's group, mockup `dossier.html`; Dor's one fact, "Active
  devices":
  - "Active organisations" folded group after "Online nodes"; header count = organisations with ≥ 1
    batch in the last 24 hours.
  - Rows busiest first: dot, name, batches (24h), share bar.
  - "N seen since Sep 2025" beneath.
  - Source: the trends store's last 24 hours, through the one route above.
- **Colours** (user, 2026-11-27: "own hues, chamber rule"):
  - Each DED organisation gets one hue of its own, deterministic from its `orgId`, kept CLEAR of the
    networks' identity hues (the palette's zones and `spreadColliding`), through the palette's
    HUD/scene lightness pair. The same in the chamber, the cards and History.
  - In the chamber the bands follow the approved column look (316bc8c5, 2026-11-23): neutral down
    the trail, coloured on the active row, a hover, or while DED is committed.
- **AI notes.**
  - History's DED facts gain, per top organisation, its batches start and end of the range
    (`edgeLevels`) and its share of the range; the organisations' names join the note's names so the
    gate scopes them.
  - The Data blocks note's facts gain the window's organisations (batches each).
  - The prompt is steered, not the text (`ai-notes-prompt-over-code`); `NOTES_VERSION` bumps.

## Left to the builder

- The exact route shape and path for names + the dossier's 24 hours.
- How the band split is drawn in the scene.
- How many organisations get their own History layer before "Other".
- Concurrency, retries and the data-skip optimisation of the walk.
- Whether the sampler leg runs every 15 minutes or on its own slot, within the cron's time budget.
