import { describe, it, expect } from "vitest";
import { ledgerNetwork, ledgerCardNetwork, sameTickNet } from "./tickNet";

describe("ledgerNetwork (the network the ledger's Metagraph rung, dim and tilt resolve against)", () => {
  it("is the app filter when nothing is committed inside the tick", () => {
    expect(ledgerNetwork({ filter: "all", tickNet: null, snapOrdinal: 42 })).toBe("all");
    expect(ledgerNetwork({ filter: "dor", tickNet: null, snapOrdinal: 42 })).toBe("dor");
  });

  it("is the tick-local network while its tick is the one on screen", () => {
    expect(ledgerNetwork({ filter: "all", tickNet: { metaId: "dor", globalOrdinal: 42 }, snapOrdinal: 42 })).toBe("dor");
  });

  it("the finer, tick-local commit wins over the app filter inside its tick", () => {
    expect(ledgerNetwork({ filter: "ded", tickNet: { metaId: "dor", globalOrdinal: 42 }, snapOrdinal: 42 })).toBe("dor");
  });

  it("never outlives its tick: another tick on screen, or none, falls back to the filter", () => {
    const tickNet = { metaId: "dor", globalOrdinal: 42 };
    expect(ledgerNetwork({ filter: "all", tickNet, snapOrdinal: 43 })).toBe("all");
    expect(ledgerNetwork({ filter: "ded", tickNet, snapOrdinal: null })).toBe("ded");
  });
});

describe("sameTickNet", () => {
  it("matches on the network and the tick it sits in", () => {
    const a = { metaId: "dor", globalOrdinal: 42 };
    expect(sameTickNet(a, { ...a })).toBe(true);
    expect(sameTickNet(a, { ...a, globalOrdinal: 43 })).toBe(false);
    expect(sameTickNet(a, { ...a, metaId: "ded" })).toBe(false);
    expect(sameTickNet(null, null)).toBe(true);
    expect(sameTickNet(a, null)).toBe(false);
  });
});

describe("ledgerCardNetwork (the rail's Metagraph card)", () => {
  const TN = { metaId: "paca", globalOrdinal: 10 };
  it("stands down for a filtered network the tick on screen did not anchor", () => {
    expect(ledgerCardNetwork({ filter: "dor", tickNet: null, snapOrdinal: 10, tickHasFilter: false })).toBe("all");
  });
  it("shows the filter when the tick is in its story, or the verdict is unknown, or no tick is open", () => {
    expect(ledgerCardNetwork({ filter: "dor", tickNet: null, snapOrdinal: 10, tickHasFilter: true })).toBe("dor");
    expect(ledgerCardNetwork({ filter: "dor", tickNet: null, snapOrdinal: 10 })).toBe("dor");
    expect(ledgerCardNetwork({ filter: "dor", tickNet: null, snapOrdinal: null, tickHasFilter: false })).toBe("dor");
  });
  it("a tick-local network always shows — it is in its tick by construction", () => {
    expect(ledgerCardNetwork({ filter: "dor", tickNet: TN, snapOrdinal: 10, tickHasFilter: false })).toBe("paca");
    // …and once its tick is no longer on screen the filter's own rule applies again.
    expect(ledgerCardNetwork({ filter: "dor", tickNet: TN, snapOrdinal: 11, tickHasFilter: false })).toBe("all");
  });
});
