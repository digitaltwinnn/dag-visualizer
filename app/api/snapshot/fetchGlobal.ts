import { getArchiveInfo } from "../archive/probe";
import { NETWORKS, type NetworkId } from "@/src/engine/config";

// ONE HOME for the raw global-snapshot pull (user, 2026-08-14 — old pages "should be sure to
// pick a node that serves the history for that specific range"). The LB routes each request to
// a random cluster node, and 143 of 152 prune to a recent window — so for a deep ordinal the LB
// alone is a ~1-in-17 lottery. The LB stays first (it load-balances, and recent ordinals are
// everywhere); a 404 — which mixed depth makes a lottery loss, not a fact — retries directly
// against up to three known-archival nodes in random order. Non-404 failures throw untried:
// those are transient, and the caller's no-cache-on-throw contract handles them.
export async function fetchGlobalJson(net: NetworkId, ordinal: number): Promise<unknown> {
  const r = await fetch(`${NETWORKS[net].l0}/global-snapshots/${ordinal}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (r.ok) return r.json();
  if (r.status !== 404) throw new Error(`l0 ${r.status}`);
  const info = await getArchiveInfo(net).catch(() => null);
  // Random order so the handful of archival nodes share the deep-read load — then try them ALL:
  // the archives have GAPS (measured 2026-08-14: ~2.4–2.8M missing on every node, ~3.5M held by
  // one of nine — largely shared holes, so they synced from a common source), and coverage
  // differs at the margins. A node missing an ordinal answers 404 in well under a second, so
  // walking the whole list is cheap; the timeout only bites on an unreachable node.
  const targets = (info?.archival ?? []).slice();
  for (let i = targets.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [targets[i], targets[k]] = [targets[k], targets[i]];
  }
  for (const t of targets) {
    try {
      const a = await fetch(`http://${t.ip}:${t.port}/global-snapshots/${ordinal}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (a.ok) return a.json();
    } catch {
      /* next target */
    }
  }
  throw new Error("l0 404 (lb and archival nodes)");
}
