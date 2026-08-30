// Reference + regression spec for the per-frame node dim/emissive resolution — and the SINGLE
// SOURCE for that math. The render path CALLS these functions directly: NodeFabric's two node
// loops (scene/objects/NodeFabric.ts) call nodeDim + nodeEmissive + hideFrac per
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
// The gather escape hatch is `gatherRaw` below, applied to the ramp BEFORE this reads it.
export const hideFrac = (c: DimContext, raw: number): number => raw * viewMix(c, "hide");

// The view-transition's staging block shows the WHOLE fleet, so the gather releases a node from the
// filter as it flies: the ramp itself relaxes to 0 at the parked position, and BOTH readings follow
// it — the chip comes back to full size AND to full brightness together.
//
// ⚠️ It lifts the RAMP, not one reading of it (user, 2026-08-18 — "node inverse focus geo→snapshot,
// happens on geo outgoing animation"). The hatch used to live in the callers, composed onto `hide`
// alone: `show += (1 - show) * gw`. So leaving geo under a filter restored an off-filter chip's SIZE
// while its dim stayed at 1.0 — glow 0.03, a black chip at full size for the whole out phase — and
// then the invisible mid-transition boundary swapped geo's row for the ledger's (dim 1.0 → 0.5) and
// 161 chips lit at once. That boundary is invisible for a LAYOUT change, which is all it was ever
// asked to hide; a change in what is VISIBLE reads as a pop wherever the nodes are standing.
// Driving the ramp to 0 is what makes the two rows agree there, so the fade is continuous across it.
//
// Linear in `raw`, so it reproduces the old size behaviour EXACTLY: `1 - hideFrac(c, raw*(1-gw))`
// is `1 - hideFrac(c, raw)*(1-gw)`, which is the composed form term for term.
export const gatherRaw = (raw: number, gatherW: number): number => raw * (1 - gatherW);

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
// The DAG core's OWN furniture is furniture too (user, 2026-08-11: "dim elements in hyper view does
// not affect the rings of the core in the middle") — ONE NODE MODEL, the core is a metagraph-shaped
// hub, so its hoops, rim fills and glow read this knob like every other hub's, lerped by the core's
// eased `_coreDim` instead of a hub's binary off-focus flag.
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

// Per-view focus GROW: how far the focused node swells, as a fraction of its own size. The
// SECOND emphasis channel, and the one that survives a crowd — where the shells are dense enough
// that neighbouring bloom halos merge, a brighter node is filled in from both sides while a
// bigger one still owns its own silhouette. Read by BOTH node loops (ONE NODE MODEL), scaled by
// the same `focusWeightOf` tier the boost uses, so a group member swells by its share.
export const focusGrow = (c: DimContext): number => viewMix(c, "grow");

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

// A committed ANCESTRY rung borrows its members' glow only while it is the FINEST rung in play
// (user, 2026-08-11). The group rungs — geo's provider cohort, hyper's composition group — are the
// only rungs with no 3D counterpart: you can click a hub, a border or a chip, but there is no
// "provider" or "data ring" object, so lighting their members is the only way they can appear in
// the scene at all. Honest while the group IS the subject; a lie once the finer subject is a node,
// because that is where the click landed. The parents keep their rail card and their explorer
// expansion instead, and each deselect visibly widens the lit set again.
//
// A HOVERED node yields it too (user, 2026-08-12: "when I hover role I see the relevant items
// focus-boosted, but when I expand the row and start hovering the nodes it's additive"). Expanding
// a group row COMMITS it, so its members stay lit; the per-node boost is tiered, never summed
// (focusWeightOf returns exactly one of 1 / groupShare / 0), but the lit SET was cumulative — the
// whole group at group tier PLUS the hovered node at full. Hovers preview what a click would
// commit (rule 9), and clicking that node collapses the borrowed glow, so the hover must show that
// collapse: group back to resting, the node alone. Both group rungs read this one function, so geo
// and hyper cannot answer the gesture differently.
// The ledger's SIGNER set reads the same gate (user, 2026-08-18). It is not ancestry — it is a
// relation from a different subject, the selected metagraph snapshot — and it was exempt on that
// argument until a 3-machine metagraph that seals with all three left a committed node reading as
// one bright chip among three. The reasoning above is what actually governs: a borrowed glow is
// honest while the group IS the subject, a lie once the click lands on a node. Hence the parameter
// names say `ancestry`/`nodeSubject` but the rule is "a borrowed group glow yields to a node".
export const ancestryGlow = (
  ancestry: ReadonlySet<string> | null,
  nodeSubject: string | null,
): ReadonlySet<string> | null => (nodeSubject ? null : ancestry);

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
  /** How far the focused node GROWS, as a fraction of its own size — `focusGrow`. */
  grow: number;
}

