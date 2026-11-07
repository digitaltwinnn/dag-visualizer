import { describe, it, expect } from "vitest";
import { brotliCompressSync } from "node:zlib";
import { exactRowOf } from "./exactRow";

// The per-ordinal exact read's ROW for one anchored metagraph snapshot (`/api/snapshot/[ordinal]`).
// The count of data updates rides the row (D6, 2026-11-07), so the metagraph snapshot card and the
// Data blocks register read it from the exact read, never from the deep channel read.

const block = (txs: unknown[]) => Array.from(Buffer.from(JSON.stringify({ proofs: [{ id: "79c986a5deadbeef" }], value: { dataTransactions: txs } })));
const entry = (blocks: number[][]) => {
  const payload = { value: { ordinal: 42, blocks: [], dataApplication: { onChainState: [], blocks } }, proofs: [{ id: "04917e4bcafebabe" }] };
  return { value: { fee: 7, content: Array.from(brotliCompressSync(Buffer.from(JSON.stringify(payload)))) } };
};

describe("exactRowOf", () => {
  it("carries the data updates and the data blocks they ride in", async () => {
    const r = await exactRowOf("DAGdata", entry([block([[{ value: { a: 1 } }, { value: { a: 2 } }]]), block([{ value: { a: 3 } }])]));
    expect(r.metaId).toBe("DAGdata");
    expect(r.ordinal).toBe(42);
    expect(r.decoded).toBe(true);
    expect(r.fee).toBe(7);
    expect(r.dataTxCount).toBe(3);
    expect(r.dataBlocks).toBe(2);
    expect(r.dataBytes).toBeGreaterThan(0);
  });

  it("says zero for a snapshot that carried no data blocks", async () => {
    const r = await exactRowOf("DAGcoin", entry([]));
    expect(r.dataTxCount).toBe(0);
    expect(r.dataBlocks).toBe(0);
  });

  it("states no count for a payload it cannot decode — unknown, never zero (rule 10)", async () => {
    const r = await exactRowOf("DAGodd", { value: { fee: 1, content: [1, 2, 3] } });
    expect(r.decoded).toBe(false);
    expect(r.dataTxCount).toBeUndefined();
    expect(r.dataBlocks).toBeUndefined();
  });
});
