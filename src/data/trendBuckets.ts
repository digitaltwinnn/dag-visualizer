// THE STORED BUCKETS AS RECORDS (user, 2026-10-08: History's RAW "should just show upstash records,
// not the raw page for snapshots, should work with the app filter as well"). The measured history
// is a store of BUCKETS — one row per five minutes, hour or day, each a set of named fields — and
// this is the pure half of showing them as they are stored: which fields a scope owns, how a field
// is named once its scope is known, how a tier is called, and which rows a page holds. The surface
// (`components/datasection/TrendBucketsSurface.tsx`) reads the same payload the planes draw from
// and renders what this hands back. Field names are the sampler's own (`app/api/trends/bucketing.ts`):
// `g.*` the global row, `m.{id}.*` a network's, `f.*` the fleet gauges, `u.cov` the unlisted coverage.

/** The scope whose fields the records show: the plane brought forward, else the app filter —
 *  History's own card rule (`trendStack.cardNetwork`). "all" and "dag" both read the global row. */
export function bucketScope(filter: string, focus: string | null): string {
  return focus ?? filter;
}

const GLOBAL_ORDER = ["g.ticks", "g.anchors", "g.blocks", "g.fee", "g.kb", "g.feeFloor", "g.kbFloor", "g.gapSum", "g.gapMax", "f.nodes", "f.layer.l0", "f.layer.cl1", "f.layer.dl1", "u.cov"];
const NET_TAILS = ["snaps", "ticks", "blocks", "fee", "kb", "gapSum", "gapMax"];
const LAYERS = ["l0", "cl1", "dl1"];

const isGlobalScope = (scope: string) => scope === "all" || scope === "dag";

/** THE FIELDS A SCOPE OWNS, in the vocabulary's order. The global row: its counters, then the
 *  fleet-wide gauges, then the unlisted coverage — never the per-country or per-network fields,
 *  which are another scope's. A network: its own counters, then its node count, its per-layer
 *  gauges and its node types. Unknown fields of the scope follow, alphabetically, so a field the
 *  sampler adds tomorrow is shown rather than hidden. */
export function bucketColumns(keys: readonly string[], scope: string): string[] {
  const rank = new Map<string, number>();
  let own: (k: string) => boolean;
  if (isGlobalScope(scope)) {
    GLOBAL_ORDER.forEach((k, i) => rank.set(k, i));
    own = (k) => (k.startsWith("g.") || k === "u.cov" || k === "f.nodes" || /^f\.layer\.(l0|cl1|dl1)$/.test(k));
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
 *  are already short. */
export function shortKey(key: string, scope: string): string {
  return isGlobalScope(scope) ? key : key.split(`.${scope}`).join("");
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
