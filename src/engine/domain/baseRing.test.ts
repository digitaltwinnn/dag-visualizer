import { describe, it, expect } from "vitest";
import { ringLevels, ringPresence, ringWedge, type RingNet, type RingMachine } from "./baseRing";

const m = (ip: string, cc: string | null = "US", isp: string | null = "Hetzner"): RingMachine => ({ ip, cc, isp });
const nets: RingNet[] = [
  { id: "dor", color: 0xff7a2f, machines: [m("1", "US", "Amazon"), m("2", "US", "Amazon"), m("3", "DE"), m("4", null, null)] },
  { id: "up", color: 0x3b8bff, machines: [m("5", "FI"), m("6", "FI")] },
  { id: "dag", color: 0x2af5ff, machines: [m("1"), m("5"), m("7", "DE"), m("8", "DE", "IONOS"), m("9", "US")] }, // the DAG core: a machine that also runs a metagraph is a second node here, as in the Countries list
];
const lv = ringLevels(nets, "dag");

describe("ringLevels — the located fleet by country, then provider, then network", () => {
  it("every level partitions the same participants (11: a machine on two networks is two nodes, as the Countries list counts)", () => {
    for (const level of [lv.countries, lv.providers, lv.networks]) {
      expect(level.reduce((n, s) => n + s.count, 0)).toBe(11);
      expect(level.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 9);
    }
  });
  it("the outer ring is the countries, biggest first, the unknown last, tiling the circle contiguously (the gap is the adapter's)", () => {
    expect(lv.countries.map((c) => [c.cc, c.count])).toEqual([["US", 5], ["DE", 3], ["FI", 2], [null, 1]]);
    for (let i = 0; i < lv.countries.length; i++) {
      const s = lv.countries[i]!, next = lv.countries[(i + 1) % lv.countries.length]!;
      expect(s.to).toBeGreaterThan(s.from);
      const gap = ((next.from - s.to) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      expect(gap).toBeCloseTo(0, 9);
    }
    for (const c of lv.countries) expect(c.color).toBeNull();
  });
  it("a country's providers tile its arc and carry every network under them", () => {
    const de = lv.countries.find((c) => c.cc === "DE")!;
    const ps = lv.providers.filter((p) => p.cc === "DE");
    expect(ps.map((p) => [p.isp, p.count])).toEqual([["Hetzner", 2], ["IONOS", 1]]);
    expect(ps[0]!.from).toBeCloseTo(de.from, 9);
    expect(ps[ps.length - 1]!.to).toBeCloseTo(de.to, 9);
    expect(ps[1]!.from - ps[0]!.to).toBeCloseTo(0, 9);
    expect(ps[0]!.nets.sort()).toEqual(["dag", "dor"]);
    expect(de.nets.sort()).toEqual(["dag", "dor"]);
  });
  it("a provider's networks tile its arc in the network's hue, the DAG remainder neutral and last", () => {
    const hz = lv.providers.find((p) => p.cc === "DE" && p.isp === "Hetzner")!;
    const ns = lv.networks.filter((n) => n.cc === "DE" && n.isp === "Hetzner");
    expect(ns.map((n) => [n.net, n.count, n.color])).toEqual([["dor", 1, 0xff7a2f], ["dag", 1, 0x2af5ff]]);
    expect(ns[0]!.from).toBeCloseTo(hz.from, 9);
    expect(ns[1]!.to).toBeCloseTo(hz.to, 9);
  });
  it("a machine on two networks is a node under each — the explorer's unit", () => {
    const us = lv.networks.filter((n) => n.cc === "US");
    expect(us.map((n) => [n.isp, n.net, n.count])).toEqual([["Hetzner", "dag", 3], ["Amazon", "dor", 2]]); // providers biggest first, then their networks
  });
  it("a committed filter partitions that network's participants alone", () => {
    const up = ringLevels(nets, "dag", "up");
    expect(up.countries.map((c) => [c.cc, c.count])).toEqual([["FI", 2]]);
    expect(up.networks.every((n) => n.net === "up")).toBe(true);
    expect(up.countries.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 9);
    expect(ringLevels(nets, "dag", "dag").countries.map((c) => [c.cc, c.count])).toEqual([["US", 3], ["DE", 2]]);
  });
  it("an empty fleet is no ring", () => {
    expect(ringLevels([], "dag")).toEqual({ countries: [], providers: [], networks: [] });
    expect(ringLevels([{ id: "x", color: 1, machines: [] }], "dag").countries).toEqual([]);
  });
  it("under a committed network the inner ring is one arc per country, spanning the country's arc (user, 2026-10-24)", () => {
    const lv = ringLevels(nets, "dag", "dor");
    expect(lv.countries.map((c) => c.cc)).toEqual(["US", "DE", null]);
    expect(lv.networks.map((n) => [n.cc, n.net, n.count, n.isp])).toEqual([["US", "dor", 2, undefined], ["DE", "dor", 1, undefined], [null, "dor", 1, undefined]]);
    for (let i = 0; i < lv.countries.length; i++) {
      expect(lv.networks[i]!.from).toBe(lv.countries[i]!.from);
      expect(lv.networks[i]!.to).toBe(lv.countries[i]!.to);
    }
  });
  it("a lone country is a whole circle — no gap for a single segment (user, 2026-10-24)", () => {
    const lv = ringLevels([{ id: "x", color: 1, machines: [m("1", "FI", "Hetzner"), m("2", "FI", "Hetzner")] }], "dag");
    expect(lv.countries).toHaveLength(1);
    expect(lv.countries[0]!.to - lv.countries[0]!.from).toBeCloseTo(Math.PI * 2, 9);
    expect(lv.providers[0]!.to - lv.providers[0]!.from).toBeCloseTo(Math.PI * 2, 9);
    expect(lv.networks[0]!.to - lv.networks[0]!.from).toBeCloseTo(Math.PI * 2, 9);
  });
});

describe("ringPresence — the hover previews, the filter and the drill commit, through one dim", () => {
  it("under All with no drill every arc on every level RESTS — nothing is the subject", () => {
    for (const level of [lv.countries, lv.providers, lv.networks]) expect(level.every((s) => ringPresence(s, null, "all") === "rest")).toBe(true);
  });
  it("a committed network lights the arcs that hold one of its machines on every level; a hover previews over it", () => {
    expect(lv.countries.map((c) => ringPresence(c, null, "up"))).toEqual(["dim", "dim", "lit", "dim"]); // "1" runs UP too but DOR owns it
    expect(lv.networks.filter((n) => n.net === "dor").every((n) => ringPresence(n, null, "dor") === "lit")).toBe(true);
    expect(lv.networks.filter((n) => n.net !== "dor").every((n) => ringPresence(n, null, "dor") === "dim")).toBe(true);
    expect(lv.countries.map((c) => ringPresence(c, "dor", "up"))).toEqual(["lit", "lit", "dim", "lit"]);
  });
  it("a country lights its own arc and everything nested in it, and dims the other countries", () => {
    expect(lv.countries.map((c) => ringPresence(c, null, "all", "DE"))).toEqual(["dim", "lit", "dim", "dim"]);
    expect(lv.providers.filter((p) => p.cc === "DE").every((p) => ringPresence(p, null, "all", "DE") === "lit")).toBe(true);
    expect(lv.providers.filter((p) => p.cc !== "DE").every((p) => ringPresence(p, null, "all", "DE") === "dim")).toBe(true);
    // …and a committed network narrows it further
    expect(ringPresence(lv.networks.find((n) => n.cc === "DE" && n.net === "dag")!, null, "dor", "DE")).toBe("dim");
  });
});

describe("ringWedge — the pie fills the level that names the subject (user, 2026-10-24)", () => {
  it("at rest the country level fills, under a network selector the network level does, the others are off", () => {
    expect(ringWedge(0, "rest", false, false)).toBe("rest");
    expect(ringWedge(1, "rest", false, false)).toBe("off");
    expect(ringWedge(2, "rest", false, false)).toBe("off");
    expect(ringWedge(2, "lit", true, false)).toBe("rest");
    expect(ringWedge(0, "lit", true, false)).toBe("off");
  });
  it("only a HOVER raises a slice; a commit rests it, and a dimmed slice drops", () => {
    expect(ringWedge(0, "lit", false, true)).toBe("hover");
    expect(ringWedge(0, "lit", false, false)).toBe("rest");
    expect(ringWedge(0, "dim", false, true)).toBe("dim");
    expect(ringWedge(2, "lit", true, true)).toBe("hover");
    expect(ringWedge(2, "dim", true, false)).toBe("dim");
  });
});
