import { NETWORKS, type NetworkId } from "@/src/engine/config";

// THE DAG'S HEIGHT, FOR THE BLOCK DAG'S NOTE — the live half of its facts (`noteFactsBlocks.ts`):
// the height and sub-height of the explorer's newest global record, the same two fields of the same
// record the Block card's chip and the live feed read. Read when the note is written, at most hourly.
//
// HONESTY (rule 10): a read that fails answers null for both — the note states no height, never a
// zero — and never fails the note, whose block counts are the store's.

export interface DagHeightRead {
  height: number | null;
  subHeight: number | null;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** The newest global snapshot's `height` and `subHeight`. */
export async function readDagHeight(net: string): Promise<DagHeightRead> {
  try {
    const r = await fetch(`${NETWORKS[net as NetworkId].be}/global-snapshots/latest`, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { height: null, subHeight: null };
    const d = ((await r.json()) as { data?: { height?: unknown; subHeight?: unknown } }).data;
    return { height: num(d?.height), subHeight: num(d?.subHeight) };
  } catch {
    return { height: null, subHeight: null };
  }
}
