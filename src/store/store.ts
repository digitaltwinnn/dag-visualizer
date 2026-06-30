import { create } from "zustand";
import type { GlobalSnapshot, LeaderboardData, MetaInfo, NodeRow, PickDescriptor, SnapshotExact } from "@/src/data/types";

// The active view. `hyper`/`geo` drive the 3D scene (morph between them); the rest are flat
// views (the canvas is hidden) — `ledger` has the live ribbon, the others are placeholders.
export type Mode = "hyper" | "geo" | "ledger" | "status" | "transactions" | "staking";

// One slot in the right-rail card stack (extend with future card types — e.g. "tx").
export type SelSlot = "node" | "snap";

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
  // Snapshot card follows the latest relevant snapshot (heartbeat live) vs pinned.
  following: boolean;
  // Hover tooltip content (engine raycast); positioned by the Tooltip component.
  hover: { title: string; sub: string; roles?: string[]; id?: string; color?: string } | null;
  // Active "Understand the network" topic (camera focus + layer highlight), or null.
  learnFocus: string | null;
  // Country drill-down within the network filter (geo view), or null.
  country: string | null;
  // Per-country breakdown + distribution score for the active filter (engine-pushed).
  leaderboard: LeaderboardData | null;
  // The active selection's nodes, for the geo node browser (engine-pushed; [] off geo).
  selNodes: NodeRow[];
  // EXACT per-snapshot totals (fee + listed/unlisted), keyed by ordinal — populated by
  // SnapshotExactBridge from /api/snapshot/[ordinal] for the live + selected ticks, so ANY view
  // can read final fees without the polling floor. Missing key = not fetched / unavailable (pruned).
  snapshotExact: Record<number, SnapshotExact>;

  // Active view. The scene is one persistent canvas; the engine morphs between hyper
  // and geo and hides it for the flat views, all driven by this.
  mode: Mode;
  // Shared network filter ("all" | "dag" | <metagraph id>) — one unified core model, no
  // separate L0/L1 filters (the DAG is just another metagraph-shaped core).
  filter: string;

  setLive: (live: boolean) => void;
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
  setFollowing: (following: boolean) => void;
  setHover: (
    hover: { title: string; sub: string; roles?: string[]; id?: string; color?: string } | null,
  ) => void;
  setLearnFocus: (focus: string | null) => void;
  setCountry: (cc: string | null) => void;
  setLeaderboard: (lb: LeaderboardData | null) => void;
  setSelNodes: (nodes: NodeRow[]) => void;
  setSnapshotExact: (data: SnapshotExact) => void;
}

// Keep the exact-snapshot cache bounded (one small object per ordinal); drop the oldest.
const EXACT_MAX = 120;

export const useStore = create<AppState>((set) => ({
  live: false,
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
  following: false,
  hover: null,
  learnFocus: null,
  country: null,
  leaderboard: null,
  selNodes: [],
  snapshotExact: {},

  setLive: (live) => set({ live }),
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
  setFollowing: (following) => set({ following }),
  setHover: (hover) => set({ hover }),
  setLearnFocus: (learnFocus) => set({ learnFocus }),
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
}));
