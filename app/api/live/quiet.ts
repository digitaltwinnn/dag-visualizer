// The quiet rule for unlisted chains, server side: the client's `_refreshOneMeta` test (no snapshot
// for RETIRE_QUIET_DAYS), plus the per-network set that lets later cache misses skip a chain found
// quiet. The set is rebuilt hourly, the cadence the client re-reads the unlisted list at.
import type { RawMetaSnapshot } from "@/src/data/types";
import { RETIRE_QUIET_DAYS } from "@/src/net/retire";

export const QUIET_REBUILD_MS = 3_600_000;

export function isQuiet(list: RawMetaSnapshot[], now: number): boolean {
  if (!list.length) return true;
  return now - Date.parse(list[0].timestamp) >= RETIRE_QUIET_DAYS * 86_400_000;
}

const sets = new Map<string, { builtAt: number; ids: Set<string> }>();

export function quietSetFor(net: string, now: number = Date.now()): Set<string> {
  let e = sets.get(net);
  if (!e || now - e.builtAt >= QUIET_REBUILD_MS) {
    e = { builtAt: now, ids: new Set() };
    sets.set(net, e);
  }
  return e.ids;
}
