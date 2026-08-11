// Reference + regression spec for the per-frame node dim/emissive resolution — and the SINGLE
// SOURCE for that math. The render path CALLS these functions directly: NodeFabric's two node
// loops (scene/objects/NodeFabric.ts) call nodeDim + nodeEmissive + hideFrac + hubMatchBoost per
// record. There is no separate inline copy left to drift — the tests colocated with this file are
// the executable spec, and changing a formula here changes the render immediately.
//
// ONE NODE MODEL (user, 2026-08-11): "Across all views I want no difference between dag nodes and
// other metagraphs — they are the same network topology, only positioned differently in some
// views. Dim effects and code should be shared, not split." The DAG core is a metagraph-shaped
// core (see CLAUDE.md), so its validators are metagraph nodes that happen to orbit the origin.
// This file therefore has ONE dim strength, ONE dim resolver and ONE glow model, and both loops
// call them with nothing but their own record. What was split, and why it looked like a design
// decision when it was really one number applied twice:
//   · `core`/`meta` were two row fields. geo and ledger already carried IDENTICAL values in both;
//     only hyper differed (0.32 vs 0) — and its 0 was forced, not chosen (below).
//   · `META_REST_SCALE = 0.68` and a `baseG = 0.33` resting glow in NodeFabric were hyper's 0.32
//     dim BAKED INTO CONSTANTS: 1 - 0.32 is 0.68, and 0.47 * (1 - 0.32*0.92) is 0.33. With the dim
//     pre-applied as the resting look, the live dim HAD to be zeroed or it would apply twice. That
//     is the whole origin of the split — and why the new `hide` knob appeared to affect the DAG
//     core alone: `hideFrac` is a fraction OF a dim, and the metagraph pool's dim was 0.
//   · Two emissive functions differed only in historic per-loop tuning carried over verbatim from
//     js/globe.js (suppression 0.92 vs 0.9, floor 0.02 vs 0.03) — a sub-1% difference that no eye
//     resolves, standing in the way of one shared model. Unified on the validator's coefficients.

import { lerp } from "./nodeLayout";
import type { View3D } from "./viewTransition";
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

// How strong the network/country dim is, ramped by the morph: SUBTLE in the Hypergraph (a gentle
// "out of focus" push — nodes stay visible and full-size, muting in place) and FULL on the globe
// (off-filter nodes vanish — the isolate, see hideFrac). ONE value for EVERY node, DAG core and
// metagraph alike, and every consumer — scale AND glow AND colour — multiplies the raw eased dim
// by it, so they can never drift apart (the old bug: the validator *scale* used the raw,
// un-ramped dim and so scaled the nodes to nothing in hyper, while their glow only dimmed).
// (The old hover-preview FORCED-STRONG 0.85 branch is gone — user 2026-07-11: hovering/
// clicking a hub in hyper dimmed the rest far harder than the regular dim; the preview now
// dims at the same per-view strength as a committed filter.)
// (Ledger override 2026-08-07: morph is frozen there, and full strength cascades to near-black
// through the chip writer — the flat 0.5 lands the chips at a COLORED-dim tier. Since 2026-08-11
// the chamber's SNAPSHOTS read the same field through `snapBright`, so a chip and the tile it
// signed dim off-filter by exactly one number.)
export const nodeDimScale = (c: DimContext): number => viewMix(c, "dim");

// HIDE IS NOT DIM (user, 2026-08-11). A dim mutes a node two ways — colour toward DIM and emissive
// suppression — but geo does a third thing that isn't a dim at all: the ISOLATE, "off-filter nodes
// vanish on the globe" (js/globe.js:896-904). It rode the same number only because that number was
// pinned in hyper, so the shrink was never visible there; the moment the strengths became tunable it
// was the FIRST thing a turned-up knob did, and a node dimmed to nothing can't be "more muted".
//
// So `hide` is its own STRENGTH ON THE SAME RAW RAMP as `dim`, not a fraction of the dim's output
// (user, 2026-08-11: turning `dim` was resizing nodes whenever `hide` was non-zero — one knob moving
// two effects is not a knob). Two independent readings of one ramp: `dim` says how far an off-filter
// node mutes, `hide` how far it shrinks away. 1 on the globe (bit-identical isolate, since geo's dim
// is 1.0 too), 0 in hyper (mute in place, full size) and 0 in the ledger, whose chips are
// uniform-sized by their own rule anyway.
//
// Reading the RAW ramp is also what keeps the country drill a LENS: `nodeDim`'s countryMix raise is
// a mute, and must never shrink the nodes it looks past.
// Callers compose the gather escape hatch (parked squares show the whole fleet) on top.
export const hideFrac = (c: DimContext, raw: number): number => raw * viewMix(c, "hide");

