# Migration design/UX concerns — for the post-migration brainstorming session

Collected while re-homing the HUD onto Tailwind/shadcn (plan `2026-07-03-shadcn-tailwind-migration.md`).
Rule: concerns are **noted here, never fixed inline**. Each entry: where seen, what feels off, why it might matter.

## From Task 2 (command bar)

1. **Filter picker: popover vs bar-expansion.** The shipped picker is a compact detached popover under the filter button; the older spec text (and CLAUDE.md) still describe a "downward expansion of the bar — one connected surface". Migration kept the shipped popover (parity). Worth deciding which design is *intended* and updating docs/spec to match.
2. **0-located metagraph rows are dimmed but still clickable** in the filter picker. CLAUDE.md describes them as disabled/non-clickable chips. Clicking one filters to a metagraph that can't be plotted. Decide: disable (a11y-correct `CommandItem disabled`) or keep clickable-but-dimmed?
3. **ToggleGroup view switch inherits shadcn's `h-9 min-w-9` default sizing** rather than content-derived height. Currently visually equal, but the sizing is now owned by the primitive's variant, not the design. If the bar's density ever changes, decide the intended hit-target size (44px tap-target rule on touch?).

## From Task 3 (right-rail shell)

4. **Right-rail cards have no accent spine today**, while the themed `Card`/`ig-panel` recipe carries a `--spine` left accent. When left+right rails both sit on the Card recipe (Task 5), decide: should right-rail facts cards get the spine (consistent glass language) or stay spineless (calmer facts scope)?
