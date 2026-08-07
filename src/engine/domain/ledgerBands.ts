// The BYTE BAR's pure model (redesign 2026-08-04, spec §4.2/§6.2/§6.3): the global snapshot is ONE
// object whose WIDTH is the bytes it carries, divided into bands proportional to each metagraph's
// sealed payload, in lane order, with unlisted channels as a neutral band at the end.
//
// Honesty rules encoded here, not in the adapter:
//   • no exact read yet          → `measured: false`, minimum width, NO bands (never inferred
//                                  from anchor count and never from the fee)
//   • measured, anchored nothing → a minimum-width SEAM (the tick still happened)
//   • over the fixed reference   → clipped at the floor edge, `overflow` states by how much
//
// Allocation-free after construction: `makeBarSpec()` preallocates one band record per listed
// metagraph plus the unlisted aggregate, and `fillBarSpec()` only writes into them.
import { BAR_MAX_W, BAR_MIN_W, BYTE_SCALE_KB, LANE_HALF_Z } from "./ledgerLayout";
import { METAGRAPHS } from "../config";

/** The band key for every anchor from a metagraph that isn't publicly listed. */
export const UNLISTED_KEY = "unlisted";

export interface Band {
  key: string;   // metagraph id (== its state-channel address), or UNLISTED_KEY
  z0: number;
  z1: number;
  bytes: number;
}

export interface BarSpec {
  measured: boolean;  // false = the exact read hasn't landed (spec §6.2)
  anchored: number;   // the authoritative anchored count, from the polled feed
  kb: number;
  z0: number;
  width: number;
  clipped: boolean;
  overflow: number;   // ×N past the reference; 1 when the bar fits
  bands: Band[];      // PREALLOCATED; only the first `bandCount` are live
  bandCount: number;
}

const MAX_BANDS = METAGRAPHS.length + 1;
const BYTES_FULL = BYTE_SCALE_KB * 1024;

export function makeBarSpec(): BarSpec {
  const bands: Band[] = [];
  for (let i = 0; i < MAX_BANDS; i++) bands.push({ key: "", z0: 0, z1: 0, bytes: 0 });
  return { measured: false, anchored: 0, kb: 0, z0: -BAR_MIN_W / 2, width: BAR_MIN_W, clipped: false, overflow: 1, bands, bandCount: 0 };
}

/**
 * @param bytesByKey null = unmeasured; otherwise key → bytes carried (UNLISTED_KEY aggregated).
 * @param order      the lane order (metagraph ids); bands follow it so ribbons never cross.
 * @param anchored   the tick's authoritative anchored count (polled, exact from tick 1).
 */
export function fillBarSpec(
  out: BarSpec,
  bytesByKey: ReadonlyMap<string, number> | null,
  order: readonly string[],
  anchored: number,
): BarSpec {
  out.anchored = anchored;
  out.bandCount = 0;
  out.clipped = false;
  out.overflow = 1;

  if (!bytesByKey) {
    out.measured = false;
    out.kb = 0;
    out.width = BAR_MIN_W;
    out.z0 = -out.width / 2; // centered on the lane field (user, 2026-08-06)
    return out;
  }

  out.measured = true;
  let total = 0;
  for (const [, b] of bytesByKey) total += b;
  out.kb = total / 1024;

  if (total >= BYTES_FULL) {
    out.width = BAR_MAX_W;
    out.clipped = true;
    out.overflow = total / BYTES_FULL;
  } else {
    out.width = Math.max(BAR_MIN_W, (total / BYTES_FULL) * BAR_MAX_W);
  }
  out.z0 = -out.width / 2; // centered on the lane field (user, 2026-08-06)

  if (total <= 0) return out; // a measured tick that anchored nothing: the seam, no bands

  let z = out.z0;
  let n = 0;
  for (let i = 0; i < order.length && n < MAX_BANDS; i++) {
    const bytes = bytesByKey.get(order[i]) ?? 0;
    if (bytes <= 0) continue;
    const band = out.bands[n++];
    band.key = order[i];
    band.bytes = bytes;
    band.z0 = z;
    z += (bytes / total) * out.width;
    band.z1 = z;
  }
  const unlisted = bytesByKey.get(UNLISTED_KEY) ?? 0;
  if (unlisted > 0 && n < MAX_BANDS) {
    const band = out.bands[n++];
    band.key = UNLISTED_KEY;
    band.bytes = unlisted;
    band.z0 = z;
    z += (unlisted / total) * out.width;
    band.z1 = z;
  }
  // Absorb float drift into the last band so the bar's right edge is exactly z0 + width.
  if (n > 0) out.bands[n - 1].z1 = out.z0 + out.width;
  out.bandCount = n;
  return out;
}

// ── Ribbons (spec §4.3) — one tapering quad per anchoring lane, from the lane's fixed footprint
// above onto its own band below. The lane counts snapshots, the band measures bytes; the ribbon is
// the relationship.
export interface RibbonQuad { topZ0: number; topZ1: number; botZ0: number; botZ1: number }

/** Half the Z footprint a lane's ribbon leaves from — the lane cell, not the tile grid. */
export const RIBBON_LANE_HALF = LANE_HALF_Z / METAGRAPHS.length;

export function ribbonQuad(laneZ: number, laneHalf: number, band: Band, out: RibbonQuad): RibbonQuad {
  out.topZ0 = laneZ - laneHalf;
  out.topZ1 = laneZ + laneHalf;
  out.botZ0 = band.z0;
  out.botZ1 = band.z1;
  return out;
}
