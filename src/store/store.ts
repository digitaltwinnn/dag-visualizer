import { create } from "zustand";
import type { GlobalSnapshot, LeaderboardData, MetaInfo, NodeRow, PickDescriptor, SnapshotExact, MetaSnapSel, ChannelSnapDeep } from "@/src/data/types";
import { metaSnapDeepKey } from "@/src/data/types";
import type { HoverSubject } from "@/src/data/hoverSubject";
// Type-only — the store may not import domain VALUES (layerBoundaries rule), but a type-only
// import of a domain type is legal and keeps CohortSel defined in exactly one place.
import type { CohortSel, CompositionSel } from "@/src/engine/domain/focusLadder";

// The active view. `hyper`/`geo`/`ledger` all drive the 3D scene (every switch among them runs
// the gather choreography); `status`/`transactions`/`staking` are flat scaffolded placeholders
// (the canvas is hidden).
export type Mode = "hyper" | "geo" | "ledger" | "status" | "transactions" | "staking";

// One slot in the right-rail card stack (extend with future card types — e.g. "tx").
export type SelSlot = "node" | "snap" | "metaSnap" | "country" | "cohort" | "composition";

// Move `slot` to the FRONT of the recency stack when it becomes active, or drop it when cleared.
function bumpStack(stack: SelSlot[], slot: SelSlot, active: boolean): SelSlot[] {
  const without = stack.filter((s) => s !== slot);
  return active ? [slot, ...without] : without;
}

// Per-hour rates + per-snapshot series from NetworkData.getActivity().
export interface Activity {
  snapsPerHour: number;
  anchorsPerHour: number;
  blocksPerHour: number;
  feesPerHour: number;
  cadenceSeries: number[];
  anchoredSeries: number[];
  blocksSeries: number[];
  feesSeries: number[];
}

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
  latestOrdinal: number | null;
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
  // can read final fees without the polling floor. Missing key = not fetched / unavailable (pruned).
  snapshotExact: Record<number, SnapshotExact>;
  // Deep channel reads (full decode of one metagraph snapshot), keyed by metaSnapDeepKey(globalOrdinal, metaId).
  // Immutably cached — fetched from /api/snapshot/[ordinal]/channel/[address] on explicit gesture,
  // never on poll or mass reads.
  metaSnapDeep: Record<string, ChannelSnapDeep>;

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
  // DESKTOP ONLY (card-redesign follow-up, 2026-08-08): per-rail COLLAPSE-TO-THREAD — the rail's
  // cards fade out (visibility-hidden, layout preserved so the thread's dots keep measuring and
  // remain as the minimized rail/possibility map); the rail-top chevron is the only control.
  // UI state like `section`, session-only, not selection.
  railHiddenLeft: boolean;
  railHiddenRight: boolean;
  // TRUE while the user is DIRECTLY manipulating the scene (OrbitControls' `start`→`end`, which
  // fire on real pointer/touch/wheel input only — Engine tweens and programmatic camera moves
  // never set this). The rails dim while it holds, so direct manipulation pushes the HUD back
  // without moving any layout. Written by the Engine (debounced on the trailing edge).
  sceneDragging: boolean;
  // PHONE ONLY: whether the top bar's vitals row is expanded (the bar grows downward by one
  // full-width row showing the active view's vitals). A USER CHOICE that persists across view
  // switches (the row's CONTENT swaps per view; only the user's toggle opens/closes it) —
  // session-only, like `phoneDock` (no localStorage). Unused on tablet/desktop (vitals inline).
  phoneVitals: boolean;
  // PHONE ONLY: the bottom sheet's drag-chosen height override in px (null = the default 60vh).
  // Shared by BOTH dock sheets so switching halves keeps the chosen height; reset to null the
  // moment the dock fully closes (`setPhoneDock(null)`) so reopening starts at the default.
  phoneSheetPx: number | null;
  // Per-slot rail-card collapse OVERRIDES (slot id → collapsed), written by a user's +/− toggle
  // or the rail-top minimize/expand-all controls. A slot with NO entry falls back to the rail's
  // AUTO default (Inspector: ladder ancestors of the focused rung rest collapsed) — so `null`
  // via setRailCollapse returns a slot to auto. UI state, not selection (the selection boundary
  // rule doesn't apply); session-only, like phoneDock.
  railCollapse: Record<string, boolean>;

  setLive: (live: boolean, lastGoodAt?: number) => void;
  setEngineReady: (v: boolean) => void;
  setSceneReady: (v: boolean) => void;
  setEngineFailed: (v: boolean) => void;
  setNodes: (l0: number, l1: number) => void;
  setMetagraphs: (n: number) => void;
  setLatestOrdinal: (ordinal: number) => void;
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
  /** `key` defaults to the decode's own identity; the bridge passes the REQUESTED key when
   *  the route fell back to another entry (an undecodable row asks with ordinal 0). */
  setMetaSnapDeep: (d: ChannelSnapDeep, key?: string) => void;
  setPhoneDock: (dock: "explore" | "details" | null) => void;
  setSection: (section: "scene" | "data") => void;
  setRailHidden: (side: "left" | "right", hidden: boolean) => void;
  setSceneDragging: (dragging: boolean) => void;
  setPhoneVitals: (open: boolean) => void;
  setPhoneSheetPx: (px: number | null) => void;
  setRailCollapse: (id: string, collapsed: boolean | null) => void;
  setRailCollapseMany: (entries: Record<string, boolean | null>) => void;
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
  latestOrdinal: null,
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
  metaSnapDeep: {},
  phoneDock: null,
  section: "scene",
  railHiddenLeft: false,
  railHiddenRight: false,
  sceneDragging: false,
  phoneVitals: false,
  railCollapse: {},
  phoneSheetPx: null,

  setLive: (live, lastGoodAt) => set((s) => ({ live, lastGoodAt: lastGoodAt ?? s.lastGoodAt })),
  setEngineReady: (engineReady) => set({ engineReady }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setEngineFailed: (engineFailed) => set({ engineFailed }),
  setNodes: (l0, l1) => set({ nodes: { l0, l1 } }),
  setMetagraphs: (metagraphs) => set({ metagraphs }),
  setLatestOrdinal: (latestOrdinal) => set({ latestOrdinal }),
  setLatestSnapshot: (latestSnapshot) => set({ latestSnapshot }),
  setActivity: (activity) => set({ activity }),
  setMode: (mode) => set({ mode }),
  setFilter: (filter) => set({ filter }),
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
      return { snapshotExact: next };
    }),
  setMetaSnapDeep: (d, key) => set((s) => {
    key ??= metaSnapDeepKey(d.globalOrdinal, d.metaId, d.ordinal);
    if (s.metaSnapDeep[key]) return {}; // a decoded snapshot is immutable
    const next = { ...s.metaSnapDeep, [key]: d };
    const keys = Object.keys(next);
    if (keys.length > DEEP_MAX) delete next[keys[0]];
    return { metaSnapDeep: next };
  }),
  // Fully closing the dock also drops the drag-chosen sheet height, so the next open starts at
  // the default; switching halves (a non-null → non-null transition) keeps it.
  setPhoneDock: (phoneDock) => set(phoneDock === null ? { phoneDock, phoneSheetPx: null } : { phoneDock }),
  setSection: (section) => set({ section }),
  setRailHidden: (side, hidden) => set(side === "left" ? { railHiddenLeft: hidden } : { railHiddenRight: hidden }),
  setSceneDragging: (sceneDragging) => set({ sceneDragging }),
  setPhoneVitals: (phoneVitals) => set({ phoneVitals }),
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
}));
