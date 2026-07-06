// Pure dim/emissive resolution shared by the validator + metagraph per-frame node loops
// (js/globe.js). Extracted verbatim (with source comments) as the domain layer for Task 11's
// globe.js split — the numbers/behaviour are unchanged, js/globe.js is not yet switched over.
//
// DEVIATION from the Task 9 brief: the brief's single `nodeEmissive(..., baseLo, baseHi)`
// signature exactly expresses the VALIDATOR loop (js/globe.js:1043-1054) — its base term really
// does lerp(0.5, 0.22, morph) — but it can NOT also express the metagraph loop
// (js/globe.js:1099-1107): that loop's base term is a flat 0.5 (no lerp), its twinkle
// coefficient is 0.12 (not 0.06), its glow-suppression coefficient is 0.9 (not 0.92), and its
// floor is 0.03 (not 0.02). None of those four differences are reachable through
// (baseLo, baseHi) alone. Per the brief's own escape hatch ("splitting into validatorEmissive +
// metaNodeEmissive is acceptable if documented"), this file keeps `nodeEmissive` exactly as
// specified (== the validator formula) and adds a sibling `metaNodeEmissive` carrying the
// metagraph loop's own hardcoded coefficients, rather than force-fit one function onto both and
// lose exactness.

import { lerp } from "./nodeLayout";

export interface DimState {
  l0: number;
  l1: number;
}

export interface DimContext {
  morph: number;
  hoverFilterActive: boolean;
  ledger: boolean;
  countryFilter: string | null;
  countryMix: number;
  hoverNodeId: string | null;
  selectedNodeId: string | null;
  filter: string;
}

// How strong the network/country dim is, ramped by the morph: SUBTLE in the Hypergraph
// (a gentle "out of focus" push — nodes stay full-strength-ish and visible) and FULL on the
// globe (off-filter nodes fade out entirely). EVERY dim consumer — node scale AND glow, for
// BOTH validators and metagraph nodes — multiplies the raw eased dim by this one value, so
// they can never drift apart (the old bug: the validator *scale* used the raw, un-ramped dim
// and so scaled the nodes to nothing in hyper, while their glow only dimmed).
export const dimScale = (c: DimContext): number =>
  c.hoverFilterActive ? 0.85 : 0.32 + 0.68 * c.morph; // js/globe.js:830-833 verbatim

// Set the dim TARGETS for a selection (the dim itself eases each frame; the per-view STRENGTH is
// applied in the node loops). The validators ARE the DAG core → lit under "all"/"dag", dimmed only
// when a metagraph is selected (both layers together — the L0/L1 split filters are gone).
// js/globe.js:665-670 (`_applyDim`) verbatim.
export const dimTargetsFor = (sel: string, metaIds: string[]) => ({
  dag: sel === "all" || sel === "dag" ? 0 : 1,
  meta: new Map(metaIds.map((id) => [id, sel === "all" || sel === id ? 0 : 1])),
});

// Validator per-node dim (js/globe.js:1037-1039): layer dim x dimScale, raised by countryMix
// when the node is outside the drilled-into country (geo only). `layer` is the node's role —
// "l0" or "cl1" (DimState's `l1` field is the "not l0" bucket: historically named after the L1
// shell, but it's the dim level for the cl1 role — see js/globe.js:244/1037, where `u.layer`
// is the node's `role` and anything that isn't "l0" reads `dim.l1`). `geoCc` is the node's geo
// country code, or null if it has none (hybrid siblings / unlocated nodes).
export function validatorDim(c: DimContext, s: DimState, layer: "l0" | "cl1", geoCc: string | null): number {
  let d = (layer === "l0" ? s.l0 : s.l1) * dimScale(c);
  // outside the drilled-into country? dim it on top of the network dim (geo only).
  if (c.countryFilter && (!geoCc || geoCc !== c.countryFilter)) d = Math.max(d, c.countryMix);
  return d;
}

// Metagraph-node per-node dim (js/globe.js:1095-1096): its own eased `recDim`, times dimScale —
// except in the Snapshots (ledger) view, where morph is frozen so dimScale alone would be too
// weak, so the effective dim is forced to a flat 0.82. Raised by countryMix outside the drilled
// country, same as validatorDim.
export function metaNodeDim(c: DimContext, recDim: number, geoCc: string | null): number {
  let d = recDim * (c.ledger ? 0.82 : dimScale(c));
  if (c.countryFilter && (!geoCc || geoCc !== c.countryFilter)) d = Math.max(d, c.countryMix);
  return d;
}

// Validator emissive glow (js/globe.js:1043-1054). `twinkle` is the node's own decorative phase
// offset; `flash` is the node's raw (undecayed) arc-arrival flash. `isFocus` = this node IS the
// hovered/selected focus target. `dimOthersOnFocus` = the caller has already ANDed "some focus
// target exists" into the filter-based flag (js/globe.js:980) — with no focus target at all
// neither the boost nor the dim-back branch should fire, and this pure function has no side
// channel to detect "no focus", so the caller must fold that into the flag it passes.
// `baseLo`/`baseHi` are the emissive base's Hypergraph/globe endpoints, lerped by morph.
export function nodeEmissive(
  c: DimContext,
  d: number,
  clock: number,
  twinkle: number,
  flash: number,
  isFocus: boolean,
  dimOthersOnFocus: boolean,
  baseLo: number,
  baseHi: number,
): number {
  let ei = lerp(baseLo, baseHi, c.morph);
  // Twinkle is a decorative (non-data-driven) shimmer — geo only (scaled by m), so the
  // Hypergraph nodes stay static and only the DATA-driven pulses animate there.
  ei += Math.sin(clock * 2 + twinkle) * 0.06 * c.morph;
  const fl = flash * c.morph; // arcs are a geo-only visual — their flash must not bleed into hyper
  let v = Math.max(0.02, ei * (1 - d * 0.92) + fl); // suppress glow when dimmed
  // Hover/selection pairing: the focused machine's every layer-shell glows together,
  // and the rest dim back so it stands out (only when not already isolating a metagraph).
  if (isFocus) v += 1.4;
  else if (dimOthersOnFocus) v *= 0.45;
  return v;
}

// Metagraph-node emissive glow (js/globe.js:1099-1107) — see the file-header deviation note:
// its base/twinkle/suppression/floor coefficients differ from the validator's and aren't
// reachable through nodeEmissive's (baseLo, baseHi) parameterisation, so it's a sibling
// function with its own (single, unlerped) `base`.
// `dimOthersOnFocus` = the caller has already ANDed "some focus target exists" into the
// filter-based flag (js/globe.js:980) — with no focus target at all neither the boost nor
// the dim-back branch should fire, and this pure function has no side channel to detect
// "no focus", so the caller must fold that into the flag it passes.
export function metaNodeEmissive(
  c: DimContext,
  d: number,
  clock: number,
  twinkle: number,
  flash: number,
  isFocus: boolean,
  dimOthersOnFocus: boolean,
  base: number,
): number {
  const glow = (base + Math.sin(clock * 2 + twinkle) * 0.12 * c.morph) * (1 - d * 0.9);
  const fl = flash * c.morph; // arcs are a geo-only visual — their flash must not bleed into hyper
  let v = Math.max(0.03, glow + fl);
  if (isFocus) v += 1.4;
  else if (dimOthersOnFocus) v *= 0.45;
  return v;
}