// Set the dim TARGETS for a selection (the dim itself eases each frame; the per-view STRENGTH is
// applied in the node loops). The validators ARE the DAG core → lit under "all"/"dag", dimmed only
// when a metagraph is selected (both layers together — the L0/L1 split filters are gone).
// js/globe.js:665-670 (`_applyDim`) verbatim.
export const dimTargetsFor = (sel: string, metaIds: string[]) => ({
  dag: sel === "all" || sel === "dag" ? 0 : 1,
  meta: new Map(metaIds.map((id) => [id, sel === "all" || sel === id ? 0 : 1])),
});

// The brightness an OFF-FILTER ELEMENT keeps — a view's own per-network FURNITURE, as opposed to
// its DATA: hyper's other hubs, with their tethers, hoops and rim fills. It is the element
// counterpart of `dim`, and it exists because that furniture had been carrying a hardcoded number
// of its own (hyper's `fdim` 0.62) while the nodes beside it answered to a knob.
//
// Read PER VIEW, not morph-lerped like the four node fields: furniture belongs to one view and
// fades out with it, so blending the neighbour view's value in would only describe elements that
// are no longer drawn. Two of the three views read 0, and both zeros are honest rather than
// unused: geo's globe has no per-network furniture at all — its off-filter answer is the nodes
// themselves (`hide`, the isolate) — and everything the ledger draws per network is DATA, so its
// bands, tiles and ribbons take the node's own `dim` through `snapBright` (user, 2026-08-11).
export const offNetMul = (view: View3D): number => 1 - FOCUS_TUNE[view].elem;

// Per-view hover/selection DIM-BACK: how far the OTHER nodes drop when one node is the focus
// (user): softer in geo (the rest stay brighter), a notch stronger in ledger, hyper unchanged.
export const focusDim = (c: DimContext): number => viewMix(c, "back");

// Per-view hover/selection BOOST: the emissive added to the focused node's shells. Full pop in
// hyper (the nodes rest dimmer there against the flat backdrop); HALVED in geo and ledger (user,
// 2026-07-17: the chips' base glow is brighter there and the flat 1.4 blew out).
export const focusBoost = (c: DimContext): number => viewMix(c, "boost");

// Focus is TIERED, not a flag (user, 2026-08-01: "selecting a provider highlights its nodes,
// but selecting a node afterwards has no visual effect" — the node was already lit at exactly
// the group's strength, so the finer selection said nothing, while the same click over a
// drilled country reads immediately). A GROUP focus (a hovered/committed provider cohort, a
// hovered composition or cluster group) takes a FRACTION of the boost; the PRIMARY subject —
// the one hovered or selected node — always takes all of it, so it stands out from its own
// group. `focusWeightOf` is the one place that ranking lives; the node loops call it per node.
export const GROUP_FOCUS = 0.45; // share of focusBoost a group member gets (FOCUS_SHARED's default)
export const focusWeightOf = (primary: boolean, group: boolean): number =>
  primary ? 1 : group ? FOCUS_SHARED.groupShare : 0;

// ---- the EMPHASIS tunable (contract: src/engine/tune.ts) -------------------------------------
// The dim/focus numbers, hoisted out of the formulas above into ONE ROW PER VIEW so the `?tune`
// panel binds them inside that view's own folder — these read as view-specific even though the
// code that applies them is central (user, 2026-08-11). Same shape as STAGE_LIGHTS: a Record
// keyed by view plus one schema reused for every row. Three properties keep it non-intrusive:
//   · `FOCUS_TUNE_DEFAULTS` is the SHIPPED LOOK and is what the tests pin — turning a knob can
//     never make a test pass or fail.
//   · Every value is seeded from the literal (or the existing const) it replaced, so the resolved
//     numbers are unchanged: `lerp(0.32, 1.0, morph)` IS `0.32 + 0.68 * morph`, and naming the
//     ENDPOINTS is what makes the geo value readable at all.
//   · `dim` is ONE row field for every node (see the ONE NODE MODEL header). It answers "what
//     control affects the other networks?" with one number per view, where the old pair of fields
//     answered it twice and disagreed in hyper for a reason that was an implementation accident.
export interface FocusRow {
  /** Network/country dim strength for EVERY node — DAG core and metagraph alike (`nodeDimScale`). */
  dim: number;
  /** How far an off-filter node SHRINKS AWAY — geo's isolate. Independent of `dim`; see `hideFrac`. */
  hide: number;
  /** How far the view's own per-network ELEMENTS drop when off-filter — `offNetMul`. */
  elem: number;
  /** How far the OTHER nodes drop when one node is the focus — `focusDim`. */
  back: number;
  /** Emissive added to the focused node — `focusBoost`. */
  boost: number;
}

