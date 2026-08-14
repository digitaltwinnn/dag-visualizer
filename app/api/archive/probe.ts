import { unstable_cache } from "next/cache";
import { METAGRAPHS } from "@/src/engine/config";

// WHO KEEPS THE CHAIN'S HISTORY — the one home for the archive census (user, 2026-08-14: "can
// we know how many nodes have the full history?", then "mention time and/or snapshots, and
// 'from genesis' if they have them all... metagraph nodes as well"). Every Ready node — the
// global L0 cluster AND each catalog metagraph's own L0 cluster — is asked what depth of ITS
// OWN chain it serves, by a coarse floor bisection (~10 tiny probes per node, resolution
// latest/1024), and the floor's wall-clock date comes from the explorer's per-ordinal record.
//
// What the answers mean, per chain:
//  · "genesis" — the node served its chain's ordinal 1. The whole chain, no caveats.
//  · "deep" (global chain only) — served the metagraph-era floor region (ordinal 766,718,
//    2023-11-13, the upgrade restart; the LB serves nothing older and nothing older is
//    needed — every metagraph snapshot postdates it). REACH is not completeness: these
//    archives share holes (~2.4–2.8M missing on all nine, ~3.5M on eight), so "deep" means
//    "serves deep history", never "serves every ordinal".
//  · "window" — a rolling recent window; floor ≈ the deepest served ordinal found.
//
// Measured 2026-08-14: 9 deep of 152 global Ready. A node that can't be reached lands in NO
// list — absent data stays absent, so the card shows nothing rather than a guess.

const L0 = "https://l0-lb-mainnet.constellationnetwork.io";
const BE = "https://be-mainnet.constellationnetwork.io";
const DIRECTORY = "https://production.dagexplorer-api.constellationnetwork.net/mainnet/metagraphs?limit=100";
const LISTED = new Set(METAGRAPHS.map((m) => m.id));

// DOR's genesis anchor — 62 ordinals above the global archive floor, ~24 KB. Served by every
// node that keeps deep history, 404 on every pruned one, and immutable so it never goes stale.
export const DEEP_PROBE_ORDINAL = 766780;

// What the global chain's "deep" reaches back to — the archive floor's own date (the
// 2023-11-13 upgrade restart), a network-wide fact, not per node.
export const ARCHIVE_SINCE = "Nov 2023";

// SSRF guard: the probe fetches plain-HTTP URLs built from upstream-supplied IPs, so only
// public unicast IPv4 may pass — a compromised cluster list must not aim this server at
// loopback, RFC1918, link-local, CGNAT or multicast space.
export function isPublicNodeIp(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((x) => x > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

const clampPort = (p: unknown): number =>
  typeof p === "number" && Number.isInteger(p) && p >= 1024 && p <= 65535 ? p : 9000;

export interface ArchiveTarget {
  ip: string;
  port: number;
}
export interface ArchiveEntry {
  ip: string;
  /** "global" for the DAG's own chain; a metagraph id for its currency chain. */
  chain: string;
  kind: "genesis" | "deep" | "window";
  /** Deepest served ordinal (exact for genesis; the found bound for window; the era floor for deep). */
  floor: number;
  /** The chain's newest ordinal at probe time — floor..latest is what the node serves. */
  latest: number;
  /** Explorer timestamp of `floor` — how far back in wall-clock time the archive reaches. */
  floorTs?: string;
}
export interface ArchiveInfo {
  /** Global-chain deep/genesis nodes — the fetchGlobal fallback's target list. */
  archival: ArchiveTarget[];
  entries: ArchiveEntry[];
  /** Global Ready nodes probed (the census denominator the card title states). */
  total: number;
}

interface ClusterNode {
  ip?: string;
  publicPort?: number;
  state?: string;
}

async function statusOf(url: string, ms: number): Promise<number | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(ms),
    });
    await r.body?.cancel();
    return r.status;
  } catch {
    return null;
  }
}

// Deepest served ordinal between a non-serving lo and a serving hi, to ~latest/1024 resolution
// (~10 probes) — the census states reach with a "~", so an exact floor buys nothing.
async function floorSearch(base: string, lo: number, hi: number): Promise<number> {
  const res = Math.max(1, Math.floor(hi / 1024));
  while (hi - lo > res) {
    const mid = Math.floor((lo + hi) / 2);
    const s = await statusOf(`${base}/${mid}`, 3000);
    if (s === 200) hi = mid;
    else lo = mid;
  }
  return hi;
}

async function explorerTs(path: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${BE}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { data?: { timestamp?: string } };
    return j.data?.timestamp;
  } catch {
    return undefined;
  }
}

async function readyNodes(clusterUrl: string): Promise<ArchiveTarget[]> {
  const r = await fetch(clusterUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`cluster ${r.status}`);
  return ((await r.json()) as ClusterNode[])
    .filter((n) => n.state === "Ready" && n.ip && isPublicNodeIp(n.ip))
    .map((n) => ({ ip: n.ip!, port: clampPort(n.publicPort) }));
}

