import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The LB is first, the archival nodes are the fallback — and the fallback answers EVERY way the LB
// can fail, not only its 404 (2026-10-04: the LB's CDN answered 403 "Request blocked" to one
// source IP while an archival node served the same ordinal; the old 404-only rule failed the read).
vi.mock("../archive/probe", () => ({
  getArchiveInfo: async () => ({ archival: [{ ip: "10.0.0.1", port: 9000 }] }),
}));

import { fetchGlobalJson, forgetRecentGlobals, GLOBAL_KEEP_MS, LB_BACKOFF_MS } from "./fetchGlobal";

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

// The breaker is module state, so every test starts an hour after the last one — past any backoff.
let clock = Date.UTC(2026, 9, 4);
beforeEach(() => {
  clock += 3_600_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
  forgetRecentGlobals();
});

describe("the recent-global keep", () => {
  it("pulls one ordinal once for both routes, and shares a pull still in flight", async () => {
    const calls = stub(() => Promise.resolve(ok({ from: "lb" })), () => Promise.resolve(ok({ from: "archive" })));
    const [a, b] = await Promise.all([fetchGlobalJson("mainnet", 5), fetchGlobalJson("mainnet", 5)]);
    expect(a).toEqual({ from: "lb" });
    expect(b).toEqual({ from: "lb" });
    expect(await fetchGlobalJson("mainnet", 5)).toEqual({ from: "lb" });
    expect(calls).toHaveLength(1);
  });
  it("forgets a failed pull at once, and a kept one after its while", async () => {
    let fail = true;
    const calls = stub(
      () => Promise.resolve(fail ? new Response("blocked", { status: 403 }) : ok({ from: "lb" })),
      () => Promise.resolve(new Response("", { status: 404 })),
    );
    await expect(fetchGlobalJson("mainnet", 5)).rejects.toThrow();
    fail = false;
    expect(await fetchGlobalJson("mainnet", 6)).toEqual({ from: "lb" }); // backing off → archives fail → LB after all
    const n = calls.length;
    vi.setSystemTime(clock + GLOBAL_KEEP_MS + 1);
    expect(await fetchGlobalJson("mainnet", 6)).toEqual({ from: "lb" });
    expect(calls.length).toBeGreaterThan(n);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

describe("the LB breaker", () => {
  // A blocked or failing LB is skipped for LB_BACKOFF_MS (user, 2026-10-04): knocking on a door the
  // CDN has shut costs a wasted request per tick and keeps the block alive.
  it("skips the LB after a block, and reads straight from the archives", async () => {
    const calls = stub(async () => new Response("blocked", { status: 403 }), async () => ok({ from: "archive" }));
    await fetchGlobalJson("mainnet", 5);
    const before = calls.filter((u) => u.includes(LB)).length;
    expect(await fetchGlobalJson("mainnet", 6)).toEqual({ from: "archive" });
    expect(calls.filter((u) => u.includes(LB)).length).toBe(before);
  });
  it("tries the LB again once the backoff has passed", async () => {
    let lbStatus = 503;
    const calls = stub(async () => (lbStatus === 200 ? ok({ from: "lb" }) : new Response("no", { status: lbStatus })), async () => ok({ from: "archive" }));
    await fetchGlobalJson("mainnet", 5);
    lbStatus = 200;
    vi.setSystemTime(clock + LB_BACKOFF_MS + 1);
    expect(await fetchGlobalJson("mainnet", 6)).toEqual({ from: "lb" });
    expect(calls.filter((u) => u.includes(LB)).length).toBe(2);
  });
  it("a 404 is a depth miss, not a failing LB — it trips nothing", async () => {
    const calls = stub(async () => new Response("no", { status: 404 }), async () => ok({ from: "archive" }));
    await fetchGlobalJson("mainnet", 5);
    await fetchGlobalJson("mainnet", 6);
    expect(calls.filter((u) => u.includes(LB)).length).toBe(2);
  });
  it("while backing off, asks the LB anyway when every archive fails", async () => {
    let lbStatus = 503;
    stub(async () => (lbStatus === 200 ? ok({ from: "lb" }) : new Response("no", { status: lbStatus })), async () => new Response("no", { status: 404 }));
    await expect(fetchGlobalJson("mainnet", 5)).rejects.toThrow();
    lbStatus = 200;
    expect(await fetchGlobalJson("mainnet", 6)).toEqual({ from: "lb" });
  });
  it("an LB body that fails to parse falls back to the archives and trips the backoff", async () => {
    const calls = stub(async () => new Response("not json", { status: 200 }), async () => ok({ from: "archive" }));
    expect(await fetchGlobalJson("mainnet", 5)).toEqual({ from: "archive" });
    await fetchGlobalJson("mainnet", 6);
    expect(calls.filter((u) => u.includes(LB)).length).toBe(1);
  });
});
