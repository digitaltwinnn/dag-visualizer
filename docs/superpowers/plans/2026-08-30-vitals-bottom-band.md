# Plan — the vitals leave the bar: a bottom instrument band

**Date** 2026-08-30 · **Status** IMPLEMENTED (2026-08-30, signed off with visual upgrades: donut + micro-bars + info cards; see progress.md) · **Branch** `bugfix/wip` (or a fresh feature branch)

## What the user asked for (their words, condensed)

- The top bar is too crowded — find another home for the vitals.
- A slim full-width bottom band: one small instrument per vital — sparkline or micro-bars where
  the quantity has history, a plain number where it doesn't.
- The snapshot bar becomes just another of those vitals: fewer bars, **no clicking** — "a nice
  visual and no large interactive element".

## What this reverses, deliberately

1. **The bottom lane is snapshots-only (user, 2026-08-12).** hyper/geo's node-count readout was
   removed as answering the wrong question. This plan brings per-view readouts back — but as the
   view's OWN vitals (the exact numbers the bar shows today), not a generic tally, and it empties
   the bar in exchange. The old decision's reasoning ("structure is already the subject of the
   view above") is answered by keeping each band view-scoped: the band shows what the bar's
   vitals region shows for that view today, nothing new.
2. **"The strip is the time INSTRUMENT" + bar click = pin (2026-08-12 · pickActions).** The
   declicked mini-strip drops: bar click→select, hover cross-highlight, and the hover clear on
   tick. Nothing is lost that has no other home — the explorer rows and the global card's pager
   both commit ticks — but the raw *click a bar you can see* route dies. User has decided this.

## Shape

**One new component, `components/VitalsBand.tsx`**, mounted where `BottomStream` mounts, in every
3D view (flat views keep nothing — no numbers beside a `preview` wireframe, rule 10).

- A slim full-width glass-less lane (the LiveStrip's footprint idiom, ~44-52px tall), laid out as
  a row of instrument cells, left-aligned groups per view. Each cell: micro eyebrow label
  (the bar's own caps register) + value + optional micro-chart.
- **Per-view cells** (exactly today's vitals vocabulary, `TopBar`'s clusters):
  - hyper — every `compositionRows` label (HYBRID / CONSENSUS / CURRENCY / DATA …): plain
    numbers (composition changes rarely; no honest in-session history).
  - geo — NODES / COUNTRIES / PROVIDERS: plain numbers.
  - ledger — SNAPS/HR and ANCHORS/HR as **sparklines** (both derivable per-tick from the
    buffers `api.ts` already keeps), plus the **mini tick-bars**: the LiveStrip's bar chart
    reduced to a fixed small window (~24-32 bars), non-interactive, filter-tinted exactly as
    today (identity hue + own scale under a filter — that honesty stays).
- **The top bar loses its vitals region**; the centered view switch keeps its position (the
  constant-width vitals cell goes, so re-measure the narrow-width thresholds — the 1299/1439
  numbers were measured WITH the vitals in the bar and will be generous after).
- **LiveStrip** slims into the band as the ledger's third cell: strip the Button rows, the click
  descriptor path, `hoverSnapOrd` writes, and the hover-clear-on-tick effect. `BottomStream`
  becomes the band's mount and keeps `--bottom-reserve` publishing (now nonzero in all 3D views —
  scene-pose only, as today).
- **Selection surfaces already covered elsewhere** stay: LiveStrip's pin route → explorer row /
  pager; the strip↔ledger cross-highlight dies with hover.

## Responsive

- Desktop/tablet: the band spans between the rails' columns like the strip does today.
- Phone: the bottom is the dock's home — the band does NOT mount under 700px (the dock + sheet
  already own that edge; vitals stay reachable in the filter strip's second row where the
  NetworkSwitch lives, unchanged). This needs a one-line policy note in CLAUDE.md.

## Mechanics to respect

- Convention 7: the band mounts by a `VIEW_POLICIES` flag (extend `timeLane` → `vitalsLane` or a
  second field), never `mode ===`.
- Two data lanes: sparkline/tick data subscribes straight to `NetworkData` (no store); only the
  plain numbers that TopBar already reads via store selectors keep those selectors.
- Rule 3: micro-charts in structural cyan; identity hue only under a committed filter (the
  strip's existing rule).
- Tests: `viewPolicy` row addition; a `VitalsBand` presence/boundary test (no store writes — it
  is read-only by construction, which `selectionBoundary.test.ts` should confirm free);
  re-measure and adjust the bar's threshold tests if any pin the vitals region.
- CLAUDE.md: rewrite the **Bottom** section (snapshots-only → the vitals band), the bar's
  vitals paragraphs, and the LiveStrip section (instrument → visual; routes to pin).

## Order of work

1. `viewPolicy` flag + `VitalsBand` skeleton with plain-number cells (hyper/geo done here).
2. LiveStrip declick + slim + move into the band (ledger cell 3).
3. SNAPS/HR + ANCHORS/HR sparklines off the live buffers.
4. TopBar: remove the vitals region; re-measure the narrow thresholds live; caption strip check.
5. Phone/tablet verify; CLAUDE.md + progress.md; full gates (tsc, vitest, prod build).

## Open questions for the user (blocking none of steps 1-3)

- Does the ledger band ALSO show snaps/anchors numbers beside the sparklines, or sparkline-only?
- Should the band hide with the rails in Scene presentation mode (just the 3D), or stay?
