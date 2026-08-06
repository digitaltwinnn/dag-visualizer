import { describe, it, expect } from "vitest";
import { brotliCompressSync } from "node:zlib";
import { decodeChannelContent, shortSigner, SIGNER_LEN } from "./decodeChannel";

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
    const d = (await decodeChannelContent(content))!;
    expect(d.ordinal).toBe(745190);
    expect(d.height).toBe(8);
    expect(d.subHeight).toBe(73538);
    expect(d.epochProgress).toBe(745071);
    expect(d.lastSnapshotHash).toBe("338f5b63aa");
    expect(d.blocks).toBe(0);
  });

  it("truncates signer ids — a full-length list is ~16x the payload on a busy tick", async () => {
    const d = (await decodeChannelContent(content))!;
    expect(d.signers).toEqual(["04917e4b", "741b1977"]);
    expect(shortSigner("04917e4bcafebabe")).toHaveLength(SIGNER_LEN);
  });

  it("reports the application state's shape without interpreting it", async () => {
    const d = (await decodeChannelContent(content))!;
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
    const d = (await decodeChannelContent(Array.from(brotliCompressSync(Buffer.from(JSON.stringify(empty))))))!;
    expect(d.hasState).toBe(false);
    expect(d.stateKeys).toEqual([{ key: "latestOrdinal", count: 0 }, { key: "latestUpdates", count: 0 }]);
  });

  it("returns null rather than throwing on anything it cannot read", async () => {
    expect(await decodeChannelContent(null)).toBeNull();
    expect(await decodeChannelContent([1, 2, 3])).toBeNull();
    expect(await decodeChannelContent("not an array")).toBeNull();
  });
});
