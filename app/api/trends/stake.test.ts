import { describe, it, expect } from "vitest";
import { stakeReading, validatorKey } from "./stake";

const peer = (c: string) => c.repeat(128);

describe("stakeReading", () => {
  it("reads every registered validator, in DAG, and totals the registry", () => {
    const r = stakeReading([
      { peerId: peer("a"), node: { state: "Ready" }, nodeMetadataParameters: { name: " EUROPA " }, totalAmountDelegated: 250_00000000, totalAddressesAssigned: 4 },
      { peerId: peer("b"), node: null, nodeMetadataParameters: { name: "Benny" }, totalAmountDelegated: 50_00000000, totalAddressesAssigned: 1 },
      { peerId: peer("c"), node: { state: "Leaving" }, totalAmountDelegated: 0, totalAddressesAssigned: 0 },
    ])!;
    expect(r.total).toBe(300);
    expect(r.live).toBe(250); // only a Ready node in the cluster is live
    expect(r.delegations).toBe(5);
    expect(r.validators).toBe(2); // a validator with nothing delegated is registered, not staked
    expect(r.perValidator.map((v) => [v.key, v.name, v.dag, v.addrs, v.live])).toEqual([
      [peer("a").slice(0, 16), "EUROPA", 250, 4, true],
      [peer("b").slice(0, 16), "Benny", 50, 1, false],
      [peer("c").slice(0, 16), "", 0, 0, false],
    ]);
  });
  it("is null when the registry holds nobody, or is not a list — never a zero reading", () => {
    expect(stakeReading([])).toBeNull();
    expect(stakeReading([{ name: "no peer" }])).toBeNull();
    expect(stakeReading({ error: "x" })).toBeNull();
  });
  it("keys a validator by its peer id's first 16 hex", () => {
    expect(validatorKey("0d9216ae41388773" + "0".repeat(112))).toBe("0d9216ae41388773");
  });
});
