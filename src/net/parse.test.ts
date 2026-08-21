import { describe, it, expect } from "vitest";
import { parseNet } from "./parse";

describe("parseNet", () => {
  it("accepts exactly the two dev networks", () => {
    expect(parseNet("?net=integrationnet")).toBe("integrationnet");
    expect(parseNet("?net=testnet")).toBe("testnet");
    expect(parseNet("?stats&net=testnet")).toBe("testnet");
  });
  it("falls back to mainnet on anything else", () => {
    expect(parseNet("")).toBe("mainnet");
    expect(parseNet(null)).toBe("mainnet");
    expect(parseNet("?net=mainnet")).toBe("mainnet");
    expect(parseNet("?net=TESTNET")).toBe("mainnet"); // exact ids only — no case folding
    expect(parseNet("?net=devnet")).toBe("mainnet");
    expect(parseNet("?net=testnetX")).toBe("mainnet");
  });
});
