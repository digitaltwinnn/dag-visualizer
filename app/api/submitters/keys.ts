// The submitters store family (`sub:`) — who submits each metagraph's data blocks
// (DED organisations, Dor devices). OUTSIDE the `t:mainnet:*` tiers on purpose: a rebuild wipes
// that prefix, and a per-submitter series would ride every History payload undrawn. Keeps forever.
// UTC throughout, like `slotOf`.
import { STORE_NS, stepMsOf } from "../trends/keys";

/** No 5m tier: the 1h and 24h History ranges chart hourly here. */
export type SubTier = "1h" | "1d";

const p2 = (n: number) => String(n).padStart(2, "0");

/** The (redis key, bucket label) a timestamp lands in: `sub:mainnet:<net>:1h:YYYY-MM` / `DD-HH`,
 *  `sub:mainnet:<net>:1d:YYYY` / `MM-DD`. The hash's FIELDS differ by kind: an organisation's is
 *  `<bucket>|<id>` (`subField`, always a `|`) holding its updates; a device network's is the bucket
 *  alone (no `|`) holding `estimate()` of that bucket's sketch (`subSketchKeyOf`, R22), written in the
 *  same transaction as the sketch. */
export function subSlotOf(netId: string, tier: SubTier, tsMs: number): { key: string; bucket: string } {
  const step = stepMsOf(tier);
  const d = new Date(Math.floor(tsMs / step) * step);
  const y = d.getUTCFullYear(), mo = p2(d.getUTCMonth() + 1), da = p2(d.getUTCDate()), h = p2(d.getUTCHours());
  if (tier === "1h") return { key: `sub:${STORE_NS}:${netId}:1h:${y}-${mo}`, bucket: `${da}-${h}` };
  return { key: `sub:${STORE_NS}:${netId}:1d:${y}`, bucket: `${mo}-${da}` };
}

/** DOR'S DEVICES ARE A SKETCH (ruling R22, replacing R19's Redis HyperLogLog): one string key per
 *  network per UTC hour (`sub:mainnet:<net>:sketch:1h:YYYY-MM-DD-HH`) and per UTC day
 *  (`…:sketch:1d:YYYY-MM-DD`), holding `sketch.ts`'s `hll12:` encoding of the bucket's device ids.
 *  Measured, one hour of Dor holds ~1,400 distinct devices, ≈1M per-device fields in a month hash; a
 *  sketch is ~5.5 KB stored (~7.3 KB on the wire: the client base64-encodes responses again) and its
 *  count carries ~1.6% standard error. A plain string because the read
 *  route's read-only token may GET/MGET it, where it is refused PFCOUNT. */
export function subSketchKeyOf(netId: string, tier: SubTier, tsMs: number): string {
  const step = stepMsOf(tier);
  const d = new Date(Math.floor(tsMs / step) * step);
  const day = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  return `sub:${STORE_NS}:${netId}:sketch:${tier}:${tier === "1h" ? `${day}-${p2(d.getUTCHours())}` : day}`;
}

/** `<bucket>|<submitter>`, an ORGANISATION's field. Submitter ids never hold `|`: `src/data/submitters.ts` counts only a DED UUID
 *  or a hex Dor id (cut to 16 chars), so the throw below is a guard, never a reachable stall. */
export function subField(bucket: string, submitter: string): string {
  if (submitter.includes("|")) throw new Error(`submitter id may not contain "|": ${submitter}`);
  return `${bucket}|${submitter}`;
}

/** Fields `from`, `to` (epoch ms of the measured span) and `cursor` (last ordinal read). */
export function subSpanKeyOf(netId: string): string {
  return `sub:${STORE_NS}:${netId}:span`;
}

/** THE HOLES (ruling R20): the hours a gap left unmeasured inside the span. Field = a hole's start,
 *  epoch ms on an hour edge; value = its end, the same. `walk-submitters --holes` fills one and deletes
 *  its field; until then every bucket overlapping it reads null. */
export function subHolesKeyOf(netId: string): string {
  return `sub:${STORE_NS}:${netId}:holes`;
}

/** Field = submitter id, value = JSON `{ name, source: "ded" | "dagscan", namedAt }`. */
export function subNamesKeyOf(netId: string): string {
  return `sub:${STORE_NS}:${netId}:names`;
}

export function subLockKeyOf(): string {
  return `sub:${STORE_NS}:lock`;
}
