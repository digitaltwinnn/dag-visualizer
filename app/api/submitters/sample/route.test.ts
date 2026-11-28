import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DED_ID, DOR_ID } from "@/src/data/submitters";

const run = vi.fn(async (_d?: unknown) => ({ read: {}, failed: {}, names: 0 }));
vi.mock("../runSubmitters", () => ({ runSubmitters: (d: unknown) => run(d) }));
vi.mock("@/app/api/trends/store", () => ({ writeStore: () => ({}) }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));

import { GET } from "./route";

const req = (auth?: string) => new Request("http://x/api/submitters/sample", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/submitters/sample", () => {
  beforeEach(() => run.mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when CRON_SECRET is unset, even for 'Bearer undefined'", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer undefined"))).status).toBe(401);
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("logs one warning per network that failed, and stays a 200", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    run.mockResolvedValueOnce({ read: { [DED_ID]: 0, [DOR_ID]: 3 }, failed: { [DED_ID]: 1062, [DOR_ID]: null }, names: 0 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await GET(req("Bearer s3cret"));
    expect(r.status).toBe(200);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain(DED_ID);
    expect(String(warn.mock.calls[0]![0])).toContain("1062");
    warn.mockRestore();
  });

  it("names an undecodable device sketch rather than an L0 read (R22)", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    run.mockResolvedValueOnce({ read: { [DOR_ID]: 0 }, failed: { [DOR_ID]: 900 }, names: 0, unreadable: { [DOR_ID]: "sub:k" } } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await GET(req("Bearer s3cret"))).status).toBe(200);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("sub:k");
    expect(String(warn.mock.calls[0]![0])).not.toContain("L0");
    warn.mockRestore();
  });

  it("runs the sampler once for DED and Dor with the right bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const r = await GET(req("Bearer s3cret"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ read: {}, failed: {}, names: 0 });
    expect(run).toHaveBeenCalledTimes(1);
    expect((run.mock.calls[0] as unknown as [{ nets: string[] }])[0].nets).toEqual([DED_ID, DOR_ID]);
  });
});
