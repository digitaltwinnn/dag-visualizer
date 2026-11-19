"use client";

import { useStore } from "@/src/store/store";
import { displayNetwork, UNLISTED_ID } from "@/src/data/unlisted";
import { registerRuns } from "@/src/engine/domain/viewPolicy";
import type { LedgerRegister } from "@/src/store/mode";
import { filterLayers } from "@/src/data/composition";
import { useFeedRead } from "@/components/useFeedRead";
import type { RegisterLineScope } from "@/components/views";

/** THE FILTER, AS THE SNAPSHOTS VIEW'S REGISTERS READ IT (user, 2026-11-19): the scope the line under
 *  the switch speaks for (everything, the DAG, one network by its ticker, the unlisted set as several),
 *  and whether the filtered network makes each register's subject (`viewPolicy.registerRuns`, over the
 *  layers its located nodes run — the kind word's own read). One home, so the switch, the band, the
 *  explorer and RAW cannot disagree about which register has no subject. */
export function useRegisterScope(who: string): { scope: RegisterLineScope; runs: (r: LedgerRegister) => boolean } {
  const filter = useStore((s) => s.filter);
  const metaList = useStore((s) => s.metaList);
  useFeedRead(["api-metagraphs"], who, filter !== "all" && filter !== UNLISTED_ID);
  const scope: RegisterLineScope =
    filter === "all" ? "all"
    : filter === "dag" ? "dag"
    : filter === UNLISTED_ID ? { ticker: "Unlisted networks", plural: true }
    : { ticker: displayNetwork(filter)?.ticker ?? filter };
  const layers = filterLayers(filter, metaList);
  return { scope, runs: (r) => registerRuns(r, layers) };
}

/** IS THE SNAPSHOTS VIEW'S FOLLOW N/A — the register open has no subject under the filter, the
 *  network running no such layer at all (UP in Data blocks)? The heartbeat stands still there
 *  (`followLatest`), and every live / pinned mark says "n/a" (user, 2026-11-19: "it can't be live but
 *  should be n/a"). Only the missing LAYER: a network that runs it but shows no block is still live. */
export function useFollowPaused(who: string): boolean {
  const mode = useStore((s) => s.mode);
  const register = useStore((s) => s.ledgerRegister);
  const { runs } = useRegisterScope(who);
  return mode === "ledger" && !runs(register);
}
