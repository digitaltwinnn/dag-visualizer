import { describe, it, expect } from "vitest";
import { NET, NET_DEF, METAGRAPHS, netUrl, netUrlFor } from "./current";
import { CATALOG, NETWORKS } from "@/src/engine/config";

describe("the frozen client resolver under Node", () => {
  it("resolves mainnet (no location) — the invariant the whole test suite leans on", () => {
    expect(NET).toBe("mainnet");
    expect(NET_DEF).toBe(NETWORKS.mainnet);
    expect(METAGRAPHS).toBe(CATALOG.mainnet);
  });
});

describe("netUrl", () => {
  it("appends NOTHING on mainnet — byte-identical URLs preserve CDN and browser cache keys", () => {
    expect(netUrl("/api/metagraphs")).toBe("/api/metagraphs");
    expect(netUrlFor("mainnet", "/api/archive?v=2")).toBe("/api/archive?v=2");
  });
  it("appends ?net= / &net= on dev networks", () => {
    expect(netUrlFor("testnet", "/api/metagraphs")).toBe("/api/metagraphs?net=testnet");
    expect(netUrlFor("integrationnet", "/api/archive?v=2")).toBe("/api/archive?v=2&net=integrationnet");
  });
});
