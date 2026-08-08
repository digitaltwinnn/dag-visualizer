import type { LucideIcon } from "lucide-react";
import { ABOUT_ICON, EXPLORE_ICON, iconForPick } from "@/components/icons";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import type { Mode } from "@/src/store/store";
import type { PickDescriptor, MetaSnapSel } from "@/src/data/types";
// LADDERS is plain DATA (the domain focus-ladder rung tables) — importing it keeps this module
// data-only; CohortSel rides along type-only (the store mirrors the same import).
import { LADDERS, type FocusLevel, type CohortSel, type CompositionSel } from "@/src/engine/domain/focusLadder";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The RAIL MANIFEST — ONE source of truth for "which cards does each rail host, in what order".
//
// Before this, the dock icon TRAYS (RailDock, via ExploreRail/Inspector) reconstructed the hosted
// card set with their OWN mode-conditionals — a parallel guess at what the rails actually render,
// which drifted (e.g. the Details tray always drew the Context icon even at the "all" filter where
// no Context card renders). Now the rails render FROM this manifest AND the trays derive their
// icons from it, so the two can never disagree.
//
// Each descriptor is presentation-agnostic (`{ id, kind, icon, subjectKey, present }`): the icon is
// the shared VIEW_ICONS / ABOUT / kind glyph; `subjectKey` is the SAME key that drives that card's
// EdgePulse/roll (the thing that changes when the card "updates"), so the tray's update-highlight
// can key off it per descriptor; `present` mirrors exactly whether that card renders right now.
// Hue + active-flag stay with the tray builders (per-rail presentation), not here.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type RailCardKind = "about" | "tool" | "context" | "metaSnap" | "country" | "cohort" | "composition" | "node" | "snap";

// ── The rail LADDER lane (Inspector's descent spine, variant-A redesign 2026-07-19) ──────────
// Which facts-rail slots are FOCUS-LADDER rungs in this view, in DISPLAY order (coarsest→finest,
// top-down — the reverse of the domain rung tables, which walk finest→coarsest). Derived from
// `focusLadder.LADDERS` so the spine can never disagree with the camera walk / deselect
// stepping: a future rung lands on the ladder lane automatically (and
// `railLadderBoundary.test.ts` already forces it a card slot). Flat views have no ladder.
const LADDER_SLOT: Partial<Record<FocusLevel, string>> = {
  network: "context",
  country: "country",
  cohort: "cohort",
  composition: "composition",
  node: "node",
};
export function ladderSlotIds(mode: Mode): string[] {
  if (mode !== "hyper" && mode !== "geo" && mode !== "ledger") return [];
  const ids = [...LADDERS[mode]]
    .reverse()
    .flatMap((r) => (LADDER_SLOT[r.level] ? [LADDER_SLOT[r.level] as string] : []));
  if (mode === "ledger") {
    // The ledger's SNAPSHOT CHAIN rides the display lane between the network and the node —
    // METAGRAPH SNAPSHOT ABOVE the global (user reversal 2026-08-08 of the 2026-08-06 order):
    // the rail mirrors the CHAMBER's own storeys (metagraph planes on top, ribbons falling into
    // the global floor below) and the story flow under a filter (the network → its snapshot →
    // the global it anchored INTO; a tile click already derives the global pin from the
    // metagraph snapshot). Display hierarchy only — both stay card slots with no focus-ladder
    // rung (the camera/deselect walk is unchanged).
    ids.splice(ids.indexOf("node"), 0, "metaSnap", "snap");
  }
  return ids;
}

/** The selection fields the ladder derivation needs — the manifest state minus the ghost-copy
 *  inputs (which can't change a slot's presence). */
export type LadderState = Pick<
  RailManifestState,
  "mode" | "filter" | "inspect" | "snap" | "metaSnap" | "country" | "cohort" | "composition"
> & {
  /** The store's selection recency (most-recent-FIRST) — the collapse rule reads it (item 8):
   *  the most recently selected present card is the ACTIVE one; the rest rest collapsed. */
  selStack?: readonly string[];
};

// The FOCUS rung: the finest ladder slot currently POPULATED (null = nothing committed). ONE
// definition, two rails — the facts rail rests only this card expanded and gives its thread dot
// the halo, and the explorers render every COARSER committed row at ancestor strength
// (`selectedRow`), so both rails answer "where am I" the same way.
export function focusSlotId(s: LadderState): string | null {
  // `selNodesCount`/`filterLabel` only feed ghost COPY — presence is unaffected, so the ladder
  // question can be answered from the selection alone.
  const cards = detailsCards({ ...s, selNodesCount: 0, filterLabel: null });
  const lane = ladderSlotIds(s.mode);
  const present = lane.filter((id) => cards.find((c) => c.id === id)?.present);
  if (!present.length) return null;
  // The ACTIVE card is the most recently selected present one (store.selStack, item 8 —
  // "keep the active card open, collapse the others"); the slot ids match the SelSlot names
  // except the ladder's node slot. Falls back to the finest present slot (e.g. only the
  // filter committed — selStack carries no "network" entry).
  for (const slot of s.selStack ?? []) {
    const id = slot === "node" ? "node" : slot;
    if (present.includes(id)) return id;
  }
  return present[present.length - 1];
}

