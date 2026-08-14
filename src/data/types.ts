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
  /** The data transactions inside the blocks — a data metagraph's real payload (batch
   *  commitments etc.); count + decoded values as JSON for the raw tree (2026-08-07). */
  dataTxCount: number;
  dataTx: string;
  /** The data blocks' measured serialized size (Σ block byte lengths) — the same bytes-as-carried
   *  reading `stateBytes` gives the state, so the card's two payload sections share one unit.
   *  Optional because the browser's immutable HTTP cache can serve a pre-field body for up to a
   *  day after deploy — absent is "not in this read", never 0. */
  dataBytes?: number;
}

/** Keyed by tick + address + the snapshot's OWN ordinal (2026-08-07): a fast metagraph batches
 *  many snapshots into one tick — DOR routinely dozens — so (tick, address) alone made every
 *  row of the tick share one decode. */
export const metaSnapDeepKey = (globalOrdinal: number, metaId: string, snapOrdinal: number): string =>
  `${globalOrdinal}:${metaId}:${snapOrdinal}`;

/** The HOVER key of ONE metagraph snapshot (user, 2026-08-09 — hovering a snapshot used to write
 *  the tick channel, so its whole global tick lit up: "it automatically selects all that are in the
 *  same global snapshot; that is not logical"). Keyed by metagraph + its own ordinal, which is
 *  unique across the buffer, so the scene lights exactly one tile and the explorer pairs exactly
 *  one row. Deliberately NOT the deep key: hover is per snapshot, not per (tick, snapshot) decode. */
export const metaSnapHoverKey = (metaId: string, snapOrdinal: number): string =>
  `${metaId}|${snapOrdinal}`;

export interface GlobalSnapshot {
  ordinal: number;
  timestamp: string;
  hash: string;
  height?: number;
  subHeight?: number;
  /** The parent global snapshot's hash — the chain link (present on the explorer feed). */
  lastSnapshotHash?: string;
  epochProgress?: number;
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
  /** Measured size of this snapshot's data blocks (Σ block byte lengths) — 0 when it carried
   *  none, or on rows cached before the field existed (an absent lane, not a reading). */
  dataBytes?: number;
}

// EXACT per-tick anchor totals read straight from the raw L0 snapshot's stateChannelSnapshots
// (every anchored metagraph snapshot carries its own `value.fee`), via /api/snapshot/[ordinal].
// Unlike the polled `Anchor` (a settling floor), this is final + complete the instant it's
// available — it INCLUDES unlisted metagraphs (no directory needed). Served only inside the
// route's ordinal window (app/api/snapshot/ordinalWindow.ts); a tick whose read fails or falls
// outside it stays on the polled floor.
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
  /** How many validators SIGNED the global snapshot (`proofs.length` on the raw L0 read) — the
   *  same Signed[] structure the metagraph snapshots carry, exposed for the snapshot card's
   *  structure rows (item 10, 2026-08-06). 0 on entries cached before the field existed. */
  signerCount?: number;
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
  /** EVERY layer id this machine answers to, primary first — a hybrid runs one process per layer
   *  and each carries its own keypair, so one machine has several peer ids (see the route's
   *  `idsOf`). Signer matching must use this, not `id` alone. */
  ids?: string[];
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
  ids?: string[]; // every layer id (see NodeInfo.ids)
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
  /** Every layer id this machine answers to (NodeInfo.ids) — what signer matching reads, because
   *  a hybrid's dL1 id differs from the l0 id in `id`. Absent for validators, whose clusters
   *  share one id per machine (api.ts `_buildDagCore` merges BY id). */
  ids?: string[];
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
  // A metagraph-snapshot TILE on the ledger's upper floor (redesign 2026-08-04, spec §7.1) — a
  // pickable 3D subject with its own store channel and card slot, not a focus rung. It carries
  // the selection payload plus the GLOBAL tick descriptor it anchored into, so the click table
  // can commit the pair (tile + its tick) without a second lookup.
  | (PickBase & { kind: "metaSnap"; sel: MetaSnapSel; global: Extract<PickDescriptor, { kind: "snapshot" }> });
