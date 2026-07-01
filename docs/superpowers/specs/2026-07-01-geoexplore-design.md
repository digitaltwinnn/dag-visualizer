# GeoExplore (geo left tool) — design

**Date:** 2026-07-01
**Scope:** The geo view's left-rail tool — the country→nodes accordion — end-to-end in the Instrument-Glass language. Supersedes the "number-only / Other-fold" note in `2026-07-01-left-rail-bottom-strip-design.md` for this panel.

## Layout

Instrument-Glass panel docked left, **structural cyan spine** (it's a tool), `PanelHead`: eyebrow `Geography · explore`, title `Nodes by country`, with the **`Distribution score`** (the 0–1 decentralisation metric, a computed value — labelled "score" to signal that) right-aligned in the header, beside the country list it summarises. (Moved here from the top-bar geo vitals, which now lead with `Nodes`.)

- **Country rows** — `flag · name · magnitude bar · count`, **sorted by count desc**. The **magnitude bar stays** (this is a distribution leaderboard — the bar aids scanning which countries dominate, unlike the 2-row node composition where a bar was busy). **Bar style matches the breakdown bars**: a **solid cyan fill + faint glow on a thin track**. Bar = share of the top country (relative ranking); when a metagraph is filtered, the list narrows to its nodes and the bar **tints to the metagraph hue**.
- **Expand a country** → drills the globe into it (`store.country`) **and** expands its **nodes inline** (master → nested detail): each node row = `metagraph-hue dot · id · · ticker · status`, using the **shared node status system** (colour = bucket: green `Ready` text / amber in-progress pill / red down pill / muted unknown; text = the exact state — see `2026-07-01-geo-node-card-design.md`). Clicking a node row opens the **geo node card** on the right rail.
- **Scroll, not fold.** The whole list is a **smooth scroll** (`ScrollArea`, themed thin cyan thumb) — **no "Other" bucket**, so every country + flag stays visible/scannable. (Rejected the fold: it hid flags.)

## Interactions

- The country drill (`store.country`) **doubles as the accordion's open row** — globe + list stay one source of truth.
- Combines with the network filter: a metagraph filter narrows the country list to that metagraph's nodes (and re-tints the bars); clearing shows all.
- The geo footprint stats (Distribution score / Countries / Densest) live in the **top-bar vitals**, not here — this panel is purely the accordion.

## Rail-list pattern (generalised)

This sets the pattern for **rail lists**: **ScrollArea** (themed thin scrollbar) + **matched magnitude bars** (solid fill + faint glow, thin track) + the shared status treatment for any node rows. The filter picker (Command) and the snapshot breakdown follow the same visual family.

## Affected components

- `components/GeoExplore.tsx` — country rows (flag · name · bar · count, sorted), inline node expansion (shared status treatment, opens the node card), **ScrollArea** replacing the top-N + "Other" fold.
- Reuses the shared status + composition/node helpers and the matched-bar style token.

## Open / follow-ups

- Implementation plan (writing-plans).
- Confirm the scroll max-height against the rail zone budget; keyboard nav within the list (Command/ScrollArea a11y).
