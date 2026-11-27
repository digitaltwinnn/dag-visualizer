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

  it("runs the sampler once for DED and Dor with the right bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const r = await GET(req("Bearer s3cret"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ read: {}, failed: {}, names: 0 });
    expect(run).toHaveBeenCalledTimes(1);
    expect((run.mock.calls[0] as unknown as [{ nets: string[] }])[0].nets).toEqual([DED_ID, DOR_ID]);
  });
});
