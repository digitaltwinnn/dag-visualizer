import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG } from "@/src/engine/config";

// The blocks route's two paths: a numeric ordinal (immutable, a day) and `latest`, the chain's
// FRONTIER (25 s at the edge, never immutable). The platform cache is a pass-through here and every
// upstream read is a stubbed fetch, keyed by URL.
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));

const { GET } = await import("./route");

const ADDRESS = CATALOG.mainnet[0]!.id;
const L0 = "http://l0.example:7000";
const VALUE = {
  ordinal: 2973,
  blocks: [{ block: { value: { parent: [{ hash: "p0", height: 4 }, { hash: "p1", height: 5 }], transactions: [{ value: { amount: 1e8, fee: 0 } }] }, proofs: [{}, {}] } }],
  tips: { remainedActive: [{ block: { hash: "t0", height: 6 }, usageCount: 1, introducedAt: 2970 }], deprecated: [] },
};

function stub(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const hit = Object.entries(routes).find(([k]) => String(url).includes(k));
    if (!hit || hit[1] instanceof Error) return new Response("no", { status: 502 });
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  }));
}
const call = (ordinal: string) =>
  GET(new Request(`http://x/api/network/${ADDRESS}/snapshots/${ordinal}/blocks`), { params: Promise.resolve({ address: ADDRESS, ordinal }) });

afterEach(() => vi.unstubAllGlobals());

describe("the latest snapshot's blocks: the chain's frontier", () => {
  it("is read from the L0's /snapshots/latest, named by the explorer record, stamped, and held 25 s", async () => {
    stub({
      [`/metagraphs/${ADDRESS}`]: { data: { urls: { l0: L0 } } },
      [`${L0}/snapshots/latest`]: { value: VALUE },
      [`/currency/${ADDRESS}/snapshots/2973`]: { data: { blocks: ["b0"], timestamp: "2026-11-06T12:00:00.000Z" } },
    });
    const r = await call("latest");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("public, s-maxage=25");
    const d = await r.json();
    expect(d.ordinal).toBe(2973);
    expect(d.ts).toBe("2026-11-06T12:00:00.000Z");
    expect(d.blocks[0].hash).toBe("b0");
    expect(d.tips.active).toEqual([{ hash: "t0", height: 6, usage: 1, introducedAt: 2970 }]);
  });

  it("still answers when the indexer has not reached the newest record: no hashes, no stamp", async () => {
    stub({ [`/metagraphs/${ADDRESS}`]: { data: { urls: { l0: L0 } } }, [`${L0}/snapshots/latest`]: { value: VALUE } });
    const d = await (await call("latest")).json();
    expect(d.blocks[0].hash).toBe("");
    expect(d.ts).toBeUndefined();
    expect(d.tips.active).toHaveLength(1);
  });

  it("a failed L0 read is a 503 that is never cached", async () => {
    stub({ [`/metagraphs/${ADDRESS}`]: { data: { urls: { l0: L0 } } } });
    const r = await call("latest");
    expect(r.status).toBe(503);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("a numeric ordinal", () => {
  it("keeps its immutable day", async () => {
    stub({
      [`/metagraphs/${ADDRESS}`]: { data: { urls: { l0: L0 } } },
      [`${L0}/snapshots/2973`]: { value: VALUE },
      [`/currency/${ADDRESS}/snapshots/2973`]: { data: { blocks: ["b0"] } },
    });
    const r = await call("2973");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=86400, s-maxage=86400, immutable");
    expect((await r.json()).blocks[0].hash).toBe("b0");
  });

  it("refuses anything else", async () => {
    expect((await call("newest")).status).toBe(400);
  });
});
