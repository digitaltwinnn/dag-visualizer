import { describe, it, expect } from "vitest";
import { brotliCompressSync } from "node:zlib";
import { exactRowOf } from "./exactRow";
import { DED_ID } from "@/src/data/submitters";
import { readFileSync } from "node:fs";

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
    // One summary per block (the Data block card): updates, kinds, signers, bytes, a digest of ours.
    expect(r.dataBlockRows?.map((b) => [b.updates, b.signers, b.kinds])).toEqual([[2, 1, [{ kind: "a", count: 2 }]], [1, 1, [{ kind: "a", count: 1 }]]]);
    expect(r.dataBlockRows?.[0]?.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(r.dataBlockRows?.[0]?.bytes).toBeGreaterThan(0);
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

  it("passes the row's metaId so a DED row carries its submitters", async () => {
    const O1 = "00000000-0000-4000-8000-000000000001";
    const ded = Array.from(Buffer.from(JSON.stringify({ proofs: [], value: { dataTransactions: [{ value: { MetagraphBatchMessage: { orgId: O1 } } }] } })));
    const r = await exactRowOf(DED_ID, entry([ded]));
    expect(r.dataBlockRows?.[0].submitters).toEqual([{ id: O1, updates: 1 }]);
  });

  it("keys the exact cache at v12", () => {
    expect(readFileSync(new URL("./cachedExact.ts", import.meta.url), "utf8")).toContain('"snapshot-exact-v12"');
  });
});
