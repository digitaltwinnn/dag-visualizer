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

// EXACT per-tick anchor totals read straight from the raw L0 snapshot's stateChannelSnapshots
// (every anchored metagraph snapshot carries its own `value.fee`), via /api/snapshot/[ordinal].
// Unlike the polled `Anchor` (a settling floor), this is final + complete the instant it's
// available — it INCLUDES unlisted metagraphs (no directory needed). Only available while the L0
// node still retains the snapshot (recent ticks); old/pruned ticks fall back to the polled floor.
export interface SnapshotExact {
  ordinal: number;
  anchored: number; // total metagraph snapshots (== metagraphSnapshotCount)
  channels: number; // distinct metagraphs that anchored
  totalFee: number; // datum — EXACT, including unlisted. The fee itself, not derived from anything.
  totalSizeKB: number; // measured serialized size (Σ content byte-array length), NOT derived from fee
  listedFee: number; // datum from metagraphs we track
  unlistedFee: number; // datum from metagraphs outside the public catalog
  listedCount: number;
  unlistedCount: number;
  // Per-metagraph breakdown by address/id → {count, fee}. Addresses matching config.METAGRAPHS are
  // "listed" (named/coloured pills); the rest are the genuinely-unlisted ones (aggregated as
  // unlistedCount). This is the exact, complete answer to "which metagraphs anchored here".
  perMeta: Record<string, { count: number; fee: number }>;
}

// Per-tick anchor aggregate from NetworkData.anchorIndex (see getAnchor).
export interface Anchor {
  fee: number; // datum (1 DAG = 1e8 datum)
  count: number; // tracked/identified metagraph snapshots
  metaIds: Set<string>;
  metaCounts: Map<string, number>;
  touched: number; // ms timestamp this entry's count last changed (for "settling" detection)
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
  isRoot?: boolean; // the DAG core (the root every metagraph anchors into)
}

export interface CountryStat {
  cc: string;
  country: string;
  count: number;
}

// One row in the geo node browser. `pick` is the node's existing inspector descriptor
// (clicking a row reuses the same card as clicking the node on the globe); the rest is
// what the browser groups/labels on. Built by globe.listNodes, pushed via setSelNodes.
export interface NodeRow {
  pick: PickDescriptor;
  label: string;
  id: string | null; // node ID when present (validators); null for id-less metagraph nodes
  cc: string | null;
  country: string | null;
  state?: string | null;
  layer: string;
  roles: string[];
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
  roles?: string[]; // layer(s) the node runs — shown as tooltip tags (hybrids list several)
}
export type PickDescriptor =
  | (PickBase & { kind: "core" })
  | (PickBase & { kind: "l0"; node?: NodeInfo; geo?: GeoInfo })
  | (PickBase & { kind: "l1"; node?: NodeInfo; geo?: GeoInfo })
  // `layer` is the shell the node is plotted in (l0 | dl1 | cl1) — the authoritative
  // per-node layer, used when the raw `node.roles` are absent/incomplete.
  | (PickBase & { kind: "metanode"; node?: NodeInfo; geo?: GeoInfo; meta?: MetaInfo; layer?: string })
  | (PickBase & { kind: "snapshot"; data: GlobalSnapshot })
  | (PickBase & { kind: "meta"; cfg: MetaCfg })
  // "geoLive" = Geography's signature detail card: the selected node's details (or a pick
  // hint). The selection's footprint summary lives in the top-bar vitals. Reads the store
  // itself (no payload).
  | (PickBase & { kind: "geoLive" });
