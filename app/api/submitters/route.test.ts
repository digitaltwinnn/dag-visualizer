import { beforeEach, describe, expect, it, vi } from "vitest";
import { DED_ID } from "@/src/data/submitters";

const calls: string[] = [];
const NOW = Date.UTC(2026, 10, 27, 10, 20);
const H = 3600000;
vi.mock("@/app/api/trends/store", () => ({
  readStore: () => ({
    hgetall: async (k: string) => {
      calls.push(k);
      if (k.endsWith(":span")) return { from: String(Date.UTC(2026, 10, 1)), to: String(Date.UTC(2026, 10, 27, 8, 30)) };
      return null;
    },
  }),
}));

import { GET } from "./route";

const get = (qs: string) => GET(new Request(`http://x/api/submitters${qs}`));

describe("GET /api/submitters", () => {
  beforeEach(() => { calls.length = 0; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });

  it("rejects a network without a submitter table and a bad range", async () => {
    expect((await get("?net=USDC&window=24h")).status).toBe(400);
    expect((await get(`?net=${DED_ID}`)).status).toBe(400);
    expect((await get(`?net=${DED_ID}&from=5&to=5`)).status).toBe(400);
    expect((await get(`?net=${DED_ID}&from=x&to=5`)).status).toBe(400);
  });

  it("window=24h reads the 1h hashes under the measured hours and sets the cache header", async () => {
    const r = await get(`?net=${DED_ID}&window=24h`);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    const w = await r.json();
    expect(w.tier).toBe("1h");
    expect(w.buckets).toHaveLength(24);
    expect(w.buckets[23]).toBe(Date.UTC(2026, 10, 27, 7));
    expect(w.buckets[0]).toBe(Date.UTC(2026, 10, 27, 7) - 23 * H);
    expect(calls).toContain(`sub:mainnet:${DED_ID}:1h:2026-11`);
  });

  it("picks the 1d tier for a range over 30 days", async () => {
    const to = NOW, from = NOW - 40 * 86400000;
    const w = await (await get(`?net=${DED_ID}&from=${from}&to=${to}`)).json();
    expect(w.tier).toBe("1d");
  });
});
