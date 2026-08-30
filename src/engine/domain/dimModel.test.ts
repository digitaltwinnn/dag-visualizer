import { describe, it, expect } from "vitest";
import {
  nodeDimScale,
  hideFrac,
  gatherRaw,
  offNetMul,
  EMPHASIS_EASE,
  emphasisK,
  focusDim,
  focusBoost,
  focusGrow,
  focusWeightOf,
  ancestryGlow,
  GROUP_FOCUS,
  FOCUS_TUNE,
  FOCUS_TUNE_DEFAULTS,
  FOCUS_ROW_SCHEMA,
  FOCUS_SHARED,
  FOCUS_SHARED_DEFAULTS,
  FOCUS_SHARED_SCHEMA,
  dimTargetsFor,
  nodeDim,
  nodeGlow,
  nodeEmissive,
  snapBright,
  snapFocusOf,
  type DimContext,
} from "./dimModel";

const ctx = (overrides: Partial<DimContext> = {}): DimContext => ({
  morph: 0,
  hoverFilterActive: false,
  ledger: false,
  countryFilter: null,
  countryMix: 0,
  hoverNodeId: null,
  hoverCohort: null,
  selectedNodeId: null,
  filter: "all",
  ...overrides,
});

// ONE dim strength for EVERY node (user, 2026-08-11) — the DAG core's validators and a
// metagraph's nodes read the same number. The old `metaDimScale` sibling, pinned to 0 in hyper,
// is gone; see the module header for why that 0 was an accident of a baked-in resting look rather
// than a design decision.
describe("nodeDimScale", () => {
  // js/globe.js:830-833 verbatim
  it("is the hyper floor 0.32 at morph=0", () => {
    expect(nodeDimScale(ctx({ morph: 0 }))).toBeCloseTo(0.32, 10);
  });

  it("ramps linearly to the geo ceiling 1.0 at morph=1", () => {
    expect(nodeDimScale(ctx({ morph: 1 }))).toBeCloseTo(1.0, 10);
  });

  it("is 0.32 + 0.68*morph at a midpoint", () => {
    expect(nodeDimScale(ctx({ morph: 0.5 }))).toBeCloseTo(0.32 + 0.68 * 0.5, 10);
  });

  it("hover-preview dims at the same strength as a committed filter (the forced 0.85 is gone)", () => {
    expect(nodeDimScale(ctx({ hoverFilterActive: true, morph: 0 }))).toBeCloseTo(0.32, 9);
    expect(nodeDimScale(ctx({ hoverFilterActive: true, morph: 1 }))).toBeCloseTo(1, 9);
  });

  // Morph is frozen in the ledger, so the ramp can't apply — the row's own flat value does.
  it("is the ledger row's flat 0.67 in the Snapshots view, whatever the morph", () => {
    expect(nodeDimScale(ctx({ morph: 0, ledger: true }))).toBeCloseTo(0.67, 10);
    expect(nodeDimScale(ctx({ morph: 1, ledger: true }))).toBeCloseTo(0.67, 10);
  });
});

describe("hideFrac (the shrink, an independent reading of the same ramp as the dim)", () => {
  // HIDE IS NOT DIM (user, 2026-08-11). A dim mutes two ways — colour and emissive — and geo does a
  // third thing that is not an emphasis at all: the ISOLATE. It gets its own row field, which is
  // what lets hyper's dim mute a node in place instead of shrinking it away.
  it("is the FULL ramp on the globe — the off-filter isolate is bit-identical", () => {
    expect(hideFrac(ctx({ morph: 1 }), 1)).toBeCloseTo(1, 10);
    expect(hideFrac(ctx({ morph: 1 }), 0.4)).toBeCloseTo(0.4, 10);
  });

  it("is ZERO in hyper at any dim — a turned-up dim mutes in place, at full size", () => {
    expect(hideFrac(ctx({ morph: 0 }), 1)).toBeCloseTo(0, 10);
    expect(hideFrac(ctx({ morph: 0 }), 0.5)).toBeCloseTo(0, 10);
  });

  it("is ZERO in the ledger, whose chips are uniform-sized by their own rule", () => {
    expect(hideFrac(ctx({ morph: 0, ledger: true }), 1)).toBeCloseTo(0, 10);
    expect(hideFrac(ctx({ morph: 1, ledger: true }), 1)).toBeCloseTo(0, 10);
  });

  it("ramps with the morph, so the isolate arrives as the nodes land", () => {
    expect(hideFrac(ctx({ morph: 0.5 }), 1)).toBeCloseTo(0.5, 10);
  });

  // The knob-independence rule (user, 2026-08-11: "dim.off-filter also resizes when hide is 0.5").
  // hideFrac reads the RAW ramp, so it is untouched by the `dim` field — one knob, one effect.
  it("does NOT move when the dim strength moves — the two knobs are independent", () => {
    const c = ctx({ morph: 1 });
    const before = hideFrac(c, 1);
    const restore = FOCUS_TUNE.geo.dim;
    try {
      FOCUS_TUNE.geo.dim = 0.1;
      expect(hideFrac(c, 1)).toBeCloseTo(before, 10);
      FOCUS_TUNE.geo.dim = 0;
      expect(hideFrac(c, 1)).toBeCloseTo(before, 10);
    } finally {
      FOCUS_TUNE.geo.dim = restore;
    }
  });

  // The country drill is a LENS, not a filter: nodeDim's countryMix raise is a mute and must never
  // reach the shrink. Reading the raw ramp is what guarantees it.
  it("ignores the country-drill mute — a lens never shrinks what it looks past", () => {
    const drilled = ctx({ morph: 1, countryFilter: "DE", countryMix: 0.8 });
    expect(nodeDim(drilled, 0, "US")).toBeCloseTo(0.8, 10); // the mute lands…
    expect(hideFrac(drilled, 0)).toBeCloseTo(0, 10); // …the shrink does not
  });
});

