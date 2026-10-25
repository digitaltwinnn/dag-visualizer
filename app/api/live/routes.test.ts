import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../network/unlistedChains", () => ({ unlistedChains: vi.fn() }));

import { unlistedChains } from "../network/unlistedChains";
import { GET as globalsGET } from "./globals/route";
import { GET as metaGET } from "./meta/[id]/route";
import { GET as clustersGET } from "./clusters/route";
import { lineageIds } from "@/src/net/lineage";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const req = (path: string) => new Request(`http://localhost${path}`);
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ok({ data: [] }));
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(unlistedChains).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/api/live/globals", () => {
  it("clamps limit to POLL.maxSnapshots", async () => {
    const res = await globalsGET(req("/api/live/globals?limit=999"));
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=52");
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=4, stale-while-revalidate=2");
    expect(await res.json()).toMatchObject({ globals: [], memoAgeMs: 0 });
  });

  it("clamps a low or junk limit to 1", async () => {
    await globalsGET(req("/api/live/globals?limit=0&net=testnet"));
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=1");
  });

  it("503 no-store on upstream failure", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 500 }));
    const res = await globalsGET(req("/api/live/globals?limit=3&net=integrationnet"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("/api/live/meta/[id]", () => {
  const tracked = lineageIds("mainnet")[0];

  it("404s an untracked, unlisted id without fetching", async () => {
    vi.mocked(unlistedChains).mockResolvedValue([]);
    const res = await metaGET(req("/api/live/meta/DAGnope?limit=5"), idParams("DAGnope"));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves a tracked id without consulting the unlisted list, clamping limit to 600", async () => {
    const res = await metaGET(req("/api/live/meta/x?limit=9999"), idParams(tracked));
    expect(res.status).toBe(200);
    expect(unlistedChains).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/currency/${tracked}/snapshots?limit=600`);
    expect(await res.json()).toMatchObject({ snapshots: [], memoAgeMs: 0 });
  });

  it("serves an unlisted id", async () => {
    vi.mocked(unlistedChains).mockResolvedValue(["DAGunl"]);
    const res = await metaGET(req("/api/live/meta/x?limit=7"), idParams("DAGunl"));
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/currency/DAGunl/snapshots?limit=7");
  });

  it("503 no-store when the unlisted list cannot verify an untracked id", async () => {
    vi.mocked(unlistedChains).mockRejectedValue(new Error("down"));
    const res = await metaGET(req("/api/live/meta/x?limit=7"), idParams("DAGq"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("/api/live/clusters", () => {
  it("503 no-store when l1 is empty", async () => {
    fetchMock.mockImplementation(async (u: string) => ok(String(u).includes("l0-lb") ? [{ id: "a" }] : []));
    const res = await clustersGET(req("/api/live/clusters?net=testnet"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reads the requested network and sets the clusters header", async () => {
    fetchMock.mockImplementation(async () => ok([{ id: "a" }]));
    const res = await clustersGET(req("/api/live/clusters?net=integrationnet"));
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain(
      "https://l0-lb-integrationnet.constellationnetwork.io/cluster/info",
    );
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=25, stale-while-revalidate=5");
    expect(await res.json()).toMatchObject({ l0: [{ id: "a" }], l1: [{ id: "a" }], memoAgeMs: 0 });
  });
});
