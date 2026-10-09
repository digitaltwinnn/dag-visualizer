# src/theme — working notes

Light/dark: the two-way pref and every ground question it forces.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the twelve rules, run & test,
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
**The NUMBER exception**: `light-dark()` is `<color>`-only, so a token whose value is a number
cannot use it and takes the guarded override TRIPLE instead — `:root` bakes the dark value,
`@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { … } }` swaps in the
light value under OS-light (`:not([data-theme="dark"])` guards an explicit dark pin from being
overridden by the media query), and `:root[data-theme="light"]` restates that same light value
for an explicit light pin. Two tokens use it and the CSS comment above each says why:
`--ident-l`/`--ident-c` (the identity lanes' L and C), and **`--trend-fill-top`**, the opacity at
the top of the History cards' area fill — 0.30 dark, 0.18 on paper, because there the hue is INK
and the presence that reads as a quiet tint on the dark card reads as a painted block on the light
one (the card's face is `--panel-solid` over the opaque `--scene-ground`). The fill is drawn as an SVG gradient
stop, so the token reaches it through `style={{ stopOpacity: "var(--trend-fill-top)" }}` — a
presentation ATTRIBUTE would not resolve a `var()`, and a JS theme read would put a second theme
owner beside `ThemeController`.

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
at ~0.42 relative luminance against the ~0.95-L plate). No threshold reaches it, which is why
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
up. Paper is L ~0.95 and the chamber's sheets sit within a few points of it, so light added there clips to
white; `bleed` multiplies the ground toward the mark's own hue, which can only darken and tint,
keeps the ground's level and vignette underneath, and cannot blow out. `glow` is a whisper beside it (0.05 since the Print pass, `bleed` 0.18 — measured on the flat plate, the bleed alone tinted the whole inside of the DAG's shells blue, so both came down to what a committed subject needs and no more). Extends the backdrop rule: **on paper, emphasis is separation you take AWAY, not light
you add.** Dark is untouched by construction — the sub-composer is built lazily on the first paper
frame, and both knobs at zero skip the sub-pipeline rather than neutralising it.

## Print — the light look since 2026-10-09

**Light mode is a PRINTED SHEET, not a lit wall** (design direction A, chosen by the user over a
blueprint plate and a lit stage, on real screenshots in the brainstorming companion). The lit
silver wall, its sky-to-stage sweep, the pool of light and the engineering grid — the 2026-08
"wave" work — are DELETED, not parked (user, same day: "clean dead code also"); git carries them,
and `SceneContext.applyBackground` is one flat colour on both grounds. The dark look is
byte-identical throughout by construction: every change is the light
arm of a `light-dark()` or the `paper ? … : …` branch, and the chamber's dark shader branch
returns before any Print term is read.

The sheet, in numbers: the page `--background` is 0.985 white; the scene plate `--scene-ground` is
0.955, one step below it, FLAT; the HUD's cards, top bar, vitals band and `--panel-solid` are one
sheet at 0.97, one step ABOVE the plate and never white (user: white cards with a hard rule read
as cut-outs "a thousand feet above" the page); every light drop shadow (`--card-ambient`,
`--band-ambient`, `--box-lift`) is zero, so `--border` (a neutral ink at 0.22) IS the edge, and the
open rung is told apart from an entry by `--box-rule`, a heavier inset ring whose dark arm is
transparent; a folded ghost carries `--panel-light` at 0.72 so it reads as a strip.

**The structure ink is one home**: `structureInk()` (`src/engine/sceneColors.ts`) answers the
accent on dark and, on paper, the MIDPOINT of `labelInk`'s muted tone and the accent (the muted
ink alone read "a bit dark for light mode — before it was cyan, maybe both"). Hyper's hoops,
tethers and ring fills and the globe's graticule, coastal walls, compass rose, land tint and
country borders all take it, so a hoop and a graticule are made of the same thing. On paper hyper's
rim fills are OFF (`FILL_OP_PAPER` — their stacked bands read as a milky disc under every hub,
measured as contrast, not light), the globe's land is a fill (`LAND_GLASS_BODY` 0.35, the Fresnel
ramp to the rim kept) over a paper-only OCEAN PLATE (`buildOcean`, 7% ink at sea level, hidden on
dark, pick-inert because geo resolves its surface by sphere maths), and the chamber's panes are
MATTE SHEETS: `GLASS_TUNE` holds body 0.10, a whisper of Fresnel (rim 0.10), the trays' body, and
`line` — `glassFill.uLine`, an ink hairline ~1.5px inside every pane's rim measured in screen
space (`fwidth`), the HUD card's edge recipe one layer down. The day glass's reflection terms
(room, window, softboxes, polished lip, the lamp lobe and its uniform push) are deleted with the
wall; the ledger still claims the stage light on paper because the lamp lights the tray CHIPS.

**The paper halo is a whisper** (`selBleed` 0.18, `selGlow` 0.05): on the flat plate the bleed alone
tinted the plate blue inside the DAG's shells, which on paper is a stain, not emphasis.

⚠️ **What this leaves on the lamp rule above:** a claim's `intensityPaper` still has to be higher
than its dark level (the test pins the direction), and on the sheet the stage light's pool is the
one lit thing a paper view shows — judge any retune of it against the flat plate, not the old wall.
Wave 8's record (`.superpowers/light-wave8-report.md`) is history: it describes the wall.
