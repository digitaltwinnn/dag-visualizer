# Left rail + bottom strip — design

**Date:** 2026-07-01
**Scope:** The two remaining HUD zones — the left "explore" rail and the bottom LiveStrip — in the Instrument-Glass language. Completes the four-zone refresh (top bar, right rail, left rail, bottom).

## Left rail — the view tool

With the dossier moved to the right rail (`2026-07-01-right-rail-subject-stack-design.md`), the left rail is now **purely the view's one interactive tool** — no `ContextPanel` here anymore.

- **One Instrument-Glass panel** docked to the left screen edge, with a **left accent spine** in **structural cyan** (it's a tool = chrome; identity hues stay on the right-rail thread). `PanelHead` eyebrow = one verb: `<View> · explore`.
- Contents per view (unchanged roles): `hyper` → `LearnPanel`; `geo` → `GeoExplore` (country→nodes accordion); `ledger` → `LedgerPanel`.
- **Country rows (GeoExplore): number-only.** Drop the per-row share bar — the right-aligned **count is enough**, and the list is sorted by it so rank reads top-to-bottom. (A faint full-width heat tint was considered and dropped; the bar was too busy.)
- Rows: mono counts, hairline separation, hover state; clicking a country drills the globe + expands its nodes inline (master → nested detail), a node row opens its card on the right rail.

**Reconciliation:** the scaffolded placeholder views' "about" copy is *orientation* — it now belongs to the **View-default card on the right** (per the right-rail spec), not a left `PlaceholderPanel`. A not-yet-interactive view has **no left tool card**; its explainer lives on the right. (Left tool returns when the view gains real interaction.)

## Bottom strip — the LiveStrip

The bottom lane: one bar per global tick, clickable/hoverable to open that snapshot (the selection flow the whole app depends on — keep discrete bars, not a waveform).

### Visual — crisp cap, faded body, quiet
- Each bar = a **crisp 2px cap in the accent hue** (the value marker) with the body **fading downward into the scene** (body opacity **~26%** — "toned"), on a **faint flat baseline hairline** (no glow).
- The value is read from the **cap**, so the fading bottom never hides data.
- **Ink lives in the cap**, not the body — so a full row stays quiet even in the loud identity hues (SWAP gold, DOR orange). Cap = the accent hue itself (no separate/white colour). Live/active bar's cap glows.

### Data model — own cadence when filtered (the fix)
- **Unfiltered (All):** bars = **total anchors per tick**, cyan (structural), scaled to the window max.
- **Filtered (a metagraph):** bars = **that metagraph's OWN anchors per tick**, in its identity hue, scaled to **its own max** — its personal cadence. Empty ticks render as **honest gaps**.
- This **replaces** the old "bar = total, fill = share-of-total" encoding, which made a 1-of-50 metagraph a sub-pixel sliver (made worse by the fade). The total for a tick stays available **on hover**.
- The y-label switches with the mode: `anchors/tick` (All) ↔ `<TICKER> anchors/tick · own scale` (filtered).

### Live indicator
- `Global L0` label + a breathing dot at the ~1.5 s tempo (the top-bar ECG is the hero heartbeat; the strip's dot stays a simple pulse). No panel chrome — the strip blends into the scene.

## Affected components

- `components/LeftColumn.tsx` — remove `ContextPanel` (moved right); placeholders no longer render a left tool card (their explainer is the right-rail View-default).
- `components/GeoExplore.tsx` — country rows number-only (drop the share bar).
- Left panels + `PanelHead` — structural-cyan spine, Instrument-Glass surface.
- `components/LiveStrip.tsx` — crisp-cap / faded-body bars (~26%), faint baseline; **switch the filtered encoding to the metagraph's own per-tick counts on its own scale** (was share-of-total); y-label swap; total on hover; keep per-bar click/hover → snapshot selection.

## Open / follow-ups

- Implementation plan (writing-plans).
- Reduced-motion: the live dot holds steady.
- Fold the cap/body/baseline + spine tokens into the Instrument-Glass token pass.
