import { describe, it, expect } from "vitest";
import { brotliCompressSync } from "node:zlib";
import { DED_ID } from "@/src/data/submitters";
import { decodeChannelContent, decodeSnapshotRoot, shortSigner, SIGNER_LEN } from "./decodeChannel";

const payload = {
  value: {
    ordinal: 745190,
    height: 8,
    subHeight: 73538,
    lastSnapshotHash: "338f5b63aa",
    epochProgress: 745071,
    blocks: [],
    dataApplication: {
      onChainState: Array.from(Buffer.from(JSON.stringify({ updates: [{ deviceId: "DAG3" }, { deviceId: "DAG4" }] }))),
      blocks: [Array.from(Buffer.from(JSON.stringify({ proofs: [{ id: "79c986a5deadbeef", signature: "3044" }] })))],
      calculatedStateProof: "a6ef9b0c",
    },
  },
  proofs: [{ id: "04917e4bcafebabe", signature: "3044" }, { id: "741b1977f00dcafe", signature: "3045" }],
};
const content = Array.from(brotliCompressSync(Buffer.from(JSON.stringify(payload))));

describe("decodeChannelContent", () => {
  it("brotli-decodes an anchored entry into its real facts", async () => {
    const d = (await decodeChannelContent(content, "DAGx"))!;
    expect(d.ordinal).toBe(745190);
    expect(d.height).toBe(8);
    expect(d.subHeight).toBe(73538);
    expect(d.epochProgress).toBe(745071);
    expect(d.lastSnapshotHash).toBe("338f5b63aa");
    expect(d.blocks).toBe(0);
  });

  it("truncates signer ids — a full-length list is ~16x the payload on a busy tick", async () => {
    const d = (await decodeChannelContent(content, "DAGx"))!;
    expect(d.signers).toEqual(["04917e4b", "741b1977"]);
    expect(shortSigner("04917e4bcafebabe")).toHaveLength(SIGNER_LEN);
  });

  it("reports the application state's shape without interpreting it", async () => {
    const d = (await decodeChannelContent(content, "DAGx"))!;
    expect(d.hasState).toBe(true);
    expect(d.stateBytes).toBeGreaterThan(0);
    expect(d.stateProof).toBe("a6ef9b0c");
    expect(d.stateKeys).toEqual([{ key: "updates", count: 2 }]);
    expect(JSON.parse(d.state).updates).toHaveLength(2);
    expect(d.dataBlockSigners).toEqual(["79c986a5"]);
  });

  it("calls a genuinely empty state what it is", async () => {
    const empty = {
      value: { ordinal: 1, dataApplication: { onChainState: Array.from(Buffer.from('{"latestOrdinal":{},"latestUpdates":{}}')), blocks: [] } },
      proofs: [],
    };
    const d = (await decodeChannelContent(Array.from(brotliCompressSync(Buffer.from(JSON.stringify(empty)))), "DAGx"))!;
    expect(d.hasState).toBe(false);
    expect(d.stateKeys).toEqual([{ key: "latestOrdinal", count: 0 }, { key: "latestUpdates", count: 0 }]);
  });

  it("marks a data block it cannot read as unread, and the snapshot's update count unknown — never 0 (review M3)", async () => {
    const odd = {
      value: { ordinal: 2, dataApplication: { onChainState: [], blocks: [Array.from(Buffer.from("not json")), Array.from(Buffer.from(JSON.stringify({ value: { updates: [{ value: 1 }] } })))] } },
      proofs: [],
    };
    const d = (await decodeChannelContent(Array.from(brotliCompressSync(Buffer.from(JSON.stringify(odd)))), "DAGx"))!;
    expect(d.dataBlocks).toBe(2);
    expect(d.dataTxCount).toBeUndefined();
    expect(d.dataBlockRows.map((r) => r.unread ?? false)).toEqual([true, false]);
    expect(d.dataBlockRows[1]!.updates).toBe(1);
  });

  it("returns null rather than throwing on anything it cannot read", async () => {
    expect(await decodeChannelContent(null, "DAGx")).toBeNull();
    expect(await decodeChannelContent([1, 2, 3], "DAGx")).toBeNull();
    expect(await decodeChannelContent("not an array", "DAGx")).toBeNull();
  });
});

describe("decodeSnapshotRoot submitters", () => {
  const dedBlock = (ids: string[]) => Array.from(Buffer.from(JSON.stringify({ proofs: [], value: { dataTransactions: ids.map((orgId) => ({ value: { MetagraphBatchMessage: { orgId } } })) } })));
  const root = (blocks: number[][]) => ({ value: { ordinal: 1, dataApplication: { onChainState: [], blocks } }, proofs: [] });
  it("tallies each data block's submitters on a submitter network", () => {
    const A = "00000000-0000-4000-8000-00000000000a", B = "00000000-0000-4000-8000-00000000000b";
    const d = decodeSnapshotRoot(root([dedBlock([A, A, B])]), DED_ID);
    expect(d.dataBlockRows[0].submitters).toEqual([{ id: A, updates: 2 }, { id: B, updates: 1 }]);
    expect(d.dataBlockRows[0].updates).toBe(3);
  });
  it("leaves submitters absent on a network with no row", () => {
    expect(decodeSnapshotRoot(root([dedBlock(["a"])]), "DAGother").dataBlockRows[0].submitters).toBeUndefined();
  });
  it("an unreadable block is unread with no submitters", () => {
    const d = decodeSnapshotRoot(root([Array.from(Buffer.from("not json"))]), DED_ID);
    expect(d.dataBlockRows[0].unread).toBe(true);
    expect(d.dataBlockRows[0].submitters).toBeUndefined();
  });
});
