# src/theme — working notes

Light/dark: the two-way pref and every ground question it forces.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the eleven rules, run & test,
the architecture map and the dev workflow; **its rules govern this file too**.

## Light/dark

**Theme is a two-way pref (`system` / `light` / `dark`), not a boolean** — `src/theme/resolve.ts`
is the one resolver (`ThemePref`, `Theme`, `THEME_KEY`, `parseThemePref`, `resolveTheme`), the
`src/net/parse.ts` pattern mirrored for theme. Almost every token is a single `light-dark(light,
dark)` call at its ONE definition site in `:root` — no second `[data-theme]` override block the
way the network accent needs, because CSS itself carries both values. `color-scheme: light dark`
on `:root` is what makes `light-dark()` resolve at all; an explicit choice stamps
`[data-theme="light"|"dark"]` on `<html>`, narrowing `color-scheme` to just that value, and
`System` removes the attribute so the browser's own `prefers-color-scheme` decides — confirmed
live: flipping the OS scheme with no reload repaints every token with zero JS, because nothing
but CSS is involved while `data-theme` is absent. layout.tsx's inline pre-paint script (the same
device the network accent uses) reads `localStorage['dagviz:theme']` and stamps `data-theme`
synchronously before first paint, so a stored explicit choice never flashes the wrong scheme.
**The one number exception**: `--ident-l`/`--ident-c` are numbers, and `light-dark()` is
`<color>`-only, so they use the guarded override pair instead — `:root` bakes the dark value,
`@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { … } }` swaps in the
light value under OS-light (`:not([data-theme="dark"])` guards an explicit dark pin from being
overridden by the media query), and `:root[data-theme="light"]` restates that same light value
for an explicit light pin — the CSS comment above them states it as the one exception.

**`components/ThemeController.tsx` is THE one owner of theme state.** It reads the stored pref on
mount, adopts what the pre-paint script already stamped, and is the app's only
`matchMedia("(prefers-color-scheme: dark)")` listener — it resolves against the CURRENT pref on
every OS change, so a flip is a no-op unless the pref is `system`. `applyThemePref()` is the one
write path (stamps or removes `data-theme`, persists or clears `localStorage`, writes the store's
`theme`/`themePref` pair); `ThemeToggle` calls it and renders nothing of its own — same
React-19 mount-state rule "The three networks" states for `NetLink`/`NetworkSwitch`: it boots
`system` on server AND first client render, so hydration sees no mismatch and the icon corrects
itself once `ThemeController`'s effect adopts the stored choice.

**The Engine swaps colours in place, never rebuilds.** `_colors` (the structural `SceneColors`)
and `_sceneColorMap` (the identity hex map) are both mutated by `_refreshTheme()`, so every
per-frame reader that captured a reference at construction sees the new values with no code
change; `_colorConsumers` is the fan-out array (`HyperView`, `Globe`, `LedgerView`) populated
once in construction order, each exposing `setColors`/`setSceneColors`. `_bloomMul` (dark `1`,
light `LIGHT_TUNE.bloomMul` — shipped `0`, which skips the whole-frame pass outright) is the same
swap-in-place contract applied to a non-colour constant — decided once
at construction and rewritten by the same `_refreshTheme()` call. The Engine never listens to
`matchMedia` or the DOM itself; it detects a flip through a zustand store subscription registered
in the constructor, event-driven when `theme` changes.

**Any new glow/emissive material must ask the ground question.** The scene's glow idiom is
additive — ribbons, arcs, hyper's tethers and ring fills, the globe's graticule/borders/coastal
wall — which adds light to a black ground but saturates a light one straight to invisible white,
so blend mode is decided per theme by `glowBlend()` (`src/engine/sceneColors.ts`), called both at
construction and again at `_refreshTheme()`'s rebuild (a material whose blending changes after
construction needs `needsUpdate`, since three.js caches the program per blend mode). Where a site
bakes presence into a VERTEX colour instead of a material opacity — the ledger's ribbons, hyper's
tethers — the same ground question rides `inkMix()`: dark stays a straight multiply toward black,
light lerps toward `--background` instead, so a dimmed mark still reads as *less present* rather
than inverting the dim-tier hierarchy. One home for both, asked at every additive site, because
the failure is silent — a material that forgets to ask still renders, still retints, and simply
cannot be seen. Found live on the geo globe and the ledger's ribbons, which vanished entirely
under light.

⚠️ **BLOOM IS THE SAME QUESTION, AND ON PAPER THE ANSWER IS A SECOND LAYER.**
`UnrealBloomPass` is a luminance highpass over the FINISHED frame, so it can only ever select
what is BRIGHTER than its surroundings — and on paper an identity mark is INK (a DOR band sits
at ~0.42 relative luminance against the ~0.8-L ground). No threshold reaches it, which is why
`LIGHT_TUNE.bloomMul` is **0**: the whole-frame pass is skipped outright on light (Engine's
`bloom.enabled = _bloomMul > 0`), and all it did there was blow the one place light DID clear it
— the lead bar, the ribbon foot — to white. `bloomFloor` is inert while that is 0. The marks get
their own layer instead (`BLOOM_LAYER` + `joinBloom()`, `scene/SceneContext.ts`): on a paper frame
the camera is narrowed to that layer alone, the background nulled, and the members rendered into a
half-res target with its own black clear, blurred, and mixed in before `OutputPass`. **Membership
is the emissive identity MARKS and nothing else** — byte-bar bands, lane tiles, the LiveEdge, node
chips, hub orbs (the core included, one node model); never the glass, the backdrop or the labels,
which are the ground the halo is measured against. Three things are load-bearing and each fails
silently: `layers` is **per-object, not inherited** (tag the mesh, never its group), `joinBloom`
only ENABLES layer 1 so a member still renders on layer 0 exactly as before, and the sub-pass must
**null `scene.background`** or the backdrop fills the target and every pixel clears the threshold.
The **camera layer-mask** variant is chosen over the official darken-non-bloom-materials recipe
because it is the only one that works with `InstancedMesh` — each instance contributes in
proportion to its own instance colour, so the emphasis system does the selection WITHIN a member
mesh — at the cost of occlusion (a mark behind glass still halos), accepted because the planes are
translucent and the paper halo is faint.
⚠️ **And the composite's primary term is a MULTIPLY, not an add** — the ground question one level
up. Paper is L ~0.8 and the chamber glass sits within ~12/255 of it, so light added there clips to
white; `bleed` multiplies the ground toward the mark's own hue, which can only darken and tint,
keeps the ground's level and vignette underneath, and cannot blow out. `glow` is a whisper beside
it (0.06). Extends the backdrop rule: **on paper, emphasis is separation you take AWAY, not light
you add.** Dark is untouched by construction — the sub-composer is built lazily on the first paper
frame, and both knobs at zero skip the sub-pipeline rather than neutralising it.

**Sub-project 2 (per-view day-look refinement) is open.** ⚠️ **Dark's byte-identity guardrail is
RETIRED for LIGHTING** (user, 2026-08-29): the rig, the follow-spot and geo's sun evolve BOTH themes,
deliberately and documented, judged as design rather than diff-matched. Everything outside lighting
keeps the discipline. Geo's day pass is closed (sun + terminator, the paper border ladder, the
density pools' contact shade, chips reading as objects on silver); wave 8's record, including the
remaining look-debt, is `.superpowers/light-wave8-report.md`.
