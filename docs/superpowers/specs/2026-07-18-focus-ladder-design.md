# Focus/zoom ladder as data — design

**Date:** 2026-07-18 · **Origin:** consistency-hardening spec Part C#5 (deferred to its own
brainstorm) · **Branch (planned):** `focus-ladder`

## Motivation

Three views hand-roll laddered focus logic as scattered Engine branches — geo:
selection→country→node (`_applyGeoFocus`, `_focusInspectNode`); hyper: filter→node
(`_focusSelection`, `_focusHyperNode`, `_focusFilter`); ledger: layer→node walked TWICE with
slightly different shapes (`_setMode`'s ledger entry block incl. `autoLayerForNode`, and
`_focusLedgerInspect`). Each walk re-encodes the same three ideas by hand: **level priority**
(finest resolvable selection wins the camera), **fallback** (an unresolvable subject falls
down a rung), and **deselect step-up** (already data on the store side via `pickActions`'
zoom-level rule).

Beyond the mechanism, the brainstorm surfaced that the real subject is the **per-view
subject-level contract**: each committable level should be consistently expressed across
FOUR surfaces — store selection, 3D response (camera + highlight), explorer UI, and
right-rail facts card — plus a per-level **cross-view carry policy**. Today's matrix has
gaps in three places and one undocumented carry inconsistency (see the matrix below).

## The consistency matrix (target state)

Surfaces: **S** store commit · **3D** camera + committed highlight · **UI** explorer rows ·
**Card** right-rail facts slot. Bold = new in this work.

| View | Level | S | 3D | UI | Card | Carry on view switch |
|---|---|---|---|---|---|---|
| all 3D | network | `filter` | per-view framing + dim | TopBar strip; hyper/geo explorer rows | dossier | carries |
| all 3D | node | `inspect` | per-view node framing | hyper/geo id rows; **ledger browser rows** | node card | carries |
| geo | country | `country` | `countryFraming` + border + mask | country rows | **country card** | clears (view-scoped) |
| geo | cohort (city×provider) | **`cohort`** | **`cohortFraming` + steady glow** | rows (now committable) | **provider card** | clears (view-scoped) |
| ledger | layer | `layer` | `ledgerLayerFraming` | LedgerPanel rows | layer card | **clears (was: silently carried)** |
| ledger | snapshot | `snap` | hot-row brightness (no camera rung — deliberate) | LiveStrip (every view) | snapshot card | pins/carries (universal subject via LiveStrip) |

