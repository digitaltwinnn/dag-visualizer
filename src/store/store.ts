import { sameTickNet } from "@/src/engine/domain/tickNet";
import { create } from "zustand";
import type { GlobalSnapshot, LeaderboardData, MetaInfo, NodeRow, PickDescriptor, SnapshotExact, MetaSnapSel, TickNetSel, ChannelSnapDeep } from "@/src/data/types";
import { metaSnapDeepKey } from "@/src/data/types";
import type { HoverSubject } from "@/src/data/hoverSubject";
// Type-only — the store may not import domain VALUES (layerBoundaries rule), but a type-only
// import of a domain type is legal and keeps CohortSel defined in exactly one place.
import type { CohortSel, CompositionSel, FocusLevel } from "@/src/engine/domain/focusLadder";
import type { ThemePref, Theme } from "@/src/theme/resolve";
// Type-only, like the domain imports above: the window vocabulary has ONE home
// (src/data/trendWindow.ts, read by the document's picker and by the stack), and a type-only
// import keeps the store from holding a data-layer VALUE.
import type { ZoomId } from "@/src/data/trendWindow";
import { scrollToKeep } from "@/src/engine/domain/trendStack";

// The active view. `hyper`/`geo`/`ledger`/`trend` all drive the 3D scene (every switch among
// them runs the gather choreography); `soon` is THE one flat placeholder view (consolidated
// 2026-09-04 — three separate soon modes said the same nothing three times; the Blueprint
// gallery inside it still previews each coming feature). `trend` (2026-09-18) is the measured
// history view — chart planes as the scene, convention 12's MEASURED HISTORY rung made a view.
export type Mode = "hyper" | "geo" | "ledger" | "trend" | "soon";

// The stored metric every trend plane draws — one picker, one column (see `trendMetric` below).
import type { LedgerMeasure } from "@/src/data/ledgerMeasure";
import type { GeoMeasure } from "@/src/data/geoMeasure";
import type { HyperMeasure } from "@/src/data/hyperMeasure";
export type { LedgerMeasure };
// WHY the scene is moving — the motion hint's cause (2026-09-26), stamped by the gesture's owner
// and read by `components/MotionHint` through `domain/motionHint.ts`, which turns it into words.
// DATA about the gesture, never copy. Defined here, beside its channel, because the domain module
// that reads it already imports this file's types and a type import back would close a cycle.
export type MotionCause =
  | { kind: "view"; from: Mode; to: Mode }
  | { kind: "filter"; id: string }
  | { kind: "focus"; id: string | null }
  // A node pick's `title` is its NETWORK's name and `sub` its place (Globe builds the pick so).
  | { kind: "node"; title: string | null; sub?: string | null }
  | { kind: "snapshot"; ordinal: number | null }
  | { kind: "metaSnap"; metaId: string | null; ordinal?: number }
  | { kind: "country"; cc: string | null }
  | { kind: "cohort"; on: boolean }
  | { kind: "composition"; on: boolean }
  | { kind: "range"; span: { fromMs: number; toMs: number } | null }
  | { kind: "window"; id: ZoomId }
  | { kind: "measure"; id: TrendMetric }
  | { kind: "page" }
  | { kind: "orbit" }
  // A rail card asking to be framed (`requestFocusRung`): the ladder rung, named by the reader.
  | { kind: "rung"; level: FocusLevel };
export type TrendMetric = "snapshots" | "blocks" | "fees" | "kb" | "nodes" | "continuity";

// One slot in the right-rail card stack (extend with future card types — e.g. "tx").
export type SelSlot = "network" | "node" | "snap" | "metaSnap" | "country" | "cohort" | "composition" | "range" | "instant";

// Move `slot` to the FRONT of the recency stack when it becomes active, or drop it when cleared.
//
// ⚠️ A NO-OP WRITE IS A NO-OP REFERENCE (2026-09-19). `selStack` is subscribed by `useLadderFocus`,
// which every explorer row and the whole facts rail read — so rebuilding the array on every call
// re-rendered both rails for a list that had not moved. That is free for a channel written once per
// click and it is not free for `setTrendCursor`, which writes at BUCKET frequency during a scrub
// with `instant` already at the front. Returning the incoming array unchanged when nothing moved
// costs one comparison over a list that is never longer than the ladder.
function bumpStack(stack: SelSlot[], slot: SelSlot, active: boolean): SelSlot[] {
  const without = stack.filter((s) => s !== slot);
  const next = active ? [slot, ...without] : without;
  if (next.length === stack.length && next.every((s, i) => s === stack[i])) return stack;
  return next;
}

// Per-hour rates + per-snapshot series from NetworkData.getActivity(). ONE HOME: this was a
// hand-copied duplicate of the data layer's interface and drifted the moment a field was added
// there (2026-08-12) — the store's own copy silently kept the old shape, so a component reading
// the new field type-errored against a type that no longer described the value it held.
export type { Activity } from "@/src/data/api";
import type { Activity } from "@/src/data/api";

