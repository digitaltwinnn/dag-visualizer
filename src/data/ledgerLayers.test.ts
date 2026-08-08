import { describe, it, expect } from "vitest";
import { LEDGER_LAYERS, ledgerLayerById } from "./ledgerLayers";
import { LAYER_GEOM } from "@/src/engine/domain/ledgerLayout";

describe("ledgerLayers (UI copy) ↔ ledgerLayout (geometry)", () => {
  it("the copy table covers exactly the geometry table's layer ids, in the same order", () => {
    expect(LEDGER_LAYERS.map((l) => l.id)).toEqual(LAYER_GEOM.map((l) => l.id));
  });
  it("every layer has non-empty display copy", () => {
    for (const l of LEDGER_LAYERS) {
      expect(l.name.length).toBeGreaterThan(0);
      expect(l.desc.length).toBeGreaterThan(0);
    }
  });
  it("ledgerLayerById resolves ids and returns undefined for unknowns", () => {
    expect(ledgerLayerById("msnap")?.name).toBe("Metagraph snapshots");
    expect(ledgerLayerById("gl0")?.name).toBe("Global snapshots");
    expect(ledgerLayerById("hypl1")).toBeUndefined(); // the node layers left the copy table (2026-08-06)
    expect(ledgerLayerById("nope")).toBeUndefined();
  });
});
