// Reference + regression spec for the validator + metagraph per-frame dim/emissive resolution —
// and the SINGLE SOURCE for that math. The render path CALLS these functions directly:
// NodeFabric.writeValidatorGlow/writeMetaFrame (scene/objects/NodeFabric.ts) call
// validatorDim/metaNodeDim + nodeEmissive/metaNodeEmissive + hubMatchBoost per node/record, and
// Globe._frameCtx (scene/Globe.ts) sources its FrameCtx.dimScaleV from dimScale(c) each frame.
// There is no separate inline copy left to drift — the tests colocated with this file are the
// executable spec, and changing a formula here changes the render immediately.
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
import type { TuneSchema } from "../tune";

export interface DimContext {
  morph: number;
  hoverFilterActive: boolean;
  ledger: boolean;
  countryFilter: string | null;
  countryMix: number;
  hoverNodeId: string | null;
  // A hovered COHORT (explorer cohort row): every member id glows together — the whole 3D
  // honeycomb stack lights from one list row. null = no cohort hover.
  hoverCohort: ReadonlySet<string> | null;
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
// (Ledger override 2026-08-07, matching metaNodeDim: morph is frozen there, and full strength
// cascades to near-black through the chip writer — the flat 0.5 lands the validator chips at
// the same COLORED-dim tier as the metagraph chips.)
export const dimScale = (c: DimContext): number =>
  c.ledger ? FOCUS_TUNE.dimLedger : lerp(FOCUS_TUNE.dimHyper, FOCUS_TUNE.dimGeo, c.morph);

// The METAGRAPH pool's own dim strength: ZERO in the Hypergraph, full on the globe. Metagraph
// nodes REST at the dimmed look in hyper (user, 2026-07-17 — the base size/glow in
// NodeFabric.writeMetaFrame carry the old dim appearance instead), so the network dim must not
// move them there: a hover preview is inert and a committed filter leaves the others at rest
// (the selection pops via the hubMatch glow boost + camera/DoF, not by dimming the rest).
// Geo is unchanged — 1.0 at morph=1, the same ceiling as dimScale, so the off-filter
// isolate/hide on the globe is bit-identical. The ledger's flat 0.5 override (metaNodeDim)
// bypasses this ramp entirely, as before. Validators keep dimScale — the DAG core still dims
// back in hyper when a metagraph is the subject (the core-preview cue).
export const metaDimScale = (c: DimContext): number => c.morph;

// Set the dim TARGETS for a selection (the dim itself eases each frame; the per-view STRENGTH is
// applied in the node loops). The validators ARE the DAG core → lit under "all"/"dag", dimmed only
// when a metagraph is selected (both layers together — the L0/L1 split filters are gone).
// js/globe.js:665-670 (`_applyDim`) verbatim.
export const dimTargetsFor = (sel: string, metaIds: string[]) => ({
  dag: sel === "all" || sel === "dag" ? 0 : 1,
  meta: new Map(metaIds.map((id) => [id, sel === "all" || sel === id ? 0 : 1])),
});

// Per-view hover/selection DIM-BACK: how far the OTHER nodes drop when one node is the focus
// (user): softer in geo (the rest stay brighter), a notch stronger in ledger, hyper unchanged.
export const focusDim = (c: DimContext): number =>
  c.ledger ? FOCUS_TUNE.backLedger : lerp(FOCUS_TUNE.backHyper, FOCUS_TUNE.backGeo, c.morph);

// Per-view hover/selection BOOST: the emissive added to the focused node's shells. Full pop in
// hyper (the nodes rest dim there, see metaDimScale); HALVED in geo and ledger (user,
// 2026-07-17: the chips' base glow is brighter there and the flat 1.4 blew out).
export const focusBoost = (c: DimContext): number =>
  c.ledger ? FOCUS_TUNE.boostLedger : lerp(FOCUS_TUNE.boostHyper, FOCUS_TUNE.boostGeo, c.morph);

// Focus is TIERED, not a flag (user, 2026-08-01: "selecting a provider highlights its nodes,
// but selecting a node afterwards has no visual effect" — the node was already lit at exactly
// the group's strength, so the finer selection said nothing, while the same click over a
// drilled country reads immediately). A GROUP focus (a hovered/committed provider cohort, a
// hovered composition or cluster group) takes a FRACTION of the boost; the PRIMARY subject —
// the one hovered or selected node — always takes all of it, so it stands out from its own
// group. `focusWeightOf` is the one place that ranking lives; the node loops call it per node.
export const GROUP_FOCUS = 0.45; // share of focusBoost a group member gets (FOCUS_TUNE's default)
export const focusWeightOf = (primary: boolean, group: boolean): number =>
  primary ? 1 : group ? FOCUS_TUNE.groupShare : 0;

// ---- the EMPHASIS tunable (contract: src/engine/tune.ts) -------------------------------------
// The per-view dim/focus numbers, hoisted out of the formulas below into one struct so the `?tune`
// panel can bind them. Two properties keep this non-intrusive:
//   · `FOCUS_TUNE_DEFAULTS` is the SHIPPED LOOK and is what the tests pin — turning a knob can
//     never make a test pass or fail.
//   · Every value is seeded from the literal (or the existing const) it replaced, so the resolved
//     numbers are unchanged: `lerp(0.32, 1.0, morph)` IS `0.32 + 0.68 * morph`, and naming the
//     ENDPOINTS is what makes the geo value readable at all.
export interface FocusTune {
  /** Network/country dim strength per view — `dimScale`. */
  dimHyper: number;
  dimGeo: number;
  dimLedger: number;
  /** How far the OTHER nodes drop when one node is the focus — `focusDim`. */
  backHyper: number;
  backGeo: number;
  backLedger: number;
  /** Emissive added to the focused node — `focusBoost`. */
  boostHyper: number;
  boostGeo: number;
  boostLedger: number;
  /** Share of the boost a GROUP member gets, vs. the primary subject's full 1. */
  groupShare: number;
  /** The ledger's flat metagraph-node dim (morph is frozen there, so the ramp can't apply). */
  metaDimLedger: number;
}

export const FOCUS_TUNE_DEFAULTS: Readonly<FocusTune> = {
  dimHyper: 0.32, dimGeo: 1.0, dimLedger: 0.5,
  backHyper: 0.45, backGeo: 0.65, backLedger: 0.55,
  boostHyper: 1.4, boostGeo: 0.7, boostLedger: 0.7,
  groupShare: GROUP_FOCUS,
  metaDimLedger: 0.5,
};

export const FOCUS_TUNE: FocusTune = { ...FOCUS_TUNE_DEFAULTS };

export const FOCUS_TUNE_SCHEMA: TuneSchema<FocusTune> = {
  dimHyper: { min: 0, max: 1, label: "dim · hyper" },
  dimGeo: { min: 0, max: 1, label: "dim · geo" },
  dimLedger: { min: 0, max: 1, label: "dim · ledger" },
  backHyper: { min: 0, max: 1, label: "dim-back · hyper" },
  backGeo: { min: 0, max: 1, label: "dim-back · geo" },
  backLedger: { min: 0, max: 1, label: "dim-back · ledger" },
  boostHyper: { min: 0, max: 3, step: 0.05, label: "boost · hyper" },
  boostGeo: { min: 0, max: 3, step: 0.05, label: "boost · geo" },
  boostLedger: { min: 0, max: 3, step: 0.05, label: "boost · ledger" },
  groupShare: { min: 0, max: 1, label: "group share" },
  metaDimLedger: { min: 0, max: 1, label: "meta dim · ledger" },
};

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

// Metagraph-node per-node dim (js/globe.js:1095-1096): its own eased `recDim`, times the
// metagraph pool's OWN strength (metaDimScale — zero in hyper, see its note) — except in the
// Snapshots (ledger) view, where morph is frozen so the ramp alone would be too weak, so the
// effective dim is forced to a FLAT 0.5 (was 0.82 under the old recede-the-rest emphasis —
// the chip writer applies dim to colour AND glow, so 0.82 cascaded to near-black; 0.5 lands
// the chips at the COLORED-dim tier the ribbons' RIBBON_DIM speaks, user 2026-08-07). Raised
// by countryMix outside the drilled country, same as validatorDim.
export function metaNodeDim(c: DimContext, recDim: number, geoCc: string | null): number {
  let d = recDim * (c.ledger ? FOCUS_TUNE.metaDimLedger : metaDimScale(c));
  if (c.countryFilter && (!geoCc || geoCc !== c.countryFilter)) d = Math.max(d, c.countryMix);
  return d;
}

// Validator emissive glow. `flash` is the node's raw (undecayed) arc-arrival flash. `focus` =
// this node's focus WEIGHT from focusWeightOf (1 = it is the hovered/selected subject,
// GROUP_FOCUS = it is only a member of a focused group, 0 = not in focus). `dimOthersOnFocus` = the caller has already
// ANDed "some focus target exists" into the filter-based flag — with no focus target at all
// neither the boost nor the dim-back branch should fire, and this pure function has no side
// channel to detect "no focus", so the caller must fold that into the flag it passes.
// `baseLo`/`baseHi` are the emissive base's Hypergraph/globe endpoints, lerped by morph.
// STEADY: the old decorative twinkle shimmer was removed (user) — only data-driven pulses animate.
export function nodeEmissive(
  c: DimContext,
  d: number,
  flash: number,
  focus: number,
  dimOthersOnFocus: boolean,
  baseLo: number,
  baseHi: number,
): number {
  const ei = lerp(baseLo, baseHi, c.morph);
  const fl = flash * c.morph; // arcs are a geo-only visual — their flash must not bleed into hyper
  let v = Math.max(0.02, ei * (1 - d * 0.92) + fl); // suppress glow when dimmed
  // Hover/selection pairing: the focused machine's every layer-shell glows together,
  // and the rest dim back so it stands out (only when not already isolating a metagraph).
  if (focus > 0) v += focusBoost(c) * focus;
  else if (dimOthersOnFocus) v *= focusDim(c);
  return v;
}

// The COMMITTED metagraph's hub-match boost: in the Hypergraph, the picked network's nodes rise
// to the hub's resting glow level (0.72) instead of sitting at the dimmer node base, so they
// bloom like their hub (user). Derived from the node's own pre-floor `glow` (the boost is the
// GAP up to 0.72, never negative) and fading out with the hubs by morph 0.3 — there's no hub on
// the globe. `committed` = this node's metagraph IS the committed filter.
export function hubMatchBoost(c: DimContext, glow: number, committed: boolean): number {
  if (!committed) return 0;
  const hubFade = Math.min(1, Math.max(0, 1 - c.morph / 0.3));
  return Math.max(0, 0.72 - glow) * hubFade;
}

// Metagraph-node emissive glow — see the file-header deviation note: its suppression/floor
// coefficients differ from the validator's and aren't reachable through nodeEmissive's
// (baseLo, baseHi) parameterisation, so it's a sibling function with its own (single,
// unlerped) `base`. STEADY: the decorative twinkle shimmer was removed (user).
// `dimOthersOnFocus` = the caller has already ANDed "some focus target exists" into the
// filter-based flag — with no focus target at all neither the boost nor the dim-back branch
// should fire, and this pure function has no side channel to detect "no focus", so the
// caller must fold that into the flag it passes. `hubBoost` is hubMatchBoost(...) above —
// added INSIDE the floor, exactly as the render path composes it.
export function metaNodeEmissive(
  c: DimContext,
  d: number,
  flash: number,
  focus: number,
  dimOthersOnFocus: boolean,
  base: number,
  hubBoost = 0,
): number {
  const glow = base * (1 - d * 0.9);
  const fl = flash * c.morph; // arcs are a geo-only visual — their flash must not bleed into hyper
  let v = Math.max(0.03, glow + fl + hubBoost);
  if (focus > 0) v += focusBoost(c) * focus;
  else if (dimOthersOnFocus) v *= focusDim(c);
  return v;
}
