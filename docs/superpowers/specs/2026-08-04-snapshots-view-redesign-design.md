# Snapshots (ledger) 3D view — redesign

**Date:** 2026-08-04
**Branch:** `snapshots-redesign`
**Status:** design approved, ready for planning

---

## 1. What this changes and why

The Snapshots view today is a seven-floor stack: four floors of validator nodes, two floors of
snapshots, and one symbolic "data producers" floor. Two problems drove the redesign:

- **The node floors dominate a view that is about snapshots.** Four of seven planes carry
  validators, which the Hypergraph and Geography views already explain better. The *when* view
  should be about the artifacts, not the machines that make them.
- **The global-snapshot floor reads empty.** It carries one block per tick sized by anchor count
  and nothing else, while the thing that makes a global snapshot interesting — that it carries
  every metagraph's sealed payload — is invisible.

The redesign reduces the chamber to **two snapshot floors**, moves the validators to **rails on
the floors' front edges**, and gives the global floor a real measure to render: the **bytes** each
metagraph anchored into each tick.

### Goals

1. Only snapshot layers are floors.
2. Nodes live on the front edges of those floors.
3. The global snapshot layer shows what it is carrying, without restating the floor above it.
4. The work is in the three.js scene, not in HTML panels.

### Non-goals

- No changes to the focus ladder's rungs, the rail card manifest, or `railLadderBoundary.test.ts`.
- No new store selection channels.
- No new subject kinds (see §9 for the one deliberately deferred).

---

## 2. Fact base

Verified against mainnet during the design session; the design depends on these.

- **A global snapshot carries the metagraph snapshot binaries**, not references:
  `value.stateChannelSnapshots` is `{address: [{value: {fee, content, lastSnapshotHash}}]}`, where
  `content` is the serialized metagraph snapshot as a byte array. This is why the raw L0 read is
  ~2.5 MB. **But the global L0 never interprets those bytes** — to it they are an opaque sealed
  payload it orders, charges for, and seals into the chain. So what a global snapshot knows about a
  metagraph is *how much of it it is carrying*, not its state. That distinction is the whole basis
  of §4.2.
- **Per-metagraph bytes already exist** in `SnapshotExact`: `perMeta[addr] = {count, fee, bytes}`,
  measured from `content.length`. **No API route change is needed.**
- **Never derive size from fee.** Constellation computes the fee with non-trivial logic; size is
  measured separately. (Existing project rule, restated because this design encodes size.)
- **Anchored KB per tick is heavy-tailed.** Sample of 533 ticks / 900 metagraph snapshots taken
  2026-08-04 from `/currency/{id}/snapshots` across 6 listed metagraphs:

  | statistic | KB per tick | anchors per tick |
  |---|---|---|
  | p50 | 5 | 1 |
  | p90 | 9 | 2 |
  | p95 | 10 | 2 |
  | p99 | 31 | — |
  | max | 883 | 105 |

  max/p95 = 88×. The sample covers 6 of 10 listed metagraphs and no unlisted anchors, so absolute
  KB is an undercount; the *shape* is the finding and it drives §6.3.
- **Most mainnet metagraph nodes are hybrid machines** (L0 + L1 on one box). DOR is the outlier at
  3 hybrid + 19 dedicated data-L1. Currency-L1 is never standalone. So counting "34 L1 nodes and
  162 L0 nodes" counts the same machines twice — this drives the rail partition in §4.3.
- **`SLOT_N` is 9** and ticks arrive every ~4 s, so the visible trail spans ~36 s — always inside
  the L0 node's ~30-minute retention. Every visible tick is measurable.
- **Metagraph blocks are rare**: over 600 snapshots sampled, SWAP had 4 non-empty (max 1 block),
  PACA and DOR none. Global snapshots carry $DAG blocks in roughly 2 of 60 ticks.
- **Currency activity varies enormously**: last currency transaction — DOR and USDC same day, SWAP
  hours, **PACA ~11 months**, **DED returns no transaction data at all** (a distinct state from
  dormancy: DED is a data metagraph with no token).

---

## 3. Decision log

Recorded because several are reversals, and the reasoning matters more than the outcome.