// Panel-facing state only (Lane B). The 60fps scene + per-snapshot visuals subscribe
// to NetworkData directly (Lane A) and never touch this store, so React renders stay
// bounded. Filled by the network service in src/data/network.ts.
interface AppState {
  live: boolean;
  lastGoodAt: number | null;
  // Fires once, after the engine's first rendered frame — lets the boot overlay cross-fade
  // into the live scene instead of fading on a timer/guess.
  engineReady: boolean;
  // Fires once the hypergraph scene is structurally COMPLETE — metagraph nodes AND the DAG core's
  // own validator nodes have both been placed. The boot overlay holds until this (not just the first
  // feed read) so the scene reveals fully-formed, with no node pop-in on top of an already-shown core.
  sceneReady: boolean;
  // Set if the engine couldn't start (e.g. WebGL unavailable / context creation threw). Without
  // this the boot phase would sit on "booting" forever — engineReady never arrives — even though
  // data is flowing. It routes the overlay to a distinct "3D unavailable" state instead of a wedge.
  engineFailed: boolean;
  nodes: { l0: number; l1: number };
  metagraphs: number;
  latestSnapshot: GlobalSnapshot | null;
  activity: Activity | null;
  // Baked metagraphs (with engine-computed country counts) — for filter chips + pane.
  metaList: MetaInfo[];
  // The right rail is a STACK of independent selections — each shows its own card, and you can
  // hold several at once (a node AND a snapshot AND, later, more). `inspect` is the selected
  // **node** (a 3D/geo pick); `snap` is the selected **snapshot** (bottom bar-chart / ribbon).
  // `selStack` lists the currently-active slots most-recent-FIRST, so the rail renders the cards
  // top-to-bottom in that order (the one you picked last sits on top). Add a future card type by
  // adding a slot field + a `setSel(...)` call + a registry entry in Inspector — nothing else.
  inspect: PickDescriptor | null;
  snap: Extract<PickDescriptor, { kind: "snapshot" }> | null;
  // The selected METAGRAPH SNAPSHOT (a tile on the ledger's upper floor). LEDGER-SCOPED like
  // `snap`: Engine.setMode clears it on the way out of the view. A selStack slot like `snap`.
  metaSnap: MetaSnapSel | null;
  // THE NETWORK INSIDE THE PINNED TICK (2026-10-02) — the ledger's Metagraph rung as a commit of
  // its own, NOT the app filter (`domain/tickNet.ts`). Ledger-scoped like `snap`, and it carries
  // its tick, so `ledgerNetwork` only honours it while that tick is on screen. It rides the
  // "network" selStack slot — the same card slot a committed filter fills.
  tickNet: TickNetSel | null;
  selStack: SelSlot[];
  // Ordinal of the snapshot the cursor is hovering in the LiveStrip bar-chart (transient highlight —
  // the ledger re-colours that snapshot's tiles). null = not hovering.
  hoverSnapOrd: number | null;
  // ONE metagraph snapshot the cursor is hovering — `metaSnapHoverKey(metaId, ordinal)`. Its own
  // channel, separate from `hoverSnapOrd`, because a snapshot is not its tick: keying the hover to
  // the global ordinal lit every sibling that anchored into the same tick (user, 2026-08-09). The
  // scene lights that ONE tile; the explorer/raw row pairs back. null = not hovering.
  hoverMetaSnap: string | null;
  // Filter chip the cursor is hovering (All/DAG/metagraph id) — a transient PREVIEW highlight of that
  // selection's nodes in any view, without committing the actual `filter`. null = not hovering.
  hoverFilter: string | null;
  // Node id/ip the cursor is hovering in the geo explorer list — glows that node's shells on the globe
  // (same pairing as a 3D raycast hover). null = not hovering a list row.
  hoverNodeId: string | null;
  // Country code (cc) the cursor is hovering in the geo explorer list — previews that country's
  // border outline on the globe at a whisper level (the committed drill is `country` below).
  hoverCountry: string | null;
  // Node ids of a hovered explorer COHORT row — the whole 3D honeycomb stack glows together.
  hoverCohort: string[] | null;
  // The hovered GROUP RUNG's identity, as a scalar key — the pairing twin of `hoverCohort`
  // (which carries member ids for the 3D glow and can't be compared by `subjectPairing`).
  // Both group rungs share this ONE channel because no view shows both: geo's provider cohort
  // keys as `${cc}|${city}|${isp}`, hyper's composition group as `${netId}|${key}`. Gives the
  // group cards the same bidirectional card↔row pairing the country/node/network subjects have
  // (user, 2026-08-02: hovering the composition card lit nothing in the explorer). null = none.
  hoverGroup: string | null;
  // (The `ledgerHilite` / `layer` channels are RETIRED, 2026-08-06 — the chamber's floors and
  // node containers are pure visual aid; the ledger's subjects are the snapshots themselves.)
  // Snapshot card follows the latest relevant snapshot (heartbeat live) vs pinned.
  following: boolean;
  // The lean hover-tooltip subject for the currently-hovered 3D object (identity ticker + short
  // name + hue). Set by the engine raycast only when the hovered target changes. null = nothing.
  hover: HoverSubject | null;
  // Country drill-down within the network filter (geo view), or null.
  country: string | null;
  // Committed city×provider COHORT selection (geo, country-scoped) — the focus-ladder rung
  // between a node and its country (finerLevels("geo","country") = ["node","cohort"]). Matches
  // GeoExplore's cohort key fields (cc/city/isp); a selStack slot like `country`.
  cohort: CohortSel | null;
  // Committed COMPOSITION group (hyper, network-scoped) — the focus-ladder rung between a node
  // and its network: HyperExplore's middle browse level (Hybrid [L0][cL1][dL1] / Data / …).
  // `{netId, key}` only — the card re-resolves the group's members off `selNodes` each render,
  // so a data refresh can never leave it showing a stale count. A selStack slot like `cohort`.
  composition: CompositionSel | null;
  // Per-country breakdown + distribution score for the active filter (engine-pushed).
  leaderboard: LeaderboardData | null;
  // The active selection's nodes, for the geo node browser (engine-pushed; [] off geo).
  // EVERY placed node row, across the whole catalog, whatever the filter (2026-09-26) — what the
  // Hypergraph explorer's per-network countries / providers are counted from. Published by the
  // Engine beside `selNodes`, from the same `listNodes`, only where the view lists nodes.
  allNodes: NodeRow[];
  selNodes: NodeRow[];
  // EXACT per-snapshot totals (fee + listed/unlisted), keyed by ordinal — populated by
  // RawSnapshotBridge from /api/snapshot/[ordinal] for the live + selected ticks, so ANY view
  // can read final fees without the polling floor. Missing key = not fetched / read not landed.
  snapshotExact: Record<number, SnapshotExact>;
  // Ordinals whose exact read FAILED (non-OK / network), stamped with the attempt time. This is
  // the give-up signal the acquiring states terminate on (rule 10: a "reading…"/node-stars slot
  // with nothing in flight is a fabricated state): the bridge records the miss, the fee stars and
  // "resolving" rows turn into honest words, and the entry is deleted the moment the exact read
  // lands (a later trigger — reselecting, the next live tick — still retries as before).
  exactMiss: Record<number, number>;
  // Deep channel reads (full decode of one metagraph snapshot), keyed by metaSnapDeepKey(globalOrdinal, metaId).
  // Immutably cached — fetched from /api/snapshot/[ordinal]/channel/[address] on explicit gesture,
  // never on poll or mass reads.
  metaSnapDeep: Record<string, ChannelSnapDeep>;
  // The ONE outstanding request for a deep read, as a `metaSnapDeepKey` — set by the metagraph
  // snapshot card's `Read this snapshot` button, consumed by RawSnapshotBridge.
  //
  // It exists because the read's cost MULTIPLIES, and the gate used to sit on the wrong gesture
  // (user, 2026-08-10 — "when I read the 1st metagraph snapshot and I use the swipe to go to 2nd,
  // 3rd etc it starts doing it automatically"). Gating on `following` alone meant every pinned
  // metaSnap change fetched: one tick measured live anchors 20 DOR snapshots, so a swipe through
  // that pager was 20 × ~2.5 MB against Constellation's public L0 LB at ~1.8s cold each — for a
  // SKIM. A stale key simply stops matching, so no explicit clear is needed.
  deepWanted: string | null;

