# The explorer card — the agreed design (2026-09-26)

The `.html` files beside this README are the screens from the live design session, in the order
they were agreed, and **they are the reference the build is checked against** — not this text.
Open them in a browser (they are self-contained fragments; the frame CSS they assumed is gone, so
read them for structure, sizes and inks, not for the page chrome). When a built card and a screen
disagree, the screen wins unless the deviation is recorded below with its reason.

Decisions, in the order they were made, each with the screen that shows it:

1. **Scope: option B** (`explorer-card.html`). The committed filter is stated in the card HEAD, not
   as a chip in the body. No chip anywhere; the History card's "X only ×" chip goes.
2. **The head's scope mark is the hue dot alone** (`option-b-refined.html` 1b): an 8px dot in the
   committed network's hue with a 3px soft ring at 22% on the title line's right; the × to release
   appears on hover of the dot, always on touch. No ticker, no name.
3. **The measure control is the figure column's heading** (`option-b-refined.html` 2a, then
   `measure-control.html` A): a hairline heading row over the list, the control right-aligned, the
   view's one setting (Same scale, Live/Pinned) to its left. No axis label (the title names it —
   `quieter.html`).
4. **The control is the heading opening its list** (`measure-control.html` A): caps word + caret →
   a radio menu of THIS LEVEL's measures with their units. With one measure the same word without
   the caret, muted, not a control. With no figure, the heading row is the hairline alone.
   Regular weight always (user: "normal") — the control differs from the label by full ink and
   the caret, never by weight.
5. **Each level has its own measures** (`level-measures.html` A): ticks fees · anchors ·
   metagraphs · size; networks in a tick snapshots · fees · size; a network's snapshots fee · size;
   Hypergraph networks nodes · countries · providers, compositions nodes (static); Geography
   countries nodes · metagraphs · providers, cohorts nodes · metagraphs; History layers the trend
   metric; node and signer rows none. Each level remembers its own pick.
6. **Depth is a PATH, not a tree** (`depth.html` A): one level on screen at a time; the ancestry is
   a breadcrumb (shadcn Breadcrumb) above the list, each crumb going back up; the list beneath is
   the current level's siblings at full width. At most ONE selection wash on screen.
7. **Level line** (`option-b-refined.html` 3a + `build-reference.html`): a caps eyebrow naming the
   axis ("By composition", "By city · provider", "By network", "By snapshot", "By signer",
   "By node") and ONE muted sentence of meaning on the SAME line; no total (the parent row's
   figure is that number and the heading names the unit — `quieter.html`).
8. **Row grid** (`row-elements.html` A, `aligned.html`, widths from `build-reference.html` and
   after): `16px glyph · 100px name · tag home (flex, takes the rest) · 56px bar · 60px figure`,
   8px column gap, 4px/6px row padding, 5px radius. The bar is a short accent, never flex. The
   tag home holds role chips (10px, hairline border, 3px radius), provider text, a hash, a state —
   ellipsis with the full text on hover; empty when the row has none. **Per level, not per card:**
   a level whose rows carry no figure drops the bar and figure columns and the name widens (an id
   shows a longer middle); a level with a figure but no tags keeps the tag home empty.
9. **Type: T1** (`type-systems.html`): eyebrow 10.5px caps tracked bold (teal for the card's
   eyebrow, muted elsewhere); title 15px semibold; hint 11.5px muted; row name 12.5px regular full
   ink; figure 12.5px mono REGULAR (user: the rail's Fact rows are regular; only a total is bold),
   right-aligned, tabular, full ink at the top level and dim ink inside a level; tags 10.5px muted;
   level meaning 11.5px muted.
10. **No ✓, no chevrons** (`quieter.html` A): the wash is the selection; the row is the control —
    hover washes it, click opens it. The figure takes the right edge in every row at every depth
    (`aligned.html`): a level indents on the LEFT only (22px) and keeps the card's right edge.
11. **Bar**: the figure's share of the level's busiest row, in the row's hue (a network's identity
    hue, the filter accent for countries and ticks); inside a level the parent's hue at 60%.
12. **Selection stays in place** (terminal, not a screen): the list never re-orders on selection;
    a committed row is scrolled into view instead.
13. **Filter gestures: option B** (`filter-gestures.html`): only the top-bar picker and the
    Hypergraph hub / network row set the filter. Geography (built 2026-09-26, `f1fadc1`) and
    Snapshots selections never set it; History already didn't. Snapshots' metagraph snapshot
    select loses its filter-first arm.
14. **Snapshots' network rows only open**: no wash, no commit (unchanged rule from 2026-08-10),
    now visibly different from the committing rows because nothing commits in a path level
    except a row that IS a subject (a tick, a snapshot).
15. **Live/Pinned** rides the heading row as dot + word (`final-walkthrough.html`).
16. **Primitives**: shadcn `Breadcrumb` for the path, shadcn `DropdownMenu` (radio group) for the
    heading control, restyled to the card's tokens like the other adopted primitives.

Recorded deviations from the screens:

- **The root crumb is a house glyph.** The screens drew "Networks › …"; built, the root word
  repeated the card's title and cost the width the crumbs need in a 264px rail (user, same day:
  "do we need 'networks' always at the start of the breadcrumb?"), and without any root entry the
  reader could not get back to the first level (user, same day: "rather than saying a lengthy
  'networks' can we do something like a 'home' icon"). So the root is the shortest possible entry,
  a lucide `House` whose accessible name is the root's word, releasing everything.
- **Crumbs are set at the rows' size and shrink with an ellipsis** (user, same day): a crumb is a
  row's name moved up, so it is `text-body` like the rows, the path never wraps, and a long label
  (a provider) ellipsises with its full text on the crumb's title. A country crumb is the name
  alone, not code + name.
- **The row grid is re-budgeted to the rail's 264px.** The screens were drawn at ~360px with
  `16 · 100 · flex · 56 · 60`; the rail's row is 247px wide, so the build uses `14 · per-level name
  (128 at a network level with no tags, 52 at a composition level) · flex · 36 (24 inside a level)
  · 40` with 5px gaps, and the role chips close up (`RoleChips tight`). Proportions kept, numbers
  the rail's.
- **The level line wraps.** Eyebrow and meaning share a line where they fit; in the rail the
  meaning wraps under the eyebrow rather than truncating — a clipped sentence explains nothing.
- **The figure column is per level too** (`figureW`, Snapshots build): a 4-decimal fee ("0.0680")
  does not fit the 40px the count-bearing levels use, so the three Snapshots levels take 48 and the
  tag home gives it up. Figures are BARE everywhere — the heading's list names the unit (decision
  7), and a size is always in KB, the unit that list states, never switching to MB or B on its own.
- **A snapshot row's tag is a seven-glyph hash PREFIX**, not the `a…b` short form: beside a 48px
  figure the tag home holds seven mono glyphs, and a prefix cut clean reads as a prefix where an
  ellipsised short form cut again reads as broken.
- **The level line lost its eyebrow and joined the path** (user, same day: "By node" over "nodes
  that seal snapshots…" was "very redundant", and a separate row for it did not read as part of
  the breadcrumb). Decision 7's ONE clause of meaning survives as the path's own caption, snug
  under the crumbs inside the nav; the axis eyebrow is gone.
- **The scope mark is the TICKER, not a dot** (user, same day, after the build: "instead of a
  colored pill use the ticker"). Decision 2's dot read as one more pill beside the path's; the
  ticker in the network's hue is the dossier head's own mark, with the × beside it on hover.
