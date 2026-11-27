// The submitters store family (`sub:`) — who submits each metagraph's data blocks
// (DED organisations, Dor devices). OUTSIDE the `t:mainnet:*` tiers on purpose: a rebuild wipes
// that prefix, and a per-submitter series would ride every History payload undrawn. Keeps forever.
// UTC throughout, like `slotOf`.
import { STORE_NS, stepMsOf } from "../trends/keys";

/** No 5m tier: the 1h and 24h History ranges chart hourly here. */
export type SubTier = "1h" | "1d";

const p2 = (n: number) => String(n).padStart(2, "0");

/** The (redis key, bucket label) a timestamp lands in: `sub:mainnet:<net>:1h:YYYY-MM` / `DD-HH`,
 *  `sub:mainnet:<net>:1d:YYYY` / `MM-DD`. */
export function subSlotOf(netId: string, tier: SubTier, tsMs: number): { key: string; bucket: string } {
  const step = stepMsOf(tier);
  const d = new Date(Math.floor(tsMs / step) * step);
  const y = d.getUTCFullYear(), mo = p2(d.getUTCMonth() + 1), da = p2(d.getUTCDate()), h = p2(d.getUTCHours());
  if (tier === "1h") return { key: `sub:${STORE_NS}:${netId}:1h:${y}-${mo}`, bucket: `${da}-${h}` };
  return { key: `sub:${STORE_NS}:${netId}:1d:${y}`, bucket: `${mo}-${da}` };
}

/** `<bucket>|<submitter>`. Submitter ids never hold `|`: `src/data/submitters.ts` counts only a DED UUID
 *  or a hex Dor id (cut to 16 chars), so the throw below is a guard, never a reachable stall. */
export function subField(bucket: string, submitter: string): string {
  if (submitter.includes("|")) throw new Error(`submitter id may not contain "|": ${submitter}`);
  return `${bucket}|${submitter}`;
}

/** Fields `from`, `to` (epoch ms of the measured span) and `cursor` (last ordinal read). */
export function subSpanKeyOf(netId: string): string {
  return `sub:${STORE_NS}:${netId}:span`;
}

/** Field = submitter id, value = JSON `{ name, source: "ded" | "dagscan", namedAt }`. */
export function subNamesKeyOf(netId: string): string {
  return `sub:${STORE_NS}:${netId}:names`;
}

export function subLockKeyOf(): string {
  return `sub:${STORE_NS}:lock`;
}