export interface RailCard {
  /** Stable id within the rail (also the tray-icon key + the render-map key). */
  id: string;
  kind: RailCardKind;
  icon: LucideIcon;
  /** The card's EdgePulse/roll subject — changes iff the card's content is a NEW subject. */
  subjectKey: string | number | null;
  /** Whether this card currently renders POPULATED (⇔ whether its tray icon shows). */
  present: boolean;
  /** The slot's GHOST hint (user design, 2026-07-10): when the view can produce this card but
   *  nothing is selected yet, the rail renders a quiet hint-state card carrying this copy —
   *  what to interact with, and what it will uncover. `null` = the view can't produce this
   *  card (no ghost; a populated card still renders anywhere — e.g. a pinned snapshot carried
   *  into another view). The availability is an ALLOW-LIST mirroring the engine's pick
   *  registry + the card scopes, exactly like the old single pick-invite it replaces. */
  hint: string | null;
}

// The slice of the store the rails branch on. Kept as a plain object so the derivations are pure
// and unit-testable (per mode × selection state → expected card set) without a live store.
// `selNodesCount` + `filterLabel` feed the geo node ghost's honest no-locatable variant (the
// old pickHintText rule, preserved verbatim).
export interface RailManifestState {
  mode: Mode;
  filter: string;
  inspect: PickDescriptor | null;
  snap: Extract<PickDescriptor, { kind: "snapshot" }> | null;
  /** How many nodes the current selection plots in geo (store.selNodes.length). */
  selNodesCount: number;
  /** The filtered network's display ticker/name (for the honest geo variant). */
  filterLabel: string | null;
  /** The committed country drill (cc code), or null — geo's coarse focus-ladder rung. */
  country: string | null;
  /** The committed city×provider cohort — geo's rung between a country and a node. */
  cohort: CohortSel | null;
  /** The committed composition group — hyper's rung between a network and a node. */
  composition: CompositionSel | null;
  /** The selected metagraph-snapshot TILE — ledger's own card slot (spec 2026-08-04), not a
   *  ladder rung. Optional: the ladder derivation (`LadderState`) and its callers never carry
   *  this field, so `detailsCards` treats an absent key the same as `null`. */
  metaSnap?: MetaSnapSel | null;
}