describe("gatherRaw (the view-transition's escape hatch — it lifts the RAMP, not one reading)", () => {
  it("releases the ramp completely at the parked position, and is inert with no transition", () => {
    expect(gatherRaw(1, 0)).toBeCloseTo(1, 10);
    expect(gatherRaw(1, 1)).toBeCloseTo(0, 10);
    expect(gatherRaw(0.4, 0)).toBeCloseTo(0.4, 10);
    expect(gatherRaw(0.4, 1)).toBeCloseTo(0, 10);
  });

  it("is monotone in flight — a chip only ever comes further back as it parks", () => {
    let prev = gatherRaw(1, 0);
    for (let gw = 0.1; gw <= 1.0001; gw += 0.1) {
      const now = gatherRaw(1, gw);
      expect(now).toBeLessThan(prev);
      prev = now;
    }
  });

  // The whole point of moving the hatch onto the ramp: the DIM follows the size back up, so an
  // off-filter chip is never restored to full size while still resolving to a black glow.
  it("brings the dim up with the size — the two readings can no longer disagree", () => {
    const geo = ctx({ morph: 1 }); // dim 1.0, hide 1 — the isolate
    // At rest an off-filter chip is gone AND black; parked it is present AND lit, together.
    expect(hideFrac(geo, gatherRaw(1, 0))).toBeCloseTo(1, 10);
    expect(nodeDim(geo, gatherRaw(1, 0), null)).toBeCloseTo(1, 10);
    expect(hideFrac(geo, gatherRaw(1, 1))).toBeCloseTo(0, 10);
    expect(nodeDim(geo, gatherRaw(1, 1), null)).toBeCloseTo(0, 10);
  });

  // What makes the invisible mid-transition boundary actually invisible for BRIGHTNESS as well as
  // layout: at the parked position the ramp is 0, so every view's row resolves the same dim and the
  // geo→ledger row swap (dim 1.0 → 0.5) can't step the fleet's glow.
  it("makes every view's row agree at the boundary — no pop when the layout snaps", () => {
    const parked = gatherRaw(1, 1);
    for (const c of [ctx({ morph: 1 }), ctx({ morph: 0 }), ctx({ morph: 1, ledger: true })]) {
      expect(nodeDim(c, parked, null)).toBeCloseTo(0, 10);
      expect(hideFrac(c, parked)).toBeCloseTo(0, 10);
    }
  });

  // The callers used to compose the hatch onto `hide` as `show += (1 - show) * gw`. Both forms are
  // linear in the ramp, so routing it through gatherRaw is a pure generalization — the size
  // behaviour is bit-identical and only the dim is new.
  it("reproduces the composed size behaviour term for term", () => {
    for (const c of [ctx({ morph: 1 }), ctx({ morph: 0.5 }), ctx({ morph: 0 })]) {
      for (const raw of [0, 0.3, 0.5, 1]) {
        for (const gw of [0, 0.25, 0.5, 0.75, 1]) {
          const composed = (() => {
            const show = 1 - hideFrac(c, raw);
            return show + (1 - show) * gw;
          })();
          expect(1 - hideFrac(c, gatherRaw(raw, gw))).toBeCloseTo(composed, 10);
        }
      }
    }
  });
});

