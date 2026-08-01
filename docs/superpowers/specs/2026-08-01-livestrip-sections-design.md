# LiveStrip sections — the divider strip + per-view data table (tasks 9 + 11)

**Date:** 2026-08-01 · **Branch:** `bugfix-improvements` · **Status:** approved design

Two user tasks merged into one coherent piece of design work:

- **Task 11:** the LiveStrip becomes a *divider* between the scene shell and a new
  full-viewport section holding the raw table data driving the scene, with a per-view
  dataset and a GSAP-animated section transition.
- **Task 9:** the snapshot card becomes a **ledger-view-scoped** card (like the country and
  layer cards), a deliberate user-authorized reversal of the current "the card shows in
  whatever view you're in" behaviour. Folded in here because the LiveStrip redesign is what
  removes the cross-view snapshot-picking surface that motivated the old behaviour.

## 1. Layout model — two full-viewport GSAP sections

A fixed-position wrapper, 200vh tall, holds two stacked sections:

- **Section 1** — today's shell unchanged: the persistent canvas, top command bar, both
  rails and their cards, with the LiveStrip at the bottom edge.
- **Section 2** — new: the top command bar (shared — it stays visible in both sections),
  the LiveStrip pinned at the section's top edge (the way back up), and a full-width data
  table filling the rest of the viewport. **No rails** in section 2.

The wrapper translates on Y between `0` (section 1) and `-100vh` (section 2) via a GSAP
tween. **Transform-driven, not real document scroll** (approach A, chosen over a
ScrollTrigger-pinned real-scroll page): the page itself never scrolls, so

- the canvas stays viewport-sized and is only *carried* by the transform — **no engine
  resize, no buffer distortion** (the existing "buffer stays viewport-sized" contract holds
  untouched);
- `RailScroll`'s internal card-list scrolling and the `--bottom-reserve` contract are
  unaffected (different scroll containers);
- tablet/phone dynamic-viewport-height jank can't leak into the canvas's perceived size.

### Trigger — the strip is the drag handle

GSAP `Draggable`/`Observer` (all plugins are free/bundled since GSAP 3.13) bound to the
LiveStrip: drag **up** from section 1 reveals section 2; the same strip, pinned at section
2's top, drags **down** to return. Inertia + snap: a release always settles fully on one
section, never in between. Wheel/touch on the strip works as a fallback gesture. GSAP is a
**new npm dependency** (confirmed not currently in `package.json`).

## 2. The strip's per-view content

- **Ledger:** the existing tick-bar chart, unchanged (bars = anchors per global tick,
  identity-hued when filtered, honest gaps). Bar clicks keep their current
  `snapshotSelectActions` semantics.
- **Hyper + geo:** the bars are **replaced** by a **compact node-count readout** — total
  node count plus a small identity-hued tick mark per network. No time axis, no bars
  (a node roster isn't a time series). Same slim strip footprint.
- **Flat placeholder views** (`status`/`transactions`/`staking`): the same compact
  node-count readout as hyper/geo — the strip stays present in every view (standing rule),
  the bars are just ledger-only now.

## 3. Section 2 — the per-view dataset

One table per view, a **complementary, denser, sortable** mirror of the same underlying
data the left-rail explorers browse — the explorers (`HyperExplore`, `GeoExplore`,
`LedgerPanel`) are **not** replaced or changed.

| View | Dataset | Row = | Row click |
|---|---|---|---|
| ledger | **per-metagraph anchor log** — one row per anchored metagraph snapshot in the retained window (finer-grained than the per-tick bars) | one metagraph snapshot (network, ordinal, fee, size, anchoring global tick, age) | selects the **global snapshot it anchored into** via `snapshotSelectActions` (the metagraph snapshot is not itself a selectable subject) |
| hyper | **node roster** — id, composition word, role pills, hosting/provider | one node | selects the node via `nodeSelectActions` (node card + camera, same as an explorer row) |
| geo | **node roster, location-first** — country, city, provider/ASN lead; then id, composition | one node | same as hyper: `nodeSelectActions` |

Flat rows with a Network column (identity dot + name), **not** grouped sub-rows — keeps the
table table-native and sortable. Data sources: the rosters read `store.selNodes` /
`store.metaList` (already published per `ViewPolicy.nodeList`); the anchor log reads the
`metaSnaps` buffers + `anchorIndex` via the `NetworkData` accessors.

**Rule-2 compliance:** every row click routes through the existing tested builders
(`nodeSelectActions`, `snapshotSelectActions`) and the one executor `applyClickActions` —
no new selection-setter code, no new action kinds. `selectionBoundary.test.ts` stays green
by construction.

**No auto-navigation:** clicking a row while in section 2 commits the selection (card
populates, camera moves) silently in the background; the user drags back up to see it.
The flat placeholder views (`status`/`transactions`/`staking`) get no section-2 dataset —
the strip still renders (it's always present) but section 2 shows the honest
"preview · in development" state, no fabricated table.

**Components (shadcn where possible, per user directive):** shadcn `Table` for the grid
with sortable column headers; `ScrollArea` for the scrolling body under a sticky header.
Identity dots / role pills reuse the existing `IdentityDot` / `RoleChips` marks. Row hover
pairs through the existing hover channels (`hoverNodeId` for roster rows, `hoverSnapOrd`
for anchor-log rows) so the scene↔HUD pairing convention carries over unchanged.

## 4. Task 9 — snapshot card goes ledger-scoped

- `Engine.setMode` gains the standalone conditional mirroring the existing layer-clearing
  pattern: leaving `ledger` clears a committed `snap` (and its `following` handling stays
  with `FollowController`, per the existing executor rule). **Not** a new `focusLadder`
  rung — the snapshot subject deliberately stays outside the ladder system.
- `railCards.ts`: the snapshot slot + `snapHint()` gate to ledger only (today it invites
  strip-bar clicks in all 3D views — those bars only exist in ledger now anyway).
- CLAUDE.md's "the snapshot card … carries across views until deselected" and the LiveStrip
  section get updated to the new behaviour when this ships.

## 5. Responsive

Tablet/phone keep the same drag-driven two-section model (the gesture is touch-natural).
The table drops to a narrower column set with horizontal scroll inside the `ScrollArea` —
no redesigned card layout. `RailDock` sheets and the phone bottom dock are section-1
furniture and are unaffected; the phone dock and section 2 never coexist on screen.

## 6. Empty / loading / no-signal states

Honesty over decoration, as everywhere: an empty roster or anchor log renders the existing
instrument-state language (`NO SIGNAL` / acquiring via the `StateAtoms` marks), never a
fabricated or placeholder row. A metagraph filter with zero locatable nodes shows the same
honest quiet-empty the explorers show.

## 7. Out of scope

- The left-rail explorers, their click semantics, and the right-rail card system (beyond
  the task-9 ledger gating) are untouched.
- No new datasets for the flat placeholder views.
- Column filtering/search is not in this iteration — sortable headers only (a `Command`
  -based search can layer on later without structural change).
