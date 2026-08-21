// The UNLISTED pseudo-network — ONE HOME (user, 2026-08-07: "make a design for the unlisted
// metagraph that is not a spot solution" — the scattered `filter === "unlisted"` branches each
// grew their own bugs). The uncataloged state channels behave as one first-class network
// everywhere ("unlisted" is a committable filter, an explorer group, a followable subject, a
// lane) — this module is the single source for BOTH its identity and its data:
//
//   · IDENTITY — `displayNetwork(id)`: the one lookup UI surfaces use where a catalog metagraph
//     OR the unlisted set may appear. Returns the catalog record shaped for display, or the
//     UNLISTED pseudo-record (neutral gray, both lanes — no single identity hue can speak for a
//     mixed set, so none does; 2026-08-08 — italic by convention), or null for "all"/unknown.
//     Note "dag" is NOT null: under the unified node model the core is a catalog metagraph, so it
//     presents as an ordinary network here.
//   · DATA — the polled buffers only track the public catalog, so the EXACT reads
//     (store.snapshotExact) are the only honest source for unlisted snapshots.
//     `unlistedLog` re-exports the pure builder; `latestUnlistedTick` answers the follow
//     system's "newest tick this network anchored into".
//
// The ledger scene needs no import: `ledgerBands.UNLISTED_KEY` carries the same id string, so
// the lane, band and dim machinery match by construction.
import { METAGRAPHS } from "@/src/net/current";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { buildUnlistedLog } from "@/src/data/anchorLog";
import type { GlobalSnapshot, MetaCfg, SnapshotExact } from "@/src/data/types";

export const UNLISTED_ID = "unlisted";

// The unlisted set's NEUTRAL identity — gray in BOTH lanes (user, 2026-08-08: it wore three
// different colours — core-blue chips, cyan scene blocks, and address-hashed hues on the
// snapshot card. No single identity can speak for a mixed uncataloged set, so none does):
//   · HUD lane — the muted-foreground token (CSS var, resolves ~#8a96b8);
//   · scene lane — the same tone as a baked number (the scene can't resolve CSS vars;
//     Engine folds it into every scene-color map it builds, so lanes/bands/ribbons/tiles
//     pick it up like any catalog hue).
export const UNLISTED_HUE = "var(--muted-foreground)";
// The same tone as RESOLVED hexes, for the two surfaces that can't resolve a CSS var: SVG
// attributes (RailThread — review fix 2026-08-08: its var() guard fell back to the core blue,
// repainting the thread in exactly the colour this identity retired) and the scene.
export const UNLISTED_HUD_HEX = "#8a96b8";
export const UNLISTED_SCENE_HEX = 0x8a96b8;

export const LISTED_IDS: ReadonlySet<string> = new Set(METAGRAPHS.map((m) => m.id));

/** The unlisted set as a MetaCfg, so the SAME dossier component renders it (user, 2026-08-14 —
 *  "I'd rather not just share grammar but prefer sharing components"). The blurb is built by
 *  the card from its observed members, so it stays empty here. */
export const UNLISTED_CFG: MetaCfg = {
  id: UNLISTED_ID,
  name: "unlisted",
  ticker: "unlisted",
  color: UNLISTED_SCENE_HEX,
  blurb: "",
};

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
  hue: UNLISTED_HUE,
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

/** Distinct uncataloged addresses observed in the measured window, newest first. Each IS a
 *  distinct metagraph — a network id is a chain identity — just absent from the public
 *  catalog, so the card can state per-address chain facts (user, 2026-08-14) while machines
 *  stay honestly unknowable. */
export function observedUnlistedIds(
  globalSnapshots: readonly GlobalSnapshot[],
  exactByOrdinal: Readonly<Record<number, SnapshotExact | undefined>>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of unlistedLog(globalSnapshots, exactByOrdinal)) {
    if (!seen.has(row.metaId)) {
      seen.add(row.metaId);
      out.push(row.metaId);
    }
  }
  return out;
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