describe("offNetMul (the off-filter dim for a view's own FURNITURE, not its data)", () => {
  // The hardcoded number it replaced (2026-08-11): hyper's hub `fdim` 0.62. The ledger's old
  // RIBBON_DIM rode here too until the chamber's bands, tiles and ribbons were recognised as DATA
  // and moved onto the node's own `dim` (snapBright, below) — so hyper is now the only view that
  // actually draws per-network furniture.
  it("keeps the shipped look hyper had before it was a knob", () => {
    expect(offNetMul("hyper")).toBeCloseTo(0.62, 10);
  });

  // Both zeros are honest readings, not unset fields: the globe's off-filter answer is the nodes
  // vanishing (hideFrac), and everything the chamber draws per network goes through snapBright.
  it("is a no-op in geo and the ledger, which draw no per-network furniture", () => {
    expect(offNetMul("geo")).toBeCloseTo(1, 10);
    expect(offNetMul("ledger")).toBeCloseTo(1, 10);
  });

  // Same STRENGTH polarity as `dim` and `hide` — 0 is off — so a row reads consistently in the
  // panel, and the resolver is what flips it into a surviving brightness.
  it("reads the strength row per view, with 0 meaning no dim at all", () => {
    const prev = FOCUS_TUNE.ledger.elem;
    try {
      FOCUS_TUNE.ledger.elem = 0;
      expect(offNetMul("ledger")).toBeCloseTo(1, 10);
      FOCUS_TUNE.ledger.elem = 1;
      expect(offNetMul("ledger")).toBeCloseTo(0, 10);
    } finally {
      FOCUS_TUNE.ledger.elem = prev;
    }
  });

  // It is deliberately NOT morph-lerped like the four node fields: furniture belongs to one view
  // and fades out with it, so a blend would describe elements that are no longer drawn.
  it("is per-view, so hyper's value never leaks into the ledger's", () => {
    expect(offNetMul("hyper")).not.toBeCloseTo(offNetMul("ledger"), 5);
  });
});

// A SNAPSHOT IS DATA, so it reads the NODE's knobs (2026-08-11) — the same `dim`, `back` and
// `boost` the chips in the trays answer to, which is what makes a chip and the tile it signed dim
// by exactly one number. The chamber keeps only its own resting level and its own COLOUR rule.
describe("snapBright (the chamber's snapshots on the node vocabulary)", () => {
  const { dim, back, boost } = FOCUS_TUNE_DEFAULTS.ledger;

  it("leaves a resting on-filter snapshot at its own level", () => {
    expect(snapBright(0.1, false)).toBeCloseTo(0.1, 10);
  });

  it("dims an off-filter snapshot by the ledger row's own `dim` — the chips' number", () => {
    expect(snapBright(0.1, true)).toBeCloseTo(0.1 * (1 - dim), 10);
  });

  it("adds the boost UNDIMMED, so a focused off-filter snapshot still reads", () => {
    expect(snapBright(0.1, false, 1)).toBeCloseTo(0.1 + boost, 10);
    expect(snapBright(0.1, true, 1)).toBeCloseTo(0.1 * (1 - dim) + boost, 10);
  });

  it("steps the OTHERS back only when they are not themselves the focus", () => {
    expect(snapBright(0.1, false, 0, true)).toBeCloseTo(0.1 * back, 10);
    expect(snapBright(0.1, false, 1, true)).toBeCloseTo(0.1 + boost, 10);
  });

  // The ranking the eye reads down the trail. Numbers may be tuned; the ORDER is the design.
  it("ranks primary > group hover > resting > stepped back", () => {
    const primary = snapBright(0.1, false, focusWeightOf(true, false), true);
    const group = snapBright(0.1, false, focusWeightOf(false, true), true);
    const resting = snapBright(0.1, false);
    const stepped = snapBright(0.1, false, 0, true);
    expect(primary).toBeGreaterThan(group);
    expect(group).toBeGreaterThan(resting);
    expect(resting).toBeGreaterThan(stepped);
    expect(stepped).toBeGreaterThan(0);
  });
});