/** Genuinely cross-view: it ranks focus TIERS, which every view shares. */
export interface FocusShared {
  /** Share of the boost a GROUP member gets, vs. the primary subject's full 1. */
  groupShare: number;
}

export const FOCUS_TUNE_DEFAULTS: Readonly<Record<View3D, Readonly<FocusRow>>> = {
  hyper: { dim: 0.32, hide: 0, elem: 0.38, back: 0.45, boost: 1.4 },
  geo: { dim: 1.0, hide: 1, elem: 0, back: 0.65, boost: 0.7 },
  ledger: { dim: 0.5, hide: 0, elem: 0, back: 0.55, boost: 0.7 },
};

export const FOCUS_SHARED_DEFAULTS: Readonly<FocusShared> = { groupShare: GROUP_FOCUS };

export const FOCUS_TUNE: Record<View3D, FocusRow> = {
  hyper: { ...FOCUS_TUNE_DEFAULTS.hyper },
  geo: { ...FOCUS_TUNE_DEFAULTS.geo },
  ledger: { ...FOCUS_TUNE_DEFAULTS.ledger },
};

export const FOCUS_SHARED: FocusShared = { ...FOCUS_SHARED_DEFAULTS };

// The one resolver every formula above goes through: the ledger takes its row flat (morph is
// frozen there), hyper↔geo lerp by the morph. One shape for all four fields, so a new emphasis
// number is a field on the row and nothing else.
const viewMix = (c: DimContext, k: keyof FocusRow): number =>
  c.ledger ? FOCUS_TUNE.ledger[k] : lerp(FOCUS_TUNE.hyper[k], FOCUS_TUNE.geo[k], c.morph);

export const FOCUS_ROW_SCHEMA: TuneSchema<FocusRow> = {
  dim: { min: 0, max: 1, label: "dim · off-filter" },
  hide: { min: 0, max: 1, label: "hide · off-filter" },
  elem: { min: 0, max: 1, label: "dim · elements" },
  back: { min: 0, max: 1, label: "dim-back on focus" },
  boost: { min: 0, max: 3, step: 0.05, label: "focus boost" },
};

export const FOCUS_SHARED_SCHEMA: TuneSchema<FocusShared> = {
  groupShare: { min: 0, max: 1, label: "group share" },
};

// Per-node dim: the record's own eased dim (the DAG core eases ONE value for the whole core — the
// old per-layer {l0,l1} split always carried identical values and was collapsed; a metagraph eases
// its own) times the morph-ramped strength, then raised by countryMix outside the drilled country.
// `geoCc` is the node's geo country code (null when unlocated). ONE function for both pools — the
// two used to differ only in which strength they read.
export function nodeDim(c: DimContext, raw: number, geoCc: string | null): number {
  let d = raw * nodeDimScale(c);
  // outside the drilled-into country? dim it on top of the network dim (geo only).
  if (c.countryFilter && (!geoCc || geoCc !== c.countryFilter)) d = Math.max(d, c.countryMix);
  return d;
}

// The node emissive BASE, hyper → globe: lifted in hyper (nodes read too dim on the flat backdrop)
// and eased down on the globe (they read too hot against the density light pools, especially the
// dense DAG stacks) — user. One pair for every node; the metagraph pool's old 0.33 was this same
// 0.47 with hyper's dim pre-applied (see the file header).
const BASE_HYPER = 0.47;
const BASE_GLOBE = 0.37;

