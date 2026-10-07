// ONE LIST PER LADDER LEVEL (user, 2026-10-07 — `docs/superpowers/specs/2026-10-07-one-list-per-level-design.md`).
// Each function answers one level's question: which subjects it holds, in which order. The
// explorer lists that list, the rail's next ghost opens its first item, and the card's ‹ › pager
// steps through it — so the three can never disagree about what is under a card. They did: the
// rail kept its own copies, and four had drifted (countries by node count while the explorer
// sorted by the picked figure, …).
//
// Pure: plain values in, plain subjects out — no React, no store, no singleton reads. A level's
// ROW (glyph, bar, click) is the explorer's business; a level's STEP (label, actions) is the
// rail's. Only membership and order live here.
import { buildChannelLog, type AnchorLogRow } from "./anchorLog";
import type { MetaSnapRecord } from "./api";
import { countryMeasure, networkOfRow, type GeoMeasure } from "./geoMeasure";
import { hoverKeyOf } from "./hoverSubject";
import { networkMeasure, type HyperMeasure } from "./hyperMeasure";
import { metagraphById } from "./network";
import type { CountryStat, GlobalSnapshot, MetaInfo, NodeRow } from "./types";
import { UNLISTED_HUE, UNLISTED_ID, UNLISTED_LABEL } from "./unlisted";
import { identityHudCss } from "@/src/palette/identity";

// ── Geography ───────────────────────────────────────────────────────────────────────────────

/** A node list's order: city (label fallback), then id. */
export const nodeOrder = (a: NodeRow, b: NodeRow): number =>
  (a.city || a.label).localeCompare(b.city || b.label, undefined, { sensitivity: "base" }) || (a.id || "").localeCompare(b.id || "");

/** The selection's nodes by country NAME — the key both the leaderboard and the node list derive
 *  from `geo.country` (`cc` can be absent, the name can't) — each country's rows in node-list order. */
export function nodesByCountry(selNodes: readonly NodeRow[]): Map<string, NodeRow[]> {
  const m = new Map<string, NodeRow[]>();
  for (const r of selNodes) {
    const key = r.country || "Unknown";
    (m.get(key) ?? m.set(key, []).get(key)!).push(r);
  }
  for (const rows of m.values()) rows.sort(nodeOrder);
  return m;
}

/** THE COUNTRIES under the network, by the picked figure, node count breaking a tie. */
export function countriesLevel(
  countries: readonly CountryStat[],
  byCountry: ReadonlyMap<string, readonly NodeRow[]>,
  measure: GeoMeasure,
): { c: CountryStat; v: number }[] {
  return countries
    .map((c) => ({ c, v: countryMeasure(measure, c.count, byCountry.get(c.country) ?? []) }))
    .sort((a, b) => b.v - a.v || b.c.count - a.c.count);
}

/** One country's nodes, joined by NAME through the leaderboard (a node can carry a country and no code). */
export function countryNodes(cc: string, countries: readonly CountryStat[], byCountry: ReadonlyMap<string, readonly NodeRow[]>): NodeRow[] {
  const name = countries.find((c) => c.cc === cc)?.country;
  return name ? [...(byCountry.get(name) ?? [])] : [];
}

/** A country's city × provider group. */
export interface Cohort {
  key: string;
  city: string | null;
  isp: string | null;
  rows: NodeRow[];
}

/** THE PROVIDERS in a country: city × provider, most nodes first, then city (unlocated last).
 *  `|| null` on both fields — `sameCohort`'s strict === needs an unresolved value to be null. */
export function cohortsLevel(rows: readonly NodeRow[]): Cohort[] {
  const by = new Map<string, Cohort>();
  for (const r of rows) {
    const geo = "geo" in r.pick ? r.pick.geo : undefined;
    const city = r.city || null;
    const isp = geo?.isp || null;
    const key = `${city ?? ""}|${isp ?? ""}`;
    (by.get(key) ?? by.set(key, { key, city, isp, rows: [] }).get(key)!).rows.push(r);
  }
  return [...by.values()].sort((a, b) => b.rows.length - a.rows.length || (a.city ?? "￿").localeCompare(b.city ?? "￿"));
}

/** THE NODE PAGER'S PROJECTION: a node that runs two layers is two explorer rows (one per layer) but
 *  ONE pager stop — deduped by the shared hover key, the rule `hoverKeyOf` encodes for pairing.
 *  A row without a key is neither pairable nor steppable. */
