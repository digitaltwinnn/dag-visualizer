import type { LucideIcon } from "lucide-react";
import { ABOUT_ICON, EXPLORE_ICON, iconForPick } from "@/components/icons";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import type { Mode } from "@/src/store/store";
import type { PickDescriptor, MetaSnapSel } from "@/src/data/types";
// LADDERS is plain DATA (the domain focus-ladder rung tables) — importing it keeps this module
// data-only; CohortSel rides along type-only (the store mirrors the same import).
import { type FocusLevel, type CohortSel, type CompositionSel } from "@/src/engine/domain/focusLadder";

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
// Which facts-rail slot stands for each FOCUS-LADDER rung. The lane's ORDER lives in
// `DISPLAY_LANE` below; this table is the rung↔slot mapping both directions read.
//
// ⚠️ The lane used to be DERIVED from `focusLadder.LADDERS` through this table, which is what kept
// the spine from disagreeing with the camera walk. It is a table now (see DISPLAY_LANE), so that
// agreement is ASSERTED instead — `railLadderBoundary.test.ts` requires every rung's slot to be in
// its view's lane, and the lane restricted to rung slots to run in the reverse of the rung order.
// A new rung therefore fails a test rather than silently missing the spine.
const LADDER_SLOT: Partial<Record<FocusLevel, string>> = {
  network: "context",
  country: "country",
  cohort: "cohort",
  composition: "composition",
  node: "node",
};
// The inverse read of the table above: which ladder RUNG does this slot stand for (null = the slot
// is not a rung — the ledger's two snapshot slots, About, the tool card). The camera's "frame the
// boxed rung" request goes through this, so a slot can only ask for a pose that a real rung — and
// therefore a real resolver — already defines. One table, both directions.
export function ladderLevelOfSlot(id: string): FocusLevel | null {
  for (const [level, slot] of Object.entries(LADDER_SLOT)) {
    if (slot === id) return level as FocusLevel;
  }
  return null;
}

/** The FACTS-RAIL DISPLAY LANE per view, coarsest→finest, top-down.
 *
 *  ⚠️ A TABLE, NOT A DERIVATION (2026-09-15). This was computed from `LADDERS` — reversed, mapped
 *  through `LADDER_SLOT` — and then patched for the ledger with two `indexOf` splices. The
 *  derivation looked like it was keeping the lane honest, and for hyper and geo it was; for the
 *  ledger it bought nothing, because BOTH entries it produced were repositioned by the splices.
 *  What it actually cost was legibility: the lane's reasoning — which card leads this view and why
 *  — lived in a comment attached to a mutation instead of in something you can read as data, next
 *  to the rung table it answers to.
 *
 *  The contract the derivation used to enforce for free is now ASSERTED instead, in
 *  `railLadderBoundary.test.ts`: every committable rung's slot appears in its view's lane, and the
 *  lane restricted to rung slots runs in the reverse of the rung order. A lane that drifts from the
 *  camera walk fails there rather than in a screenshot.
 *
 *  Members with no rung are card slots only (the ledger's two snapshot slots) — display hierarchy,
 *  no camera pose, no deselect step. `ladderLevelOfSlot` is the inverse read and stays the one
 *  place a slot can name a rung. */
const DISPLAY_LANE: Partial<Record<Mode, readonly string[]>> = {
  hyper: ["context", "composition", "node"],
  geo: ["context", "country", "cohort", "node"],
  // ⚠️ THE TICK LEADS (user, 2026-09-15). The lane is a containment claim — the slab abuts
  // committed cards into one body, and adjacency is what says what holds what — so the question is
  // which claim is least wrong. Neither order is literally true: a tick does not contain a network,
  // and a network certainly does not contain a global tick, which is what the old lane asserted by
  // putting the dossier on top. What the tick DOES contain is that network's anchor, and the tick
  // card already lists exactly that (DOR 48 · DED 29 · …), so reading down the pile now follows the
  // card's own next step instead of contradicting it.
  //
  // It also seats a POPULATED card at the head in the one view whose coarsest subject needs no
  // commit — the tick follows live by itself — so the lane opens speaking rather than inviting.
  // (The chamber's storeys are unchanged: geometry still shows ribbons falling INTO the global
  // floor; the rail states the reading order.)
  ledger: ["snap", "context", "metaSnap", "node"],
};