// A ROW-level focus is not a whole-row focus (2026-08-11). A tick holds every network's snapshot
// side by side, so under a committed filter the row's boost belongs to the committed network alone
// — the boost is added UNDIMMED (above), which is exactly what let it lift the very bands the
// off-filter dim exists to push behind.
describe("snapFocusOf (a row's focus reaches the committed network only)", () => {
  it("passes the row's own tier through for an on-filter snapshot", () => {
    expect(snapFocusOf(true, false, false)).toBe(focusWeightOf(true, false));
    expect(snapFocusOf(false, true, false)).toBe(focusWeightOf(false, true));
    expect(snapFocusOf(false, false, false)).toBe(0);
  });

  it("withholds it from an off-filter snapshot, whatever the row is doing", () => {
    expect(snapFocusOf(true, false, true)).toBe(0);
    expect(snapFocusOf(false, true, true)).toBe(0);
  });

  // So the committed network leads by the full boost while the rest keep their dim: the gap the
  // filter is FOR, instead of every band on the row coming up together.
  it("keeps the off-filter snapshot below its own resting level on a focused row", () => {
    const on = snapBright(0.1, false, snapFocusOf(true, false, false), true);
    const off = snapBright(0.1, true, snapFocusOf(true, false, true), true);
    expect(off).toBeLessThan(snapBright(0.1, false));
    expect(off).toBeGreaterThan(0);
    expect(on).toBeGreaterThan(off);
  });
});

describe("focusDim / focusBoost (per-view hover/selection strength)", () => {
  // WIRING, not numbers: each resolver reads its own view's row, and hyper↔geo lerp by morph.
  // Asserting against FOCUS_TUNE_DEFAULTS rather than re-stating the literals is what keeps a
  // ?tune bake a one-file edit — the numbers are a look and are meant to move; the row a
  // resolver reads is the design. (Still the DEFAULTS, never the live FOCUS_TUNE struct, so
  // turning a knob can't make this pass or fail.) The ORDER is pinned separately below.
  it("focusDim reads each view's own `back`", () => {
    expect(focusDim(ctx({ morph: 0 }))).toBeCloseTo(FOCUS_TUNE_DEFAULTS.hyper.back, 10);
    expect(focusDim(ctx({ morph: 1 }))).toBeCloseTo(FOCUS_TUNE_DEFAULTS.geo.back, 10);
    expect(focusDim(ctx({ morph: 0, ledger: true }))).toBeCloseTo(FOCUS_TUNE_DEFAULTS.ledger.back, 10);
  });

  it("focusBoost reads each view's own `boost`", () => {
    expect(focusBoost(ctx({ morph: 0 }))).toBeCloseTo(FOCUS_TUNE_DEFAULTS.hyper.boost, 10);
    expect(focusBoost(ctx({ morph: 1 }))).toBeCloseTo(FOCUS_TUNE_DEFAULTS.geo.boost, 10);
    expect(focusBoost(ctx({ morph: 0, ledger: true }))).toBeCloseTo(FOCUS_TUNE_DEFAULTS.ledger.boost, 10);
  });

  it("focusGrow reads each view's own `grow`", () => {
    expect(focusGrow(ctx({ morph: 0 }))).toBeCloseTo(FOCUS_TUNE_DEFAULTS.hyper.grow, 10);
    expect(focusGrow(ctx({ morph: 1 }))).toBeCloseTo(FOCUS_TUNE_DEFAULTS.geo.grow, 10);
    expect(focusGrow(ctx({ morph: 0, ledger: true }))).toBeCloseTo(FOCUS_TUNE_DEFAULTS.ledger.grow, 10);
  });

  // The second emphasis channel reaches EVERY view since 2026-08-28 (the user reversed their
  // own 2026-08-18 hyper-alone ruling: a hover swell is focus language, wanted app-wide). The
  // relations that survive the reversal ARE the design: grow only reaches a node through its
  // transient focus weight (rest sizes stay honest — geo's honeycomb still sums to the true
  // count at rest, the ledger's trays stay uniform at rest), hyper's swell stays the loudest
  // (its nodes sit alone on shells; geo/ledger chips sit in dense stacks where a large swell
  // collides with neighbours), and every view's is SUBTLE (the user pulled hyper's own back
  // from 0.45: "keep it subtle but visible").
  it("gives every view a subtle grow, hyper loudest", () => {
    expect(FOCUS_TUNE_DEFAULTS.geo.grow).toBeGreaterThan(0);
    expect(FOCUS_TUNE_DEFAULTS.ledger.grow).toBeGreaterThan(0);
    expect(FOCUS_TUNE_DEFAULTS.hyper.grow).toBeGreaterThan(FOCUS_TUNE_DEFAULTS.geo.grow);
    expect(FOCUS_TUNE_DEFAULTS.hyper.grow).toBeGreaterThan(FOCUS_TUNE_DEFAULTS.ledger.grow);
    for (const v of ["hyper", "geo", "ledger"] as const)
      expect(FOCUS_TUNE_DEFAULTS[v].grow).toBeLessThanOrEqual(0.45); // subtle: below the pre-reversal hyper value
    // the morph blend still mixes the two endpoint rows, so a transition inherits neither alone
    expect(focusGrow(ctx({ morph: 0.5 }))).toBeCloseTo(
      (FOCUS_TUNE_DEFAULTS.hyper.grow + FOCUS_TUNE_DEFAULTS.geo.grow) / 2, 10);
  });

  // The design relations the numbers must keep, whatever a ?tune session moves them to: the
  // focused node's glow pop is LOUDEST in hyper, where it sits over dim resting nodes, and
  // softer in geo/ledger, whose chips have a brighter base and blew out at hyper's value
  // (user, 2026-07-17); and hyper's dim-back is the SHALLOWEST, because its shells are dense
  // enough that muting them hard reads as the view going dark rather than as one node leading.
  it("keeps the per-view emphasis ranking", () => {
    const d = FOCUS_TUNE_DEFAULTS;
    expect(d.hyper.boost).toBeGreaterThan(d.geo.boost);
    expect(d.hyper.boost).toBeGreaterThan(d.ledger.boost);
    expect(d.hyper.back).toBeLessThan(d.geo.back);
    expect(d.hyper.back).toBeLessThan(d.ledger.back);
  });

  it("the emissive function consumes them: a geo-focused node gains 0.7, a geo dim-back is ×0.65", () => {
    const c = ctx({ morph: 1 });
    const base = nodeEmissive(c, 0, 0, 0, false);
    expect(nodeEmissive(c, 0, 0, 1, true)).toBeCloseTo(base + 0.7, 10);
    expect(nodeEmissive(c, 0, 0, 0, true)).toBeCloseTo(base * 0.65, 10);
  });
});