  // Active view. The scene is one persistent canvas; the engine morphs between hyper
  // and geo and hides it for the flat views, all driven by this.
  mode: Mode;
  // The DOC OVERLAY (2026-09-04): /about and /design render INSIDE the app as a scrollable
  // document layer over the live scene (DocLayer), instead of separate static pages that
  // rebooted the WebGL engine on every footer navigation. A presentation axis like `section`,
  // never a Mode — a document is over the network, not a view of it. While set, the HUD's
  // scene furniture stands down (DocGate) and RouteSync publishes the doc page's own path.
  docPage: "about" | null;
  // ONE-SHOT HANDOFF down the observation ladder (convention 12, 2026-09-09): a /trends chart
  // range handed to the anchor log's search. The trends page writes it as it closes; the log
  // consumes it on sight (prefills the date criteria, seeks when it can) and clears it — a
  // navigation bridge, not a selection (the network commit itself rides the pickActions table).
  /** A door's hand-off to the anchor log: a span to land in, or — with `snapshot` — one metagraph
   *  snapshot to find (its card's "Show the raw data", 2026-10-04). */
  logSeek: { metaId: string | null; fromMs: number; toMs: number; snapshot?: number; label?: string } | null;
  // The doc overlay's STAGE-READY signal, written by the Engine (the one clock that knows the
  // choreography's real boundary — frame-driven, so ?slowmo and low FPS stretch it correctly,
  // where a wall-clock wait in the HUD desynced). DEFAULT TRUE so a document never waits on a
  // scene that isn't there (cold flat boots, WebGL-unavailable); the Engine sets it false only
  // when a doc opens OVER a live 3D view, and true again the frame the gather completes —
  // DocLayer holds its entrance on it.
  docStageReady: boolean;
  // The CLOSE side's beat (user, 2026-09-04): the doc's roll-out is its own OUT phase, so the
  // engine holds the flat stage until it finishes — `docClosing` is true from the close gesture
  // until DocLayer's exit animation completes (it clears this), and only then does the engine
  // begin the destination view's entry, with the fleet back at the parked grids for the flight.
  docClosing: boolean;
  // Shared network filter ("all" | "dag" | <metagraph id>) — one unified core model, no
  // separate L0/L1 filters (the DAG is just another metagraph-shaped core).
  filter: string;
  // PHONE ONLY: which bottom sheet (if any) is open — "explore" (ExploreRail) or "details"
  // (Inspector), or null when both are closed. Phone has no room to stack two bottom sheets
  // (unlike tablet's two independent side sheets), so this is the single source of truth both
  // docks read `open` from: a dock is open iff `phoneDock === its own id`, and opening one
  // (`setPhoneDock("explore" | "details" | "vitals")`) automatically closes the others by flipping its
  // `open` to false — the two components never need to know about each other. Never set by a
  // scene pick (`setInspect`/`setSnap`) — only by the user tapping a button or dismissing a
  // sheet: tapping the ACTIVE bar half again (toggle), tapping the grabber (`.sheet-grabber`,
  // now a real tap-to-collapse button — see RailDock), or Escape → `setPhoneDock(null)`.
  // (Outside-tap does NOT dismiss it — `onInteractOutside` is `preventDefault`-blocked so the
  // scene/other dock stays interactive underneath.) Unused on tablet/desktop.
  phoneDock: "explore" | "details" | "vitals" | null;
  // Which of the two shell LAYERS is presented (spec 2026-08-01): "scene" = the 3D shell + HUD,
  // "data" = the per-view raw-data table that surfaces out of the scene's depth over it. Written
  // by the command bar's RAW switch (and Escape); SectionShell owns the GSAP timeline that
  // realizes it. UI state, not selection (the selection boundary rule doesn't apply);
  // session-only, like phoneDock.
  section: "scene" | "data";
  /** THE VIEW A DOOR LEFT to open the records (2026-09-26; user: closing the raw layer "should
   *  always go back to wherever opened the page"). `openRecords` switches the mode to Snapshots
   *  so the raw layer shows the anchor log; when the layer closes, `setSection("scene")` returns
   *  to this view and clears it. A view switch made while the layer is open clears it too — the
   *  reader has chosen a view, and there is nothing to return to. */
  rawReturnMode: Mode | null;
  /** …and the History plane that was in front when the door was taken, restored with the view
   *  (the tester pass, 2026-10-07: the round trip lost it). */
  rawReturnFocus: string | null;
  // DESKTOP ONLY (card-redesign follow-up, 2026-08-08): collapse the HUD's card rails to their
  // THREADS — BOTH rails together (user: the rails are symmetric and the motive, "spotlight the
  // scene", is whole-HUD; one command-bar toggle beats two subtle per-rail chevrons). Cards fade
  // out visibility-hidden (layout preserved so the threads keep measuring — their dots remain
  // as the minimized rails/possibility map). UI state like `section`, session-only.
  railsHidden: boolean;
  // TRUE while the user is DIRECTLY manipulating the scene (OrbitControls' `start`→`end`, which
  // fire on real pointer/touch/wheel input only — Engine tweens and programmatic camera moves
  // never set this). The rails dim while it holds, so direct manipulation pushes the HUD back
  // without moving any layout. Written by the Engine (debounced on the trailing edge).
  sceneDragging: boolean;
  // TRUE while the ENGINE is flying the camera in answer to a commit — the counterpart to
  // `sceneDragging`'s "the user's hand is on the scene" (user, 2026-08-12: "when we swipe a card
  // or click another one in the card hierarchy the scene moves the camera accordingly; during
  // this short animation period can we apply a similar effect to the cards/panels as when we
  // manually use the camera controls"). Consumed by the PHONE dock sheet only — every wider tier
  // has its own way to step the HUD aside (desktop's SCENE toggle, the tablet edge tab), so they
  // opt out (user, 2026-08-13 — the ⚠️ block in RailShade.tsx has the reasoning). Written by the
  // Engine on the tween's edges only (never per frame), and NOT during a view transition: that
  // choreography is its own 3.9s answer to the user's gesture, so a 1.4s dim inside it would read
  // as a blink.
  cameraFlying: boolean;
  // THE MOTION HINT's two channels (2026-09-26). `sceneMoving` is ENGINE → REACT: derived each
  // frame from the structures that drive motion (the view transition, the camera flight, the
  // controls' drag, the trend stack's ease) and written on edges only. `motionCause` is WHY —
  // stamped once per gesture by whoever owns it: the click executor for every selection, the
  // setters below for the settings that move the scene, the Engine for a drag. `MotionHint`
  // turns the pair into one sentence (`domain/motionHint.ts`); nothing else reads them.
  sceneMoving: boolean;
  motionCause: MotionCause | null;
  // The view transition's phase while one runs — OUT is the teardown, IN the build — so a view
  // switch can say "leaving A" and then "entering B" (user, 2026-09-26). Engine-written, edges only.
  motionPhase: "out" | "in" | null;
  // Where the view transition's STAGING BAND ends, in canvas-local CSS px from the top (2026-09-29)
  // — the lowest row of the gathered grids — so the motion hint can stand clear of it while a
  // switch runs. Engine-written on change only; null until a transition has measured one.
  gatherBottom: number | null;
  // Which rail slot is the materialized BOX right now (the expanded card — "context", "node",
  // "snap", …), or null when nothing is boxed. A PRESENTATION channel, written by Inspector
  // from the same state that renders the box, read by the subject callout so the scene label
  // mirrors the box exactly as the camera does (user, 2026-08-15: clicking a committed node's
  // hub re-boxes the metagraph card — the callout must step up with it). Never a selection
  // channel: committing/deselecting stays with the ladder.
  boxedCard: string | null;
  // PHONE ONLY: the bottom sheet's height under the finger, in px, WHILE A DRAG IS LIVE (null =
  // the sheet stands at its content's fit, under RailDock's 60% section ceiling). A release
  // clears it (2026-10-04 — the resting detents went with the ceiling), and so does a full close.
  phoneSheetPx: number | null;
  // How many px of the CANVAS each side is covered by an open rail sheet, left and right (0 =
  // nothing covering that side). Below 1100px the rails stop sitting BESIDE the canvas and become
  // sheets that OVERLAY it, while the canvas itself stays viewport-sized underneath — so anything
  // the Engine places against the canvas rect is placing against a box the user can't fully see.
  // The subject callout is the one consumer today: it measures its panel against the free band
  // `[left + sceneCoverL, right - sceneCoverR]` and declines rather than render a fragment in a
  // gap too narrow to hold it (`domain/calloutPlacement.ts`). Published by whoever OWNS the dock —
  // RailDock stays store-free and reports its measured width through an `onCoverPx` prop, so this
  // is written by ExploreRail and Inspector. TWO SCALARS ON PURPOSE, never one object: they are
  // written independently and read per frame, so a shared object would churn its reference every
  // time either side moved. Always 0 on desktop (rails are inline) and on phone (bottom sheets
  // take height, not width — and the callout declines there outright anyway).
  sceneCoverL: number;
  sceneCoverR: number;
  // THE BOTTOM COVER, per phone dock (2026-09-28): the height the open bottom sheet takes off the
  // canvas, published as the sheet's TARGET height (the dock's own `heightPx` — 0 while it arms
  // its grow and while it exits) so the Engine eases one shift on its own clock rather than
  // chasing thirty ResizeObserver ticks. The Engine reads the larger of the two and moves the
  // scene's framing centre up into the band that remains (`domain/sheetShift.ts`, a projection
  // offset, never a camera move). TWO SCALARS, one per dock, for the same reason the sides are:
  // the docks are mutually exclusive but their exits LAG (a closing sheet shrinks for 420ms and
  // publishes 0 when it unmounts), so one shared scalar would let the closing dock clobber the
  // opening one. Always 0 on desktop and tablet. Three docks, three scalars (the Vitals sheet
  // was missed on the first cut — user: "for vitals it's a bit too close to the bottom section").
  sceneCoverBExplore: number;
  sceneCoverBDetails: number;
  sceneCoverBVitals: number;
  // Per-slot rail-card collapse OVERRIDES (slot id → collapsed), written by a user's +/− toggle
  // or the rail-top minimize/expand-all controls. A slot with NO entry falls back to the rail's
  // AUTO default (Inspector: ladder ancestors of the focused rung rest collapsed) — so `null`
  // via setRailCollapse returns a slot to auto. UI state, not selection (the selection boundary
  // rule doesn't apply); session-only, like phoneDock.
  railCollapse: Record<string, boolean>;
  // HOW the current rail state was reached (user, 2026-09-11 — "solve it structurally", ending
  // the timer-based roll suppression): true when the latest navigation was a QUIET gesture —
  // the plank's ladder steps and any manual expand/collapse (the About card's never-roll-on-a-
  // manual-expand rule) — so a card mounting from it, however late its data arrives, skips the
  // title roll-in. The one executor resets it to false on every ordinary commit; CardHead
  // freezes the answer per mount. UI state, not selection.
  navQuiet: boolean;
  // THE CAMERA FRAMES THE BOXED RUNG (user, 2026-08-09: "when we click the card, can we also
  // update the view camera position, we do the same when we click a row in the explorer"). The
  // rail's open plank and the camera name the same subject, so opening a rung asks the Engine to
  // re-walk its focus ladder FROM that rung, skipping the finer ones — the same resolvers, the
  // same poses a row click lands on. NOT a selection write (nothing is committed or released), so
  // it stays outside the pickActions table: only the finest COMMITTED rung is selection, and this
  // channel deliberately lets the camera sit at a coarser one while the selection stands.
  // An OBJECT, not a bare level, because it is a one-shot REQUEST: re-opening the same rung must
  // fire again, and a fresh reference is what the Engine's `!==` bridge sees.
  focusRung: { level: FocusLevel } | null;