const isNodePick = (p: PickDescriptor | null): boolean =>
  !!p && (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode");

// LEFT rail (Explore): the "About this view" orientation card in EVERY view, plus — only where the
// view has one — its single tool card (hyper → HyperExplore, geo → GeoExplore, ledger →
// LedgerPanel). All are STATIC
// tools: their subjectKeys are constants so they never read as "updated" (the tray stays a quiet
// legend; view switches ride the separate switch-signal, not a per-card update highlight).
export function exploreCards(s: Pick<RailManifestState, "mode">): RailCard[] {
  const hasTool = s.mode === "hyper" || s.mode === "geo" || s.mode === "ledger";
  // The tray shows the tool card's OWN head mark (the ONE standard EXPLORE_ICON) — it used to
  // show VIEW_ICONS[mode], which in ledger put a Layers glyph on the left tab that read as the
  // snapshot card's mark (user bug report); card head and tray icon must agree.
  return [
    { id: "about", kind: "about", icon: ABOUT_ICON, subjectKey: "about", present: true, hint: null },
    { id: "tool", kind: "tool", icon: EXPLORE_ICON, subjectKey: "tool", present: hasTool, hint: null },
  ];
}

// Per-slot ghost hint copy — view + slot → the invite (or null = the view can't produce the
// card). The 3D views only; the flat placeholder views pick nothing → no ghosts (same allow-list
// rule the old single pick-invite followed). The geo node hint keeps the honest no-locatable
// variant: inviting a click when the filtered network plots nothing would be a dead hint, and
// "all" with 0 nodes is just boot (no ghost rather than a false one flashing at startup).
//
// COPY RULE (2026-08-02): a hint is the GESTURE and nothing else — the slot label beside it
// already names the subject, and the dashed frame already says "nothing here yet". Every hint
// used to end "… to inspect it.", so four ghosts stacked in the rail read as one sentence
// repeated four times with the verb swapped. Each now names its own route instead, and where a
// subject is reached from a PARENT row the hint says which ("under a country", "under a
// network", "under a floor") — the containment the rail's thread encodes, said in words.
const IN_3D = (m: Mode) => m === "hyper" || m === "geo" || m === "ledger";
function contextHint(s: RailManifestState): string | null {
  if (!IN_3D(s.mode)) return null;
  return "Pick a network in the top-bar filter.";
}
function nodeHint(s: RailManifestState): string | null {
  // NB the hypergraph's HUBS commit the filter (the metagraph slot) — only nodes fill this one,
  // so the hint no longer offers a hub click it can't honour.
  if (s.mode === "hyper") return "Click a node in the hypergraph, or in the explorer.";
  if (s.mode === "geo") {
    if (s.selNodesCount === 0) {
      if (!s.filterLabel) return null; // boot — the data simply hasn't landed yet
      return `${s.filterLabel} has no locatable nodes — explore it in the Hypergraph view.`;
    }
    return "Click a node on the globe, or in the explorer.";
  }
  // Nodes are pickable in the chamber too (user, 2026-07-12 — the standing chips are a real pick
  // target), so the slot announces it.
  if (s.mode === "ledger") return "Click a node in a container under a floor.";
  return null;
}
function snapHint(s: RailManifestState): string | null {
  // LEDGER-SCOPED (spec 2026-08-01, a deliberate reversal of the old carry-across-views rule):
  // the strip's bars now run only in ledger and leaving the view clears the pin (Engine.setMode),
  // so the slot invites — and exists — only there.
  return s.mode === "ledger" ? "Click a snapshot block, or a bar in the strip below." : null;
}
// Country/cohort are geo-only focus-ladder rungs (the drill + the city×provider commit) — their
// ghosts only ever invite in geo, same allow-list idiom as every other slot.
function countryHint(s: RailManifestState): string | null {
  return s.mode === "geo" ? "Drill a country on the globe, or in the explorer." : null;
}
function cohortHint(s: RailManifestState): string | null {
  return s.mode === "geo" ? "Open a city · provider row under a country." : null;
}
// Composition is hyper's own middle rung (2026-08-02) — the make-up groups under a network in
// the explorer. Hyper-only, same allow-list idiom.
function compositionHint(s: RailManifestState): string | null {
  return s.mode === "hyper" ? "Open a make-up group under a network." : null;
}
// A metagraph snapshot is a ledger-only card SLOT (spec 2026-08-04) — not a ladder rung; the
// routes are the 3D tile and the explorer's metagraph-snapshot rows.
function metaSnapHint(s: RailManifestState): string | null {
  return s.mode === "ledger" ? "Click a tile under a lane, or a snapshot in the explorer." : null;
}

// RIGHT rail (Details): FIXED slots in a stable order — the Context dossier, then country,
// cohort, composition, the snapshot chain (global, then the metagraph snapshot that anchors into
// it), then node (coarse→fine, matching the focus ladders + the ledger's display lane). Each slot
// renders its populated card when selected, else its GHOST hint when the view can produce it (see
// `hint` above) — so the rail always shows the view's full possibility space and a deselect
// returns a slot to its ghost in place (spatially stable; the old recency reordering made cards
// jump). Callers filter to `present` for the tray icons.
export function detailsCards(s: RailManifestState): RailCard[] {
  const context: RailCard = {
    id: "context",
    kind: "context",
    icon: iconForPick("meta"),
    subjectKey: s.filter,
    // Mirrors ContextCard's own branches: every non-"all" filter renders a card — catalog
    // metagraphs + "dag" via the dossier, "unlisted" via its honest pseudo-network pane
    // (2026-08-08; before that pane, unlisted left this slot a hole — present suppressed the
    // ghost while the card self-nulled).
    present: s.filter !== "all",
    hint: contextHint(s),
  };
  const metaSnap: RailCard = {
    id: "metaSnap",
    kind: "metaSnap",
    icon: iconForPick("metaSnap"),
    subjectKey: s.metaSnap ? `${s.metaSnap.metaId}:${s.metaSnap.ordinal}` : null,
    present: !!s.metaSnap,
    hint: metaSnapHint(s),
  };
  const country: RailCard = {
    id: "country",
    kind: "country",
    icon: iconForPick("country"),
    subjectKey: s.country,
    present: s.country != null,
    hint: countryHint(s),
  };
  const cohort: RailCard = {
    id: "cohort",
    kind: "cohort",
    icon: iconForPick("cohort"),
    subjectKey: s.cohort ? `${s.cohort.cc}|${s.cohort.city}|${s.cohort.isp}` : null,
    present: s.cohort != null,
    hint: cohortHint(s),
  };
  const composition: RailCard = {
    id: "composition",
    kind: "composition",
    icon: iconForPick("composition"),
    subjectKey: s.composition ? `${s.composition.netId}|${s.composition.key}` : null,
    present: s.composition != null,
    hint: compositionHint(s),
  };
  const node: RailCard = {
    id: "node",
    kind: "node",
    icon: iconForPick("geoLive"),
    subjectKey: hoverKeyOf(s.inspect),
    present: isNodePick(s.inspect),
    hint: nodeHint(s),
  };
  const snap: RailCard = {
    id: "snap",
    kind: "snap",
    icon: iconForPick("snapshot"),
    subjectKey: s.snap ? s.snap.data.ordinal : null,
    present: !!s.snap,
    hint: snapHint(s),
  };
  return [context, country, cohort, composition, snap, metaSnap, node];
}