// Focus is TIERED so a finer selection always says something: picking a node inside an already
// lit provider cohort used to change nothing at all (user, 2026-08-01), because group membership
// and being the subject were the same boolean.
describe("focusWeightOf / GROUP_FOCUS (the focus ranking)", () => {
  it("primary wins outright, a group member takes only a share, neither = 0", () => {
    expect(focusWeightOf(true, false)).toBe(1);
    expect(focusWeightOf(true, true)).toBe(1); // the subject inside its own group is still primary
    expect(focusWeightOf(false, true)).toBe(GROUP_FOCUS);
    expect(focusWeightOf(false, false)).toBe(0);
    expect(GROUP_FOCUS).toBeGreaterThan(0);
    expect(GROUP_FOCUS).toBeLessThan(1);
  });

  it("the emissive function scales the boost by the weight, so the subject outshines its group", () => {
    const c = ctx({ morph: 1 });
    const off = nodeEmissive(c, 0, 0, 0, false);
    const group = nodeEmissive(c, 0, 0, focusWeightOf(false, true), true);
    const primary = nodeEmissive(c, 0, 0, focusWeightOf(true, true), true);
    expect(group).toBeCloseTo(off + 0.7 * GROUP_FOCUS, 10);
    expect(primary).toBeCloseTo(off + 0.7, 10);
    expect(primary).toBeGreaterThan(group);
    expect(group).toBeGreaterThan(off);
  });
});

describe("ancestryGlow (a committed group yields its glow to the finer node subject)", () => {
  const cohort = new Set(["a", "b", "c"]);

  it("passes the group through while it IS the finest rung in play", () => {
    expect(ancestryGlow(cohort, null)).toBe(cohort);
  });

  it("yields once a node is committed — the click landed on the node, not the group", () => {
    expect(ancestryGlow(cohort, "a")).toBeNull();
    // even a node OUTSIDE the group: the finest rung is what the glow answers to
    expect(ancestryGlow(cohort, "z")).toBeNull();
  });

  // user, 2026-08-12: expanding a group row commits it, so hovering a node inside the open row
  // lit the whole group AND the node. A hover previews the commit, and the commit collapses this
  // glow — so the hover must collapse it too. The call site passes selectedNodeId ?? hoverNodeId.
  it("yields to a HOVERED node the same way, so the hover previews the click", () => {
    expect(ancestryGlow(cohort, "b")).toBeNull();
  });

  it("is null-safe, so a caller can chain it with ?? without a pre-check", () => {
    expect(ancestryGlow(null, null)).toBeNull();
    expect(ancestryGlow(null, "a")).toBeNull();
  });
});

