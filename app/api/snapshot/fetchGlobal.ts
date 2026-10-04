import { getArchiveInfo } from "../archive/probe";
import { NETWORKS, type NetworkId } from "@/src/engine/config";

// ONE HOME for the raw global-snapshot pull (user, 2026-08-14 — old pages "should be sure to
// pick a node that serves the history for that specific range"). The LB routes each request to
// a random cluster node, and 143 of 152 prune to a recent window — so for a deep ordinal the LB
// alone is a ~1-in-17 lottery. The LB stays first (it load-balances, and recent ordinals are
// everywhere); when it does not answer with the snapshot, the read retries directly against the
// known-archival nodes in random order.
// ⚠️ EVERY LB FAILURE FALLS BACK, not only a 404 (2026-10-04). The LB sits behind a CDN that can
// refuse one source outright — measured: CloudFront 403 "Request blocked" for every ordinal from
// one IP, while an archival node served the same snapshot in 0.27s — and a 5xx or a timeout is
// the same answer from the reader's side: this door is shut, try the others. Only when every
// node fails does it throw, naming the LB's own answer, and the caller's no-cache-on-throw
// contract retries it later.
export async function fetchGlobalJson(net: NetworkId, ordinal: number): Promise<unknown> {
  let lb: string;
  try {
    const r = await fetch(`${NETWORKS[net].l0}/global-snapshots/${ordinal}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return r.json();
    lb = String(r.status);
  } catch {
    lb = "unreachable";
  }
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
  throw new Error(`l0 ${lb} (lb and archival nodes)`);
}
