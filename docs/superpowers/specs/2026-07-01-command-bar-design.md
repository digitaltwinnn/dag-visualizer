# Top command bar — design

**Date:** 2026-07-01
**Scope:** The full-width top command bar — brand/status, filter, view switch, and view vitals — redesigned in the Instrument-Glass language. Part of the HUD refresh; consumes the empty-states, panel-update, and colour-lane decisions.

## Problems with today's bar

- The **whole bar accent** (`--tb-accent`) tints to the selected metagraph — including the **active view button** — leaking the *identity* lane into navigation chrome.
- The **filter is pill-in-pill** (an identity chip inside a bordered Filter button): busy, and *loud* given the filter state is already carried by the right-rail thread, card breadcrumbs, and the filtered scene.
- There's **no home for the product name** ("DAG Visualizer").
- The live indicator is a **separate dot** alongside other marks — two abstract elements doing one job.

## Form

**A single unified glass bar** (Form A) — one continuous Instrument-Glass surface with a single left **accent spine** (structural cyan→blue) and **hairline dividers** between the three regions. (A segmented three-module variant was considered and rejected — the left/right rails already give the HUD its modular feel; the bar reads calmer as one instrument.)

Three regions on one row: **brand + status + filter** (left) · **view switch** (center) · **view vitals** (right).

## Lane discipline (the fix)

Navigation chrome stays **structural**; only the filter carries **identity**.

- **View switch active state, accent spine, vitals** → structural cyan/blue. A metagraph hue never themes navigation.
- **Filter dot** → the active metagraph's identity hue (it names a network). That's the *only* identity colour in the bar.

## Brand = the heartbeat (unified mark)

The product mark is an **ECG heartbeat** to the left of the wordmark — **one element carrying brand + liveness** (replaces both the old diamond and the separate live dot).

- **Wordmark:** `‹ECG›  DAG Visualizer` — mark in cyan, **DAG** bright (`--text`), **Visualizer** muted (`--muted`). Far-left (the conventional identity spot), then a hairline divider to the controls. Truncates to mark + `DAG` on narrow screens.
- **Live:** the trace **sweeps a beat on each snapshot tick** — the identity is literally alive (meaningful motion, ~1.5 s family; reduced-motion → static trace).
- **NO SIGNAL:** the trace **flattens to a flatline** and the wordmark greys — the flatline is the identity's own offline state, **no text tag needed**. Ties directly into the empty-states NO SIGNAL language.

## Filter — de-nested + toned

A quiet control, not a status badge (the state is over-communicated elsewhere).

- `Filter` micro-label + a **small identity dot** + the network **name in neutral text** + caret. **No filled chip**, no nested boxes.
- **All:** the dot goes **neutral cyan**, reads `All ▾`.
- Clicking **expands the bar downward into the picker** (one connected surface).
- Rationale: the right-rail thread + breadcrumbs + filtered scene already carry the loud "you're on DOR" signal, so the control recedes.

### The expanded picker — logo list + search
Redesigned from the flat chip row into a proper selection menu (it's an identity-selection surface — a legitimate place for **logos**, alongside the dossier; unlike the tiny inline pill/tooltip):

- **`All · whole network`** pinned on top (metagraph count + total nodes) — the default / clear option.
- **One row per metagraph:** **logo avatar** (rounded tile, ringed in the identity hue; monogram fallback) + **name** + **ticker** (identity hue) + **node count** on the right.
- **Sorted by node count (desc)** — most-significant first, which also sinks the **0-node / unlocatable** metagraphs to the bottom (shown **greyed with their real count**, e.g. `0 · located` — factual, never hidden).
- **Current pick highlighted** in its identity hue; hover state on the rest.
- **Search field** at the top — earns its keep as the metagraph set grows (the generator scales 100+); the list scrolls.
- Instrument-Glass surface, visually continuous with the bar (rounded to meet the filter button).

## View switch

Segmented control, six views, **monochrome glyphs only (never emoji)**. Active = structural cyan (inset ring + cyan icon + brighter label). The three **scaffolded placeholders** (Network / Transactions / Staking) render **dimmed** to signal not-yet-full.

## Vitals

Per-view mono numerics on the right — one **cell grammar** (uppercase muted label + neutral mono value + optional sparkline), hairline-separated, divided from the view switch by a hairline. **Numbers are neutral** (the number-colour rule); values **odometer-roll** on meaningful ticks.

**The three clusters:**
- **hyper — structure** (filter-aware): `L0 · cL1 · dL1` — nodes serving each layer for the current selection. One taxonomy: a hybrid counts in every layer it runs, so columns can **sum past the node total**. A filtered metagraph shows its own counts with an **em-dash for absent layers** (`cL1 —`), keeping the three columns stable (no reflow on switch).
- **geo — footprint**: `Nodes · Countries · Densest` — total machines on the map, the country count, and the densest country (flag + count). (The **Distribution score** moved out of the vitals into the GeoExplore header — see that spec.)
- **ledger — live activity**: `snaps/h · anchors/h · fees/h`, each with a trend **sparkline**. The sparkline is **muted-neutral history bars + a cyan live/latest bar** — cyan = the live accent (already in the bar via the spine + ECG), lane-correct because these *are* the live-activity charts. The only splash of colour in the vitals.

**Filtered state — stays neutral.** When a metagraph is filtered the vitals scope to it (its counts / footprint / own activity), but there is **no scope chip and no tinted border** — the **filter pill** (left of the same bar) is the single, subtle scope cue; re-announcing it on the right would break the toned/neutral-bar principle. The vitals just show the scoped numbers (small counts + em-dash already signal a metagraph view).

## Affected components

- `components/TopBar.tsx` — restructure: add the brand lockup + ECG logo; **remove the whole-bar `--tb-accent` metagraph tint** (keep the view switch structural); de-nest + tone the filter; keep the expand-to-chips behaviour.
- `components/topbar/Vitals.tsx` — wire the odometer roll into the headline values.
- `components/topbar/FilterChips.tsx` — **reworked** from the chip grid into the **logo list + search** picker: `All` on top, rows (logo/monogram + name + ticker + count) sorted by node count desc, current pick highlighted, 0-node metagraphs greyed at the bottom, a search input for scaling.
- New: the ECG logo component (live sweep / flatline), reading `store.live`.

## Open / follow-ups

- Implementation plan (writing-plans).
- Narrow-screen behaviour (wordmark → mark+`DAG`; vitals may collapse).
- The exact ECG waveform asset + beat-per-tick wiring.
- Fold bar tokens (spine, dividers, region paddings) into the Instrument-Glass token pass.