| # | Decision | Note |
|---|---|---|
| 1 | All six layer ids survive as focus rungs and cards; the four node layers render as rails, not planes | keeps `focusLadder`, `LedgerPanel`, layer cards and `railLadderBoundary.test.ts` untouched |
| 2 | The metagraph-snapshot floor keeps per-metagraph **lanes** | reversal of a mid-session proposal to stack all metagraphs at one position; stacking freed the width but left the room empty |
| 3 | The metagraph-snapshot floor keeps its **own time trail** | metagraph snapshots build their own history and in principle need not anchor at all |
| 4 | Upper floor width: one main field ordered data → hybrid, plus a narrow **currency gutter** (~1/6) on the right | rejected: three equal bands; a gutter that opens only on a block |
| 5 | The currency gutter's status line uses an **absolute** source, not a window | so it can say `PACA · DORMANT 11 MONTHS` and `DED · NO CURRENCY` rather than "none recently" |
| 6 | A committed filter gives that lane the **whole floor** | batch size per tick becomes visible for the first time; accepted cost in §8 |
| 7 | The global snapshot is **one object**, never a restatement of the chips above | it carries payload, it does not copy state |
| 8 | The global snapshot is a **byte bar**: fixed height and depth, width = bytes carried | uses the horizontal space the lanes stopped needing |
| 9 | The bar is divided into **bands** proportional to each metagraph's bytes, in lane order | one band per metagraph however many snapshots it batched |
| 10 | Lane → band is drawn as one **tapering ribbon**, not a strut plus a band | a wide bar makes the weighted strut and the band the same number; draw it once |
| 11 | Ribbons draw on the **lead row and the hot row only** | nine rows of ribbons overlap the lanes in front of them |
| 12 | Byte → width uses a **fixed p99-calibrated reference** with clipping, not a rolling maximum | reversal of an earlier recommendation; see §6.3 |
| 13 | Exact reads are **backfilled at boot**, in the background | so "unmeasured" is a fallback state, not a routine startup state |
| 14 | Node rails partition machines by **make-up** (L1-only / hybrid / L0-only); each machine appears once; **empty rails hide** | no double counting |
| 15 | Resting camera stays **face-on**; the diagonal remains the layer-focus move | lanes vertical, ribbons front-facing, rails read as rails |
| 16 | Station dials are **retired**; cubic anchor links are **replaced** by the ribbons | the rails now carry resting cluster identity |

---

## 4. Geometry — the chamber

### 4.1 Two floors

| plane | holds |
|---|---|
| upper — metagraph snapshots (`msnap`) | ten metagraph lanes across the width; per tick, each lane holds that tick's anchored snapshots as tiles (the existing `_anchorTiles` uniform-pitch grid within the lane cell). A narrow **currency gutter** on the right. |
| lower — global snapshots (`gl0`) | one **byte bar** per tick. A narrow **$DAG gutter** on the right, mirroring the currency gutter. |

X remains time (chains trail left, `SLOT_SP` apart, `SLOT_N` visible). Z remains lane position on
the upper floor. Y is now two heights instead of seven, with enough separation for the ribbons to
read.

### 4.2 The byte bar

- **Fixed height and fixed depth. Width alone encodes bytes carried.**
- The body is divided into **bands** proportional to each metagraph's `perMeta[addr].bytes`, ordered
  the same as the lanes above, with the **unlisted** aggregate as a neutral band at the end.
- A tick that anchors nothing still happened: it renders as a **minimum-width seam**, not a gap.
- A tick exceeding the scale reference is **clipped at the floor edge with the overflow stated as a
  multiplier** (`×12`) on its label. Clipping makes a monster tick more prominent, not less.
- The bar carries its own label: KB carried, anchors, ordinal.

### 4.3 Ribbons

Each anchoring lane sends one **tapering ribbon** from its lane column down onto its own band. Lane
order and band order match, so ribbons splay without crossing. Unlisted anchors get a **neutral
ribbon starting in mid-air**, since they have no lane — the first time the 3D view admits they
exist.

The lane above **counts snapshots**; the band below **measures bytes**; the ribbon is the
relationship between the two. Anchor pulses ride the ribbons.

Ribbons draw on the **lead row and the hot row only** (the model already enforces exactly one hot
row via `isRowHot`). Older ticks keep a single hairline strut.

### 4.4 Node rails

Machines are partitioned by **make-up**, each machine on exactly one rail, along the front edge of
the floor it belongs to:

| rail | machines |
|---|---|
| L1-only | run a metagraph L1 layer and no L0 |
| hybrid | run both |
| L0-only | run a metagraph L0 layer and no L1 |