export function machinesOf(rows: readonly NodeRow[]): NodeRow[] {
  const seen = new Set<string>();
  const out: NodeRow[] = [];
  for (const r of rows) {
    const k = hoverKeyOf(r.pick);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// ── Hypergraph ──────────────────────────────────────────────────────────────────────────────

/** THE NETWORKS, by the picked figure, fleet size breaking a tie — the explorer's root list and the
 *  Metagraph card's pager in this view. Counted over the whole fleet (`allNodes`), not the selection. */
export function networksLevel(metaList: readonly MetaInfo[], allNodes: readonly NodeRow[], measure: HyperMeasure): { m: MetaInfo; v: number }[] {
  const byNet = new Map<string, NodeRow[]>();
  for (const r of allNodes) {
    const n = networkOfRow(r);
    if (n) (byNet.get(n) ?? byNet.set(n, []).get(n)!).push(r);
  }
  return metaList
    .map((m) => ({ m, v: networkMeasure(measure, m, byNet.get(m.id) ?? []) }))
    .sort((a, b) => b.v - a.v || b.m.nodes.length - a.m.nodes.length);
}

// ── Snapshots ───────────────────────────────────────────────────────────────────────────────

/** One metagraph snapshot anchored into a global snapshot. */
export interface TickSnap {
  metaId: string;
  ordinal: number;
  hash: string;
  ts: string;
  fee: number;
  sizeInKB: number;
}

/** One network that anchored into a global snapshot, with its snapshots there, NEWEST FIRST. */
export interface TickNetwork {
  id: string;
  name: string;
  hue: string;
  unlisted: boolean;
  snaps: TickSnap[];
}

const newestFirst = (a: TickSnap, b: TickSnap) => (a.metaId === b.metaId ? b.ordinal - a.ordinal : a.ts === b.ts ? b.ordinal - a.ordinal : a.ts < b.ts ? 1 : -1);
const snapOf = (r: AnchorLogRow): TickSnap => ({ metaId: r.metaId!, ordinal: r.ordinal, hash: r.hash, ts: r.ts, fee: r.fee, sizeInKB: r.sizeInKB });

/** ONE TICK'S POLLED ROWS — the per-network buffers' records stamped with this global's timestamp
 *  (the anchor join is exact: a record's `ts` IS its anchoring global's), each joined to it. The ONE
 *  polled input both the explorer and the rail hand `tickNetworksLevel` (final review, 2026-10-07:
 *  they had fed it two different ones), and a walk over ~10 short buffers rather than the whole log. */
export function tickPolledRows(metaSnaps: ReadonlyMap<string, readonly MetaSnapRecord[]>, tick: GlobalSnapshot): AnchorLogRow[] {
  const rows: AnchorLogRow[] = [];
  for (const [metaId, recs] of metaSnaps) {
    for (const rec of recs) {
      if (rec.ts !== tick.timestamp) continue;
      rows.push({ metaId, ordinal: rec.ordinal, hash: rec.hash, fee: rec.fee, sizeInKB: rec.sizeInKB, ts: rec.ts, global: tick });
    }
  }
  return rows;
}

/** THE NETWORKS IN A GLOBAL SNAPSHOT — the explorer's level under a tick, the Metagraph card's
 *  pager under it, and the tick ghost's first child.
 *
 *  ONE TICK'S ROWS, from both sources, POLLED FIRST: the polled row wins where both hold the same
 *  (metaId, ordinal) — it carries the snapshot's own `hash`, which the exact read lacks — and the
 *  exact read supplies everything the per-network buffer has aged out. ⚠️ THE BREAKDOWN IS THE
 *  UNION, and only the exact read makes it COMPLETE (user, 2026-09-14: "DED is missing"): the
 *  polled buffers hold `POLL.metaSnapBuffer` rows PER NETWORK — a depth in rows, not ticks.
 *  Listed networks by snapshot count, then name; the UNLISTED set last, one entry for every
 *  uncatalogued address (the exact read is its only source). */
export function tickNetworksLevel(
  tick: GlobalSnapshot,
  polled: readonly AnchorLogRow[],
  exactRows: readonly { metaId: string; ordinal: number; fee: number; bytes: number }[] | null | undefined,
  isListed: (metaId: string) => boolean,
): TickNetwork[] {
  const byOrd = exactRows ? { [tick.ordinal]: { rows: exactRows } } : {};
  const mine = polled.filter((r) => r.metaId != null && r.global.ordinal === tick.ordinal);
  const seen = new Set(mine.map((r) => `${r.metaId}|${r.ordinal}`));
  const extra = buildChannelLog([tick], byOrd, isListed).filter((r) => !seen.has(`${r.metaId}|${r.ordinal}`));
  const by = new Map<string, TickNetwork>();
  for (const r of [...mine, ...extra]) {
    const id = r.metaId!;
    let n = by.get(id);
    if (!n) {
      n = { id, name: metagraphById(id)?.name ?? id, hue: identityHudCss(id), unlisted: false, snaps: [] };
      by.set(id, n);
    }
    n.snaps.push(snapOf(r));
  }
  const listed = [...by.values()].sort((a, b) => b.snaps.length - a.snaps.length || a.name.localeCompare(b.name));
  for (const n of listed) n.snaps.sort(newestFirst);
  const unl = buildChannelLog([tick], byOrd, (id) => !isListed(id)).map(snapOf).sort(newestFirst);
  return unl.length ? [...listed, { id: UNLISTED_ID, name: UNLISTED_LABEL, hue: UNLISTED_HUE, unlisted: true, snaps: unl }] : listed;
}
