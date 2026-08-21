import { describe, it, expect } from "vitest";
import { hoverKeyOf, tooltipSubject } from "./hoverSubject";

// The identity colour for every NON-metagraph subject is the token itself, `var(--primary)` —
// resolved by CSS at render time (Tooltip renders it as a `color` style property), never by
// JS, so there is nothing to keep in sync with the network's accent override.
const CORE = "var(--primary)";

describe("hoverKeyOf", () => {
  it("keys a metagraph node by ip", () => {
    expect(hoverKeyOf({ kind: "metanode", node: { ip: "1.2.3.4", id: "abc" } } as never)).toBe("1.2.3.4");
  });
  it("keys a DAG validator by machine id", () => {
    expect(hoverKeyOf({ kind: "l0", node: { id: "node-9c2", ip: "5.6.7.8" } } as never)).toBe("node-9c2");
  });
  it("is null for a hub, a snapshot, and nullish", () => {
    expect(hoverKeyOf({ kind: "meta", cfg: {} } as never)).toBeNull();
    expect(hoverKeyOf({ kind: "snapshot", data: { ordinal: 1 } } as never)).toBeNull();
    expect(hoverKeyOf(null)).toBeNull();
  });
});

describe("tooltipSubject", () => {
  it("labels a metagraph node: ticker + short-able node name + metagraph hue", () => {
    const s = tooltipSubject({ kind: "metanode", node: { id: "9c2f", ip: "1.2.3.4" }, meta: { id: "ded", symbol: "DED", color: 0x36e29a } } as never);
    expect(s?.ident).toBe("DED");
    expect(s?.name).toBe("9c2f");
    expect(s?.mono).toBe(true);
    expect(s?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(s?.color).not.toBe(CORE);
  });
  it("labels a DAG validator as DAG in core cyan, name mono", () => {
    const s = tooltipSubject({ kind: "l1", node: { id: "abcd" } } as never);
    expect(s?.ident).toBe("DAG");
    expect(s?.color).toBe(CORE);
    expect(s?.mono).toBe(true);
  });
  it("labels a hub with its name (ticker ident, metagraph hue, not mono)", () => {
    const s = tooltipSubject({ kind: "meta", cfg: { id: "dor", ticker: "DOR", name: "Dor Technologies", color: 0xff5a3c } } as never);
    expect(s?.ident).toBe("DOR");
    expect(s?.name).toBe("Dor Technologies");
    expect(s?.mono).toBe(false);
    expect(s?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(s?.color).not.toBe(CORE);
  });
  it("labels a snapshot by ordinal in core cyan", () => {
    expect(tooltipSubject({ kind: "snapshot", data: { ordinal: 42 } } as never)).toEqual({ ident: "L0", name: "42", color: CORE, mono: false });
  });
  it("labels the core", () => {
    expect(tooltipSubject({ kind: "core" } as never)).toEqual({ ident: "DAG", name: "Global L0", color: CORE, mono: false });
  });
  it("is null for geoLive and nullish", () => {
    expect(tooltipSubject({ kind: "geoLive" } as never)).toBeNull();
    expect(tooltipSubject(null)).toBeNull();
  });
});