/** Genuinely cross-view: it ranks focus TIERS, which every view shares. */
export interface FocusShared {
  /** Share of the boost a GROUP member gets, vs. the primary subject's full 1. */
  groupShare: number;
}

export const FOCUS_TUNE_DEFAULTS: Readonly<Record<View3D, Readonly<FocusRow>>> = {
  // hyper's `back`/`boost` re-tuned live (user, 2026-08-12): the shells are dense and evenly
  // lit, so a focused node needed both a louder boost and a deeper step-back from its
  // neighbours before it read as the subject rather than as one bright node among many.
  // boost 1.85 → 1.1 (user, 2026-08-16 — "all except the selected node get highlighted"): with
  // the network committed the boost STACKED on hubMatchBoost to ~2.57 emissive, past the scene
  // palette's hue-keeping range — the subject blew out to a small white point while its backed
  // siblings kept fat saturated bodies, so the emphasis read INVERTED. The stack is gone too
  // (NodeFabric: a focused node's boost replaces the hub-match, one emphasis at a time), and 1.1
  // lands the subject ~1.4, above the hub level and inside the hue range.
  // grow: EVERY view, subtly (user, 2026-08-28: "like in hyper view... can we do the same all
  // views? It increases a bit too much now in hyper, keep it subtle but visible"). This
  // REVERSES the 2026-08-18 hyper-alone ruling by the same authority that made it. What
  // stands from the old reasoning: a hovered/committed node's grow is a TRANSIENT focus
  // signal, not a resting size — geo's honeycomb still sums to the true node count at rest
  // and the ledger's trays are still uniform at rest, because `grow` only reaches a node
  // through its eased focus weight. What changed: the earlier reading treated ANY grow in
  // geo/ledger as a data lie; the user judges a transient hover swell as focus language,
  // wanted app-wide. Values: hyper pulled 0.45 → 0.28 (was "a bit too much"); geo/ledger
  // smaller still — their chips sit in dense stacks/trays where a large swell collides
  // with neighbours.
  hyper: { dim: 0.32, hide: 0, elem: 0.38, back: 0.41, boost: 1.1, grow: 0.28 },
  geo: { dim: 1.0, hide: 1, elem: 0, back: 0.65, boost: 0.7, grow: 0.24 }, // 0.16 → 0.24 (user, 2026-08-30: "same as hyper" — the old value was below noticing in a stack); hyper stays loudest
  ledger: { dim: 0.67, hide: 0, elem: 0, back: 0.55, boost: 0.7, grow: 0.24 }, // dim 0.5 → 0.67 (user export, 2026-08-30): a deeper coloured dim on the other lanes, paired with the DAG core never dimming here at all (Globe._applyDim's ledger rule)
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
  grow: { min: 0, max: 1.5, step: 0.05, label: "focus grow" },
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
// Exported for its own spec (the resting base both pools share); nodeEmissive composes on it.
export const nodeGlow = (c: DimContext, d: number): number =>
  lerp(BASE_HYPER, BASE_GLOBE, c.morph) * (1 - d * 0.92);

// Node emissive glow. `flash` is the node's raw (undecayed) arc-arrival flash. `focus` = this
// node's focus WEIGHT from focusWeightOf (1 = it is the hovered/selected subject, GROUP_FOCUS = it
// is only a member of a focused group, 0 = not in focus). `anyFocus` = SOME focus target exists,
// ANDed with the caller's filter-based flag: with nothing focused at all neither the boost nor the
// dim-back branch may fire, and a pure function has no side channel to detect that, so the caller
// must fold it in. It is named for the PRECONDITION rather than the effect because each call site
// derives it from its own state (a node id, a hovered/selected row, a hovered tile) and every bug
// this parameter has had was a call site answering "is anything focused?" wrongly.
// STEADY: the old decorative twinkle shimmer was removed (user) — only data-driven pulses animate.
export function nodeEmissive(
  c: DimContext,
  d: number,
  flash: number,
  focus: number,
  anyFocus: boolean,
): number {
  const fl = flash * c.morph; // arcs are a geo-only visual — their flash must not bleed into hyper
  let v = Math.max(0.02, nodeGlow(c, d) + fl);
  // Hover/selection pairing: the focused machine's every layer-shell glows together,
  // and the rest dim back so it stands out (only when not already isolating a metagraph).
  if (focus > 0) v += focusBoost(c) * focus;
  else if (anyFocus) v *= focusDim(c);
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
// The focus weight a snapshot takes from a ROW-LEVEL focus. A row is a TICK, and a tick holds every
// network's snapshot side by side — so under a committed filter the row's focus is NOT the whole
// row's (user, 2026-08-11: "when we have focus-boost it should only boost the active metagraph in
// the global snapshot", and "dim · off-filter should also affect the segment in the global snapshot
// that is not part of the filtered metagraph"). The boost is deliberately UNDIMMED, which is exactly
// what let a row-wide focus swamp the off-filter dim: on the shown row every band came up together
// by the same +boost, so the committed network stopped leading and its dim did nothing. An
// off-filter snapshot simply is not what the row's focus is ABOUT, so it takes none of it.
//
// A snapshot the pointer is ON is a different question — that IS the subject, off-filter or not, and
// its caller passes the primary weight directly. The node model answers the same way: hovering an
// off-filter node still brings it forward, because the boost is added outside the dim.
export const snapFocusOf = (primary: boolean, group: boolean, offFilter: boolean): number =>
  offFilter ? 0 : focusWeightOf(primary, group);

export function snapBright(
  base: number,
  offFilter: boolean,
  focus = 0,
  anyFocus = false,
): number {
  const row = FOCUS_TUNE.ledger;
  let v = base * (offFilter ? 1 - row.dim : 1);
  if (focus > 0) v += row.boost * focus;
  else if (anyFocus) v *= row.back;
  return v;
}

// A COMMITTED FILTER ADDS NO LIGHT TO MEMBER NODES (user, 2026-08-30 — structural, all views).
// `hubMatchBoost` lived here until then: in hyper it lifted the committed network's nodes to the
// hub's resting glow (0.72), which made "select a metagraph" read as "highlight all its nodes".
// The user's structural correction: the commit is answered by each view's OWN channel — hyper by
// the hub (furniture: the flight, the paused orbit, every other network's `elem` drop and `dim`),
// geo by the isolate (`hide` — there is no per-network furniture to answer with), the ledger by
// the coloured dim. Member nodes keep their at-rest colour everywhere; light added to a node is
// reserved for the FOCUS vocabulary (a hovered/committed node, a group while it is the finest
// rung). The DAG had been pulled INTO the lift on one-node-model grounds (2026-08-18); the model
// survives the retirement the other way round — no pool takes it.

// EMPHASIS EASES, IT DOES NOT SNAP (user, 2026-08-11: "a subtle transition ... to make it less
// jumpy ... as default as possible in every view, so not a spot solution"). A hover is a PREVIEW,
// and a preview that arrives in one frame reads as a jump — the boost pops on, and every other
// element drops by `back` at the same instant, which is the biggest mass change the eye sees.
//
// The ease is applied where the resolved value is WRITTEN, never inside the resolvers above. That
// is what keeps it from being a second emphasis model: `nodeEmissive`/`snapBright` still answer the
// exact steady-state tier they always did, so every test that pins those tiers stays meaningful and
// a knob still moves exactly one effect. What eases is the instrument's approach to the answer.
//
// ONE rate for every view and every instrument — the node fabric's two loops, the byte bar's bands
// and the lane tiles. (The ribbons are exempt: they bake their vertex colours at EVENT time on a
// filter commit and take no focus at all, so there is no per-frame value to approach.)
// τ ≈ 125 ms: long enough that nothing steps, short enough that a node's ~200 ms arc-flash tail
// still reads as a flash rather than a bloom.
export const EMPHASIS_EASE = 8;

/** The per-frame lerp factor for `EMPHASIS_EASE`. HOIST IT ONCE PER FRAME, never per node — the
 *  tune hoist rule (src/engine/tune.ts): the inner body must read a local, not call per element. */
export const emphasisK = (dt: number): number => Math.min(1, dt * EMPHASIS_EASE);
