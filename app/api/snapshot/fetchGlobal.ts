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
// ⚠️ A FAILING LB IS LEFT ALONE FOR A WHILE (user, 2026-10-04). While the CDN refuses this source,
// every live tick still knocked on the shut door first — a wasted request each time, and the kind of
// steady traffic that keeps a WAF block in place. A block, a 5xx or no answer at all now sends reads
// straight to the archives for `LB_BACKOFF_MS`; the first read after it asks the LB again, so a lifted
// block heals itself. A 404 trips nothing: it is the LB's depth lottery (above), not a failing LB.
// Per network and per server instance — a cold function simply starts by asking the LB.
export const LB_BACKOFF_MS = 10 * 60_000;
const lbSkipUntil = new Map<NetworkId, number>();

/** One attempt at the LB: the parsed snapshot, or why not. The BODY is read inside the try — a
 *  body that stalls or fails to parse is a failing LB like any other (review, 2026-10-04). */
async function tryLb(net: NetworkId, ordinal: number): Promise<{ ok: true; json: unknown } | { ok: false; why: string; trip: boolean }> {
  try {
    const r = await fetch(`${NETWORKS[net].l0}/global-snapshots/${ordinal}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true, json: await r.json() };
    return { ok: false, why: String(r.status), trip: r.status !== 404 };
  } catch {
    return { ok: false, why: "unreachable", trip: true };
  }
}

/** Fisher–Yates, in place. */
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [a[i], a[k]] = [a[k]!, a[i]!];
  }
  return a;
}

export async function fetchGlobalJson(net: NetworkId, ordinal: number): Promise<unknown> {
  let lb: string;
  const skipping = (lbSkipUntil.get(net) ?? 0) > Date.now();
  if (skipping) {
    lb = "skipped (backing off)";
  } else {
    const a = await tryLb(net, ordinal);
    if (a.ok) {
      lbSkipUntil.delete(net);
      return a.json;
    }
    lb = a.why;
    if (a.trip) lbSkipUntil.set(net, Date.now() + LB_BACKOFF_MS);
  }
  const info = await getArchiveInfo(net).catch(() => null);
  // Random order so the handful of archival nodes share the deep-read load — then try them ALL:
  // the archives have GAPS (measured 2026-08-14: ~2.4–2.8M missing on every node, ~3.5M held by
  // one of nine — largely shared holes, so they synced from a common source), and coverage
  // differs at the margins. A node missing an ordinal answers 404 in well under a second, so
  // walking the whole list is cheap; the timeout only bites on an unreachable node.
  // THE NODES WHOSE MEASURED FLOOR COVERS THIS ORDINAL (user, 2026-10-18: "we do know the depth a
  // node serves, it's shown on the node card — can't we query the nodes we know actually have the
  // snapshot?"). The census records every global node's floor..latest; the "archival" list is the
  // subset reaching the 2023 era floor, and on a day no node reaches it (2026-10-18: archivalCount
  // 0 while three nodes served from Aug 2024) the fallback had nothing to try — so a year-old
  // snapshot failed although nodes held it. FLOOR ONLY: a node serves floor..now, and the census's
  // `latest` is the tip at probe time, hours stale (review, 2026-10-18 — bounded by it, every live
  // ordinal matched no entry). Shallowest sufficient floor first, in BUCKETS of ~half a year with
  // a random order inside each, so the few long archives are not asked for what every node still
  // has and no single node takes every read (the loop below shares the load the same way for the
  // archival list, the last resort for a census with no per-node entries).
  const BUCKET = 500_000;
  const covering = shuffle((info?.entries ?? []).filter((e) => e.chain === "global" && e.floor <= ordinal))
    .sort((a, b) => Math.floor(b.floor / BUCKET) - Math.floor(a.floor / BUCKET))
    .map((e) => ({ ip: e.ip, port: e.port ?? 9000 }));
  const targets = covering.length ? covering : shuffle((info?.archival ?? []).slice());
  for (const t of targets) {
    try {
      const a = await fetch(`http://${t.ip}:${t.port}/global-snapshots/${ordinal}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (a.ok) return await a.json();
    } catch {
      /* next target */
    }
  }
  // THE BACKOFF CAN NEVER MAKE A READ WORSE (review, 2026-10-04): while skipping, if every archive
  // failed too, ask the LB after all — one blip must not cost ten minutes of reads the LB could
  // have answered. A success there lifts the backoff.
  if (skipping) {
    const a = await tryLb(net, ordinal);
    if (a.ok) {
      lbSkipUntil.delete(net);
      return a.json;
    }
    lb = `${a.why} (after backing off)`;
  }
  throw new Error(`l0 ${lb} (lb and archival nodes)`);
}
