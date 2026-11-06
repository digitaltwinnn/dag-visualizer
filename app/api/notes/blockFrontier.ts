import { NETWORKS, type NetworkId } from "@/src/engine/config";
import type { TipRead } from "@/src/engine/domain/blockBraid";
import { decodeBlocks } from "../snapshot/decodeBlocks";
import { fetchGlobalJson } from "../snapshot/fetchGlobal";
import { latestMetaSnapshot } from "../network/metaL0";

// THE BLOCK DAG'S FRONTIER, FOR ITS NOTE — the live half of the facts (`noteFactsBlocks.ts`): the
// DAG's height and sub-height from the explorer's newest global record, its open tips from that
// global's own snapshot (the shared pull, `fetchGlobalJson`, the very read the chamber's exact reads
// make), and each listed chain's tips from its own L0's newest snapshot (`metaL0.ts`, the read the
// Blocks register's frontier route makes). Read when the note is written, at most hourly.
//
// HONESTY (rule 10): every part fails soft and alone. A read that fails answers null for what it
// would have stated — no tips for that chain, no height — so the note states what was read and
// nothing it was not; a failed frontier never fails the note, whose block counts are the store's.

export interface BlockFrontierRead {
  frontier: Record<string, TipRead | null>;
  height: number | null;
  subHeight: number | null;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

async function newestGlobal(net: NetworkId): Promise<{ ordinal: number; height: number | null; subHeight: number | null } | null> {
  try {
    const r = await fetch(`${NETWORKS[net].be}/global-snapshots/latest`, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = ((await r.json()) as { data?: { ordinal?: unknown; height?: unknown; subHeight?: unknown } }).data;
    const ordinal = num(d?.ordinal);
    return ordinal == null ? null : { ordinal, height: num(d?.height), subHeight: num(d?.subHeight) };
  } catch {
    return null;
  }
}

async function dagTips(net: NetworkId, ordinal: number): Promise<TipRead | null> {
  try {
    const j = (await fetchGlobalJson(net, ordinal)) as { value?: unknown };
    return decodeBlocks(j.value ?? j).tips;
  } catch {
    return null;
  }
}

/** The DAG's frontier and each of `chains`' (catalog ids, the DAG left out). */
export async function readBlockFrontier(net: string, chains: readonly string[]): Promise<BlockFrontierRead> {
  const n = net as NetworkId;
  const tokens = chains.filter((c) => c !== "dag");
  const [global, tokenTips] = await Promise.all([
    newestGlobal(n),
    Promise.all(tokens.map((c) => latestMetaSnapshot(n, c).then((r) => r.tips, () => null))),
  ]);
  const frontier: Record<string, TipRead | null> = { dag: global ? await dagTips(n, global.ordinal) : null };
  tokens.forEach((c, i) => (frontier[c] = tokenTips[i] ?? null));
  return { frontier, height: global?.height ?? null, subHeight: global?.subHeight ?? null };
}
