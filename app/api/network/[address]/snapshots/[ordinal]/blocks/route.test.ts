import { afterEach, describe, expect, it, vi } from "vitest";
import { METAGRAPHS } from "@/src/engine/config";

// The blocks route: one numeric ordinal, immutable, a day — and nothing else (the `latest` frontier
// read left with the open tips, design round D5). The platform cache is a pass-through here and
// every upstream read is a stubbed fetch, keyed by URL.
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));

const { GET } = await import("./route");

const ADDRESS = METAGRAPHS[0]!.id;
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

describe("a numeric ordinal", () => {
  it("keeps its immutable day", async () => {
    stub({
      [`/metagraphs/${ADDRESS}`]: { data: { urls: { l0: L0 } } },
      [`${L0}/snapshots/2973`]: { value: VALUE },
      [`/currency/${ADDRESS}/snapshots/2973`]: { data: { blocks: ["b0"] } },
    });
    const r = await call("2973");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=86400, s-maxage=86400, immutable");
    const d = await r.json();
    expect(d.blocks[0].hash).toBe("b0");
    // The answer is the ordinal and its blocks: the value's tips are not read (D5).
    expect(Object.keys(d).sort()).toEqual(["blocks", "ordinal"]);
  });

  it("refuses anything else — `latest` included", async () => {
    expect((await call("newest")).status).toBe(400);
    expect((await call("latest")).status).toBe(400);
  });
});