  /** THE SHARED TIME CURSOR (2026-09-18) — one instant, read by every plane and by the right
   *  rail's "all layers at cursor" list. It is a COMMIT, not a hover: it drives rail content,
   *  so it survives a pointer leaving the timeline. null = no instant picked, and the rail says
   *  so rather than inventing one. */
  trendCursorMs: number | null;
  /** Which stored metric every plane draws. One picker, one column — the planes are a
   *  comparison, so a per-plane metric would make the stack meaningless. */
  trendMetric: TrendMetric;
  // What the Snapshots explorer's tick rows lead with — fee, anchors, metagraphs or size
  // (`src/data/ledgerMeasure.ts`). A setting, like `trendMetric`; its control is the card's heading.
  ledgerMeasure: LedgerMeasure;
  // What the Geography explorer's country rows count — nodes, metagraphs or providers
  // (`src/data/geoMeasure.ts`). A setting, like the two above.
  geoMeasure: GeoMeasure;
  // What the Hypergraph explorer's network rows count — nodes, countries or providers
  // (`src/data/hyperMeasure.ts`). A setting, like the two above.
  hyperMeasure: HyperMeasure;
  /** How far the stack is scrolled through the roster, in planes. The catalog is longer than the
   *  visible window, so the stack pages rather than capping at a top-N. */
  trendScroll: number;
  /** The plane brought forward (5b). View-scoped: it clears on leaving the view, like the other
   *  view-scoped ladder levels. */
  trendFocus: string | null;
  /** ONE SCALE OR EACH ITS OWN — the Trends document's 2026-09-14 rule, carried into the view.
   *  A column of per-network charts that each autoscale answers "how did THIS network's week go?"
   *  beautifully and "which of these is bigger?" with a flat lie: a chain anchoring three a day and
   *  one anchoring forty draw the same silhouette. A depth STACK is read AS a column before it is
   *  read one plane at a time, so `shared` is the default and the honest reading needs no gesture;
   *  `own` is the reader's escape when a small network's own shape is what they want. NOT
   *  view-scoped — it is how the reader likes their charts drawn, not a rung, so `setMode` leaves
   *  it alone. */
  trendScale: "shared" | "own";
  /** THE STACK'S WINDOW (2026-09-18) — the same vocabulary the Trends document's picker and the
   *  vitals rim already wear (`ZOOMS`, src/data/trendWindow.ts; user, 2026-09-09: the ranges stay
   *  consistent across surfaces). The stack and the document are two registers of ONE rung, so a
   *  window means the same thing in both — but each holds its own: the document's zoom is local
   *  component state, because the window a reader picks while reading the page is the page's.
   *  NOT view-scoped: `setMode` leaves it alone, like `trendScale`. */
  trendWindow: ZoomId;
  /** THE STACK'S COMMITTED RANGE — a brushed span that replaces the window's cut entirely, and
   *  auto-tiers to the finest grain its start can honestly carry (`planTrendFetch`). NO `metaId`,
   *  unlike the document's: the stack's range is the WHOLE stack's, every plane cut to the same
   *  span, which is the comparison a depth stack exists to make. null = the window stands. */
  trendRange: { fromMs: number; toMs: number } | null;
  /** THE RANKED ROSTER — a REACT → ENGINE publish channel (2026-09-18), the fourth.
   *  Which networks the stack shows, busiest first, is decided from FETCHED trends data that only
   *  React holds (`rankByLast` over the stored series), and the engine's projector needs exactly
   *  that list to place one plane per id. One-way and single-publisher by construction:
   *  `components/TrendStack.tsx` writes it, `TrendStackSync` reads it through the Engine's bridge,
   *  and nothing writes back — an engine writer would be a feedback loop, re-ranking from the list
   *  it had just set (`components/publishChannelBoundary.test.ts` makes that executable).
   *  ⚠️ BRIDGED BY REFERENCE, like `focusRung`: the publisher passes a FRESH array only when the
   *  list's CONTENT changes, because the Engine's `!==` is the whole change signal. A fresh array
   *  every render would retarget the ease every frame and the stack would never settle; a mutated
   *  array would never reach the Engine at all.
   *  `[]` whenever the stack is not mounted — honest: no planes, nothing to place. */
  trendIds: readonly string[];

