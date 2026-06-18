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

// A metagraph + engine-computed geo facts. `nodes` is the full node list (drives the
// context-pane Layers/Nodes/Make-up rows); `located` is how many have a geolocation
// (what the globe can plot — drives the filter chip count / disabled state).
export interface MetaInfo {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  siteUrl?: string;
  color: number;
  nodes: NodeInfo[];
  located: number;
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

export interface MetaCfg {
  id: string;
  name: string;
  ticker?: string;
  color: number;
  blurb?: string;
}

// What the inspector renders. Emitted by the engine's picking (core/l0/l1/metanode)
// or set by the ribbon (snapshot). A "meta" descriptor drives the context pane.
//
// Discriminated on `kind` so each branch carries exactly the fields it needs — the
// consumer (InspectorCard) narrows on `kind` and gets the right shape with no `!`.
interface PickBase {
  title?: string;
  sub?: string;
}
export type PickDescriptor =
  | (PickBase & { kind: "core" })
  | (PickBase & { kind: "l0"; node?: NodeInfo; geo?: GeoInfo })
  | (PickBase & { kind: "l1"; node?: NodeInfo; geo?: GeoInfo })
  | (PickBase & { kind: "metanode"; node?: NodeInfo; geo?: GeoInfo; meta?: MetaInfo })
  | (PickBase & { kind: "snapshot"; data: GlobalSnapshot })
  | (PickBase & { kind: "meta"; cfg: MetaCfg })
  // "cluster" = the Global L0 / DAG L1 context pane (the validator-cluster analogue of
  // the metagraph "meta" pane); `cluster` says which layer.
  | (PickBase & { kind: "cluster"; cluster: "l0" | "l1" });
