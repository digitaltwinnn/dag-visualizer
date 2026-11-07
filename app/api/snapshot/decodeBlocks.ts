import type { BlockRead, BlockTransfer, TipRead } from "@/src/engine/domain/blockBraid";
import { blockHashesOf } from "@/src/data/api";

// The blocks and tips a snapshot VALUE carries — the same shape on a global snapshot and a
// metagraph's: `blocks[].block.{value:{parent,transactions},proofs}` and
// `tips.{remainedActive,deprecated}`. Amounts and fees are datum (1e-8 DAG) on the wire and DAG
// here; each transfer keeps its own source, destination, amount and fee (`transfers`), the totals
// are their sums. A block's own hash is not in the value (the indexer computes it), so every block comes
// back with `hash: ""` and the route fills it from the explorer record, by index. Absent data
// stays absent (rule 10): no blocks → [], no tips → null.

const DATUM = 1e8;

type Ref = { hash?: unknown; height?: unknown };
type Tx = { value?: { source?: unknown; destination?: unknown; amount?: unknown; fee?: unknown } };
type RawBlock = { block?: { value?: { parent?: Ref[]; transactions?: Tx[] }; proofs?: unknown[] } };
type RawTips = {
  remainedActive?: { block?: Ref; usageCount?: unknown; introducedAt?: unknown }[];
  deprecated?: { block?: Ref; deprecatedAt?: unknown }[];
};

const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const str = (x: unknown): string => (typeof x === "string" ? x : "");

export function decodeBlocks(value: unknown): { blocks: BlockRead[]; tips: TipRead | null } {
  const v = (value ?? {}) as { blocks?: RawBlock[]; tips?: RawTips };
  const blocks: BlockRead[] = (Array.isArray(v.blocks) ? v.blocks : []).map((b) => {
    const inner = b?.block;
    const parents = (inner?.value?.parent ?? []).map((p) => ({ height: num(p?.height), hash: str(p?.hash) }));
    const txs = inner?.value?.transactions ?? [];
    let amount = 0;
    let fee = 0;
    const transfers: BlockTransfer[] = [];
    for (const t of txs) {
      const a = num(t?.value?.amount);
      const f = num(t?.value?.fee);
      amount += a;
      fee += f;
      transfers.push({ from: str(t?.value?.source), to: str(t?.value?.destination), amount: a / DATUM, fee: f / DATUM });
    }
    return {
      hash: "",
      height: parents.reduce((m, p) => Math.max(m, p.height), 0) + 1,
      parents,
      txCount: txs.length,
      amount: amount / DATUM,
      fee: fee / DATUM,
      signers: Array.isArray(inner?.proofs) ? inner.proofs.length : 0,
      transfers,
    };
  });
  const t = v.tips;
  const tips: TipRead | null = t
    ? {
        active: (t.remainedActive ?? []).map((a) => ({
          hash: str(a?.block?.hash),
          height: num(a?.block?.height),
          usage: num(a?.usageCount),
          introducedAt: num(a?.introducedAt),
        })),
        deprecated: (t.deprecated ?? []).map((d) => ({
          hash: str(d?.block?.hash),
          height: num(d?.block?.height),
          deprecatedAt: num(d?.deprecatedAt),
        })),
      }
    : null;
  return { blocks, tips };
}

/** The explorer record's block hashes, or a throw when the record is absent — so a cache wrapped
 *  around it never stores a miss. */
export function recordBlockHashes(record: { blocks?: unknown } | undefined): string[] {
  if (!record || !Array.isArray(record.blocks)) throw new Error("no record");
  return blockHashesOf(record);
}

/** Names each decoded block by index. `complete` is false when the explorer listed fewer hashes
 *  than there are blocks: the tail keeps `hash: ""` and the answer must not be cached for long. */
export function pairHashes(blocks: BlockRead[], hashes: string[]): { blocks: BlockRead[]; complete: boolean } {
  return { blocks: blocks.map((b, i) => ({ ...b, hash: hashes[i] ?? "" })), complete: hashes.length >= blocks.length };
}
