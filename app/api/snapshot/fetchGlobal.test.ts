import { afterEach, describe, expect, it, vi } from "vitest";

// The LB is first, the archival nodes are the fallback — and the fallback answers EVERY way the LB
// can fail, not only its 404 (2026-10-04: the LB's CDN answered 403 "Request blocked" to one
// source IP while an archival node served the same ordinal; the old 404-only rule failed the read).
vi.mock("../archive/probe", () => ({
  getArchiveInfo: async () => ({ archival: [{ ip: "10.0.0.1", port: 9000 }] }),
}));

import { fetchGlobalJson } from "./fetchGlobal";

const LB = "l0-lb-mainnet";
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function stub(lb: () => Promise<Response>, archival: () => Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    calls.push(url);
    return url.includes(LB) ? lb() : archival();
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchGlobalJson", () => {
  it("answers from the LB when it can, and never asks an archive", async () => {
    const calls = stub(async () => ok({ from: "lb" }), async () => ok({ from: "archive" }));
    expect(await fetchGlobalJson("mainnet", 5)).toEqual({ from: "lb" });
    expect(calls).toHaveLength(1);
  });

  it.each([404, 403, 503])("falls back to an archival node when the LB answers %i", async (status) => {
    stub(async () => new Response("no", { status }), async () => ok({ from: "archive" }));
    expect(await fetchGlobalJson("mainnet", 5)).toEqual({ from: "archive" });
  });

  it("falls back when the LB cannot be reached at all", async () => {
    stub(async () => { throw new TypeError("fetch failed"); }, async () => ok({ from: "archive" }));
    expect(await fetchGlobalJson("mainnet", 5)).toEqual({ from: "archive" });
  });

  it("throws, naming the LB's answer, when no archive has it either", async () => {
    stub(async () => new Response("no", { status: 403 }), async () => new Response("no", { status: 404 }));
    await expect(fetchGlobalJson("mainnet", 5)).rejects.toThrow(/l0 403/);
  });
});
