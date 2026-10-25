import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lineageIds } from "@/src/net/lineage";

vi.mock("../network/unlistedChains", () => ({ unlistedChains: vi.fn() }));

// Each test loads the routes fresh (vi.resetModules), so `upstream.ts`'s module-level memo and
// `quiet.ts`'s sets never carry an answer from one test into the next.
let unlistedChains: ReturnType<typeof vi.fn>;
let liveGET: (req: Request) => Promise<Response>;
let globalsGET: (req: Request) => Promise<Response>;
let metaGET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let clustersGET: (req: Request) => Promise<Response>;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const req = (path: string) => new Request(`http://localhost${path}`);
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.resetModules();
  unlistedChains = vi.mocked((await import("../network/unlistedChains")).unlistedChains);
  unlistedChains.mockReset(); // the mock factory's fn survives resetModules
  ({ GET: liveGET } = await import("./route"));
  ({ GET: globalsGET } = await import("./globals/route"));
  ({ GET: metaGET } = await import("./meta/[id]/route"));
  ({ GET: clustersGET } = await import("./clusters/route"));
  fetchMock = vi.fn(async () => ok({ data: [] }));
  vi.stubGlobal("fetch", fetchMock);
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

  it("rounds a low or junk limit to the smallest rung (12), and a mid one up to 52", async () => {
    await globalsGET(req("/api/live/globals?limit=0&net=testnet"));
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=12");
    await globalsGET(req("/api/live/globals?limit=13&net=testnet"));
    expect(String(fetchMock.mock.calls[1][0])).toContain("limit=52");
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

  it("serves an unlisted id, rounding its limit up to the ladder", async () => {
    vi.mocked(unlistedChains).mockResolvedValue(["DAGunl"]);
    const res = await metaGET(req("/api/live/meta/x?limit=7"), idParams("DAGunl"));
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/currency/DAGunl/snapshots?limit=50");
  });

  it("two limits on one rung share one memo entry — one upstream read", async () => {
    const a = await metaGET(req("/api/live/meta/x?limit=7"), idParams(tracked));
    const b = await metaGET(req("/api/live/meta/x?limit=8"), idParams(tracked));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

describe("/api/live", () => {
  it("200 with the shared header, the assembled answer and memoAgeMs", async () => {
    vi.mocked(unlistedChains).mockResolvedValue([]);
    fetchMock.mockImplementation(async (u: string) =>
      ok({ data: String(u).includes("/global-snapshots") ? [{ ordinal: 2 }, { ordinal: 1 }] : [] }),
    );
    const res = await liveGET(req("/api/live"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=4, stale-while-revalidate=2");
    const body = await res.json();
    expect(body).toMatchObject({ globals: [{ ordinal: 2 }, { ordinal: 1 }], unlisted: [], failed: [], memoAgeMs: 0 });
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain(
      "https://be-mainnet.constellationnetwork.io/global-snapshots?limit=12",
    );
  });

  it("503 no-store when the globals read fails", async () => {
    vi.mocked(unlistedChains).mockResolvedValue([]);
    fetchMock.mockImplementation(async (u: string) =>
      String(u).includes("/global-snapshots") ? new Response("x", { status: 500 }) : ok({ data: [] }),
    );
    const res = await liveGET(req("/api/live"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
