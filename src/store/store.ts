import { create } from "zustand";
import type { GlobalSnapshot } from "@/src/data/types";

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
  activity: Activity | null;
  priceUsd: number | null;

  // Shared network filter ("all" | "l0" | "l1" | <metagraph id>). The filter UI lands
  // in Phase 3; the ribbon already reads it for its per-chip metagraph cue.
  filter: string;
  // The snapshot mirrored by the inspector / highlighted in the ribbon (or null).
  selectedSnapshot: GlobalSnapshot | null;

  setLive: (live: boolean) => void;
  setNodes: (l0: number, l1: number) => void;
  setMetagraphs: (n: number) => void;
  setLatestOrdinal: (ordinal: number) => void;
  setActivity: (activity: Activity | null) => void;
  setPriceUsd: (usd: number | null) => void;
  setFilter: (filter: string) => void;
  setSelectedSnapshot: (snap: GlobalSnapshot | null) => void;
}

export const useStore = create<AppState>((set) => ({
  live: false,
  nodes: { l0: 0, l1: 0 },
  metagraphs: 0,
  latestOrdinal: null,
  activity: null,
  priceUsd: null,
  filter: "all",
  selectedSnapshot: null,

  setLive: (live) => set({ live }),
  setNodes: (l0, l1) => set({ nodes: { l0, l1 } }),
  setMetagraphs: (metagraphs) => set({ metagraphs }),
  setLatestOrdinal: (latestOrdinal) => set({ latestOrdinal }),
  setActivity: (activity) => set({ activity }),
  setPriceUsd: (priceUsd) => set({ priceUsd }),
  setFilter: (filter) => set({ filter }),
  setSelectedSnapshot: (selectedSnapshot) => set({ selectedSnapshot }),
}));
