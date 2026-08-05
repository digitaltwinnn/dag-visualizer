// Shapes coming off the data layer (src/data/api.ts, typed). Loose where the source is loose.

/** The full decode of ONE anchored metagraph snapshot (spec §7.3). Fetched only on a deliberate
 *  gesture — it re-downloads the ~2.5 MB global to reach one entry. */
export interface ChannelSnapDeep {
  globalOrdinal: number;
  metaId: string;
  ordinal: number;
  height: number;
  subHeight: number;
  epochProgress: number;
  lastSnapshotHash: string;
  fee: number;
  bytes: number;
  blocks: number;
  signers: string[];
  stateKeys: { key: string; count: number }[];
  stateBytes: number;
  stateProof: string | null;
  state: string;
  dataBlockSigners: string[];
}

export const metaSnapDeepKey = (globalOrdinal: number, metaId: string): string => `${globalOrdinal}:${metaId}`;

export interface GlobalSnapshot {
  ordinal: number;
  timestamp: string;
  hash: string;
  height?: number;
  subHeight?: number;
  metagraphSnapshotCount?: number;
  blocks?: unknown[];
}

/** One anchored metagraph snapshot inside a global tick, from the exact read (spec §7.2 tier 2). */
export interface ChannelSnapRow {
  metaId: string;      // the state-channel address
  ordinal: number;     // the metagraph snapshot's own ordinal (0 when the payload can't be decoded)
  decoded: boolean;
  fee: number;
  bytes: number;
  signers: string[];   // truncated validator ids
  blocks: number;
  hasState: boolean;
  stateBytes: number;
  stateProof: string | null;
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
  rewardsDatum: number; // total rewards distributed by this snapshot, in datum (0 if absent/unverified)
  listedFee: number; // datum from metagraphs we track
  unlistedFee: number; // datum from metagraphs outside the public catalog
  listedCount: number;
  unlistedCount: number;
  // Per-metagraph breakdown by address/id → {count, fee, bytes}. Addresses matching config.METAGRAPHS
  // are "listed" (named/coloured pills); the rest are the genuinely-unlisted ones (aggregated as
  // unlistedCount). This is the exact, complete answer to "which metagraphs anchored here". `bytes`
  // is that metagraph's measured serialized size (Σ content byte length), shown as KB on the
  // expanded row — NOT derived from the fee.
  perMeta: Record<string, { count: number; fee: number; bytes: number }>;
  rows: ChannelSnapRow[];
}

/** A selected METAGRAPH SNAPSHOT — a tile on the upper floor (redesign 2026-08-04, spec §7.1).
 *  A card SLOT, not a focus-ladder rung: like the global snapshot it has its own store channel
 *  and a fixed rail slot, and appears in no LADDER. `metaId` is the metagraph's id, which IS its
 *  state-channel address, so it keys `SnapshotExact.perMeta` directly. */
export interface MetaSnapSel {
  metaId: string;
  ordinal: number;       // the metagraph snapshot's OWN ordinal
  hash: string;
  globalOrdinal: number; // the global tick it anchored into
  ts: string;            // that tick's timestamp — the anchor join
}

/** Whether a metagraph's own token is moving — the ledger's currency-gutter status (spec §6.7). */
export interface CurrencyActivity {
  metaId: string;
  state: "active" | "dormant" | "none";
  lastTs: string | null;
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
  reset: boolean;
  snapshots?: GlobalSnapshot[];
  snapshot?: GlobalSnapshot;
  latest: GlobalSnapshot | null;
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
  // Hosting provider, from the same IP lookup (ip-api `isp` + the ASN prefix of `as`;
  // ipwho.is `connection.isp/asn` on the https fallback). Absent = unknown host.
  isp?: string;
  asn?: string;
}

export type GeoMap = Record<string, GeoInfo>;

// A validator node from the NetworkData `cluster` event (always carries an IP).
export interface ClusterNode {
  ip: string;
  state?: string;
  id?: string;
}

// A metagraph as returned by /api/metagraphs (the shape the globe + meta list read).
export interface RouteNode {
  ip: string;
  state?: string;
  layer?: string;
  roles?: string[];
  id?: string;
}
export interface RouteMetagraph {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  siteUrl?: string;
  iconUrl?: string;
  nodes: RouteNode[];
}

// The DAG modelled as a metagraph-shaped core (api.ts `_buildDagCore`): the L0+L1 validator
// clusters merged by node id into one node-list with `roles` (a hybrid runs several layers).
export interface DagCore {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  isRoot?: boolean;
  color: number;
  nodes: RouteNode[];
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
  iconUrl?: string;
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
  city: string | null; // resolved city — the row's location-first primary (country = the group)
  state?: string | null;
  layer: string;
  roles: string[];
}
// Per-country breakdown for the active filter (engine-computed).
export interface LeaderboardData {
  countries: CountryStat[];
}

export interface MetaCfg {
  id: string;
  name: string;
  ticker?: string;
  color: number;
  blurb?: string;
  iconUrl?: string; // logo for cores not in the live metaList (e.g. the DAG core)
  siteUrl?: string; // site for cores not in the live metaList (e.g. the DAG core)
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
  | (PickBase & { kind: "geoLive" })
  // A settlement-stack LAYER, selected from the Snapshots·Explore panel or a 3D floor plane.
  // Carries ONLY the id (matching domain/ledgerLayout's LAYER_GEOM) — the display name/description
  // are UI copy, resolved through src/data/ledgerLayers.ts by every surface that shows words.
  | (PickBase & { kind: "layer"; layerId: string });
