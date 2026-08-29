import { create } from "zustand";
import type { GlobalSnapshot, LeaderboardData, MetaInfo, NodeRow, PickDescriptor, SnapshotExact, MetaSnapSel, ChannelSnapDeep } from "@/src/data/types";
import { metaSnapDeepKey } from "@/src/data/types";
import type { HoverSubject } from "@/src/data/hoverSubject";
// Type-only — the store may not import domain VALUES (layerBoundaries rule), but a type-only
// import of a domain type is legal and keeps CohortSel defined in exactly one place.
import type { CohortSel, CompositionSel, FocusLevel } from "@/src/engine/domain/focusLadder";
import type { ThemePref, Theme } from "@/src/theme/resolve";

// The active view. `hyper`/`geo`/`ledger` all drive the 3D scene (every switch among them runs
// the gather choreography); `status`/`transactions`/`staking` are flat scaffolded placeholders
// (the canvas is hidden).
export type Mode = "hyper" | "geo" | "ledger" | "status" | "transactions" | "staking";

// One slot in the right-rail card stack (extend with future card types — e.g. "tx").
export type SelSlot = "network" | "node" | "snap" | "metaSnap" | "country" | "cohort" | "composition";

// Move `slot` to the FRONT of the recency stack when it becomes active, or drop it when cleared.
function bumpStack(stack: SelSlot[], slot: SelSlot, active: boolean): SelSlot[] {
  const without = stack.filter((s) => s !== slot);
  return active ? [slot, ...without] : without;
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
  // Shared network filter ("all" | "dag" | <metagraph id>) — one unified core model, no
  // separate L0/L1 filters (the DAG is just another metagraph-shaped core).
  filter: string;
  // PHONE ONLY: which bottom sheet (if any) is open — "explore" (ExploreRail) or "details"
  // (Inspector), or null when both are closed. Phone has no room to stack two bottom sheets
  // (unlike tablet's two independent side sheets), so this is the single source of truth both
  // docks read `open` from: a dock is open iff `phoneDock === its own id`, and opening one
  // (`setPhoneDock("explore" | "details")`) automatically closes the other by flipping its
  // `open` to false — the two components never need to know about each other. Never set by a
  // scene pick (`setInspect`/`setSnap`) — only by the user tapping a button or dismissing a
  // sheet: tapping the ACTIVE bar half again (toggle), tapping the grabber (`.sheet-grabber`,
  // now a real tap-to-collapse button — see RailDock), or Escape → `setPhoneDock(null)`.
  // (Outside-tap does NOT dismiss it — `onInteractOutside` is `preventDefault`-blocked so the
  // scene/other dock stays interactive underneath.) Unused on tablet/desktop.
  phoneDock: "explore" | "details" | null;
  // Which of the two shell LAYERS is presented (spec 2026-08-01): "scene" = the 3D shell + HUD,
  // "data" = the per-view raw-data table that surfaces out of the scene's depth over it. Written
  // by the command bar's RAW switch (and Escape); SectionShell owns the GSAP timeline that
  // realizes it. UI state, not selection (the selection boundary rule doesn't apply);
  // session-only, like phoneDock.
  section: "scene" | "data";
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
  // Which rail slot is the materialized BOX right now (the expanded card — "context", "node",
  // "snap", …), or null when nothing is boxed. A PRESENTATION channel, written by Inspector
  // from the same state that renders the box, read by the subject callout so the scene label
  // mirrors the box exactly as the camera does (user, 2026-08-15: clicking a committed node's
  // hub re-boxes the metagraph card — the callout must step up with it). Never a selection
  // channel: committing/deselecting stays with the ladder.
  boxedCard: string | null;
  // PHONE ONLY: the bottom sheet's drag-chosen height override in px (null = the default 60vh).
  // Shared by BOTH dock sheets so switching halves keeps the chosen height; reset to null the
  // moment the dock fully closes (`setPhoneDock(null)`) so reopening starts at the default.
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
  // Per-slot rail-card collapse OVERRIDES (slot id → collapsed), written by a user's +/− toggle
  // or the rail-top minimize/expand-all controls. A slot with NO entry falls back to the rail's
  // AUTO default (Inspector: ladder ancestors of the focused rung rest collapsed) — so `null`
  // via setRailCollapse returns a slot to auto. UI state, not selection (the selection boundary
  // rule doesn't apply); session-only, like phoneDock.
  railCollapse: Record<string, boolean>;
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

  setLive: (live: boolean, lastGoodAt?: number) => void;
  setEngineReady: (v: boolean) => void;
  setSceneReady: (v: boolean) => void;
  setEngineFailed: (v: boolean) => void;
  setNodes: (l0: number, l1: number) => void;
  setMetagraphs: (n: number) => void;
  setLatestSnapshot: (snap: GlobalSnapshot | null) => void;
  setActivity: (activity: Activity | null) => void;
  setMode: (mode: Mode) => void;
  setFilter: (filter: string) => void;
  setMetaList: (list: MetaInfo[]) => void;
  setInspect: (pick: PickDescriptor | null) => void;
  setSnap: (snap: Extract<PickDescriptor, { kind: "snapshot" }> | null) => void;
  advanceSnap: (snap: Extract<PickDescriptor, { kind: "snapshot" }> | null) => void;
  setMetaSnap: (sel: MetaSnapSel | null) => void;
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
  setSnapshotExact: (data: SnapshotExact) => void;
  /** Record a FAILED exact read for this ordinal — the acquiring states' give-up signal. */
  setExactMiss: (ordinal: number) => void;
  /** `key` defaults to the decode's own identity; the bridge passes the REQUESTED key when
   *  the route fell back to another entry (an undecodable row asks with ordinal 0). */
  setMetaSnapDeep: (d: ChannelSnapDeep, key?: string) => void;
  setDeepWanted: (key: string | null) => void;
  setPhoneDock: (dock: "explore" | "details" | null) => void;
  setSection: (section: "scene" | "data") => void;
  setRailsHidden: (hidden: boolean) => void;
  setSceneDragging: (dragging: boolean) => void;
  setCameraFlying: (flying: boolean) => void;
  setPhoneSheetPx: (px: number | null) => void;
  /** Publish how many px of the canvas an open rail sheet covers on one side (0 when closed). */
  setSceneCover: (side: "left" | "right", px: number) => void;
  setBoxedCard: (id: string | null) => void;
  setRailCollapse: (id: string, collapsed: boolean | null) => void;
  setRailCollapseMany: (entries: Record<string, boolean | null>) => void;
  /** Ask the Engine to frame this ladder rung (see `focusRung`). One-shot; the Engine reads it
   *  on change and never clears it — the value IS the last request, not a pending queue. */
  requestFocusRung: (level: FocusLevel) => void;
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
  filter: "all",
  metaList: [],
  inspect: null,
  snap: null,
  metaSnap: null,
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
  snapshotExact: {},
  exactMiss: {},
  metaSnapDeep: {},
  deepWanted: null,
  phoneDock: null,
  section: "scene",
  railsHidden: false,
  sceneDragging: false,
  cameraFlying: false,
  railCollapse: {},
  focusRung: null,
  phoneSheetPx: null,
  sceneCoverL: 0,
  sceneCoverR: 0,
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
  setMode: (mode) => set({ mode }),
  // Committing a network IS a user gesture (user, 2026-08-14 — changing the filter or paging
  // the dossier left the snapshot card as the box): it bumps the recency stack like every
  // other selection, so the facts rail focuses the metagraph card. "all" clears the entry.
  setFilter: (filter) => set((s) => ({ filter, selStack: bumpStack(s.selStack, "network", filter !== "all") })),
  setMetaList: (metaList) => set({ metaList }),
  setInspect: (inspect) => set((s) => ({ inspect, selStack: bumpStack(s.selStack, "node", !!inspect) })),
  setSnap: (snap) => set((s) => ({ snap, selStack: bumpStack(s.selStack, "snap", !!snap) })),
  // FollowController's heartbeat advance: re-point the followed snapshot WITHOUT bumping the
  // selection recency — a tick is not a user act, and the facts rail's collapse rule reads
  // `selStack` recency (item 8, 2026-08-06). Present-but-unranked: appended at the END if absent.
  advanceSnap: (snap) =>
    set((s) => ({
      snap,
      selStack: !snap
        ? s.selStack.filter((x) => x !== "snap")
        : s.selStack.includes("snap")
          ? s.selStack
          : [...s.selStack, "snap"],
    })),
  setMetaSnap: (metaSnap) => set((s) => ({ metaSnap, selStack: bumpStack(s.selStack, "metaSnap", !!metaSnap) })),
  advanceMetaSnap: (metaSnap) =>
    set((s) => ({
      metaSnap,
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
  setSection: (section) => set({ section }),
  setRailsHidden: (railsHidden) => set({ railsHidden }),
  setSceneDragging: (sceneDragging) => set({ sceneDragging }),
  setCameraFlying: (cameraFlying) => set({ cameraFlying }),
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
    set((s) =>
      side === "left"
        ? s.sceneCoverL === px
          ? s
          : { sceneCoverL: px }
        : s.sceneCoverR === px
          ? s
          : { sceneCoverR: px },
    ),
  setBoxedCard: (boxedCard) => set({ boxedCard }),
  // A fresh object every call — the request is the EVENT, so re-opening the same rung must reach
  // the Engine's reference-compare bridge again.
  requestFocusRung: (level) => set({ focusRung: { level } }),
  setTheme: (pref, resolved) => set({ themePref: pref, theme: resolved }),
}));