  setLive: (live: boolean, lastGoodAt?: number) => void;
  setEngineReady: (v: boolean) => void;
  setSceneReady: (v: boolean) => void;
  setEngineFailed: (v: boolean) => void;
  setNodes: (l0: number, l1: number) => void;
  setMetagraphs: (n: number) => void;
  setLatestSnapshot: (snap: GlobalSnapshot | null) => void;
  setActivity: (activity: Activity | null) => void;
  setMode: (mode: Mode) => void;
  setDocPage: (docPage: "about" | null) => void;
  setLogSeek: (logSeek: { metaId: string | null; fromMs: number; toMs: number; snapshot?: number; label?: string } | null) => void;
  setDocStageReady: (ready: boolean) => void;
  setDocClosing: (closing: boolean) => void;
  setFilter: (filter: string) => void;
  setMetaList: (list: MetaInfo[]) => void;
  setInspect: (pick: PickDescriptor | null) => void;
  setSnap: (snap: Extract<PickDescriptor, { kind: "snapshot" }> | null) => void;
  advanceSnap: (snap: Extract<PickDescriptor, { kind: "snapshot" }> | null) => void;
  setMetaSnap: (sel: MetaSnapSel | null) => void;
  setTickNet: (sel: TickNetSel | null) => void;
  /** The follow system's heartbeat advance for the metagraph-snapshot card — non-bumping, like
   *  advanceSnap: a live tick is never a "new selection" (the card recency/collapse order holds). */
  advanceMetaSnap: (sel: MetaSnapSel | null) => void;
  setHoverSnapOrd: (ordinal: number | null) => void;
  setHoverMetaSnap: (key: string | null) => void;
  setHoverFilter: (filter: string | null) => void;
  setHoverNodeId: (id: string | null) => void;
  setHoverCountry: (cc: string | null) => void;
  setHoverCohort: (ids: string[] | null) => void;
  setHoverGroup: (key: string | null) => void;
  setFollowing: (following: boolean) => void;
  setHover: (hover: HoverSubject | null) => void;
  setCountry: (cc: string | null) => void;
  setCohort: (c: CohortSel | null) => void;
  setComposition: (c: CompositionSel | null) => void;
  setLeaderboard: (lb: LeaderboardData | null) => void;
  setSelNodes: (nodes: NodeRow[]) => void;
  setAllNodes: (rows: NodeRow[]) => void;
  setSnapshotExact: (data: SnapshotExact) => void;
  /** Record a FAILED exact read for this ordinal — the acquiring states' give-up signal. */
  setExactMiss: (ordinal: number) => void;
  /** `key` defaults to the decode's own identity; the bridge passes the REQUESTED key when
   *  the route fell back to another entry (an undecodable row asks with ordinal 0). */
  setMetaSnapDeep: (d: ChannelSnapDeep, key?: string) => void;
  setDeepWanted: (key: string | null) => void;
  setPhoneDock: (dock: "explore" | "details" | "vitals" | null) => void;
  setSection: (section: "scene" | "data") => void;
  setRawReturnMode: (mode: Mode | null, focus?: string | null) => void;
  setRailsHidden: (hidden: boolean) => void;
  setSceneDragging: (dragging: boolean) => void;
  setCameraFlying: (flying: boolean) => void;
  setSceneMoving: (moving: boolean) => void;
  setMotionPhase: (phase: "out" | "in" | null) => void;
  setGatherBottom: (px: number | null) => void;
  setMotionCause: (cause: MotionCause | null) => void;
  setPhoneSheetPx: (px: number | null) => void;
  /** Publish how many px of the canvas an open rail sheet covers on one side (0 when closed). */
  setSceneCover: (side: "left" | "right" | "explore" | "details" | "vitals", px: number) => void;
  setBoxedCard: (id: string | null) => void;
  setRailCollapse: (id: string, collapsed: boolean | null) => void;
  setNavQuiet: (navQuiet: boolean) => void;
  setRailCollapseMany: (entries: Record<string, boolean | null>) => void;
  /** Ask the Engine to frame this ladder rung (see `focusRung`). One-shot; the Engine reads it
   *  on change and never clears it — the value IS the last request, not a pending queue. */
  requestFocusRung: (level: FocusLevel) => void;
  setTrendCursor: (ms: number | null) => void;
  setTrendMetric: (metric: TrendMetric) => void;
  setLedgerMeasure: (measure: LedgerMeasure) => void;
  setGeoMeasure: (measure: GeoMeasure) => void;
  setHyperMeasure: (measure: HyperMeasure) => void;
  setTrendScroll: (offset: number) => void;
  setTrendFocus: (id: string | null) => void;
  setTrendScale: (scale: "shared" | "own") => void;
  /** Pick the stack's window. It CLEARS any committed range — a window IS a range statement, the
   *  Trends document's own rule for its zoom pills. */
  setTrendWindow: (window: ZoomId) => void;
  setTrendRange: (range: { fromMs: number; toMs: number } | null) => void;
  /** Publish the ranked roster (see `trendIds`). Pass a fresh array only on a content change. */
  setTrendIds: (ids: readonly string[]) => void;
  // THEME (light/dark spec §2). Unlike the network (a frozen page parameter), theme is genuine
  // runtime state: the resolved value drives the Engine's colour re-thread and any component
  // that renders theme-conditionally. ONE writer: ThemeController. `theme` boots "dark" (the
  // SSR-safe default); the controller corrects it on mount before the engine constructs.
  themePref: ThemePref;
  theme: Theme;
  setTheme: (pref: ThemePref, resolved: Theme) => void;
}

