// The shared live feed's server side: a module-level memo and the three upstream readers.
// The memo is per server instance on purpose (never unstable_cache): it only collapses concurrent
// and near-simultaneous calls; the edge cache in front of each route does the real sharing.
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";

const TIMEOUT_MS = 4000;

type Entry = { at: number; value: unknown };
const done = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function memo<T>(
  key: string,
  ttlMs: number,
  read: () => Promise<T>,
  now: () => number = Date.now,
): Promise<{ value: T; ageMs: number }> {
  const hit = done.get(key);
  const t = now();
  if (hit && t - hit.at < ttlMs) return { value: hit.value as T, ageMs: t - hit.at };
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = read().then(
      (v) => {
        done.set(key, { at: now(), value: v });
        inflight.delete(key);
        return v;
      },
      (e) => {
        inflight.delete(key);
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
