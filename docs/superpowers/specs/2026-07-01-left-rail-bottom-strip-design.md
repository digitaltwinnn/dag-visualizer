# Left rail + bottom strip — design

**Date:** 2026-07-01
**Scope:** The two remaining HUD zones — the left "explore" rail and the bottom LiveStrip — in the Instrument-Glass language. Completes the four-zone refresh (top bar, right rail, left rail, bottom).

## Left rail — the view tool

With the dossier moved to the right rail (`2026-07-01-right-rail-subject-stack-design.md`), the left rail is now **purely the view's one interactive tool** — no `ContextPanel` here anymore.

- **One Instrument-Glass panel** docked to the left screen edge, with a **left accent spine** in **structural cyan** (it's a tool = chrome; identity hues stay on the right-rail thread). `PanelHead` eyebrow = one verb: `<View> · explore`.
- **The left rail holds the view's interactive panel** — either **data-exploration** (geo → `GeoExplore`, the country→nodes accordion) or **interactive learning** (ledger → `LedgerPanel`, the settlement-stack legend whose floor rows hover-highlight the 3D floor; hyper → the guided tour). The plain **text** view explainer stays on the *right* (the view-default); anything you *interact with* is here on the left.
- Per view: `geo` → GeoExplore; `ledger` → LedgerPanel (settlement-stack legend — output ◇ / validator ○ floor markers, plain-language roles, "reading it" note); `hyper` → the guided tour (**currently broken → a static "about" placeholder card**).
- **GeoExplore is specced in full in `2026-07-01-geoexplore-design.md`** (it supersedes an earlier "number-only / Other-fold" note here): country rows = flag · name · **magnitude bar** (kept — it's a distribution leaderboard) · count, sorted desc; a **ScrollArea** (no "Other" fold); clicking a country drills the globe + expands its nodes inline (master → nested detail), a node row opens its card on the right rail.

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

### Hover, tooltip & click
- **Hover a bar** → its **cap glows** (and body lifts slightly) **and** the matching **block in the ledger view glows** — bidirectional cross-highlight, the same "one focus language" as the scene tie-in (`2026-07-01-hud-scene-tiein-design.md`).
- **Tooltip** — the shared Instrument-Glass tooltip, border in the subject hue (metagraph hue when filtered, core cyan for All):
  - **Bare ordinal** as the head — **no `#`** (a big mono number in a snapshot tooltip is obviously the ordinal).
  - **Counts:** `anchored N` (All) · `‹TICKER› N of total` (filtered) · `‹TICKER› 0 · none this tick` + the tick total (a **gap** tick the metagraph skipped).
  - **Recency:** a quiet `◷ 12s ago` line — **relative + coarse** (freshness, not a ticking clock); the **live bar** reads `● live now` (pulsing cyan dot).
  - **Hint:** `click to open snapshot`.
- **Gap ticks stay hoverable/clickable** (they're real global snapshots).
- **Click** → opens that snapshot's **card in the right rail**; from `hyper`/`geo` it **jumps to `ledger`**. Consistent commit language with the rest of the HUD.

## Affected components

- `components/LeftColumn.tsx` — remove `ContextPanel` (moved right); placeholders no longer render a left tool card (their explainer is the right-rail View-default).
- `components/GeoExplore.tsx` — see `2026-07-01-geoexplore-design.md` (magnitude bar kept, ScrollArea, inline node expansion).
- Left panels + `PanelHead` — structural-cyan spine, Instrument-Glass surface.
- `components/LiveStrip.tsx` — crisp-cap / faded-body bars (~26%), faint baseline; **switch the filtered encoding to the metagraph's own per-tick counts on its own scale** (was share-of-total); y-label swap; per-bar hover (cap glow + ledger cross-highlight) and click → snapshot selection.
- `components/Tooltip.tsx` (LiveStrip variant) — bare ordinal (no `#`), counts, relative recency / `live now`, click hint; subject-hued border.

## Open / follow-ups

- Implementation plan (writing-plans).
- Reduced-motion: the live dot holds steady.
- Fold the cap/body/baseline + spine tokens into the Instrument-Glass token pass.
- **Align the explainer cards' consistency + level of detail** — the left interactive-learning panels (LedgerPanel legend, hyper guided tour) and the right text view-defaults vary in depth today; a later pass unifies how much each teaches. (Positioning is settled: interactive → left, text explainer → right.)
