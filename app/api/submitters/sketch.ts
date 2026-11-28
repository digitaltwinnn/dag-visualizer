// DOR'S DEVICE SKETCH (ruling R22, 2026-11-28): a HyperLogLog of our own, stored as a plain string.
// Redis's own HLL (R19's PFADD/PFCOUNT) cannot be read on the public read route: Redis classes
// PFCOUNT a write (it caches its count in the key), and the read-only Upstash token is refused it.
// GET and MGET are allowed, so the sketch is a string the read side merges and counts itself.
//
// ⚠️ THE FORMAT IS FIXED FOREVER ONCE SHIPPED: every stored sketch depends on it. The precision, the
// hash, the rank and the encoding below may never change in place; a new format takes a new prefix
// (and a decoder for the old one), never a reinterpretation of `hll12:`.
// - Precision p = 12: m = 4096 registers, one byte each. Standard error 1.04/√m ≈ 1.6%.
// - Hash: sha256 of the id (utf8), its first 8 bytes as two unsigned 32-bit ints. Register = the top
//   12 bits; rank = the leading zeros of the following 52 bits + 1, capped at 53.
// - The id: Dor's `publicId` as `SUBMITTERS[DOR].read` spells it (`src/data/submitters.ts`, ruling
//   R25) — lower-cased, then cut to its first `DEVICE_ID_LEN` (16) characters. The spelling is part of
//   the format: hashed differently, every device would count twice across the change.
// - Encoding: `"hll12:" + base64(registers)`. The prefix versions the format AND keeps the value from
//   ever parsing as JSON, which `@upstash/redis` would otherwise auto-deserialise on GET/MGET.
import { createHash } from "node:crypto";

const P = 12;
const M = 1 << P;
const MAX_RANK = 64 - P + 1; // 53
const PREFIX = "hll12:";
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

export type Sketch = Uint8Array;

export function newSketch(): Sketch {
  return new Uint8Array(M);
}

/** Adds each id to `sketch` in place (idempotent: an id added twice changes nothing). */
export function addIds(sketch: Sketch, ids: Iterable<string>): Sketch {
  for (const id of ids) {
    const h = createHash("sha256").update(id, "utf8").digest();
    const hi = h.readUInt32BE(0), lo = h.readUInt32BE(4);
    const j = hi >>> (32 - P);
    const rest = hi & ((1 << (32 - P)) - 1); // the next 20 bits of the 52
    const lz = rest !== 0 ? Math.clz32(rest) - P : 32 - P + Math.clz32(lo); // clz32(0) = 32
    const rank = Math.min(lz + 1, MAX_RANK);
    if (rank > sketch[j]!) sketch[j] = rank;
  }
  return sketch;
}

/** Register-wise max of `src` into `target`, in place — the union (commutative, idempotent). */
export function mergeInto(target: Sketch, src: Sketch): Sketch {
  for (let j = 0; j < M; j++) if (src[j]! > target[j]!) target[j] = src[j]!;
  return target;
}

/** The distinct count the sketch estimates, rounded: raw HLL, with linear counting in the small range
 *  (no large-range correction: the hash is 64 bits). */
export function estimate(sketch: Sketch): number {
  let sum = 0, zeros = 0;
  for (let j = 0; j < M; j++) {
    sum += 2 ** -sketch[j]!;
    if (sketch[j] === 0) zeros++;
  }
  const alpha = 0.7213 / (1 + 1.079 / M);
  const e = (alpha * M * M) / sum;
  return Math.round(e <= 2.5 * M && zeros > 0 ? M * Math.log(M / zeros) : e);
}

export function encodeSketch(sketch: Sketch): string {
  return PREFIX + Buffer.from(sketch.buffer, sketch.byteOffset, sketch.byteLength).toString("base64");
}

/** The sketch a stored value holds, or null for anything this format did not write (another prefix,
 *  bad base64, a wrong length, a register no id could reach). */
export function decodeSketch(str: unknown): Sketch | null {
  if (typeof str !== "string" || str.slice(0, PREFIX.length) !== PREFIX) return null;
  const b64 = str.slice(PREFIX.length);
  if (!B64.test(b64)) return null;
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== M || buf.toString("base64") !== b64) return null;
  const out = new Uint8Array(buf);
  return out.every((r) => r <= MAX_RANK) ? out : null;
}