// One node of the GLOBAL chain: deep probe first (one request sorts the common case), genesis
// check only for the deep ones (nothing pruned serves it), floor bisection for the windowed.
async function probeGlobalNode(t: ArchiveTarget, latest: number): Promise<ArchiveEntry | null> {
  const base = `http://${t.ip}:${t.port}/global-snapshots`;
  const deep = await statusOf(`${base}/${DEEP_PROBE_ORDINAL}`, 5000);
  if (deep === 200) {
    const genesis = await statusOf(`${base}/1`, 3000);
    if (genesis === 200) return { ip: t.ip, chain: "global", kind: "genesis", floor: 1, latest };
    return { ip: t.ip, chain: "global", kind: "deep", floor: DEEP_PROBE_ORDINAL, latest };
  }
  if (deep !== 404) return null; // unreachable — absent, not "window"
  const tip = await statusOf(`${base}/${latest - 3}`, 4000);
  if (tip !== 200) return null;
  const floor = await floorSearch(base, DEEP_PROBE_ORDINAL, latest - 3);
  return { ip: t.ip, chain: "global", kind: "window", floor, latest };
}

// One node of a metagraph's CURRENCY chain: genesis is ordinal 1 of ITS chain, so that one
// probe answers "from genesis" directly; otherwise the same floor bisection.
async function probeCurrencyNode(t: ArchiveTarget, metaId: string, latest: number): Promise<ArchiveEntry | null> {
  const base = `http://${t.ip}:${t.port}/snapshots`;
  const genesis = await statusOf(`${base}/1`, 5000);
  if (genesis === 200) return { ip: t.ip, chain: metaId, kind: "genesis", floor: 1, latest };
  if (genesis !== 404) return null;
  const tip = await statusOf(`${base}/${latest - 3}`, 4000);
  if (tip !== 200) return null;
  const floor = await floorSearch(base, 1, latest - 3);
  return { ip: t.ip, chain: metaId, kind: "window", floor, latest };
}

async function latestGlobal(): Promise<number> {
  const r = await fetch(`${BE}/global-snapshots/latest`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as { data?: { ordinal?: number } };
  if (typeof j.data?.ordinal !== "number") throw new Error("bad shape");
  return j.data.ordinal;
}

async function latestCurrency(metaId: string): Promise<number | null> {
  try {
    const r = await fetch(`${BE}/currency/${metaId}/snapshots?limit=1`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { ordinal?: number }[] };
    const o = j.data?.[0]?.ordinal;
    return typeof o === "number" ? o : null;
  } catch {
    return null;
  }
}

async function probeArchive(): Promise<ArchiveInfo> {
  const gLatest = await latestGlobal();
  const globalNodes = await readyNodes(`${L0}/cluster/info`);

  // Each catalog metagraph's own l0 cluster, from the same directory /api/metagraphs reads.
  const dirMetas: { id: string; l0: string }[] = [];
  try {
    const r = await fetch(DIRECTORY, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = (await r.json()) as { data?: { id?: string; urls?: { l0?: string } }[] };
      for (const m of j.data ?? []) {
        if (m.id && LISTED.has(m.id) && m.urls?.l0) dirMetas.push({ id: m.id, l0: m.urls.l0 });
      }
    }
  } catch {
    /* no directory — the global census still answers */
  }

  const entries: ArchiveEntry[] = [];
  const globalRuns = globalNodes.map(async (t) => {
    const e = await probeGlobalNode(t, gLatest);
    if (e) entries.push(e);
  });
  const metaRuns = dirMetas.map(async (m) => {
    const latest = await latestCurrency(m.id);
    if (latest == null) return;
    let nodes: ArchiveTarget[] = [];
    try {
      nodes = await readyNodes(m.l0.replace(/\/$/, "") + "/cluster/info");
    } catch {
      return;
    }
    await Promise.all(
      nodes.map(async (t) => {
        const e = await probeCurrencyNode(t, m.id, latest);
        if (e) entries.push(e);
      }),
    );
  });
  await Promise.all([...globalRuns, ...metaRuns]);

  // A probe that reached nobody is an outage, not a finding — throw so it is never cached.
  if (!entries.length) throw new Error("probe reached no nodes");

  // Wall-clock reach for the windowed and genesis floors, one tiny explorer read per node —
  // the value the card renders as "~N months". Deep floors carry ARCHIVE_SINCE instead.
  const portByIp = new Map<string, number>();
  for (const t of globalNodes) portByIp.set(t.ip, t.port);
  await Promise.all(
    entries.map(async (e) => {
      if (e.kind === "deep") return;
      e.floorTs = await explorerTs(
        e.chain === "global" ? `/global-snapshots/${e.floor}` : `/currency/${e.chain}/snapshots/${e.floor}`,
      );
    }),
  );

  const archival = entries
    .filter((e) => e.chain === "global" && e.kind !== "window")
    .map((e) => ({ ip: e.ip, port: portByIp.get(e.ip) ?? 9000 }));
  return { archival, entries, total: globalNodes.length };
}

// Archival membership changes on operator timescales, not tick timescales — 6h is generous.
export const getArchiveInfo = (): Promise<ArchiveInfo> =>
  unstable_cache(probeArchive, ["archive-probe-v2"], { revalidate: 21600 })();
