import { describe, it, expect } from "vitest";
import { countrySubject, hoverKeyOf, tooltipSubject } from "./hoverSubject";

// A hover takes the hovered object's own colour (user, 2026-10-03). What belongs to the DAG — its
// nodes, its core, a global snapshot — takes the DAG's identity hue; only a country, which
// belongs to no network, keeps the structural accent (`var(--primary)`, resolved by CSS at
// render time, so there is nothing to keep in sync with the network's accent override).
import { identityHudCss } from "@/src/palette/identity";
const CORE = "var(--primary)";
const DAG = identityHudCss("dag");

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
    expect(s?.color).toMatch(/^oklch\(var\(--ident-l\)/);
    expect(s?.color).not.toBe(CORE);
  });
  it("labels a DAG validator as DAG in the DAG's own hue — never the accent the All filter wears", () => {
    const s = tooltipSubject({ kind: "l1", node: { id: "abcd" } } as never);
    expect(s?.ident).toBe("DAG");
    expect(s?.color).toBe(DAG);
    expect(s?.color).not.toBe(CORE);
    expect(s?.mono).toBe(true);
  });
  it("labels a hub with its name (ticker ident, metagraph hue, not mono)", () => {
    const s = tooltipSubject({ kind: "meta", cfg: { id: "dor", ticker: "DOR", name: "Dor Technologies", color: 0xff5a3c } } as never);
    expect(s?.ident).toBe("DOR");
    expect(s?.name).toBe("Dor Technologies");
    expect(s?.mono).toBe(false);
    expect(s?.color).toMatch(/^oklch\(var\(--ident-l\)/);
    expect(s?.color).not.toBe(CORE);
  });
  it("labels a global snapshot by ordinal in the DAG's hue", () => {
    // No ticker: "L0" read as a layer chip, and neither the card nor the callout calls a global
    // snapshot that. Its kind says what it is, and the hover card draws the cube for it.
    expect(tooltipSubject({ kind: "snapshot", data: { ordinal: 42 } } as never)).toEqual({ kind: "snapshot", ident: "", name: "42", color: DAG, mono: false });
  });
  it("labels the core", () => {
    expect(tooltipSubject({ kind: "core" } as never)).toEqual({ kind: "network", netId: "dag", ident: "DAG", name: "Global L0", color: DAG, mono: false });
  });
  it("is null for geoLive and nullish", () => {
    expect(tooltipSubject({ kind: "geoLive" } as never)).toBeNull();
    expect(tooltipSubject(null)).toBeNull();
  });
});

describe("tooltipSubject — a metagraph snapshot tile", () => {
  it("hovers an UNLISTED channel in the unlisted set's neutral, never a hue hashed from its address", async () => {
    const { UNLISTED_HUE } = await import("./unlistedId");
    const s = tooltipSubject({ kind: "metaSnap", sel: { metaId: "DAG1notInTheCatalogAtAll", ordinal: 42 } } as never);
    expect(s?.color).toBe(UNLISTED_HUE);
    expect(s?.name).toBe("42");
  });

  it("hovers a listed network's tile in that network's identity hue", async () => {
    const { METAGRAPHS } = await import("@/src/net/current");
    const listed = METAGRAPHS.find((m) => m.id !== "dag")!;
    const s = tooltipSubject({ kind: "metaSnap", sel: { metaId: listed.id, ordinal: 7 } } as never);
    expect(s?.color).toMatch(/^oklch\(var\(--ident-l\)/);
    expect(s?.ident).toBe(listed.ticker || listed.name);
  });
});

describe("the hover subject's kind", () => {
  it("names what the pointer is on, so the hover card can wear that card's mark", () => {
    expect(tooltipSubject({ kind: "metanode", node: { id: "9c2f" }, meta: { id: "ded", symbol: "DED" } } as never)?.kind).toBe("node");
    expect(tooltipSubject({ kind: "l0", node: { id: "abc" } } as never)?.kind).toBe("node");
    expect(tooltipSubject({ kind: "metaSnap", sel: { metaId: "DAG1x", ordinal: 1 } } as never)?.kind).toBe("metaSnap");
    const hub = tooltipSubject({ kind: "meta", cfg: { id: "dor", name: "Dor", ticker: "DOR" } } as never);
    expect(hub?.kind).toBe("network");
    expect(hub?.netId).toBe("dor");
  });
});

describe("countrySubject", () => {
  it("is a country hover carrying the ISO code, with no ticker", () => {
    expect(countrySubject("DE")).toEqual({ kind: "country", ident: "", name: "DE", color: CORE, mono: false });
  });
});