export function ladderSlotIds(mode: Mode): string[] {
  return [...(DISPLAY_LANE[mode] ?? [])];
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
    // The stack speaks selection slots; the lane speaks card slots — two renames:
    // the network selection's card is the CONTEXT dossier (user, 2026-08-14: a filter
    // commit focuses the metagraph card, not whatever snapshot the follow pinned).
    const id = slot === "network" ? "context" : slot;
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
  /** Coarse pointer (usePointerCoarse — `(pointer: coarse)`, the same key the touch floors
   *  ride): the hints say the gesture the reader's device actually has — Tap, not Click.
   *  Optional so every fine-pointer caller and test reads unchanged. */
  coarse?: boolean;
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
// COPY RULE (2026-08-02, sharpened 2026-08-12): a hint is the GESTURE and nothing else — the slot
// label beside it already names the subject, and the dashed frame already says "nothing here yet".
// Two rules fall out of that, and BOTH were violated by the first cut:
//
//  1. NEVER RESTATE THE LABEL'S NOUN. "Country — Drill a country…", "Node — Click a node…" spends
//     the sentence's subject on a word the eyebrow just said. The label IS the subject; the hint
//     names the OBJECT you aim at (the land, a chip, a bar, a tile) and where it is.
//  2. NO SHARED TAIL. Every hint ended "… to inspect it." until 2026-08-02; the fix then grew a new
//     one, ", or in the explorer.", on three slots at once, so a stacked rail read as one sentence
//     repeated with the verb swapped — the same defect one clause down. The explorer is a visible
//     list of rows and needs no invitation; a ghost's job is the SCENE route, which you cannot
//     discover by reading. So the explorer is named only where it is the ONLY route (the provider
//     and composition rungs), where it is the distinguishing fact rather than a refrain.
//
// Where a subject is reached from a PARENT the hint still says which ("under a country", "under a
// network") — the containment the rail's thread encodes, said in words. Ledger's three openers stay
// "Click" on purpose: they are three real clicks, and the objects (bar / tile / chip) plus their
// storeys (on the floor / on a plane above it / in a tray) diverge inside four words, so the stack
// reads as a legend rather than a chant.
//
// ⚠️ 3. NAME THE THING IN THE NETWORK'S OWN WORDS, NOT THE SCENE'S FURNITURE (user, 2026-08-12 —
//    "the ghost cards are not in constellation / dag terminology"). Two hints had drifted into
//    vocabulary that exists nowhere else the reader can see it: "a make-up group" is invented (the
//    rows it points at say Hybrid / Consensus / Currency / Data over L0 · cL1 · dL1 pills, and the
//    house word for those is LAYER), and "a ring around a hub" named two pieces of internal scene
//    geometry — `hub` appears in no user-facing copy at all, while every other hint names its parent
//    as a "country" or a "network". Both now do: "a layer group", "a layer ring around a network".
//    Hyper's rings genuinely ARE one layer each (L0 inner, dL1 middle, cL1 outer), so the word is
//    accurate and teaches the shell shape in passing, the same way metaSnapHint teaches the chamber's
//    two storeys. The three NODE hints lost their geometry nouns (sphere / chip) with it and refer
//    back to the label instead — "Click ONE …", contextHint's own device — which reads as one legend
//    across the views rather than three different objects for one subject.
// 4. PLAIN SENTENCES, NO DASH CLAUSE (user, 2026-08-12 — "remove the - text that ai often uses").
//    A statement that needs two clauses gets two sentences ("… has no locatable nodes. Explore it in
//    the Hypergraph view."). This is an app-wide copy rule, not a ghost-hint one; it applies to every
//    surface the reader reads (the About cards, the explorer hints, the empty states). Comments and
//    docs like this one are dev-facing and keep their dashes.
const IN_3D = (m: Mode) => m === "hyper" || m === "geo" || m === "ledger";
// The pointer's own verb (2026-09-04): "Click" taught a mouse to a thumb. One helper so no hint
// can pick its own word.
const CLICK = (s: RailManifestState) => (s.coarse ? "Tap" : "Click");
function contextHint(s: RailManifestState): string | null {
  if (!IN_3D(s.mode)) return null;
  // No noun at all: the slot label reads "Metagraph" while the app's broader word is "network", and
  // this hint used to put BOTH in one line ("Metagraph — Pick a network…").
  return "Pick one in the top-bar filter.";
}
function nodeHint(s: RailManifestState): string | null {
  // NB the hypergraph's HUBS commit the filter (the metagraph slot) — only nodes fill this one,
  // so the hint no longer offers a hub click it can't honour.
  if (s.mode === "hyper") return `${CLICK(s)} one on a layer ring around a network.`;
  if (s.mode === "geo") {
    if (s.selNodesCount === 0) {
      if (!s.filterLabel) return null; // boot — the data simply hasn't landed yet
      return `${s.filterLabel} has no locatable nodes. Explore it in the Hypergraph view.`;
    }
    // No "…on the globe" here: the COUNTRY ghost one slot up already ends that way, and two
    // ghosts in one rail sharing a trailing clause is the refrain rule 2 exists to prevent
    // (the tail test catches it). The stack is only ever on the globe anyway.
    // ⚠️ The long-press advertisement rides the NODE ghost, on touch only, in geo alone (one
    // mention — every 3D object previews the same way, and a refrain across three node hints
    // would be the shared-tail defect at sheet scale). It exists because long-press is the one
    // gesture with no visible affordance: nothing in the scene says a still press previews.
    return s.coarse ? "Tap one in a stack — or press and hold to preview it." : "Click one in a stack.";
  }
  // Nodes are pickable in the chamber too (user, 2026-07-12 — the standing chips are a real pick
  // target), so the slot announces it. "in a container under a floor" was stale jargon from the
  // retired per-role split (src/data/ledgerLayers.ts) — the house word is TRAY, and there are many.
  if (s.mode === "ledger") return `${CLICK(s)} one in any of the trays.`;
  return null;
}
function snapHint(s: RailManifestState): string | null {
  // LEDGER-SCOPED (spec 2026-08-01, a deliberate reversal of the old carry-across-views rule):
  // the strip's bars now run only in ledger and leaving the view clears the pin (Engine.setMode),
  // so the slot invites — and exists — only there. The strip earns its clause (it is a second
  // route in a different ZONE, not the explorer refrain) and the parallel is real: the same
  // subject is a bar in both places.
  return s.mode === "ledger" ? `${CLICK(s)} a bar on the floor, or in the strip below.` : null;
}
// Country/cohort are geo-only focus-ladder rungs (the drill + the city×provider commit) — their
// ghosts only ever invite in geo, same allow-list idiom as every other slot.
function countryHint(s: RailManifestState): string | null {
  return s.mode === "geo" ? `${CLICK(s)} the land on the globe.` : null;
}
function cohortHint(s: RailManifestState): string | null {
  // Explorer-only rung: no 3D cohort exists to click, so naming the row IS the route.
  return s.mode === "geo" ? "Open a city · provider row under a country." : null;
}
// Composition is hyper's own middle rung (2026-08-02) — the layer groups under a network in
// the explorer. Hyper-only, same allow-list idiom; explorer-only like the cohort above.
function compositionHint(s: RailManifestState): string | null {
  return s.mode === "hyper" ? "Open a layer group under a network." : null;
}
// A metagraph snapshot is a ledger-only card SLOT (spec 2026-08-04) — not a ladder rung. Naming the
// STOREY does the work here: the line above it aims at a bar ON the floor, so "a plane above the
// floor" separates the two subjects and teaches the chamber's two-storey shape in passing.
function metaSnapHint(s: RailManifestState): string | null {
  return s.mode === "ledger" ? `${CLICK(s)} a tile on a plane above the floor.` : null;
}

// RIGHT rail (Details): FIXED slots in a stable order — the Context dossier, then country,
// cohort, composition, the snapshot chain (global, then the metagraph snapshot that anchors into
// it), then node (coarse→fine, matching the focus ladders + the ledger's display lane). Each slot
// renders its populated card when selected, else its GHOST hint when the view can produce it (see
// `hint` above) — so the rail always shows the view's full possibility space and a deselect
// returns a slot to its ghost in place (spatially stable; the old recency reordering made cards
// jump). Callers filter to `present` for the tray icons.
export function detailsCards(s: RailManifestState): RailCard[] {
  // A PLACEHOLDER VIEW HAS NO FACTS SCOPE (user, 2026-08-10). `status`/`transactions`/`staking`
  // draw a wireframe captioned `preview · in development` and deliberately show no numbers, so
  // they never read as live data — but the ladder lane is empty there (`ladderSlotIds` → []), which
  // dropped every present card into Inspector's trailing non-ladder pass. The result was a fully
  // populated node card — status pill, ASN, real id — sitting beside the wireframe with nothing to
  // say it isn't FROM it, which is the exact reading rule 10 exists to prevent. It also arrived
  // half-formed: `nonLadder` excludes the context kind (ContextCard is only ever mounted inside its
  // rung, to keep its EdgePulse alive across the dossier⇄nothing swap), so the node showed with no
  // network above it and no ancestry pile — fall-out, not a decision.
  // The SELECTION IS UNTOUCHED: this only stops the view speaking for it, so returning to a 3D view
  // restores the whole pile in place. Gated on the views the facts scope is FOR (convention 7),
  // and it matches what the left rail already does here — About only, no tool card.
  if (!IN_3D(s.mode)) return [];
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
  // The manifest order drives the tablet/phone flat stack + tray icons and MUST agree with the
  // desktop lane above: tick → dossier → the tick's own metagraph snapshot → node.
  return [snap, context, country, cohort, composition, metaSnap, node];
}