describe("dimTargetsFor", () => {
  // js/globe.js:665-670 (_applyDim) verbatim
  it("lights the dag (0) and every metagraph (0) when sel='all'", () => {
    const t = dimTargetsFor("all", ["dor", "ded"]);
    expect(t.dag).toBe(0);
    expect(t.meta.get("dor")).toBe(0);
    expect(t.meta.get("ded")).toBe(0);
  });

  it("lights the dag (0) and dims every metagraph (1) when sel='dag'", () => {
    const t = dimTargetsFor("dag", ["dor"]);
    expect(t.dag).toBe(0);
    expect(t.meta.get("dor")).toBe(1);
  });

  it("dims the dag (1) and lights only the selected metagraph (0) when sel is a metagraph id", () => {
    const t = dimTargetsFor("dor", ["dor", "ded"]);
    expect(t.dag).toBe(1);
    expect(t.meta.get("dor")).toBe(0);
    expect(t.meta.get("ded")).toBe(1);
  });
});

// ONE resolver for both node pools. The two it replaced had identical bodies and differed only in
// which strength they read — and that difference existed only in hyper (see the module header).
describe("nodeDim", () => {
  it("scales the record's own eased dim by nodeDimScale", () => {
    const c = ctx({ morph: 0 });
    expect(nodeDim(c, 0.4, null)).toBeCloseTo(0.4 * nodeDimScale(c), 10);
  });

  it("gives a DAG-core node and a metagraph node the SAME dim for the same inputs", () => {
    // The pools no longer have separate strengths, so this is true by construction — the test
    // exists so re-splitting them fails here rather than being noticed on screen months later.
    for (const morph of [0, 0.5, 1]) {
      const c = ctx({ morph });
      expect(nodeDim(c, 1, null)).toBeCloseTo(nodeDimScale(c), 10);
    }
  });

  it("applies in hyper too — an off-filter metagraph node mutes there instead of resting dim", () => {
    // The old metaNodeDim returned 0 here whatever the dim target, which is what made the `hide`
    // knob look like it only touched the DAG core.
    expect(nodeDim(ctx({ morph: 0 }), 1, null)).toBeCloseTo(0.32, 10);
  });

  it("raises the dim to countryMix when the node is outside the drilled country", () => {
    const c = ctx({ morph: 1, countryFilter: "US", countryMix: 0.9 });
    // 0.4 * nodeDimScale(1) = 0.4, which is < countryMix 0.9 -> raised to 0.9
    expect(nodeDim(c, 0.4, "DE")).toBeCloseTo(0.9, 10);
  });

  it("raises to countryMix when the node has no geo at all (geoCc null)", () => {
    const c = ctx({ morph: 1, countryFilter: "US", countryMix: 0.7 });
    expect(nodeDim(c, 0.4, null)).toBeCloseTo(0.7, 10);
  });

  it("does NOT raise the dim when the node IS inside the drilled country", () => {
    const c = ctx({ morph: 1, countryFilter: "US", countryMix: 0.9 });
    // inside the country the max(d, countryMix) branch is skipped entirely, so d stays 0.4.
    expect(nodeDim(c, 0.4, "US")).toBeCloseTo(0.4, 10);
  });

  it("never raises the dim when no country is drilled into", () => {
    const c = ctx({ morph: 1, countryFilter: null, countryMix: 0 });
    expect(nodeDim(c, 0.4, "DE")).toBeCloseTo(0.4, 10);
  });

  it("takes the ledger row's flat multiplier, ignoring the morph", () => {
    const c = ctx({ morph: 0, ledger: true });
    expect(nodeDim(c, 0.5, null)).toBeCloseTo(0.67 * 0.5, 10);
  });
});

// A COMMITTED FILTER ADDS NO LIGHT TO MEMBER NODES (user, 2026-08-30 — structural, every view):
// hubMatchBoost, which lifted the committed network's nodes to hub level 0.72 in hyper, is
// retired. The commit is answered by each view's own channel — hyper's hub + elem/dim, geo's
// hide, the ledger's coloured dim — and light added to a node is reserved for the FOCUS
// vocabulary. The rule's full statement lives beside nodeEmissive in dimModel.ts.
it("a committed filter adds no light to member nodes — nodeEmissive has no filter term", () => {
  // Same context, same dim, no focus: the emissive is the resting glow whatever the filter says.
  const c = ctx({ morph: 0 });
  expect(nodeEmissive(c, 0, 0, 0, false)).toBeCloseTo(Math.max(0.02, nodeGlow(c, 0)), 10);
});