// Keep the exact-snapshot cache bounded (one small object per ordinal); drop the oldest.
const EXACT_MAX = 120;
const DEEP_MAX = 24;

export const useStore = create<AppState>((set) => ({
  live: false,
  lastGoodAt: null,
  engineReady: false,
  sceneReady: false,
  engineFailed: false,
  nodes: { l0: 0, l1: 0 },
  metagraphs: 0,
  latestSnapshot: null,
  activity: null,
  mode: "hyper",
  docPage: null,
  logSeek: null,
  docStageReady: true,
  docClosing: false,
  filter: "all",
  metaList: [],
  inspect: null,
  snap: null,
  metaSnap: null,
  tickNet: null,
  selStack: [],
  hoverSnapOrd: null,
  hoverMetaSnap: null,
  hoverFilter: null,
  hoverNodeId: null,
  hoverCountry: null,
  hoverCohort: null,
  hoverGroup: null,
  following: false,
  hover: null,
  country: null,
  cohort: null,
  composition: null,
  leaderboard: null,
  selNodes: [],
  allNodes: [],
  snapshotExact: {},
  exactMiss: {},
  metaSnapDeep: {},
  deepWanted: null,
  phoneDock: null,
  section: "scene",
  rawReturnMode: null,
  rawReturnFocus: null,
  railsHidden: false,
  sceneDragging: false,
  cameraFlying: false,
  sceneMoving: false,
  motionCause: null,
  motionPhase: null,
  gatherBottom: null,
  railCollapse: {},
  navQuiet: false,
  focusRung: null,
  trendCursorMs: null,
  trendMetric: "snapshots",
  ledgerMeasure: "fee",
  geoMeasure: "nodes",
  hyperMeasure: "nodes",
  trendScroll: 0,
  trendFocus: null,
  trendScale: "shared",
  // 30 days by default (user, 2026-09-29): recent enough to read day by day, long enough to show a
  // trend. The pills reach back to ALL.
  trendWindow: "30d" as ZoomId,
  trendRange: null,
  trendIds: [],
  phoneSheetPx: null,
  sceneCoverL: 0,
  sceneCoverR: 0,
  sceneCoverBExplore: 0,
  sceneCoverBDetails: 0,
  sceneCoverBVitals: 0,
  boxedCard: null,
  themePref: "system" as ThemePref,
  theme: "dark" as Theme,

  setLive: (live, lastGoodAt) => set((s) => ({ live, lastGoodAt: lastGoodAt ?? s.lastGoodAt })),
  setEngineReady: (engineReady) => set({ engineReady }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setEngineFailed: (engineFailed) => set({ engineFailed }),
  setNodes: (l0, l1) => set({ nodes: { l0, l1 } }),
  setMetagraphs: (metagraphs) => set({ metagraphs }),
  setLatestSnapshot: (latestSnapshot) => set({ latestSnapshot }),
  setActivity: (activity) => set({ activity }),
  // A view switch CLOSES any open doc overlay: the switch is a statement of where you want to
  // be, and the two publish to one address bar (RouteSync derives the path from doc ?? mode).
  // Closing (either route) arms `docClosing` — the doc's exit animation is its OUT phase, and
  // the engine waits on it before entering the destination view.
  // A view switch is a LOUD navigation (the no-pop rule rolls view-scoped content on arrival),
  // so it clears any standing quiet mark from a rail gesture. `trendFocus` clears with it — it's
  // view-scoped, like the other ladder levels; `trendCursorMs` does NOT (an instant is a
  // universal subject and carries, the way `node` and `network` do in `LEVEL_CARRY`).
  // A view switch stamps its own motion cause (the hint says what it builds).
  setMode: (mode) => set((s) => ({ mode, navQuiet: false, docPage: null, docClosing: s.docPage != null || s.docClosing, trendFocus: null, rawReturnMode: null, motionCause: { kind: "view", from: s.mode, to: mode } })),
  // Opening a doc also SURFACES THE SCENE POSE: the overlay sits at z-8, under the raw layer's
  // z-9 — a doc opened from the RAW pose rendered beneath the still-interactive table, with the
  // RAW toggle that could exit it hidden by the doc's own control gating (review find,
  // 2026-09-05). The doc covers the SCENE by design, so the pose comes home with it.
  setDocPage: (docPage) =>
    set((s) => ({
      docPage,
      section: docPage != null ? "scene" : s.section,
      docClosing: docPage == null ? s.docPage != null || s.docClosing : false,
    })),
  setDocStageReady: (docStageReady) => set({ docStageReady }),
  setDocClosing: (docClosing) => set({ docClosing }),
  setLogSeek: (logSeek) => set({ logSeek }),
  // Committing a network IS a user gesture (user, 2026-08-14 — changing the filter or paging
  // the dossier left the snapshot card as the box): it bumps the recency stack like every
  // other selection, so the facts rail focuses the metagraph card. "all" clears the entry.
  setFilter: (filter) => set((s) => ({ filter, selStack: bumpStack(s.selStack, "network", filter !== "all" || !!s.tickNet) })),
  setMetaList: (metaList) => set({ metaList }),
  setInspect: (inspect) => set((s) => ({ inspect, selStack: bumpStack(s.selStack, "node", !!inspect) })),
  setSnap: (snap) => set((s) => ({ snap, selStack: bumpStack(s.selStack, "snap", !!snap) })),
  // FollowController's heartbeat advance: re-point the followed snapshot WITHOUT bumping the
  // selection recency — a tick is not a user act, and the facts rail's collapse rule reads
  // `selStack` recency (item 8, 2026-08-06). Present-but-unranked: appended at the END if absent.
  advanceSnap: (snap) =>
    set((s) => ({
      snap,
      // A NEW tick arriving is an ARRIVAL, never part of a quiet gesture — it lifts the
      // navQuiet provenance so the loud default governs the next title freeze (review find,
      // 2026-09-11: this path bypasses applyClickActions, the flag's usual reset, so a stale
      // quiet from a manual expand suppressed every later live-advance roll). Same-ordinal
      // re-points leave the flag alone — a poll is not an arrival.
      navQuiet: snap && s.snap?.data.ordinal !== snap.data.ordinal ? false : s.navQuiet,
      selStack: !snap
        ? s.selStack.filter((x) => x !== "snap")
        : s.selStack.includes("snap")
          ? s.selStack
          : [...s.selStack, "snap"],
    })),
  setMetaSnap: (metaSnap) => set((s) => ({ metaSnap, selStack: bumpStack(s.selStack, "metaSnap", !!metaSnap) })),
  // A NO-OP WRITE IS A NO-OP REFERENCE: the Engine's subscription re-resolves the chamber's lens
  // and the camera on a change, so re-committing the same network in the same tick (a tile under
  // an already-open network) must not hand it a fresh object.
  setTickNet: (tickNet) =>
    set((s) =>
      sameTickNet(s.tickNet, tickNet)
        ? s
        : { tickNet, selStack: bumpStack(s.selStack, "network", !!tickNet || s.filter !== "all") },
    ),
  advanceMetaSnap: (metaSnap) =>
    set((s) => ({
      metaSnap,
      // Same arrival rule as advanceSnap above — identity is metaId+ordinal (sameMetaSnap's).
      navQuiet:
        metaSnap && !(s.metaSnap && s.metaSnap.metaId === metaSnap.metaId && s.metaSnap.ordinal === metaSnap.ordinal)
          ? false
          : s.navQuiet,
      selStack: !metaSnap
        ? s.selStack.filter((x) => x !== "metaSnap")
        : s.selStack.includes("metaSnap")
          ? s.selStack
          : [...s.selStack, "metaSnap"],
    })),
  setHoverSnapOrd: (hoverSnapOrd) => set({ hoverSnapOrd }),
  setHoverMetaSnap: (hoverMetaSnap) => set({ hoverMetaSnap }),
  setHoverFilter: (hoverFilter) => set({ hoverFilter }),
  setHoverNodeId: (hoverNodeId) => set({ hoverNodeId }),
  setHoverCountry: (hoverCountry) => set({ hoverCountry }),
  setHoverCohort: (hoverCohort) => set({ hoverCohort }),
  setHoverGroup: (hoverGroup) => set({ hoverGroup }),
  setFollowing: (following) => set({ following }),
  setHover: (hover) => set({ hover }),
  setCountry: (country) => set((s) => ({ country, selStack: bumpStack(s.selStack, "country", !!country) })),
  setCohort: (cohort) => set((s) => ({ cohort, selStack: bumpStack(s.selStack, "cohort", !!cohort) })),
  setComposition: (composition) =>
    set((s) => ({ composition, selStack: bumpStack(s.selStack, "composition", !!composition) })),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  setSelNodes: (selNodes) => set({ selNodes }),
  setAllNodes: (allNodes) => set({ allNodes }),
  setSnapshotExact: (data) =>
    set((s) => {
      if (s.snapshotExact[data.ordinal]) return {}; // immutable per ordinal — keep the first
      const next = { ...s.snapshotExact, [data.ordinal]: data };
      const keys = Object.keys(next);
      if (keys.length > EXACT_MAX) {
        // Integer-like object keys iterate in numeric order, not insertion order — sort to be safe.
        for (const k of keys
          .map(Number)
          .sort((a, b) => a - b)
          .slice(0, keys.length - EXACT_MAX)) {
          delete next[k];
        }
      }
      // A landed read supersedes any recorded miss for its ordinal — the give-up state must
      // never outlive the data it was giving up on.
      if (s.exactMiss[data.ordinal] == null) return { snapshotExact: next };
      const miss = { ...s.exactMiss };
      delete miss[data.ordinal];
      return { snapshotExact: next, exactMiss: miss };
    }),
  setExactMiss: (ordinal) =>
    set((s) => {
      // Bounded like the data it shadows: keep only the newest EXACT_MAX miss stamps.
      const next = { ...s.exactMiss, [ordinal]: Date.now() };
      const keys = Object.keys(next);
      if (keys.length > EXACT_MAX) {
        for (const k of keys
          .map(Number)
          .sort((a, b) => a - b)
          .slice(0, keys.length - EXACT_MAX)) {
          delete next[k];
        }
      }
      return { exactMiss: next };
    }),
  setMetaSnapDeep: (d, key) => set((s) => {
    key ??= metaSnapDeepKey(d.globalOrdinal, d.metaId, d.ordinal);
    if (s.metaSnapDeep[key]) return {}; // a decoded snapshot is immutable
    const next = { ...s.metaSnapDeep, [key]: d };
    const keys = Object.keys(next);
    if (keys.length > DEEP_MAX) delete next[keys[0]];
    return { metaSnapDeep: next };
  }),
  setDeepWanted: (deepWanted) => set({ deepWanted }),
  // Fully closing the dock also drops the drag-chosen sheet height, so the next open starts at
  // the default; switching halves (a non-null → non-null transition) keeps it.
  setPhoneDock: (phoneDock) => set(phoneDock === null ? { phoneDock, phoneSheetPx: null } : { phoneDock }),
  // Closing the raw layer RETURNS to the view a door left (see `rawReturnMode`): the mode step a
  // door took is undone here, with the same arrival the bar's switch would announce, and the
  // view's own state (a focus, a range) is left as it was — this is a return, not a new visit.
  setSection: (section) =>
    set((s) => {
      const back = section === "scene" ? s.rawReturnMode : null;
      return back != null && back !== s.mode
        ? {
            section,
            mode: back,
            rawReturnMode: null,
            // The plane that was in front comes back with the view, as the card it names.
            trendFocus: s.rawReturnFocus,
            rawReturnFocus: null,
            selStack: s.rawReturnFocus != null ? bumpStack(s.selStack, "network", true) : s.selStack,
            motionCause: { kind: "view", from: s.mode, to: back },
          }
        : { section, rawReturnMode: section === "scene" ? null : s.rawReturnMode };
    }),
  setRawReturnMode: (rawReturnMode, focus = null) => set({ rawReturnMode, rawReturnFocus: focus }),
  setRailsHidden: (railsHidden) => set({ railsHidden }),
  setSceneDragging: (sceneDragging) => set({ sceneDragging }),
  setCameraFlying: (cameraFlying) => set({ cameraFlying }),
  setSceneMoving: (sceneMoving) => set({ sceneMoving }),
  setMotionPhase: (motionPhase) => set({ motionPhase }),
  setGatherBottom: (gatherBottom) => set({ gatherBottom }),
  setMotionCause: (motionCause) => set({ motionCause }),
  setNavQuiet: (navQuiet) => set({ navQuiet }),
  setRailCollapse: (id, collapsed) =>
    set((s) => {
      const railCollapse = { ...s.railCollapse };
      if (collapsed === null) delete railCollapse[id];
      else railCollapse[id] = collapsed;
      return { railCollapse };
    }),
  // The batch form of setRailCollapse, same null-returns-a-slot-to-auto semantics — so
  // "collapse all" / "expand all" / the clear-all reset are each ONE store write.
  setRailCollapseMany: (entries) =>
    set((s) => {
      const railCollapse = { ...s.railCollapse };
      for (const [id, collapsed] of Object.entries(entries)) {
        if (collapsed === null) delete railCollapse[id];
        else railCollapse[id] = collapsed;
      }
      return { railCollapse };
    }),
  setPhoneSheetPx: (phoneSheetPx) => set({ phoneSheetPx }),
  // Guarded so a re-measure reporting the same width is a no-op — this fires on every sheet
  // open/close and the Engine reads it per frame.
  setSceneCover: (side, px) =>
    set((s) => {
      const key =
        side === "left" ? "sceneCoverL"
        : side === "right" ? "sceneCoverR"
        : side === "explore" ? "sceneCoverBExplore"
        : side === "details" ? "sceneCoverBDetails"
        : "sceneCoverBVitals";
      return s[key] === px ? s : { [key]: px };
    }),
  setBoxedCard: (boxedCard) => set({ boxedCard }),
  // A fresh object every call — the request is the EVENT, so re-opening the same rung must reach
  // the Engine's reference-compare bridge again.
  // A rail card's framing is a camera flight with no click-table action behind it, so the
  // request stamps its own motion cause — the hint would otherwise show the previous gesture's.
  requestFocusRung: (level) => set({ focusRung: { level }, motionCause: { kind: "rung", level } }),
  // THE CURSOR IS A COMMITTED SUBJECT OF ITS VIEW (2026-09-19), so it takes a place in the
  // recency stack like every other card slot: the facts rail's collapse rule reads `selStack` to
  // decide which present card is the ACTIVE one, and without a rung here the cursor card would
  // rest as an entry under a dossier committed minutes earlier — a click on the timeline that
  // populates a card nobody can see. It is NOT a selection rung (no camera pose, no deselect
  // step, and `setTrendCursor` deliberately stays outside the pickActions table — clearing it is
  // the card's × and nothing cascades), and a SCRUB bumps at most once per bucket, because the
  // timeline is its one writer and quantises there.
  // `navQuiet: false` for the same reason every ordinary commit clears it: an instant ARRIVING is
  // exactly the moment the card's title roll and edge pulse exist to announce, and a stale quiet
  // mark left by an earlier manual expand would swallow the first one.
  setTrendCursor: (ms) =>
    set((s) => ({ trendCursorMs: ms, navQuiet: false, selStack: bumpStack(s.selStack, "instant", ms != null) })),
  // The settings that MOVE the scene stamp their cause (the hint reads it while the stack eases).
  setTrendMetric: (metric) => set({ trendMetric: metric, motionCause: { kind: "measure", id: metric } }),
  setLedgerMeasure: (measure) => set({ ledgerMeasure: measure }),
  setGeoMeasure: (measure) => set({ geoMeasure: measure }),
  setHyperMeasure: (measure) => set({ hyperMeasure: measure }),
  setTrendScroll: (offset) => set({ trendScroll: offset, motionCause: { kind: "page" } }),
  // A plane focus names History's Metagraph card (`trendStack.cardNetwork`, 2026-10-07), so it
  // bumps the network slot as a filter commit does — the card it opens becomes the active one. A
  // release leaves the stack alone: the filter may still hold the card.
  setTrendFocus: (id) => set((s) => ({ trendFocus: id, selStack: id != null ? bumpStack(s.selStack, "network", true) : s.selStack })),
  setTrendScale: (scale) => set({ trendScale: scale }),
  // A window and a range are the SAME statement about what is on screen, so picking one retires
  // the other (the document's zoom pills do exactly this).
  // The RANGE is History's other committed subject (2026-10-07 — the Range card, the Moment's
  // parent), so it takes a place in the recency stack exactly as the cursor does; a window pick
  // retires the range and so drops it.
  setTrendWindow: (trendWindow) =>
    set((s) => ({ trendWindow, trendRange: null, selStack: bumpStack(s.selStack, "range", false), motionCause: { kind: "window", id: trendWindow } })),
  setTrendRange: (trendRange) =>
    set((s) => ({ trendRange, selStack: bumpStack(s.selStack, "range", trendRange != null), motionCause: { kind: "range", span: trendRange } })),
  // Stored BY REFERENCE — the array the publisher hands in is the one the Engine compares with
  // `!==`. No copy, no sort, no normalising: any of those would mint a fresh reference per call
  // and turn a no-op publish into a retarget (see the channel note on `trendIds`).
  // ONE set, so the Engine never sees the new order under the old window: a focus the reader had
  // in front is kept on screen through a re-rank (`scrollToKeep`), and two writes would release the
  // camera's lean and re-apply it in the same tick.
  setTrendIds: (trendIds) => set((s) => ({ trendIds, trendScroll: scrollToKeep(s.trendIds, trendIds, s.trendFocus, s.trendScroll) })),
  setTheme: (pref, resolved) => set({ themePref: pref, theme: resolved }),
}));