Deliberate exemptions (recorded, not gaps): hyper's composition groups stay DISCLOSURES
ONLY (2026-07-12 decision — no commit, no camera); the snapshot subject has no camera rung
(the trail slides left every tick; brightness is the response); the `rowProducers` floor is
symbolic (no nodes — don't fabricate).

## Part 1 — the ladder module (`src/engine/domain/focusLadder.ts`)

A new domain module, peer to `viewPolicy.ts` (the same allow-list idiom), with colocated
tests (the domain-export gate applies). Exports:

- `FocusLevel = "node" | "cohort" | "country" | "layer" | "network" | "all"` — the full
  vocabulary; each view uses a subset.
- `SelectionSnapshot` — a plain struct the Engine builds from the store:
  `{ inspectIsNode, cohort, country, layerId, filter }`.
- `Rung = { level: FocusLevel; active(sel: SelectionSnapshot): boolean; resolver: ResolverKey }`.
- `LADDERS: Record<View3D, Rung[]>`, ordered finest→coarsest:
  - **geo**: `node → cohort → country → network → all`
  - **hyper**: `node → network → all`
  - **ledger**: `node → layer → all`
- Order helpers for the store side: `finerLevels(view, level)` (and whatever small
  accessors `pickActions` needs) so drop-the-finer deselect rules derive from the SAME list.
- Per-level **carry policy** as data: `carry: "always" | "view-scoped"` (network/node =
  always; country/cohort/layer = view-scoped → cleared when leaving their view). The
  snapshot subject is NOT a ladder rung — its pin/carry behaviour stays owned by
  `FollowController` + `snapshotSelectActions`, untouched.

Resolvers are NAMED here but IMPLEMENTED as Engine methods — they have real scene side
effects (`Globe.focusNode` leans the globe, `focusCountryShape` spins it, autoRotate
toggles) that don't belong in `domain/`. The table is pure and fully testable; the effects
stay where effects live. (Rejected alternatives: embedding the ladder in `ViewPolicy` rows
— mixes event-time camera logic into the per-frame policy table; a pure effect-descriptor
DSL — re-encodes five Engine methods 1:1 for no payoff.)

## Part 2 — Engine rewiring + folded fixes

One `Engine._resolveFocus()` replaces the four hand-rolled walks (`_focusSelection`,
`_applyGeoFocus`'s level logic, `_focusLedgerInspect`, `_setMode`'s ledger entry camera
block). It builds the `SelectionSnapshot`, walks `LADDERS[view]` finest→coarsest, and the
first rung that is `active` AND whose resolver returns success wins the camera. Resolver
failure (unlocatable node, countries topology not loaded) falls through to the next rung —
today's per-view fallback chains, made uniform. The per-level resolvers become small
single-purpose Engine methods keyed by `ResolverKey` (largely the existing `_focus*`
bodies).

Behaviour notes:

- The `autoLayerForNode` auto-commit on ledger entry stays a STORE step through the one
  executor, run before resolving — unchanged semantics.
- `applyFilter(focusCamera=false)` background refreshes still never move the camera; a
  user-driven filter change re-resolves (which reproduces the ledger lane-aware layer
  re-frame for free).
- **Fix (folded):** the ledger double-walk collapses into the one resolve.
- **Fix (folded):** the **reversal gap** — when a view transition settles back at its
  origin without a boundary having fired (mid-OUT commit + flip back), the Engine re-runs
  `_resolveFocus()` on settle, re-deriving the framing from committed state instead of
  leaving it stale.
- **Fix (behaviour change, deliberate):** `store.layer` becomes view-scoped — cleared when
  leaving `ledger` (today it silently persists, which is why the layer card lingers in
  hyper/geo). Re-entering ledger with a node selected still auto-derives its layer via
  `autoLayerForNode`, covering the resume case.

Scope guard: this refactor is behaviour-preserving for all interactions except the three
labelled fixes and the two gap-fill features below.

## Part 3 — shared level list with `pickActions`

`pickActions` imports the ladder's level order so its zoom-level deselect rules (leaving a
level drops the finer ones) derive from the identical list — one definition, two consumers:
the Engine consumes it for camera resolution, `pickActions` for store stepping. A colocated
test asserts the two can't drift (the cross-check the brainstorm required). Existing tested
ordering contracts (filter-first, inspect-last, deselect-before-drill) are preserved.

**Ancestry rule (new, uniform):** committing a fine rung commits its ancestry so the
deselect ladder always steps down through every rung predictably, regardless of how you
arrived:

- geo node click (scene or id row): commits country (as today) AND its cohort — deselect
  steps node → cohort → country → network.
- ledger node select from the browser: commits its parent floor as the layer; scene node
  clicks in ledger keep the current `autoLayerForNode` L0 ancestry.

## Part 4 — gap-fill A: the geo cohort rung

