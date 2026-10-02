# The right rail's cards — one skeleton (proposal, 2026-10-02)

`index.html` shows all eight right-rail cards as captured from the running app (metagraph,
composition, node, country, provider, global snapshot, metagraph snapshot, moment), the five
places they diverge, a six-slot skeleton (head · lead · breakdown · facts · doors · foot + pager),
and each card redrawn on it. Serve the parent folder: `python3 -m http.server 3100` from
`docs/superpowers/design`, then open `/2026-10-02-right-rail-cards/`.

## Decisions (user, 2026-10-02)

- The skeleton is approved: head · lead · breakdown · facts · doors · foot + pager.
- **A lead on every card.** **One dash for empties** (the reason on hover, or beside it where
  there is one).
- **A separator between the lead and the breakdown.**
- **Metagraph snapshot: State and Data are TABS** in the breakdown slot (the cabinet recipe).
- **The metagraph keeps its type line** under the title ("data and currency metagraph"); the
  description is the lead.

- **The ticker is a chip** like every other qualifier. **The metagraph's description clamps to two
  lines** with "Show more".

## Built (2026-10-02)

All eight cards are on the skeleton. Primitives in `components/inspector/parts.tsx`: `Lead`,
`SectionLabel`, `Empty`, `QualifierChip`, `Door` (beside `Fact` / `Foot`).

Deviations from the drawings, each for a recorded rule:
- **Metagraph snapshot has NO ticker chip.** The Metagraph card always sits directly above it now
  (the tick-local network), and a card never restates its ancestor (the pile rule; the ticker left
  this head on 2026-08-10 for the same reason). Its aside is empty; the relation is the lead.
- **The node card's lead yields to its ancestors.** Under a committed country and provider the
  place and host are those cards' titles, so the lead is the "Signed N" relation alone, or absent.
- **The Moment card keeps its headline line** (the reading at the instant, with its scope) under
  the new lead; its "Snapshot records" control was already the door recipe and keeps its own foot
  geometry.

## The metagraph breakdown (decided: D2, built)

`breakdown.html` — five forms (A today · B one line per cut · C say-it · D unit strip · E tiles).
User, 2026-10-02: the dot legend is what bothers most ("can it be solved with tables?"); D is the
favourite, E is nice but loses information; and **the largest network will soon be about 30
nodes**, so a square is always one node and D needs no scaled fallback.
`breakdown-2.html` — four D variants with the legend as a table and no dots: D1 strip + table
beside, D2 one table whose squares are the bars (recommended), D3 names as columns under the
strip, D4 a composition × status / archive cross table. **Picked D2 (user, 2026-10-02) and built** as `ScheduleTable` in `components/inspector/parts.tsx`:
name · count · one square per node, a proportional bar above 60 nodes.

## Visuals for the other cards (1–5 built, 2026-10-02)

`visuals.html` — which of the other seven cards gain from the D2 table. Proposed: global snapshot
(one square per anchored snapshot), Moment (bars per network), provider (nodes per network instead
of inline dots), country (nodes by network), composition (the group lit inside its network's
strip); the node card gets at most an archive reach bar; the metagraph snapshot stays as built.
One rule: name · count · mark in the D2 grid, a square for a countable thing and a bar for a rate
or a count above 60, only in the breakdown slot.

User: "ok" to the recommendation — 1 to 5 built, the metagraph snapshot left alone, the node's
archive reach bar built later (below). Shared pieces in `components/inspector/parts.tsx`:
`UnitMarks`, `CUT_ROW` (the three-column row for a one-cut card), `countable`, and `ScheduleTable`
with an optional axis. Deviations from the drawing: the Moment card keeps its headline line (it
carries the subject, unit and rank) and only its rows became table rows; the composition strip is
dropped above 60 nodes instead of scaled; country shows the network cut only. Built with the dev
server down, then verified live the same day (dark 1920 and light 1366, every card, no console
errors). The node card's archive REACH bar was approved and built after ("do the archive reach bar
also"): the share of the chain's ordinals the node still serves, filled from the right. The live
pass also made the Moment's absent readings a dash ("no reading" wrapped in the figure column).

Later rulings the same day: the archive cut's column reads **"Depth"** ("Archive depth" on hover);
the **composition card is a plain fact card again** ("of 3 · 1 makes no sense to a human; remove
the status row" — Nodes and Network are regular rows, the share stays the lead); the dossier's
**fold mark sits after the total**, the same mark and place as the snapshot card's expandable rows.

More rulings, same day:
- **The ticker chip** wherever a ticker QUALIFIES A TITLE (card head, scene callout and tooltip,
  the Moment's headline, the raw pane's head — `TickerChip`); a ticker in a column or a sentence
  stays plain hued text.
- **The node card's archive is one value, one bar, one note** ("redesign the full archive section …
  x-es, ~-es, bold text, subtle text; looks messy"): `Archive · 7 months` / `Full` / `since Nov
  2023` / a dash, the reach bar under it, then "1.0M of 7.0M snapshots". No check, cross or tilde.
- **Nothing in Snapshots writes the filter** — not a row, a tile, a band, a pager step or the
  global card's ×, and not to reset it either. Under a tick the filtered network sat out, the
  Metagraph card stands down with a hint, and ∨ steps into the tick's own first network.
- **Tabs are underline tabs** ("I don't like the rounded corners with color — looks like a card,
  but this is a simple control"): muted labels, the active one in full ink over a 2px accent rule
  on the row's hairline; no fill, outline or radius, and the body under them has no box
  (`components/cabinetTabs.ts`, all three tab strips).
- **Breakdown rows read name · mark · count**: the count right-aligned on the card's edge, the mark
  right-aligned against it, in a count column only as wide as its widest figure ("should we right
  align the number and put the visual in front?" … "a bit closer to the number").
