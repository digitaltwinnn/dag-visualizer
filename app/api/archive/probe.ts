import { unstable_cache } from "next/cache";

// WHO KEEPS THE CHAIN'S HISTORY — the one home for the archive probe (user, 2026-08-14: "can we
// know how many nodes have the full history?"). The L0 LB fronts validators of two kinds: most
// prune their global-snapshot store to a rolling recent window (~78 days when measured), a few
// reach back to the metagraph-era upgrade restart (ordinal 766,718, 2023-11-13 — the LB serves
// nothing older, and nothing older is needed: every metagraph snapshot postdates it). REACH is
// not completeness: the deep archives share holes (~2.4–2.8M missing on all nine, ~3.5M on
// eight), so "archival" means "serves deep history", never "serves every ordinal".
// Measured 2026-08-14: 9 archival of 152 Ready. The probe asks every Ready node for one
// known-deep, known-small ordinal and sorts them by the answer; the result feeds the node card's
// Archive fact and the deep-read routes' archival fallback (fetchGlobal.ts).
//
// A node that neither 200s nor 404s (unreachable, timeout) lands in NEITHER list — absent data
// stays absent, so the card shows nothing rather than a guess.

const L0 = "https://l0-lb-mainnet.constellationnetwork.io";

// DOR's genesis anchor — 62 ordinals above the archive floor, ~24 KB. Served by every node that
// keeps deep history, 404 on every pruned one, and immutable so the probe never goes stale.
export const DEEP_PROBE_ORDINAL = 766780;

// What "full history" reaches back to — the archive floor's own date (the 2023-11-13 upgrade
// restart), a network-wide fact, not per node.
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
export interface ArchiveInfo {
  /** Nodes that served the deep probe — the ones a deep read can actually reach history on. */
  archival: ArchiveTarget[];
  /** Nodes that answered 404 at the deep probe — a rolling recent window only. */
  pruned: string[];
  /** Ready nodes probed (archival + pruned + the unreachable). */
  total: number;
}

interface ClusterNode {
  ip?: string;
  publicPort?: number;
  state?: string;
}

async function probeArchive(): Promise<ArchiveInfo> {
  const r = await fetch(`${L0}/cluster/info`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`l0 ${r.status}`);
  const nodes = ((await r.json()) as ClusterNode[]).filter(
    (n) => n.state === "Ready" && n.ip && isPublicNodeIp(n.ip),
  );
  const archival: ArchiveTarget[] = [];
  const pruned: string[] = [];
  await Promise.all(
    nodes.map(async (n) => {
      const port = clampPort(n.publicPort);
      try {
        const p = await fetch(`http://${n.ip}:${port}/global-snapshots/${DEEP_PROBE_ORDINAL}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        await p.body?.cancel();
        if (p.status === 200) archival.push({ ip: n.ip!, port });
        else if (p.status === 404) pruned.push(n.ip!);
      } catch {
        /* unreachable — neither list */
      }
    }),
  );
  // A probe that reached nobody is an outage, not a finding — throw so it is never cached.
  if (!archival.length && !pruned.length) throw new Error("probe reached no nodes");
  return { archival, pruned, total: nodes.length };
}

// Archival membership changes on operator timescales, not tick timescales — 6h is generous.
export const getArchiveInfo = (): Promise<ArchiveInfo> =>
  unstable_cache(probeArchive, ["archive-probe-v1"], { revalidate: 21600 })();
