// THE STORED BUCKETS AS RECORDS (user, 2026-10-08: History's RAW "should just show upstash
// records, not the raw page for snapshots, should work with the app filter as well"). The measured
// history is a store of BUCKETS — one row per five minutes, hour or day, each a set of named fields
// — and this is the pure half of showing them as they are stored: which fields a scope owns, how a
// field is named once its scope is known, how a tier is called, and which rows a page holds. The
// surface (`components/datasection/TrendBucketsSurface.tsx`) reads the same payload the planes
// draw from and renders what this hands back. Field names are the sampler's own
// (`app/api/trends/bucketing.ts`): `g.*` the global row, `m.{id}.*` a network's, `f.*` the fleet
// gauges, `u.cov` the unlisted coverage.
//
// ⚠️ STORED FIELDS ONLY (the PR review). The payload the app reads is FOLDED (`withUnlisted`): it
// adds `m.{unlisted}.*` summed from the unlisted chains and rewrites `g.fee` / `g.kb` as floor plus
// unlisted. None of those is a stored field — the store holds `g.feeFloor` / `g.kbFloor` and one
// `m.{address}.*` set per chain — so the derived ones are left out here, and the Unlisted scope
// shows the per-address chains the fold summed.

/** The derived totals the fold writes over the payload — never stored, so never a record here. */
const DERIVED = new Set(["g.fee", "g.kb"]);
const GLOBAL_ORDER = ["g.ticks", "g.anchors", "g.blocks", "g.feeFloor", "g.kbFloor", "g.gapSum", "g.gapMax", "f.nodes", "f.layer.l0", "f.layer.cl1", "f.layer.dl1", "u.cov"];
const NET_TAILS = ["snaps", "ticks", "blocks", "fee", "kb", "gapSum", "gapMax"];
const LAYERS = ["l0", "cl1", "dl1"];

const isGlobalScope = (scope: string) => scope === "all" || scope === "dag";
/** A per-network key's address and tail: `m.{addr}.{tail}` → [addr, tail]. */
const netKey = (k: string): [string, string] | null => {
  const m = /^m\.([^.]+)\.(.+)$/.exec(k);
  return m ? [m[1]!, m[2]!] : null;
};

/** THE FIELDS A SCOPE OWNS, in the vocabulary's order. The global row: its counters, then the
 *  fleet-wide gauges, then the unlisted coverage — never the per-country or per-network fields,
 *  which are another scope's, and never the fold's derived totals. A network: its own counters,
 *  then its node count, its per-layer gauges and its node types. THE UNLISTED SCOPE (`unlistedId`,
 *  with `listed` saying which addresses the catalog holds): every unlisted chain's own `m.{addr}.*`
 *  fields, chain by chain — the records the fold sums, not its sum. Unknown fields of a scope
 *  follow, alphabetically, so a field the sampler adds tomorrow is shown rather than hidden. */
export function bucketColumns(
  keys: readonly string[],
  scope: string,
  unlisted?: { id: string; listed: (addr: string) => boolean },
): string[] {
  const rank = new Map<string, number>();
  let own: (k: string) => boolean;
  if (isGlobalScope(scope)) {
    GLOBAL_ORDER.forEach((k, i) => rank.set(k, i));
    own = (k) => !DERIVED.has(k) && (k.startsWith("g.") || k === "u.cov" || k === "f.nodes" || /^f\.layer\.(l0|cl1|dl1)$/.test(k));
  } else if (unlisted && scope === unlisted.id) {
    const addrs = [...new Set(keys.map(netKey).filter((x): x is [string, string] => !!x).map(([a]) => a))]
      .filter((a) => a !== unlisted.id && !unlisted.listed(a))
      .sort();
    addrs.forEach((a, ai) => NET_TAILS.forEach((t, ti) => rank.set(`m.${a}.${t}`, ai * 100 + ti)));
    own = (k) => { const nk = netKey(k); return !!nk && addrs.includes(nk[0]); };
  } else {
    const m = `m.${scope}.`;
    NET_TAILS.forEach((t, i) => rank.set(m + t, i));
    rank.set(`f.nodes.${scope}`, 20);
    LAYERS.forEach((l, i) => rank.set(`f.layer.${scope}.${l}`, 30 + i));
    own = (k) => k.startsWith(m) || k === `f.nodes.${scope}` || k.startsWith(`f.layer.${scope}.`) || k.startsWith(`f.type.${scope}.`);
  }
  return [...new Set(keys)].filter(own).sort((a, b) => {
    const ra = rank.get(a) ?? 1000;
    const rb = rank.get(b) ?? 1000;
    return ra - rb || a.localeCompare(b);
  });
}

/** A field's name with its scope's address taken out: `m.{id}.fee` reads `m.fee`, `f.nodes.{id}`
 *  `f.nodes` — the head states the address once, the columns need not repeat it. Global fields
 *  are already short. Under the UNLISTED scope every column is another chain's, so the address
 *  stays, shortened to its ends: `m.DAG4QS…vzvHo.snaps`. */
export function shortKey(key: string, scope: string, unlistedId?: string): string {
  if (isGlobalScope(scope)) return key;
  if (unlistedId && scope === unlistedId) {
    const nk = netKey(key);
    return nk ? `m.${shortAddr(nk[0])}.${nk[1]}` : key;
  }
  return key.split(`.${scope}`).join("");
}

/** THE UNLISTED SCOPE'S COLUMNS BY CHAIN: `m.{addr}.{tail}` keys grouped per address, in the
 *  order `bucketColumns` gave them — one group per chain, each with its tails. The surface draws
 *  one row per bucket AND chain from this (a chain a bucket holds nothing of draws no row), so
 *  five chains' seven fields are eight columns rather than thirty-five across. */
export function chainGroups(columns: readonly string[]): { addr: string; tails: string[]; keys: string[] }[] {
  const out: { addr: string; tails: string[]; keys: string[] }[] = [];
  for (const k of columns) {
    const nk = netKey(k);
    if (!nk) continue;
    let g = out.find((x) => x.addr === nk[0]);
    if (!g) out.push((g = { addr: nk[0], tails: [], keys: [] }));
    g.tails.push(nk[1]);
    g.keys.push(k);
  }
  return out;
}

/** A chain address shortened to its ends, the raw log's own handle for one. */
export function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-5)}` : addr;
}

/** What a tier is called: the sampler's own `5m` / `1h` / `1d`; any other step says its minutes. */
export function tierWord(stepMs: number): string {
  if (stepMs === 5 * 60_000) return "5m";
  if (stepMs === 3_600_000) return "1h";
  if (stepMs === 86_400_000) return "1d";
  return `${Math.round(stepMs / 60_000)}m`;
}

/** The bucket indexes one page holds, NEWEST FIRST (the log's order), with the page's 1-based
 *  row range. A page past the end is empty, never a crash. */
export function bucketPage(count: number, page: number, size: number): { idx: number[]; from: number; to: number } {
  const start = (Math.max(1, page) - 1) * size;
  const idx: number[] = [];
  for (let n = start; n < Math.min(count, start + size); n++) idx.push(count - 1 - n);
  return idx.length ? { idx, from: start + 1, to: start + idx.length } : { idx, from: 0, to: 0 };
}
