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

Still open: chips for every qualifier including the ticker; whether the metagraph's description
clamps to two lines. Nothing is built yet.
