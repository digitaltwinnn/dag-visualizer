// The UNLISTED pseudo-network — ONE HOME (user, 2026-08-07: "make a design for the unlisted
// metagraph that is not a spot solution" — the scattered `filter === "unlisted"` branches each
// grew their own bugs). The uncataloged state channels behave as one first-class network
// everywhere ("unlisted" is a committable filter, an explorer group, a followable subject, a
// lane) — this module is the single source for BOTH its identity and its data:
//
//   · IDENTITY — `displayNetwork(id)`: the one lookup UI surfaces use where a catalog metagraph
//     OR the unlisted set may appear. Returns the catalog record shaped for display, or the
//     UNLISTED pseudo-record (core-blue hue — no single identity hue can speak for a mixed
//     set — italic by convention), or null for "all"/"dag"/unknown.
//   · DATA — the polled buffers only track the public catalog, so the EXACT reads
//     (store.snapshotExact) are the only honest source for unlisted snapshots.
//     `unlistedLog` re-exports the pure builder; `latestUnlistedTick` answers the follow
//     system's "newest tick this network anchored into".
//
// The ledger scene needs no import: `ledgerBands.UNLISTED_KEY` carries the same id string, so
// the lane, band and dim machinery match by construction.
import { METAGRAPHS } from "@/src/engine/config";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { buildUnlistedLog } from "@/src/data/anchorLog";
import type { GlobalSnapshot, SnapshotExact } from "@/src/data/types";

export const UNLISTED_ID = "unlisted";

export const LISTED_IDS: ReadonlySet<string> = new Set(METAGRAPHS.map((m) => m.id));

/** How a network presents on glass — catalog metagraphs and the unlisted set through ONE shape. */
export interface DisplayNetwork {
  id: string;
  name: string;
  ticker: string;
  /** CSS colour for dots/washes (an identity hue, or the core tone for the unlisted set). */
  hue: string;
  /** True for the unlisted pseudo-network — renders italic, never resolves machines. */
  virtual: boolean;
}

const UNLISTED_DISPLAY: DisplayNetwork = {
  id: UNLISTED_ID,
  name: "unlisted",
  ticker: "unlisted",
  hue: "var(--core)",
  virtual: true,
};

/** The one display lookup: a catalog metagraph, the unlisted pseudo-network, or null. */
export function displayNetwork(id: string | null | undefined): DisplayNetwork | null {
  if (!id) return null;
  if (id === UNLISTED_ID) return UNLISTED_DISPLAY;
  const cfg = metagraphById(id);
  if (!cfg) return null;
  return { id: cfg.id, name: cfg.name, ticker: cfg.ticker || cfg.name, hue: hex(cfg.color), virtual: false };
}

/** The unlisted snapshots in the measured window, newest first — the ONE row source (the
 *  explorer group, the anchor log and the follow system all read this). */
export function unlistedLog(
  globalSnapshots: readonly GlobalSnapshot[],
  exactByOrdinal: Readonly<Record<number, SnapshotExact | undefined>>,
) {
  return buildUnlistedLog(globalSnapshots, exactByOrdinal, LISTED_IDS);
}

/** The newest tick the unlisted set anchored into — the follow system's "latest relevant". */
export function latestUnlistedTick(
  globalSnapshots: readonly GlobalSnapshot[],
  exactByOrdinal: Readonly<Record<number, SnapshotExact | undefined>>,
): GlobalSnapshot | null {
  for (let i = globalSnapshots.length - 1; i >= 0; i--) {
    if ((exactByOrdinal[globalSnapshots[i].ordinal]?.unlistedCount ?? 0) > 0) return globalSnapshots[i];
  }
  return null;
}
