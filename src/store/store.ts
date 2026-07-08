import { create } from "zustand";
import type { GlobalSnapshot, LeaderboardData, MetaInfo, NodeRow, PickDescriptor, SnapshotExact } from "@/src/data/types";
import type { HoverSubject } from "@/src/data/hoverSubject";

// The active view. `hyper`/`geo` drive the 3D scene (morph between them); the rest are flat
// views (the canvas is hidden) — `ledger` has the live ribbon, the others are placeholders.
export type Mode = "hyper" | "geo" | "ledger" | "status" | "transactions" | "staking";

// One slot in the right-rail card stack (extend with future card types — e.g. "tx").
export type SelSlot = "node" | "snap" | "layer";

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
  // Ledger layer id (LedgerView FLOOR_LAYERS: "ml1"|"ml0"|"msnap"|"gl0"|"hypl0"|"hypl1") the cursor
  // is HOVERING in the Snapshots·Explore panel — a transient plane-highlight PREVIEW (the committed
  // selection is `layer` below; the engine resolves `ledgerHilite ?? layer?.layerId`). null = none.
  ledgerHilite: string | null;
  // The COMMITTED layer selection (clicked in the explore panel) — opens the layer card in the
  // right rail and keeps its plane highlighted. A selStack slot like `inspect`/`snap`.
  layer: Extract<PickDescriptor, { kind: "layer" }> | null;
  // Snapshot card follows the latest relevant snapshot (heartbeat live) vs pinned.
  following: boolean;
  // The lean hover-tooltip subject for the currently-hovered 3D object (identity ticker + short
  // name + hue). Set by the engine raycast only when the hovered target changes. null = nothing.
  hover: HoverSubject | null;
  // Country drill-down within the network filter (geo view), or null.
  country: string | null;
  // Per-country breakdown + distribution score for the active filter (engine-pushed).
  leaderboard: LeaderboardData | null;
  // The active selection's nodes, for the geo node browser (engine-pushed; [] off geo).
  selNodes: NodeRow[];
  // EXACT per-snapshot totals (fee + listed/unlisted), keyed by ordinal — populated by
  // RawSnapshotBridge from /api/snapshot/[ordinal] for the live + selected ticks, so ANY view
  // can read final fees without the polling floor. Missing key = not fetched / unavailable (pruned).
  snapshotExact: Record<number, SnapshotExact>;

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
  // PHONE ONLY: whether the top bar's vitals row is expanded (the bar grows downward by one
  // full-width row showing the active view's vitals). A USER CHOICE that persists across view
  // switches (the row's CONTENT swaps per view; only the user's toggle opens/closes it) —
  // session-only, like `phoneDock` (no localStorage). Unused on tablet/desktop (vitals inline).
  phoneVitals: boolean;
  // PHONE ONLY: the bottom sheet's drag-chosen height override in px (null = the default 60vh).
  // Shared by BOTH dock sheets so switching halves keeps the chosen height; reset to null the
  // moment the dock fully closes (`setPhoneDock(null)`) so reopening starts at the default.
  phoneSheetPx: number | null;

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
  setHoverSnapOrd: (ordinal: number | null) => void;
  setHoverFilter: (filter: string | null) => void;
  setHoverNodeId: (id: string | null) => void;
  setLedgerHilite: (id: string | null) => void;
  setLayer: (layer: Extract<PickDescriptor, { kind: "layer" }> | null) => void;
  setFollowing: (following: boolean) => void;
  setHover: (hover: HoverSubject | null) => void;
  setCountry: (cc: string | null) => void;
  setLeaderboard: (lb: LeaderboardData | null) => void;
  setSelNodes: (nodes: NodeRow[]) => void;
  setSnapshotExact: (data: SnapshotExact) => void;
  setPhoneDock: (dock: "explore" | "details" | null) => void;
  setPhoneVitals: (open: boolean) => void;
  setPhoneSheetPx: (px: number | null) => void;
}

// Keep the exact-snapshot cache bounded (one small object per ordinal); drop the oldest.
const EXACT_MAX = 120;

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
  selStack: [],
  hoverSnapOrd: null,
  hoverFilter: null,
  hoverNodeId: null,
  ledgerHilite: null,
  layer: null,
  following: false,
  hover: null,
  country: null,
  leaderboard: null,
  selNodes: [],
  snapshotExact: {},
  phoneDock: null,
  phoneVitals: false,
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
  setHoverSnapOrd: (hoverSnapOrd) => set({ hoverSnapOrd }),
  setHoverFilter: (hoverFilter) => set({ hoverFilter }),
  setHoverNodeId: (hoverNodeId) => set({ hoverNodeId }),
  setLedgerHilite: (ledgerHilite) => set({ ledgerHilite }),
  setLayer: (layer) => set((s) => ({ layer, selStack: bumpStack(s.selStack, "layer", !!layer) })),
  setFollowing: (following) => set({ following }),
  setHover: (hover) => set({ hover }),
  setCountry: (country) => set({ country }),
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
  // Fully closing the dock also drops the drag-chosen sheet height, so the next open starts at
  // the default; switching halves (a non-null → non-null transition) keeps it.
  setPhoneDock: (phoneDock) => set(phoneDock === null ? { phoneDock, phoneSheetPx: null } : { phoneDock }),
  setPhoneVitals: (phoneVitals) => set({ phoneVitals }),
  setPhoneSheetPx: (phoneSheetPx) => set({ phoneSheetPx }),
}));
