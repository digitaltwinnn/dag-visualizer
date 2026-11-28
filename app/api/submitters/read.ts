import { SUBMITTERS } from "@/src/data/submitters";
import { stepMsOf } from "../trends/keys";
import type { StoredHash, TrendsStore } from "../trends/store";
import { assembleSubmitters, measuredSketchKeys, parseSpan, windowRange24h, type SubmittersWindow } from "./assemble";
import { subHolesKeyOf, subNamesKeyOf, subSlotOf, subSpanKeyOf, type SubTier } from "./keys";

// THE SUBMITTERS READ — one network's range of the `sub:` family, gathered and folded
// (`assembleSubmitters`). ONE home for which hashes a range reads, so the route and the AI notes'
// sources (`app/api/notes/sources.ts`, ruling R5: the notes read the store, never the HTTP route)
// can never read two different windows for the same range.

const DAY = 86400000;

/** The hourly tier up to 30 days (and for `24h`), the daily one beyond. */
export function subTierOf(fromMs: number, toMs: number): SubTier {
  return toMs - fromMs <= 30 * DAY ? "1h" : "1d";
}

/** `range` is `[fromMs, toMs)` or `"24h"` (the 24 whole hours ending at the current hour).
 *  `years: false` skips the 1d year hashes, so `seenTotal`, `firstSeenMs` and `palette` stay empty:
 *  the notes need none of them. The network must have a `SUBMITTERS` row; a read that throws
 *  propagates. */
export async function readSubmitters(
  store: Pick<TrendsStore, "hgetall" | "mget">,
  net: string,
  range: { fromMs: number; toMs: number } | "24h",
  nowMs: number,
  opts: { years?: boolean } = {},
): Promise<SubmittersWindow> {
  const [span, names, holes] = await Promise.all([
    store.hgetall(subSpanKeyOf(net)), store.hgetall(subNamesKeyOf(net)), store.hgetall(subHolesKeyOf(net)),
  ]);
  const { fromMs, toMs } = range === "24h" ? windowRange24h(nowMs) : range;
  const tier: SubTier = range === "24h" ? "1h" : subTierOf(fromMs, toMs);
  const step = stepMsOf(tier);
  const keys = new Set<string>();
  for (let t = Math.floor(fromMs / step) * step; t < toMs; t += step) keys.add(subSlotOf(net, tier, t).key);
  const read = async (ks: string[]) => {
    const out: Record<string, StoredHash> = {};
    await Promise.all(ks.map(async (k) => { const h = await store.hgetall(k); if (h) out[k] = h; }));
    return out;
  };
  if (SUBMITTERS[net]!.kind === "device") {
    // DOR (R22): each bucket's count field from the same tier hashes, and the sketches of the measured
    // buckets by MGET for the range's union — strings only, so the read-only token suffices.
    const [hashes, sketches] = await Promise.all([read([...keys]), store.mget(measuredSketchKeys(net, tier, fromMs, toMs, span, holes))]);
    return assembleSubmitters({ net, tier, fromMs, toMs, hashes, span, names, holes, sketches });
  }
  const years: string[] = [];
  if (opts.years !== false) {
    const first = new Date(parseSpan(span)?.from ?? nowMs).getUTCFullYear();
    for (let y = first; y <= new Date(nowMs).getUTCFullYear(); y++) years.push(subSlotOf(net, "1d", Date.UTC(y, 5, 1)).key);
  }
  const [hashes, yearHashes] = await Promise.all([read([...keys]), read(years)]);
  return assembleSubmitters({ net, tier, fromMs, toMs, hashes, span, names, holes, yearHashes });
}
