// The shared live feed's server side: a module-level memo and the three upstream readers.
// The memo is per server instance on purpose (never unstable_cache): it only collapses concurrent
// and near-simultaneous calls; the edge cache in front of each route does the real sharing.
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";

const TIMEOUT_MS = 4000;

type Entry = { at: number; ttlMs: number; value: unknown };
const done = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/** Past this many entries, a write first drops every expired one. The keys are bounded (per network,
 *  per chain, per quantized limit), so this is a backstop, not the working set. */
export const MEMO_SWEEP_AT = 256;

/** How many answers the memo holds (expired ones included until a read or a sweep drops them). */
export function memoSize(): number {
  return done.size;
}

function sweep(t: number): void {
  for (const [k, e] of done) if (t - e.at >= e.ttlMs) done.delete(k);
}

/** A failed read is HELD for the same window a success is (review, 2026-10-25): with no hold,
 *  every tab's poll during an upstream outage re-ran the whole fan-out (globals + every chain)
 *  exactly while the upstream was struggling. Server-side only — the route still answers 503
 *  no-store, so the edge caches nothing and the next window retries. */
const failedAt = new Map<string, { at: number; ttlMs: number; err: unknown }>();

export async function memo<T>(
  key: string,
  ttlMs: number,
  read: () => Promise<T>,
  now: () => number = Date.now,
): Promise<{ value: T; ageMs: number }> {
  const hit = done.get(key);
  const t = now();
  if (hit) {
    if (t - hit.at < ttlMs) return { value: hit.value as T, ageMs: t - hit.at };
    done.delete(key); // expired: never retained past its window
  }
  const miss = failedAt.get(key);
  if (miss) {
    if (t - miss.at < miss.ttlMs) throw miss.err;
    failedAt.delete(key);
  }
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = read().then(
      (v) => {
        const at = now();
        if (done.size >= MEMO_SWEEP_AT) sweep(at);
        done.set(key, { at, ttlMs, value: v });
        inflight.delete(key);
        return v;
      },
      (e) => {
        inflight.delete(key);
        failedAt.set(key, { at: now(), ttlMs, err: e });
        throw e;
      },
    );
    inflight.set(key, p);
  }
  const value = await p;
  return { value, ageMs: 0 };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function readGlobals(be: string, limit: number): Promise<GlobalSnapshot[]> {
  const json = (await getJson(`${be}/global-snapshots?limit=${limit}`)) as { data?: GlobalSnapshot[] };
  return json.data ?? [];
}

export async function readChain(be: string, id: string, limit: number): Promise<RawMetaSnapshot[]> {
  const json = (await getJson(`${be}/currency/${id}/snapshots?limit=${limit}`)) as { data?: RawMetaSnapshot[] };
  return json.data ?? [];
}

export async function readClusters(l0: string, l1: string): Promise<{ l0: unknown[]; l1: unknown[] }> {
  const [a, b] = await Promise.all([getJson(`${l0}/cluster/info`), getJson(`${l1}/cluster/info`)]);
  if (!Array.isArray(a) || !a.length || !Array.isArray(b) || !b.length) throw new Error("empty cluster info");
  return { l0: a, l1: b };
}
