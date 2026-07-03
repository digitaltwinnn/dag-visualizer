# Data-driven panel updates — design

**Date:** 2026-07-01
**Scope:** How the JSX/React HUD panels acknowledge that their data changed. Companion to the empty/loading-states spec (same "on-brand, calm motion" family); this one is about *panels that are already showing data and get updated*, not the 3D scene (whose motion is intentionally data-shaped and left per-view).

## Problem

Panels update for two very different reasons, and today they aren't distinguished:

1. **A generic cue.** `components/useFlashOnChange.ts` fires a **hard expanding box-shadow ring** (0→8px, 1100 ms, accent-tinted) around the *whole card* when its subject changes. It's a stock highlight-pulse.
2. **A gap.** The **top-bar vitals** (snaps/anchors/fees per hour, distribution score…) update live from polls with **no cue at all** — numbers silently swap.

## Two kinds of update, two cues

- **Kind 1 · New subject** — you *selected* something (a node, a snapshot bar, a filter); the whole panel becomes a different thing. → a **card-level** cue.
- **Kind 2 · Live value change** — same subject, but *new data arrived* (a vitals number ticks, the followed snapshot advances). → a **value-level** cue. Flashing the whole card every few seconds is too much.

### Kind 1 — softened node-halo
Keep the card-level cue on subject change, but **soften the hard ring into a diffuse node-halo**: a blurred, low-opacity cyan glow that swells and fades (echoing the node hover-halo), not a crisp 8px outline. Same trigger and one-shot timing as today (~1.1 s), same accent-tint + reduced-motion guard.

Attach points (unchanged): `Inspector` (per detail pane, on the pick `dep`) and `ContextPanel` (dossier, on `filter`).

### Kind 2 — headline-only odometer roll
When live data updates a **shown** value, the value **rolls** to its new figure — old digit-block slides up and out, new slides in (a clean one-shot vertical translate). **No fade / blink.** Reduced-motion → instant swap.

**The rule: roll the headline, not the details.**
- **One roll per card update** — on the value the eye hits first (the card's identity / primary metric).
- Everything subordinate **swaps instantly**. No cascade of rolling numbers (no slot-machine).
- A readout that is *all* headline (the vitals cluster) rolls each cell — same rule, there's just no subordinate detail to hold back.

Applied:

| Surface | Rolls | Quiet (instant) |
|---|---|---|
| Snapshot card | the **ordinal** (title) | anchored count · pills · fee · size |
| Vitals cluster | **snaps/h · anchors/h · fees/h** (each is a headline) | — |

**Meaningful-only.** The roll fires only when the value actually changes to a *new* datum (a new tick / a resolved value) — idle re-polls that return the same number are inherently no-ops, so nothing twinkles when nothing changed.

**Roll vs the ACQUIRING cross-fade (don't confuse them).** From the empty-states spec: a value's **first appearance** (resolving from unknown) is the constellation cross-fade; a value **changing from one known figure to another** is the roll. Different moments, different cues.

**Follow vs pick (snapshot card).** The ordinal rolls only when *following live* advances to the next tick. Manually picking a *different* snapshot is a **new subject** → Kind-1 halo, **no roll** (it's a jump, not an advance).

## Motion values

- **Kind 1 halo:** ~1.1 s ease-out, diffuse (blurred, low-opacity) cyan/accent glow, one-shot on subject change.
- **Kind 2 roll:** one-shot vertical translate of the value block, ~250–350 ms, odometer ease (e.g. `cubic-bezier(.5,0,.15,1)`), no opacity change.
- **Reduced-motion:** both → instant (no halo, no roll); values swap in place.

## Implementation notes

- **Kind 1:** adjust `useFlashOnChange` keyframes from the hard `0 0 0 0/8px` ring to a diffuse blurred glow (`0 0 <blur> <spread> <accent>` → transparent). Same hook, same call sites.
- **Kind 2:** a small dedicated primitive — a `RollingNumber` component (or `useOdometer` hook) that, on a changed `value` prop, animates old→new via a two-item vertical slide (Web Animations API, to survive React re-renders, mirroring the `useFlashOnChange` rationale). Honour `prefers-reduced-motion` (swap instantly). Fixed line-height container with `overflow:hidden`; width reserved to avoid layout shift.
- Wire `RollingNumber` into the **headline** value only: `Vitals`'s three cells, and the `SnapshotCard` ordinal (gated on `following`).

## Where it applies

- **Kind 1 (halo):** `Inspector` detail card, `ContextPanel` dossier.
- **Kind 2 (roll):** `Vitals` (all cells), `SnapshotCard` ordinal (follow-only).

## Open / follow-ups

- Implementation plan (writing-plans) covers the `useFlashOnChange` softening + the `RollingNumber` primitive + wiring.
- Fold the halo/roll durations into the shared motion tokens alongside the empty-states values when the Instrument-Glass token pass happens.
