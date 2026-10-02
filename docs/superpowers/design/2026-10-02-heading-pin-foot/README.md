# Heading · pin · foot — options (2026-10-02)

`index.html` beside this README is the options page from the spacing/density review (serve it with
`python3 -m http.server 3100` from this folder, or open it directly). Three questions, each with the
current state, three alternatives, and a recommendation:

- **A — the explorer heading.** The hint beside the measure control (the 2026-09-28 one-row ruling)
  wraps to three lines at 199px. A1 shorter copy (recommended), A2 control in the head's caption
  slot, A3 hint as a tip.
- **B — where live / pinned shows.** Stated three times today. B1 card + scene mirror (recommended),
  B2 the scene callout as the control, B3 the command bar.
- **C — the card foot.** Ids and hashes already live only in the foot (the unlisted dossier's inner
  blocks are the one body exception, by design). C1 one mono register (recommended for the metagraph
  card), C2 a folded disclosure row (recommended for the snapshot cards), C3 foot = pager only.

## Decisions (user, 2026-10-02)

- **A2** — the measure control moves into the card head's caption slot (right of the title); the
  hint runs the full width on its own line under the hairline. The heading row keeps only the
  view's one setting (History's Same scale) when there is one.
- **B1** — the card owns the live / pinned control; the scene callout mirrors it; the explorer
  head shows nothing (its selected-row wash says which tick is pinned). Reverses 2026-09-29's
  "show pinned in both" — with the three statements side by side, two was the call.
- **C1** — the foot is one mono register: the label is a prefix inside the value line, kept
  UPPERCASE as today ("NETWORK ID  DAG0C…"), the copy glyph always present at low ink and lit on
  hover.
