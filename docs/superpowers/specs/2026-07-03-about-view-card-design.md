# Left-rail "About this view" card system — design

**Date:** 2026-07-03
**Scope:** A single reusable orientation card on the LEFT rail for **every** view (hyper, geo, ledger, and the placeholder views status / transactions / staking), replacing today's inconsistent state (hyper + placeholders have an "about" card via `PlaceholderPanel`; geo shows only its tool; ledger shows only a WIP tool). Generalizes and absorbs the placeholder-views orientation.

## Intent

Every view gets the same **About this view** card at the top of the left rail — a short "what am I looking at" orientation — so the four-zone HUD reads identically across views. It is **collapsed by default** in every view (a single header strip) and expands on demand, keeping the rail minimal and scene-forward.

## The card

- **One component — `AboutView`** (rename of the existing `components/PlaceholderPanel.tsx`, whose real job is already exactly this). Props: `{ title: string; eyebrow: string; lines: string[]; caption?: string }`. It renders the shared `panel` shell + `PanelHead` (title + eyebrow + caption + collapse toggle) over a `prose-body` of `lines`. No new styling — reuses existing rail tokens so it reads as one surface.
- **Collapsed by default.** Initial `collapsed` state is `true` in every view: the card shows only its `PanelHead` strip (view name + `<View> · about` eyebrow + expand caret). Expanding reveals the prose `lines`. (Today `PlaceholderPanel` defaults expanded; this flips the default.)
- **Header convention.** Eyebrow = `<View> · about` (e.g. `Geography · about`); title = the view's name. Consistent with the `<View> · <role>` eyebrow pattern used elsewhere on the rail.
- **Caption.** Placeholder views (status / transactions / staking) carry a `SOON` caption; built views (hyper / geo / ledger) carry none.

## Copy source

A single `ABOUT: Record<Mode, { title: string; eyebrow: string; lines: string[]; caption?: string }>` map (in `LeftColumn.tsx`, replacing the current `PLACEHOLDERS` map). It covers **all six** modes. Hyper / status / transactions / staking copy moves over verbatim from today's `PLACEHOLDERS`. New copy for the two views that lack it:

- **geo** — title `Geographic footprint`, eyebrow `Geography · about`:
  - "Where the network runs — every validator plotted at its real geolocation, with a density heatmap and travelling-packet connection arcs between them."
  - "Drill into a country to see its nodes; filtering a metagraph narrows the map to that network's footprint."
- **ledger** — title `Snapshots`, eyebrow `Snapshots · about`:
  - "When the network settles — Global L0 produces a snapshot every few seconds, anchoring the metagraphs' own snapshots into shared trust. The 3D chamber stacks the validation layers top-to-bottom, and each global snapshot forms as its layer settles."
  - "The live snapshot sits centre-stage and trails off to the left as it ages; click any snapshot (here or in the strip below) to inspect its fee, size and per-metagraph breakdown."

(Hyper/status/transactions/staking copy is the existing text — see `components/LeftColumn.tsx` `PLACEHOLDERS`.)

## Placement (LeftColumn)

For **every** view, the rail's `content` is the About card at the top, then the view's tool card (if any) below:

```
<AboutView {...ABOUT[mode]} />
{mode === "geo" && <GeoExplore />}
{mode === "ledger" && <LedgerPanel />}
```

Result per view:
- **hyper** — About only (no tool).
- **geo** — About + `GeoExplore`.
- **ledger** — About (high-level orientation) + `LedgerPanel` (the interactive settlement-stack legend tool — distinct role, kept).
- **status / transactions / staking** — About only (the center blueprint carries the visual orientation).

The `filterAccent` `--filter-accent` styling on `#leftcol` is unchanged; the About card inherits it like the other cards.

## Responsive

No responsive changes. `LeftColumn` already wraps its `content` in the desktop `#leftcol`, the tablet `RailDock` (edge-tab Sheet), and the phone bottom-sheet. The About card is part of that `content`, so it flows through all three automatically. Its collapse toggle works identically in every breakpoint.

## Affected components

- **Rename:** `components/PlaceholderPanel.tsx` → `components/AboutView.tsx` (same shell; `collapsed` initial state flips to `true`). Update the import in `LeftColumn.tsx`.
- **`components/LeftColumn.tsx`** — replace the `PLACEHOLDERS` map with the six-view `ABOUT` map (add geo + ledger copy), and render `<AboutView {...ABOUT[mode]} />` at the top of `content` for every view (above the existing tool cards).

## Out of scope / non-goals

- No change to the right rail (facts-only, unchanged — orientation stays on the left).
- No change to the center blueprint (placeholder views keep it).
- No change to the tool cards themselves (GeoExplore, LedgerPanel) beyond sitting below the About card.
- No new "guided tour" interactivity — this is a static orientation card (the reworked Learn tour remains a separate future effort).

## Open / follow-ups

- Implementation plan (writing-plans).
- If a real view later grows a richer left tool, its About card still sits above it unchanged.
