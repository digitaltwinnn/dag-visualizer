// Shapes coming off the (still-vanilla) data layer. Loose where the source is loose.

export interface GlobalSnapshot {
  ordinal: number;
  timestamp: string;
  hash: string;
  height?: number;
  subHeight?: number;
  metagraphSnapshotCount?: number;
  blocks?: unknown[];
}

// Per-tick anchor aggregate from NetworkData.anchorIndex (see getAnchor).
export interface Anchor {
  fee: number; // datum (1 DAG = 1e8 datum)
  count: number; // tracked/identified metagraph snapshots
  metaIds: Set<string>;
  metaCounts: Map<string, number>;
}

export interface GlobalEvent {
  reset?: boolean;
  snapshots?: GlobalSnapshot[];
  snapshot?: GlobalSnapshot;
  latest?: GlobalSnapshot;
}

export interface NodeInfo {
  ip?: string;
  id?: string;
  state?: string;
  layer?: string;
  roles?: string[];
}
export interface GeoInfo {
  city?: string;
  country?: string;
  cc?: string;
  lat?: number;
  lon?: number;
}

// A baked metagraph + the engine-computed country count of its located nodes.
export interface MetaInfo {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  siteUrl?: string;
  color: number;
  nodes: NodeInfo[];
  countriesCount: number;
}

export interface CountryStat {
  cc: string;
  country: string;
  count: number;
}
// Per-country breakdown + distribution score for the active filter (engine-computed).
export interface LeaderboardData {
  countries: CountryStat[];
  score: number | null;
  refId: string | null;
}

// What the inspector renders. Emitted by the engine's picking (core/l0/l1/metanode)
// or set by the ribbon (snapshot). A "meta" descriptor drives the context pane.
export interface PickDescriptor {
  // "cluster" = the Global L0 / DAG L1 context pane (the validator-cluster analogue of
  // the metagraph "meta" pane); `cluster` says which layer.
  kind: "core" | "l0" | "l1" | "metanode" | "snapshot" | "meta" | "cluster";
  cluster?: "l0" | "l1";
  title?: string;
  sub?: string;
  node?: NodeInfo;
  geo?: GeoInfo;
  meta?: MetaInfo;
  cfg?: { id: string; name: string; ticker?: string; color: number; blurb?: string };
  data?: GlobalSnapshot;
}