// A node's glow before the floor and the focus terms — the dim's own suppression of the base.
// Exported because the render path needs it to measure hubMatchBoost's gap up to the hub level,
// and re-deriving it at the call site would be exactly the inline mirror this file exists to stop.
export const nodeGlow = (c: DimContext, d: number): number =>
  lerp(BASE_HYPER, BASE_GLOBE, c.morph) * (1 - d * 0.92);

// Node emissive glow. `flash` is the node's raw (undecayed) arc-arrival flash. `focus` = this
// node's focus WEIGHT from focusWeightOf (1 = it is the hovered/selected subject, GROUP_FOCUS = it
// is only a member of a focused group, 0 = not in focus). `dimOthersOnFocus` = the caller has
// already ANDed "some focus target exists" into the filter-based flag — with no focus target at
// all neither the boost nor the dim-back branch should fire, and this pure function has no side
// channel to detect "no focus", so the caller must fold that into the flag it passes. `hubBoost`
// is hubMatchBoost(...) below — added INSIDE the floor, exactly as the render path composes it.
// STEADY: the old decorative twinkle shimmer was removed (user) — only data-driven pulses animate.
export function nodeEmissive(
  c: DimContext,
  d: number,
  flash: number,
  focus: number,
  dimOthersOnFocus: boolean,
  hubBoost = 0,
): number {
  const fl = flash * c.morph; // arcs are a geo-only visual — their flash must not bleed into hyper
  let v = Math.max(0.02, nodeGlow(c, d) + fl + hubBoost);
  // Hover/selection pairing: the focused machine's every layer-shell glows together,
  // and the rest dim back so it stands out (only when not already isolating a metagraph).
  if (focus > 0) v += focusBoost(c) * focus;
  else if (dimOthersOnFocus) v *= focusDim(c);
  return v;
}

// A SNAPSHOT IS DATA, NOT FURNITURE (user, 2026-08-11): "the snapshots in the Snapshots view are
// not furniture — they represent real data created by the network, so they must behave just like a
// node: same `dim · off-filter`, same `dim-back on focus`, same `focus boost`." The chamber's two
// snapshot instruments (the byte bar's bands, the lane tiles) and the ribbons that join them ran
// their own four-way cascade of bespoke fractions instead — `hot`, `hot × SNAP_PREVIEW`,
// `hot × SNAP_ONNET`, `rest` — and took their off-filter drop from `elem`, the ELEMENTS knob, which
// exists for a view's own FURNITURE. So the ledger's data answered to the furniture's knob while
// the node chips beside it answered to the node's, and no focus reached it at all: a hover had an
// effect, but nothing was a focus, so nothing ever dimmed back.
//
// This is `nodeEmissive`'s shape, term for term: the instrument's resting level takes the
// off-filter dim, the focused snapshot ADDS the boost UNDIMMED (so an off-filter row you hover
// still comes forward), and everything else drops back while a focus exists. `base` stays per
// instrument — a band's opacity and a tile's colour multiplier are different quantities — and is
// the only number the two still keep of their own.
//
// COLOUR IS INDEPENDENT and stays with the callers (user's caveat, same day): identity hue vs the
// neutral trail is the chamber's own DEPTH reading, and it must never ride these knobs.
export function snapBright(
  base: number,
  offFilter: boolean,
  focus = 0,
  dimOthersOnFocus = false,
): number {
  const row = FOCUS_TUNE.ledger;
  let v = base * (offFilter ? 1 - row.dim : 1);
  if (focus > 0) v += row.boost * focus;
  else if (dimOthersOnFocus) v *= row.back;
  return v;
}

// The COMMITTED metagraph's hub-match boost: in the Hypergraph, the picked network's nodes rise
// to the hub's resting glow level (0.72) instead of sitting at the dimmer node base, so they
// bloom like their hub (user). Derived from the node's own pre-floor `glow` (the boost is the
// GAP up to 0.72, never negative) and fading out with the hubs by morph 0.3 — there's no hub on
// the globe. `committed` = this node's metagraph IS the committed filter.
// The DAG core deliberately does NOT take this: it has no orbiting hub to match, it IS the core
// sphere at the centre, which carries its own reveal/dim in HyperView. That is furniture, not the
// node model — the one asymmetry left, and it is about what a node orbits, not about what it is.
export function hubMatchBoost(c: DimContext, glow: number, committed: boolean): number {
  if (!committed) return 0;
  const hubFade = Math.min(1, Math.max(0, 1 - c.morph / 0.3));
  return Math.max(0, 0.72 - glow) * hubFade;
}