**An empty rail hides and the remaining rails collapse up** — consistent with the explorer's
composition groups and `RoleChips`, which only ever emit groups that exist.

The rungs deliberately **overlap** the rails: committing `ml1` lights the L1-only *and* hybrid
rails; `ml0` lights L0-only and hybrid. The hybrid rail lighting under both is the visual statement
that they are the same machines — precisely what the old two-floor layout got wrong.

The same partition rule applied to the DAG's own validators on the lower floor (`hypl0`, `hypl1`)
yields two rails and hides the empty hybrid one — the same rule, a different outcome,
self-documenting.

Node meshes remain the shared `InstancedMesh` chips from hyper/geo; `Globe`'s ledger placement
writes **rail positions** instead of lane cluster positions.

### 4.5 Gutters

- **Currency gutter** (upper right): a status line per §6.7, plus the rare block sparkle.
- **$DAG gutter** (lower right): $DAG blocks from `global.blocks`, already carried by the existing
  poll.

### 4.6 Camera

Resting pose stays **face-on** (`viewRotY = -π/2`): the lead row centred, the trail receding
straight back, lanes vertical, ribbons front-facing, rails read as rails. The diagonal
(`ledgerLayerFraming`) keeps its job as the layer-focus move.

### 4.7 Dimensions

Starting values, to be tuned live against the running app rather than derived on paper:

- **Floor separation** keeps today's `rowMSnap` (2.5) → `rowGL0` (−11) gap of 13.5 units. The five
  retired planes are *removed*, not redistributed — the chamber gets shorter, and the ribbon run
  between the two remaining floors is unchanged. Lanes span `LEDGER.depth × LANE_SPREAD ≈ 27` in Z,
  so the widest ribbon splays about 2 : 1 across its drop; if that reads too shallow, the separation
  is the one number to raise.
- **Trail length** stays `SLOT_N = 9` at `SLOT_SP = 3.6`. Nine slots at ~4 s per tick is the ~36 s
  window that keeps every visible tick inside the L0 node's retention (§6.4) — lengthening the trail
  would push the oldest slots toward unmeasurable, so it is deliberately unchanged.
- **Byte-bar height and depth** are fixed and equal for every tick; only width varies (§4.2).

---

## 5. Behaviour

### 5.1 Focus ladder

Rungs are unchanged: `node → layer → network → all`. Two resolvers change shape:

- **`layer`** — a rung naming a floor (`msnap`, `gl0`) frames that plane. A rung naming a node layer
  (`ml1`, `ml0`, `hypl0`, `hypl1`) frames the **rails carrying it** along the front edge. This needs
  a rail framing in `cameraRig.ts` beside `ledgerLayerFraming`.
- **`network`** — no longer frames a lane at its L0 floor, because committing a filter expands that
  lane to the whole floor. It frames the floor, plus the committed metagraph's band below.

### 5.2 Filter

Committing rearranges the upper floor: the lane takes the whole floor, other lanes' tiles leave,
rails dim non-member machines.

**The byte bar keeps its full composition.** Every band stays; the committed one lights and the rest
dim. This asymmetry is deliberate: the floor above re-scopes to what you asked for, the bar below
remains the network-wide truth, so how much everyone else anchored is never lost.

**Hover previews the highlight, never the rearrangement.** A hovered network dims and lights exactly
as a commit would; only a commit expands the lane. Hovers must not relayout.

### 5.3 Picking

| subject | pick |
|---|---|
| chip on a rail | node (`nodeSelectActions`, ancestry = its layer + network) |
| floor plane or rail | layer (`layerToggleActions`) |
| tile on the upper floor | that metagraph **and** that global snapshot |
| band on the lower bar | the same, from the other end |
| ribbon | not pickable — a relationship, not a subject |

Tile and band picks are filter-first, subject-last, per the existing ancestry contract in
`pickActions.ts`. `hoverSnapOrd` keeps the LiveStrip ↔ bar cross-highlight; a band or lane hover also
writes `hoverFilter`.

---

## 6. Data & honesty

### 6.1 Two feeds, deliberately

| floor | source | latency |
|---|---|---|
| upper (counts) | polled `anchorIndex` / `metaCounts` | instant |
| lower (bytes) | exact L0 read, `SnapshotExact.perMeta[].bytes` | a beat later |