- **Store:** new `cohort: { cc, city, isp } | null` channel (city/isp nullable, matching
  the explorer's cohort key; country-scoped). Geo-only lifecycle like `country`.
- **pickActions:** `cohortToggleActions` builder (tested-table idiom): committing a cohort
  drops a selected node; the country toggle drops cohort AND node; a filter switch clears
  all three. `applyClickActions` gains one `"cohort"` action kind. The
  `selectionBoundary` write-path rule inherits the new rows for free.
- **3D:** the rung's resolver reuses the node-zoom machinery — `Globe.focusCohort()` leans
  the globe to the cohort's centroid via the same `NODE_RAISE` contract; a new
  `cameraRig.cohortFraming` frames the whole honeycomb stack field (the node pose pulled
  back; absolute/dolly-exempt like `nodeFraming`). Committed stacks hold a **steady glow**:
  the existing `hoverCohort` fabric path gains a committed twin
  (`Globe.setSelectedCohort`), same strength as the hover preview (house rule: hover
  previews exactly what commit looks like, minus the flight).
- **UI:** the cohort row becomes committable — click toggles the cohort (SELECTED_ROW + ✓)
  and still discloses its id rows (the country rows' commit+expand idiom). The single-node
  cohort's one-click-selects-its-node shortcut stays, now also committing the cohort
  underneath.

## Part 5 — gap-fill B: the ledger node browser

`LedgerPanel` grows disclosures, stratum-first (the card keeps its name "Settlement
layers" and stays the view's ONE tool card — nodes appear *within* strata):

- The four node-kind floors (`rowML1`, `rowML0`, `rowHypL0`, `rowDAGL1`) follow the country-
  row idiom: click commits the layer (as today, `layerToggleActions`) AND expands it.
  Snapshot floors and `rowProducers` don't disclose (their subjects aren't nodes).
- Inside a metagraph floor: one **cluster group row per metagraph lane** with nodes on that
  floor (identity dot IS correct here — a lane is one metagraph — plus a count). The DAG
  floors expand straight to their single cluster's node rows.
- Node id rows run the existing tested `nodeSelectActions`, wear the ✓ when selected, pair
  on `hoverNodeId`; hovering a cluster group row glows its whole 3D stack via the existing
  `hoverCohort` channel (same shared fabric instances).
- `ViewPolicy.nodeList` flips true for `ledger` so `store.selNodes` publishes there (the
  policy field built for exactly this).

## Part 6 — facts cards + the rail-manifest boundary test

**Principle:** every committable ladder rung has a right-rail facts slot — populated when
committed, ghost otherwise. This surfaces an EXISTING gap (country) plus the new rung:

- **Country card** (`COUNTRY` eyebrow, geo-scoped like layer is ledger-scoped): flag + name
  title; body from the pure `geoStats` — node count, share of the current filter, provider
  count, cities, networks present. All live data.
- **Provider card** (`PROVIDER` eyebrow, geo-scoped): "City · Provider" title; body — node
  count, networks hosted (identity dots), composition mix, ASN (`GeoInfo.isp`/`asn`).
  Naming: user-facing vocabulary is **provider** (matching the geo vitals' "Providers"
  column); internal identifiers keep the established `cohort` name (`hoverCohort`,
  `cohortsOf`, the new `cohort` store channel) — one concept, two registers, recorded here
  so the split is deliberate, not drift.
- Both follow the fixed-slot model: `CardHead` anatomy, ghost hint when their view can
  produce them but nothing is committed, kind mark tinted by `--filter-accent`.
- **Enforcement:** `railCards.ts` gains a per-view level→slot mapping checked by a new
  boundary test — for every `LADDERS[view]` rung below `all`, the manifest must either name
  a card slot or carry an explicit documented exemption. The snapshot subject keeps its
  existing slot untouched (not a zoom rung). A future rung cannot land without deciding its
  facts card.
- Accepted trade-off: geo's rail at rest shows 4 ghosts (dossier, country, provider, node).
  Ghosts are quiet one-liners by design; ghost copy teaches the ladder ("Drill a country on
  the globe or in the explorer"). Revisit only if the live app reads noisy.

## Testing & verification

- `focusLadder.test.ts`: pins each view's rung order, the `active()` truth table, the
  fall-through contract, and the per-level carry policy.
- Cross-check test: `pickActions` deselect stepping ↔ ladder level order cannot drift.
- `pickActions.test.ts`: `cohortToggleActions` + the ancestry orderings.
  `applyClickActions.test.ts`: the `"cohort"` effect. `selectionBoundary` inherits new rows.
- Rail-manifest boundary test (Part 6).
- Live visual pass (house style, chrome-devtools MCP): unchanged interactions verified
  pixel-neutral (all three views' walks, deselect stepping, view-entry carry); the two
  gap-fills verified in the running app; the reversal-gap repro (`?slowmo` mid-OUT commit +
  flip back) settling on the correct framing; the layer card no longer lingering outside
  ledger.

## Non-goals

- No visual redesign of existing poses/framings — the per-view *values* stay; the
  *mechanism* unifies.
- Hyper composition groups stay disclosure-only; snapshot gets no camera rung;
  `rowProducers` gets no nodes (all deliberate, recorded above).
- No new dependencies.
