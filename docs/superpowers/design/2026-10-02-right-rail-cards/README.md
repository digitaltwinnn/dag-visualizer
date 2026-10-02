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
- **The metagraph card's breakdown is unchanged** pending a pick from `breakdown.html`.