Counts are cheap and immediate; bytes are exact and arrive shortly after. The upper floor never
waits on the lower.

### 6.2 Never approximate across units

A tick whose exact read has not landed is **unmeasured**: a dashed outline at minimum width, no
bands, filling in when the read arrives. Width is never inferred from anchor count and never from
the fee.

### 6.3 The scale reference

**A fixed reference constant, calibrated to the p99 of anchored KB per tick, with clipping.**

Rejected alternatives and why:

- **Rolling maximum over the visible trail** — always fills the floor, but the past visibly moves
  when a monster tick arrives, and with max/p95 = 88× that move is drastic.
- **Long-window maximum** — set by a single outlier; every ordinary tick becomes a ~1% sliver, which
  is the empty floor this redesign is trying to fix.
- **p95** — roughly 1 tick in 20 clips; with 9 visible slots a clipped bar would almost always be on
  screen, so clipping would read as noise rather than as an event.

**p99** clips roughly 1 tick in 100 — about one every seven minutes — so a clipped bar is a real
event, while the median still reads at a useful fraction of the floor.

**Calibration method.** Bake the constant offline (`scripts/bake-ledger-scale.ts`, run manually when
the metagraph set changes, alongside the existing brand-hue and country-code bakes):

1. Fetch `/currency/{id}/snapshots?limit=300` for every id in `METAGRAPHS`.
2. Group by `timestamp` (the anchoring global tick) and sum `sizeInKB`.
3. Take the p99 over at least 500 ticks.
4. The polled feed excludes unlisted anchors, which the runtime exact read includes, so inflate by
   the unlisted byte share measured from ~20 exact reads.
5. Write the result as a documented constant in `domain/ledgerLayout.ts`.

**Provisional value: 60 KB**, from the 533-tick sample in §2 (p99 = 31 KB over 6 of 10 metagraphs)
scaled for coverage. The bake replaces it with a measured figure.

**Drift warning.** The Engine dev-warns when the p99 of measured ticks observed during a session
diverges materially from the baked constant — the same idiom as the existing `config.COLORS` ↔ CSS
token drift warning. A baked constant that goes stale as the network grows should announce itself.

### 6.4 Backfill

`RawSnapshotBridge` already fetches the live tick's exact read in **every view**, so any session
older than ~36 s is fully measured regardless of where the user has been. Only a cold page load is
dark.

So: **a one-time background backfill at boot** of the previous eight ordinals, rate-limited to a
couple per second rather than fired as a burst. Each ordinal is immutable and cached for a day, so
repeat visits and other viewers pay nothing.

`_seedHistory` maps onto the new layout without changing shape: the upper floor's trail is seeded
from the retained `globalSnapshots` window plus `getAnchor(ts).metaCounts`, exactly as today; the
lower floor's bands are seeded from the backfilled exact reads as they land, each slot rendering
unmeasured (§6.2) until its read arrives. So the two floors seed independently and the upper one is
never held back by the lower.

### 6.5 The lead row is honestly unfinished

Metagraph snapshots keep getting stamped into a tick for seconds after it appears. The newest lane
tiles therefore grow — that is the settling window, and the lead row says `forming…` until it goes
quiet, reusing the ~7 s `SETTLE_MS` idiom from `AnchoredTags`. The bar below does not settle: once
measured it is final.

### 6.6 Unlisted anchors

`unlistedCount` and their summed bytes become the neutral ribbon and neutral band. Today only a text
pill on the snapshot card admits they exist.

### 6.7 The currency status line

One new cached server route over `/currency/{id}/transactions?limit=1` for the ten metagraphs
(`unstable_cache`, ~10 min, honest 503 on failure like the existing routes). It distinguishes two
states a window-scoped feed cannot:

- `PACA · DORMANT 11 MONTHS` — a currency that exists and is quiet.
- `DED · NO CURRENCY` — a data metagraph with no token at all (the endpoint returns no data).

Under `all` the line is network-wide; under a filter it narrows to the committed metagraph.

---

## 7. Retirements

- Five of the seven floor planes.
- **The data-producers floor.** It was a label and a flow line with no nodes; with the floors gone it
  has nothing to stand on. Losing it is preferable to inventing a home for it.
- **The station dials** (`DIAL_R`, `_makeDial`, `buildDialGeometry`, `_gL0Ring` / `_dagL1Ring`
  glow) — the rails now carry resting cluster identity.