describe("nodeGlow (the resting base both pools share)", () => {
  it("is the hyper base at morph=0 and the globe base at morph=1", () => {
    expect(nodeGlow(ctx({ morph: 0 }), 0)).toBeCloseTo(0.47, 10);
    expect(nodeGlow(ctx({ morph: 1 }), 0)).toBeCloseTo(0.37, 10);
  });

  it("suppresses by (1 - d*0.92)", () => {
    expect(nodeGlow(ctx({ morph: 1 }), 0.5)).toBeCloseTo(0.37 * (1 - 0.5 * 0.92), 10);
  });
});

// ONE emissive resolver for both pools. The two it replaced differed by a sub-1% coefficient
// (0.92/0.02 vs 0.9/0.03) and by whether the base lerped — historic per-loop tuning carried over
// from js/globe.js, not a design decision. They unify on the validator's numbers.
describe("nodeEmissive", () => {
  it("at morph=0, no flash/dim/focus: the hyper base, floored at 0.02", () => {
    expect(nodeEmissive(ctx({ morph: 0 }), 0, 0, 0, false)).toBeCloseTo(0.47, 10);
  });

  it("at morph=1 with d=0: the globe base", () => {
    expect(nodeEmissive(ctx({ morph: 1 }), 0, 0, 0, false)).toBeCloseTo(0.37, 10);
  });

  it("suppresses glow by (1 - d*0.92) and adds the morph-scaled flash", () => {
    const c = ctx({ morph: 1 });
    const d = 0.5, flash = 1;
    expect(nodeEmissive(c, d, flash, 0, false)).toBeCloseTo(0.37 * (1 - d * 0.92) + flash, 10);
  });

  it("scales the flash by the morph — no flash in hyper", () => {
    expect(nodeEmissive(ctx({ morph: 0 }), 0, 2, 0, false)).toBeCloseTo(0.47, 10);
  });

  // The 0.02 is a GUARD, not a value the shipped bases reach: d is capped at 1, so the deepest
  // suppression a node can take is 0.37 * 0.08. It exists so a retuned base can't drive an
  // emissive to zero and read as a dead node.
  it("bottoms out at the fully-suppressed glow, above its own floor", () => {
    expect(nodeEmissive(ctx({ morph: 1 }), 1, 0, 0, false)).toBeCloseTo(0.37 * 0.08, 10);
  });

  it("boosts the focused node by hyper's `boost`, ignoring anyFocus", () => {
    const c = ctx({ morph: 0 });
    const base = nodeEmissive(c, 0, 0, 0, false);
    expect(nodeEmissive(c, 0, 0, 1, true)).toBeCloseTo(base + FOCUS_TUNE_DEFAULTS.hyper.boost, 10);
  });

  it("dims a non-focused node by hyper's `back` only when anyFocus is set", () => {
    const c = ctx({ morph: 0 });
    const base = nodeEmissive(c, 0, 0, 0, false);
    expect(nodeEmissive(c, 0, 0, 0, true)).toBeCloseTo(base * FOCUS_TUNE_DEFAULTS.hyper.back, 10);
  });

  it("does nothing extra when there's no focus target at all (isFocus and anyFocus both false)", () => {
    expect(nodeEmissive(ctx({ morph: 0 }), 0, 0, 0, false)).toBeCloseTo(0.47, 10);
  });
});


