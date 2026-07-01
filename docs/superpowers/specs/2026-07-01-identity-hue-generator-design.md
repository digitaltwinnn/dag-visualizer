# Identity hue generator — design

**Date:** 2026-07-01
**Scope:** How each metagraph gets its **identity-lane** colour — a generator that replaces the hand-picked list, tuned for glowing nodes on the dark bg, kept clear of the reserved structural hues, brand-matched where possible, and scaling past the current 10. Structural lane (chrome + semantic status) is unchanged.

## OKLCH fundamentals

- **Fixed lightness + chroma: `L 0.80 · C 0.15`.** Every metagraph hue renders at the same perceptual weight, so nodes glow **equally** on `#05060e` regardless of hue (no colour is louder/dimmer than another).
- **Guard-bands (~±16°)** around each **reserved structural hue** so identity never collides with chrome/status:
  - warn-red ~25° · success-green ~165° · accent-cyan ~195° · core-L0-blue ~265° · core-L1-violet ~300°.
- **Allowed hue zones** (the gaps): roughly **41–149°**, **211–249°**, **316–9°** (wrap). All generated hues live here.
- **Scaling:** the allowed zones hold ~20 perceptually-distinct hues at one L/C. Past that, add a **dimmer 2nd tier** (lower L/C) so overflow stays distinct. In practice all metagraphs are rarely on screen at once; the filter/legend + the ever-present **ticker label** disambiguate.

## Assignment — brand-first, hash-fallback

Each metagraph's hue is chosen **deterministically**, server-side (in `/api/metagraphs`), and cached with the metagraph list.

1. **Gather brand candidates** from two sources:
   - the site's **`theme-color`** meta (and og/brand meta) from `siteUrl`;
   - the **dominant + secondary/accent colours** extracted from the **logo** (`iconUrl`, already fetched).
2. **Convert all candidates to OKLCH.**
3. **Pick the best *allowed* candidate:** the most brand-representative candidate whose hue **already sits in an allowed zone** (and is vivid enough). This is the key rule — prefer an on-brand colour that's *already* legal over shifting the primary one. (E.g. a blue-logo metagraph with a teal accent → the teal.)
4. **Snap only as last resort:** if *every* candidate lands inside a reserved band, snap the **primary** brand hue to the **nearest allowed** neighbour (blue→azure, green→lime, violet→magenta) — close to brand, clearly not-structural.
5. **Glow-tune:** apply the fixed `L 0.80 / C 0.15` to the chosen hue.
6. **De-collision:** if two metagraphs resolve to nearly the same hue, the later one (deterministic order) **nudges to the next free slot** — distinctness beats exact brand fidelity.
7. **Fallback:** no logo / no theme-colour / extraction fails → a **hash of the metagraph id** → a stable allowed slot. Stable per id (a metagraph keeps its colour; new ones never reshuffle others).
8. **Manual pin (override):** a curated map may pin specific metagraphs if a generated result is ever wrong — an escape hatch, not the default.

## Why this over the alternatives

- **vs pure hash:** brand-matching is *recognisable* (DOR reads orange, SWAP gold) instead of arbitrary.
- **vs even-by-index:** hash/brand assignment is **stable** — adding or removing a metagraph never reshuffles everyone else's colour (identity memory holds).

## Accessibility

Hue is never the *sole* signal — the **ticker label** rides alongside the colour everywhere (chips, pills, breadcrumbs, tooltip, thread). So colour-vision-deficient users still disambiguate by text; the generator's job is aesthetic distinctness, not the only channel.

## Affected components

- `app/api/metagraphs/route.ts` — extract brand candidates (theme-colour fetch + logo dominant/secondary), resolve each metagraph's hue via the pipeline above, **cache with the list** (per the existing `unstable_cache`).
- A **`palette.ts`** generator (shared): the OKLCH math (allowed zones, guard-bands, glow-tune, de-collision, hash-fallback, 2nd tier). Replaces the hand-picked colours in `config.METAGRAPHS`, matched by `id`; keep config **order/hub slots** as-is.
- Everything that reads a metagraph colour (hubs, globe nodes, chips, thread, caps, tooltip, pills) now reads the generated hue by `id` — no change to call sites, just the source.

## Factual note

Brand hues are **derived from the metagraph's real logo/site**, not invented — consistent with the no-fabricated-data rule.

## Open / follow-ups

- Implementation plan (writing-plans).
- Choice of dominant-colour extraction (small lib vs manual k-means on the icon) and `theme-color` fetch/caching.
- Tune the exact guard-band widths + allowed-zone bounds against the real resolved set once extraction runs.
- Confirm the 2nd-tier L/C values when the metagraph count actually exceeds the hue budget.