- **The cubic anchor links** (`curvePoint`, `LINK_SEG` tessellation) — replaced by the ribbons.
- The centred live block plus the plain trailing chain — replaced by the byte-bar trail.
- `HYP_SPLIT` — there is one lower floor now.

`LAYER_GEOM` keeps all six ids, but half now resolve to rail geometry rather than plane heights.

---

## 8. Accepted costs

- **Hover cannot preview the lane expansion.** Committing a filter is a relayout; a hover only
  previews the highlight. This is the price of decision 6 and the honest place to draw the line.
- **The width axis means something different under a filter** — metagraph identity under `all`,
  position within the batch when filtered. Precedent: the LiveStrip already re-scopes its bars to the
  filtered metagraph's own cadence. It must be labelled.
- **A clipped bar loses proportionality.** Its bands still show shares; the total is truncated and the
  overflow multiplier states by how much.
- **The baked scale constant can go stale.** Mitigated by the drift warning (§6.3).
- **Bands and ribbons rebuild when bytes land or a tick arrives.** This is event-time allocation,
  which the project rules permit and `noFrameAllocations` allows when marked — but it must be
  preallocated to ten metagraphs plus unlisted and marked `event-time`, or the test will fail it.

---

## 9. Deferred

**A metagraph snapshot as its own selectable subject.** It would need a new pick kind, a card slot, a
ladder rung, a carry policy and a `railLadderBoundary` entry. Instead, when a filter *and* a snapshot
are both committed, the **existing snapshot card gains that metagraph's share** — snapshots anchored,
KB, fee. Same information, no new rung. The raw layer's `AnchorLogTable` already proves the subject
exists if it later earns promotion.

**Per-block transaction counts.** Would require a per-hash fetch. Out of scope.

---

## 10. Code shape

Respecting the enforced layer rules: `domain/` pure with colocated tests, `scene/` adapters that read
domain and write GPU, `Engine.ts` the only store bridge.

### New / changed domain (each with colocated tests)

| module | responsibility |
|---|---|
| `domain/ledgerLayout.ts` | two floor heights, rail geometry, lane X positions, gutter bounds, the baked scale constant |
| `domain/ledgerBands.ts` *(new)* | pure: `perMeta` bytes + lane order → band spans, ribbon endpoints, clipping and overflow multiplier, minimum-width seam |
| `domain/ledgerRails.ts` *(new)* | pure: machines → the three make-up rails, empty-rail suppression, positions along the front edge |
| `domain/ledgerModel.ts` | slot model retained; unmeasured-tick state; lead-row settling |
| `domain/cameraRig.ts` | rail framing beside `ledgerLayerFraming` |
| `domain/pickActions.ts` | the tile/band action (filter + snapshot) and its test |

`domain/focusLadder.ts` is unchanged.

### Scene

`scene/views/LedgerView.ts` is 979 lines and this touches most of it, so it splits:

- `LedgerView.ts` — composition, the `SceneView` contract, floors, labels, fade/alpha ownership.
- `scene/objects/ByteBar.ts` *(new)* — the bar, its bands, the trail.
- `scene/objects/Ribbons.ts` *(new)* — lead-row and hot-row ribbons, anchor pulses.
- `scene/objects/NodeRails.ts` *(new)* — rail geometry and the dim/lighting response.

Root-group `visible` stays owned by the Engine, per `sceneViewContract.test.ts`.

### Data / components

- `src/data/ledgerLayers.ts` — copy updated for the two floors and four rails; user-facing wording
  keeps the standing rule (the stack **anchors state**; "settlement" is reserved for the DAG a
  snapshot pays).
- `RawSnapshotBridge` — boot-time backfill of the previous eight ordinals, rate-limited.
- `app/api/currency-activity/route.ts` *(new)* — the batched, cached last-transaction read.
- `scripts/bake-ledger-scale.ts` *(new)* — the calibration bake.

### Test gates to satisfy

`layerBoundaries`, `domainExportCoverage`, `noFrameAllocations` (event-time markers on the band and
ribbon rebuilds), `noHardcodedColors` (the neutral unlisted tone must come from a token, and the
identity scene map stays a required ctor argument), `sceneView` / `sceneViewContract`,
`selectionBoundary` (the tile/band pick routes through `pickActions` + `applyClickActions`),
`railLadderBoundary` (unchanged — no new rungs, deliberately).
