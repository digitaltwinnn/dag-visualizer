# Plan — callouts follow TRACKED subjects (the ledger gets two)

**Date** 2026-08-30 · **Status** awaiting user sign-off · **Requested** user: "in snapshot mode
when we filter on a metagraph actually two elements are/should be tracked; the global snapshot
(+callout) AND the metagraph snapshot (+callout); fix it structurally; something that is
tracked/focused has the callout."

## The structural change

The callout system is single-subject by construction: `#callout` is ONE anchor wrapper, the
Engine's `_syncCallout` writes ONE transform, and the model mirrors THE box (`boxedCard`, falling
through to the finest committed rung). The new principle replaces "the callout mirrors the box"
with: **every TRACKED subject renders a callout.**

- A view exposes a small, ordered set of tracked subjects (domain data, per view — convention 7):
  - hyper: the staged subject (node, else hub, else nothing committed → none) — max 1, unchanged.
  - geo: the committed node / cohort-less anchors as today — max 1, unchanged.
  - ledger: the shown GLOBAL tick (live-followed or pinned) AND, under a committed metagraph,
    the committed/live METAGRAPH snapshot — max 2. This is the case that motivated the change:
    live metagraph mode tracks both, so both are named in the scene.
- The box still decides which subject's callout is PRIMARY (the camera's subject), but no longer
  gates presence. `boxedCard` keeps its exact current role for the camera and for model detail.

## Mechanics

1. **DOM**: `#callout` becomes the container; inside it one `.co-sub` wrapper per tracked subject
   (keyed by subject kind, so React reconciles stably). `SceneCallout` renders the set;
   `Engine._syncCallout` walks the same set and writes each wrapper's transform + `data-on` —
   still the Tooltip discipline, still two homes, now plural. `calloutBoundary.test.ts` is
   REWRITTEN to pin the generalized contract (container two homes; every wrapper written by the
   one sync; both owners consult the tracked-subject resolver — ONE home for the set, so presence
   and anchors can't disagree).
2. **Anchors** stay object-level and honest: the global tick anchors its byte-bar band (the
   committed network's own segment under a filter — `bandAnchor` exists), the metagraph snapshot
   its own tile (`selectedTileAnchor` exists). A subject whose anchor can't be resolved this
   frame renders no callout — unchanged rule.
3. **Placement/dodge**: two panels near one row must not overlap. Rule: the PRIMARY subject
   places first (existing placement math, band-aware); the second computes its placement and, if
   its panel rect intersects the first's, takes the mirrored side (`data-flip`), and if both
   sides collide it drops — a callout that can only lie about where it points does not render
   (the distributed-subject rule's reasoning). Lives in `domain/calloutPlacement.ts` beside the
   band math, pure and testable.
4. **Phone/tablet**: unchanged — the phone declines all callouts through `breakpointOf`; the
   tablet band logic applies per callout.
5. **CLAUDE.md**: the subject-callout section's "the box leads" paragraph gains the tracked-set
   statement; the CSS2DRenderer "contained swap if callouts ever multiply" note gets revisited —
   staying with DOM panels (two is still cheap; the swap point was about many).

## Order of work

1. `domain/` tracked-subject resolver + placement dodge, with colocated tests (rule 4).
2. `SceneCallout` set rendering; `Engine._syncCallout` loop; boundary test rewrite.
3. Ledger wiring (band + tile anchors already exist); live checks: filtered follow (both
   callouts, ticking), pin an old tick, deselect ladder walk, hover previews (hover still
   commits nothing and spawns no callout).
4. Cross-view regression pass (hyper node/hub, geo node, tablet band, phone absence).
