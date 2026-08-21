import { describe, it, expect } from "vitest";
import { netOf } from "./request";

describe("netOf — the per-request server resolver", () => {
  it("reads the same param through the same validator", () => {
    expect(netOf(new Request("http://x/api/geo?net=testnet"))).toBe("testnet");
    expect(netOf(new Request("http://x/api/geo?net=integrationnet"))).toBe("integrationnet");
    expect(netOf(new Request("http://x/api/geo"))).toBe("mainnet");
    expect(netOf(new Request("http://x/api/geo?net=nonsense"))).toBe("mainnet");
  });
});