// The `?tune` surface (contract: src/engine/tune.ts). The formulas above were literals until the
// dev panel needed to bind them; these tests are the regression guard for that move.
describe("FOCUS_TUNE", () => {
  it("starts live == defaults, so an untouched panel changes nothing", () => {
    expect(FOCUS_TUNE).toEqual(FOCUS_TUNE_DEFAULTS);
    expect(FOCUS_SHARED).toEqual(FOCUS_SHARED_DEFAULTS);
  });

  // The live rows must be COPIES: the panel writes into them, and a shared reference would let a
  // knob mutate the shipped look these tests pin.
  it("holds its own row objects, not the frozen defaults", () => {
    for (const view of ["hyper", "geo", "ledger"] as const) {
      expect(FOCUS_TUNE[view]).not.toBe(FOCUS_TUNE_DEFAULTS[view]);
    }
    expect(FOCUS_SHARED).not.toBe(FOCUS_SHARED_DEFAULTS);
  });

  it("keeps GROUP_FOCUS as its groupShare default", () => {
    expect(FOCUS_SHARED_DEFAULTS.groupShare).toBe(GROUP_FOCUS);
  });

  it("schemas every knob, and every knob's range contains its default", () => {
    for (const row of Object.values(FOCUS_TUNE_DEFAULTS)) {
      for (const [key, v] of Object.entries(row)) {
        const knob = FOCUS_ROW_SCHEMA[key as keyof typeof row];
        expect(knob, `no schema entry for ${key}`).toBeDefined();
        expect(v).toBeGreaterThanOrEqual(knob!.min);
        expect(v).toBeLessThanOrEqual(knob!.max);
      }
    }
    for (const [key, v] of Object.entries(FOCUS_SHARED_DEFAULTS)) {
      const knob = FOCUS_SHARED_SCHEMA[key as keyof typeof FOCUS_SHARED_DEFAULTS];
      expect(knob, `no schema entry for ${key}`).toBeDefined();
      expect(v).toBeGreaterThanOrEqual(knob!.min);
      expect(v).toBeLessThanOrEqual(knob!.max);
    }
  });

  // Every row carries the same fields, which is what lets ONE schema serve all three folders.
  it("gives every 3D view a complete row", () => {
    for (const row of Object.values(FOCUS_TUNE_DEFAULTS)) {
      expect(Object.keys(row).sort()).toEqual(Object.keys(FOCUS_ROW_SCHEMA).sort());
    }
  });

  // The defaults must reproduce the ORIGINAL literal formulas' SHAPE at every morph — the
  // refactor renamed the endpoints, it did not change how they blend: one linear lerp from the
  // hyper row to the geo row, which is what `viewMix` promises. The ENDPOINTS are read from the
  // rows rather than re-stated, because they are a look and get re-tuned (hyper's `back` and
  // `boost` both have; see the row's own note). One deliberate structural exception, and a value
  // only belongs here once it is named as one: the metagraph pool, whose `meta` ramp is GONE by
  // design (see the ONE NODE MODEL header), so both pools now read this one `dim` row and there
  // is no second formula left to reproduce.
  it("blends hyper→geo linearly at every morph", () => {
    const d = FOCUS_TUNE_DEFAULTS;
    const at = (a: number, b: number, m: number) => a + (b - a) * m;
    for (const morph of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const c = ctx({ morph });
      expect(nodeDimScale(c)).toBeCloseTo(at(d.hyper.dim, d.geo.dim, morph), 10);
      expect(focusDim(c)).toBeCloseTo(at(d.hyper.back, d.geo.back, morph), 10);
      expect(focusBoost(c)).toBeCloseTo(at(d.hyper.boost, d.geo.boost, morph), 10);
    }
  });

  // The GEO isolate is the shipped behaviour `hide` was split out of, and it must not move:
  // there, hide is 1, so the shrink is the whole dim exactly as the inline `1 - dEff` was.
  // Hyper is the deliberate change — it used to shrink the DAG core by dim×0.32 and now mutes
  // it in place (user, 2026-08-11). Mid-morph values are unobservable: `morph` is snapped at the
  // transition's invisible boundary frame, never eased through.
  it("leaves the geo isolate bit-identical while releasing hyper's shrink", () => {
    for (const d of [0.25, 0.5, 1]) {
      expect(hideFrac(ctx({ morph: 1 }), d)).toBeCloseTo(d, 10);
      expect(hideFrac(ctx({ morph: 0 }), d)).toBeCloseTo(0, 10);
    }
  });

  it("reproduces the pre-refactor ledger overrides", () => {
    const c = ctx({ ledger: true, morph: 0.5 });
    expect(nodeDimScale(c)).toBeCloseTo(0.67, 10); // 0.5 → 0.67, user export 2026-08-30
    expect(focusDim(c)).toBeCloseTo(0.55, 10);
    expect(focusBoost(c)).toBeCloseTo(0.7, 10);
    expect(nodeDim(c, 1, null)).toBeCloseTo(0.67, 10);
  });
});

// Emphasis EASES rather than snapping (user, 2026-08-11). The ease lives at the WRITE sites, so
// what this pins is only the rate's shape: a frame-rate-independent approach factor that never
// overshoots. The tiers themselves are unchanged by it — that is the point of easing the write.
describe("emphasis easing", () => {
  it("is a clamped, frame-rate-independent approach factor", () => {
    expect(emphasisK(0)).toBe(0);
    expect(emphasisK(1 / 60)).toBeCloseTo(EMPHASIS_EASE / 60, 10);
    // A long frame (a stall, a background tab resuming) lands exactly on target, never past it.
    expect(emphasisK(10)).toBe(1);
  });

  // Slow enough to read as a transition, fast enough that a node's ~200ms arc-flash tail
  // (Globe: 1 - dt*5) still reads as a flash rather than a bloom.
  it("settles faster than the arc flash it rides over", () => {
    expect(EMPHASIS_EASE).toBeGreaterThan(5);
  });
});
