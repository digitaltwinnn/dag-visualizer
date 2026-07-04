# Migration design/UX concerns — for the post-migration brainstorming session

Collected while re-homing the HUD onto Tailwind/shadcn (plan `2026-07-03-shadcn-tailwind-migration.md`).
Rule: concerns are **noted here, never fixed inline**. Each entry: where seen, what feels off, why it might matter.

## From Task 2 (command bar)

1. **Filter picker: popover vs bar-expansion.** The shipped picker is a compact detached popover under the filter button; the older spec text (and CLAUDE.md) still describe a "downward expansion of the bar — one connected surface". Migration kept the shipped popover (parity). Worth deciding which design is *intended* and updating docs/spec to match.
2. **0-located metagraph rows are dimmed but still clickable** in the filter picker. CLAUDE.md describes them as disabled/non-clickable chips. Clicking one filters to a metagraph that can't be plotted. Decide: disable (a11y-correct `CommandItem disabled`) or keep clickable-but-dimmed?
3. **ToggleGroup view switch inherits shadcn's `h-9 min-w-9` default sizing** rather than content-derived height. Currently visually equal, but the sizing is now owned by the primitive's variant, not the design. If the bar's density ever changes, decide the intended hit-target size (44px tap-target rule on touch?).

## From Task 3 (right-rail shell)

4. **Right-rail cards have no accent spine today**, while the themed `Card`/`ig-panel` recipe carries a `--spine` left accent. When left+right rails both sit on the Card recipe (Task 5), decide: should right-rail facts cards get the spine (consistent glass language) or stay spineless (calmer facts scope)?
   - *Task 5 update:* the swap is done — every rail card is now `.ig-panel`. Kept the right rail spineless (`--spine:transparent` via the shared `RIGHT_CARD` class) to preserve today's look; the left rail keeps its identity-tinted cyan spine (`--spine:var(--filter-accent,var(--primary))`). So the ig-panel spine is now *opt-in per container*. The open question stands for the brainstorming session: is a per-card right-rail spine actually wanted (it'd double up with RailThread's margin spine, which is the right rail's real identity cue), or keep the current asymmetry (left = card-edge spine + neutral thread; right = spineless cards + identity thread)?

## From Task 5 (left rail + unified card header)

5. **Left-rail spine now also shows inside the tablet/phone sheets.** On desktop the left tool cards carry the ig-panel identity spine; because those same cards render inside the `RailDock` Sheet on tablet/phone, they now also show a per-card spine *in addition to* the sheet's own screen-edge spine (`16-responsive-shell.css .sheet-content::before`). Two near-parallel spines a few px apart. Desktop is unaffected. Decide whether hosted-in-sheet cards should suppress their own spine (let the sheet edge be the only cue).
6. **Nested geo country-list scrollbar unified to the neutral rail scrollbar.** The old `.geo-list` had a bespoke *cyan* (`--core`-tinted) custom scrollbar; Task 5 reused the shared `.cmd-list-scroll` (neutral grey, the same slim scrollbar as the rails + command list) since webkit-scrollbar pseudos aren't Tailwind utilities and the neutral one is the established design-system scrollbar. Slight colour delta (cyan → grey), more consistent. Confirm the neutral scrollbar is the intended one network-wide, or reinstate a cyan variant as a component class.
7. **`CardHead` carries a `titleKey` roll-in slot no current consumer exercises.** The unified header supports a keyed `roll-in` title (the documented HUD grammar — title rolls in on subject change), but all six consumers today either have a static header title (panels / "All · whole network") or render their rich subject header in the card *body* (MetaCard/SnapshotCard, which already roll-in there). So the header-level roll-in is latent. Decide whether the inspector/context subject titles should move *into* the header (and roll there) for one grammar, or the body headers stay as-is and the header slot is only for future simple-title cards.
