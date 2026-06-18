import { create } from "zustand";
import type { GlobalSnapshot, LeaderboardData, MetaInfo, PickDescriptor } from "@/src/data/types";

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
  priceUsd: number | null;
  // Baked metagraphs (with engine-computed country counts) — for filter chips + pane.
  metaList: MetaInfo[];
  // The inspector target: a 3D pick (core/l0/l1/metanode) or a clicked snapshot.
  inspect: PickDescriptor | null;
  // Snapshot card follows the latest relevant snapshot (heartbeat live) vs pinned.
  following: boolean;
  // Hover tooltip content (engine raycast); positioned by the Tooltip component.
  hover: { title: string; sub: string } | null;
  // Active "Understand the network" topic (camera focus + layer highlight), or null.
  learnFocus: string | null;
  // Country drill-down within the network filter (geo view), or null.
  country: string | null;
  // Per-country breakdown + distribution score for the active filter (engine-pushed).
  leaderboard: LeaderboardData | null;

  // Active view. The scene is one persistent canvas; the engine morphs between hyper
  // and geo and shows the ledger placeholder, all driven by this.
  mode: "hyper" | "geo" | "ledger";
  // Shared network filter ("all" | "l0" | "l1" | <metagraph id>).
  filter: string;

  setLive: (live: boolean) => void;
  setNodes: (l0: number, l1: number) => void;
  setMetagraphs: (n: number) => void;
  setLatestOrdinal: (ordinal: number) => void;
  setLatestSnapshot: (snap: GlobalSnapshot | null) => void;
  setActivity: (activity: Activity | null) => void;
  setPriceUsd: (usd: number | null) => void;
  setMode: (mode: "hyper" | "geo" | "ledger") => void;
  setFilter: (filter: string) => void;
  setMetaList: (list: MetaInfo[]) => void;
  setInspect: (pick: PickDescriptor | null) => void;
  setFollowing: (following: boolean) => void;
  setHover: (hover: { title: string; sub: string } | null) => void;
  setLearnFocus: (focus: string | null) => void;
  setCountry: (cc: string | null) => void;
  setLeaderboard: (lb: LeaderboardData | null) => void;
}

export const useStore = create<AppState>((set) => ({
  live: false,
  nodes: { l0: 0, l1: 0 },
  metagraphs: 0,
  latestOrdinal: null,
  latestSnapshot: null,
  activity: null,
  priceUsd: null,
  mode: "hyper",
  filter: "all",
  metaList: [],
  inspect: null,
  following: false,
  hover: null,
  learnFocus: null,
  country: null,
  leaderboard: null,

  setLive: (live) => set({ live }),
  setNodes: (l0, l1) => set({ nodes: { l0, l1 } }),
  setMetagraphs: (metagraphs) => set({ metagraphs }),
  setLatestOrdinal: (latestOrdinal) => set({ latestOrdinal }),
  setLatestSnapshot: (latestSnapshot) => set({ latestSnapshot }),
  setActivity: (activity) => set({ activity }),
  setPriceUsd: (priceUsd) => set({ priceUsd }),
  setMode: (mode) => set({ mode }),
  setFilter: (filter) => set({ filter }),
  setMetaList: (metaList) => set({ metaList }),
  setInspect: (inspect) => set({ inspect }),
  setFollowing: (following) => set({ following }),
  setHover: (hover) => set({ hover }),
  setLearnFocus: (learnFocus) => set({ learnFocus }),
  setCountry: (country) => set({ country }),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
}));
