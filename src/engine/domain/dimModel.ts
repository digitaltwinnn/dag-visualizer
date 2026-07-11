// Reference + regression spec for the validator + metagraph per-frame dim/emissive resolution.
// The render path inlines these formulas verbatim rather than calling into this module:
// NodeFabric.writeValidatorGlow/writeMetaFrame (scene/objects/NodeFabric.ts) reimplement
// nodeEmissive/metaNodeEmissive's math inline, and Globe._dimScale/_applyDim (scene/Globe.ts)
// reimplement dimScale/dimTargetsFor. Any change here must be made in BOTH places until a
// follow-up wires this module in directly (parity-gated). The tests colocated with this file
// are the executable spec of the contract.
//
// DEVIATION from the Task 9 brief: the brief's single `nodeEmissive(..., baseLo, baseHi)`
// signature exactly expresses the VALIDATOR loop (js/globe.js:1043-1054) — its base term really
// does lerp(0.5, 0.22, morph) — but it can NOT also express the metagraph loop
// (js/globe.js:1099-1107): its glow-suppression coefficient is 0.9 (not 0.92) and its
// floor is 0.03 (not 0.02) — historic per-loop tuning kept verbatim. (The loops' base terms
// and twinkle have since been unified/removed.) Those differences are not reachable through
// (baseLo, baseHi) alone. Per the brief's own escape hatch ("splitting into validatorEmissive +
// metaNodeEmissive is acceptable if documented"), this file keeps `nodeEmissive` exactly as
// specified (== the validator formula) and adds a sibling `metaNodeEmissive` carrying the
// metagraph loop's own hardcoded coefficients, rather than force-fit one function onto both and
// lose exactness.

import { lerp } from "./nodeLayout";


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
// (The old hover-preview FORCED-STRONG 0.85 branch is gone — user 2026-07-11: hovering/
// clicking a hub in hyper dimmed the rest far harder than the regular dim; the preview now
// dims at the same per-view strength as a committed filter.)
export const dimScale = (c: DimContext): number => 0.32 + 0.68 * c.morph;

// Set the dim TARGETS for a selection (the dim itself eases each frame; the per-view STRENGTH is
// applied in the node loops). The validators ARE the DAG core → lit under "all"/"dag", dimmed only
// when a metagraph is selected (both layers together — the L0/L1 split filters are gone).
// js/globe.js:665-670 (`_applyDim`) verbatim.
export const dimTargetsFor = (sel: string, metaIds: string[]) => ({
  dag: sel === "all" || sel === "dag" ? 0 : 1,
  meta: new Map(metaIds.map((id) => [id, sel === "all" || sel === id ? 0 : 1])),
});

// Validator (DAG-core) dim: the eased whole-core dim (ONE value — the old per-layer {l0,l1}
// split always carried identical values and was collapsed; the DAG core is one subject) scaled
// by the morph-ramped strength, then raised by countryMix outside the drilled country. `geoCc`
// is the node's geo country code (null when unlocated).
export function validatorDim(c: DimContext, dim: number, geoCc: string | null): number {
  let d = dim * dimScale(c);
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

// Validator emissive glow. `flash` is the node's raw (undecayed) arc-arrival flash. `isFocus` =
// this node IS the hovered/selected focus target. `dimOthersOnFocus` = the caller has already
// ANDed "some focus target exists" into the filter-based flag — with no focus target at all
// neither the boost nor the dim-back branch should fire, and this pure function has no side
// channel to detect "no focus", so the caller must fold that into the flag it passes.
// `baseLo`/`baseHi` are the emissive base's Hypergraph/globe endpoints, lerped by morph.
// STEADY: the old decorative twinkle shimmer was removed (user) — only data-driven pulses animate.
export function nodeEmissive(
  c: DimContext,
  d: number,
  flash: number,
  isFocus: boolean,
  dimOthersOnFocus: boolean,
  baseLo: number,
  baseHi: number,
): number {
  const ei = lerp(baseLo, baseHi, c.morph);
  const fl = flash * c.morph; // arcs are a geo-only visual — their flash must not bleed into hyper
  let v = Math.max(0.02, ei * (1 - d * 0.92) + fl); // suppress glow when dimmed
  // Hover/selection pairing: the focused machine's every layer-shell glows together,
  // and the rest dim back so it stands out (only when not already isolating a metagraph).
  if (isFocus) v += 1.4;
  else if (dimOthersOnFocus) v *= 0.45;
  return v;
}

// Metagraph-node emissive glow — see the file-header deviation note: its suppression/floor
// coefficients differ from the validator's and aren't reachable through nodeEmissive's
// (baseLo, baseHi) parameterisation, so it's a sibling function with its own (single,
// unlerped) `base`. STEADY: the decorative twinkle shimmer was removed (user).
// `dimOthersOnFocus` = the caller has already ANDed "some focus target exists" into the
// filter-based flag — with no focus target at all neither the boost nor the dim-back branch
// should fire, and this pure function has no side channel to detect "no focus", so the
// caller must fold that into the flag it passes.
export function metaNodeEmissive(
  c: DimContext,
  d: number,
  flash: number,
  isFocus: boolean,
  dimOthersOnFocus: boolean,
  base: number,
): number {
  const glow = base * (1 - d * 0.9);
  const fl = flash * c.morph; // arcs are a geo-only visual — their flash must not bleed into hyper
  let v = Math.max(0.03, glow + fl);
  if (isFocus) v += 1.4;
  else if (dimOthersOnFocus) v *= 0.45;
  return v;
}
