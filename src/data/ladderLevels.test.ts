import { describe, expect, it } from "vitest";
import { cohortsLevel, countriesLevel, countryNodes, machinesOf, networksLevel, nodeOrder, nodesByCountry, tickNetworksLevel, tickPolledRows } from "./ladderLevels";
import type { AnchorLogRow } from "./anchorLog";
import type { MetaSnapRecord } from "./api";
import type { CountryStat, GlobalSnapshot, MetaInfo, NodeRow } from "./types";

// A node row with just what the levels read. `meta` names its network (networkOfRow).
const node = (o: { ip: string; id?: string; cc?: string | null; country?: string | null; city?: string; isp?: string; meta?: string; layer?: string }): NodeRow =>
  ({
    pick: {
      kind: "metanode",
      meta: o.meta ? { id: o.meta } : undefined,
      node: { ip: o.ip, id: o.id ?? `id-${o.ip}` },
      geo: { cc: o.cc ?? undefined, city: o.city, isp: o.isp },
    },
    label: o.ip,
    id: o.id ?? `id-${o.ip}`,
    cc: o.cc ?? null,
    country: o.country ?? null,
    city: o.city ?? null,
    layer: o.layer ?? "l0",
  }) as unknown as NodeRow;

const de1 = node({ ip: "1", id: "b", cc: "de", country: "Germany", city: "Falkenstein", isp: "Hetzner", meta: "dor" });
const de2 = node({ ip: "2", id: "a", cc: "de", country: "Germany", city: "Falkenstein", isp: "Hetzner", meta: "ded" });
const de3 = node({ ip: "3", id: "c", cc: "de", country: "Germany", city: "Berlin", isp: "AWS", meta: "dor" });
const fi1 = node({ ip: "4", id: "d", cc: "fi", country: "Finland", city: "Helsinki", isp: "Hetzner", meta: "dor" });
const fi2 = node({ ip: "5", id: "e", cc: "fi", country: "Finland", city: "Helsinki", isp: "OVH", meta: "ded" });
const fi3 = node({ ip: "6", id: "f", cc: "fi", country: "Finland", city: "Espoo", isp: "UpCloud", meta: "tbc" });
// A node the lookup placed in a country but gave no code (Review Focus 2).
const fiNoCc = node({ ip: "7", id: "g", cc: null, country: "Finland", city: "Oulu", isp: "Elisa", meta: "dor" });
const sel = [de1, de2, de3, fi1, fi2, fi3, fiNoCc];
const countries: CountryStat[] = [
  { cc: "de", country: "Germany", count: 3 },
  { cc: "fi", country: "Finland", count: 3 },
];

describe("nodeOrder", () => {
  it("orders by city, then id", () => {
    expect([de1, de3, de2].sort(nodeOrder).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

describe("nodesByCountry", () => {
  it("joins by country NAME and sorts by city, then id", () => {
    const by = nodesByCountry(sel);
    expect(by.get("Germany")!.map((r) => r.id)).toEqual(["c", "a", "b"]); // Berlin, then Falkenstein a < b
    expect(by.get("Finland")!.map((r) => r.id)).toEqual(["f", "d", "e", "g"]); // Espoo, Helsinki d < e, Oulu
  });
});

describe("countriesLevel", () => {
  const by = nodesByCountry(sel);
  it("orders by the picked figure", () => {
    // providers: Germany 2 (Hetzner, AWS), Finland 4 (Hetzner, OVH, UpCloud, Elisa)
    expect(countriesLevel(countries, by, "providers").map((x) => x.c.cc)).toEqual(["fi", "de"]);
  });
  it("breaks a tie on node count, so the order is stable (Review Focus 3)", () => {
    // metagraphs: Germany {dor, ded} = 2, Finland (two rows only) {dor, ded} = 2 — tied; Finland
    // has the larger node count, so it leads.
    const tieBy = new Map([["Germany", [de1, de2, de3]], ["Finland", [fi1, fi2]]]);
    const tie: CountryStat[] = [
      { cc: "de", country: "Germany", count: 3 },
      { cc: "fi", country: "Finland", count: 5 },
    ];
    expect(countriesLevel(tie, tieBy, "metagraphs").map((x) => x.c.cc)).toEqual(["fi", "de"]);
  });
});

describe("countryNodes", () => {
  it("returns a country's rows by NAME, including a node with no country code (Review Focus 2)", () => {
    expect(countryNodes("fi", countries, nodesByCountry(sel)).map((r) => r.id)).toEqual(["f", "d", "e", "g"]);
    expect(countryNodes("xx", countries, nodesByCountry(sel))).toEqual([]);
  });
});

describe("cohortsLevel", () => {
  it("groups by city × provider, count desc then city", () => {
    const rows = countryNodes("de", countries, nodesByCountry(sel));
    const cs = cohortsLevel(rows);
    expect(cs.map((c) => `${c.isp}|${c.city}|${c.rows.length}`)).toEqual(["Hetzner|Falkenstein|2", "AWS|Berlin|1"]);
    expect(cs[0]!.rows.map((r) => r.id)).toEqual(["a", "b"]); // keeps the input (sorted) order
  });
  it("sorts an unlocated cohort last", () => {
    const loose = node({ ip: "9", country: "Germany", isp: "X" }); // no city
    const cs = cohortsLevel([de3, loose]);
    expect(cs.map((c) => c.city)).toEqual(["Berlin", null]);
  });
});

describe("networksLevel", () => {
  const net = (id: string, n: number) => ({ id, name: id, nodes: Array.from({ length: n }, () => ({})) }) as unknown as MetaInfo;
  // dor: 3 nodes in 2 countries; ded: 2 nodes in 2 countries; tbc: 1 node, 1 country
  const all = [de1, de3, fi1, de2, fi2, fi3];
  const metas = [net("ded", 2), net("dor", 3), net("tbc", 1)];
  it("orders by the picked figure", () => {
    expect(networksLevel(metas, all, "nodes").map((x) => x.m.id)).toEqual(["dor", "ded", "tbc"]);
  });
  it("breaks a tie on fleet size (Review Focus 3)", () => {
    // countries: dor 2 (DE, FI), ded 2 (DE, FI) — tied; dor has the larger fleet
    expect(networksLevel(metas, all, "countries").map((x) => x.m.id)).toEqual(["dor", "ded", "tbc"]);
  });
});

describe("tickNetworksLevel", () => {
  const tick = { ordinal: 42, timestamp: "T42" } as unknown as GlobalSnapshot;
  const other = { ordinal: 41, timestamp: "T41" } as unknown as GlobalSnapshot;
  const listed = (id: string) => id === "dor" || id === "ded";
  const polledRow = (metaId: string, ordinal: number, g = tick): AnchorLogRow => ({ metaId, ordinal, hash: `h${ordinal}`, fee: 1, sizeInKB: 1, ts: g.timestamp, global: g });
  const ex = (metaId: string, ordinal: number) => ({ metaId, ordinal, fee: 2, bytes: 2048 });

  it("unions polled and exact rows, polled first, and lists listed networks by count then name", () => {
    const nets = tickNetworksLevel(
      tick,
      [polledRow("ded", 5), polledRow("dor", 900, other)], // dor's polled row is another tick's
      [ex("dor", 901), ex("dor", 902), ex("ded", 5), ex("ded", 6)],
      listed,
    );
    expect(nets.map((n) => `${n.id}:${n.snaps.length}`)).toEqual(["ded:2", "dor:2"]); // tie → name: "ded" < "dor"
    expect(nets[0]!.snaps.map((s) => `${s.ordinal}:${s.hash}`)).toEqual(["6:", "5:h5"]); // newest first; polled keeps its hash
  });
  it("puts the unlisted set LAST, whatever its count (Review Focus 4)", () => {
    const nets = tickNetworksLevel(tick, [], [ex("X1", 1), ex("X1", 2), ex("X2", 7), ex("dor", 900)], listed);
    expect(nets.map((n) => n.id)).toEqual(["dor", "unlisted"]);
    expect(nets[1]!.unlisted).toBe(true);
    expect(nets[1]!.snaps.map((s) => `${s.metaId}:${s.ordinal}`)).toEqual(["X2:7", "X1:2", "X1:1"]);
  });
  it("lists what is known while a read is missing (Review Focus 1)", () => {
    expect(tickNetworksLevel(tick, [polledRow("dor", 900)], null, listed).map((n) => n.id)).toEqual(["dor"]);
    expect(tickNetworksLevel(tick, [], undefined, listed)).toEqual([]);
  });
});

describe("machinesOf — the node pager steps nodes, not layer rows (Review Focus 5)", () => {
  it("keeps one row per node, first occurrence, dropping rows with no key", () => {
    const l0 = node({ ip: "8", id: "m", layer: "l0" });
    const l1 = node({ ip: "8", id: "m", layer: "l1" });
    const keyless = { ...node({ ip: "" }), pick: { kind: "metanode", node: null } } as unknown as NodeRow;
    expect(machinesOf([l0, l1, de1, keyless]).map((r) => r.layer + r.id)).toEqual(["l0m", "l0b"]);
  });
});

describe("tickPolledRows — the one polled input both the explorer and the rail feed tickNetworksLevel", () => {
  const tick = { ordinal: 42, timestamp: "T42" } as unknown as GlobalSnapshot;
  const rec = (ordinal: number, ts: string) => ({ ordinal, ts, hash: `h${ordinal}`, fee: 1, sizeInKB: 2 }) as unknown as MetaSnapRecord;
  const buffers = new Map<string, MetaSnapRecord[]>([
    ["dor", [rec(900, "T41"), rec(901, "T42"), rec(902, "T42")]],
    ["ded", [rec(5, "T43")]],
  ]);
  it("keeps only the records stamped with this tick, each joined to it", () => {
    const rows = tickPolledRows(buffers, tick);
    expect(rows.map((r) => `${r.metaId}:${r.ordinal}:${r.hash}`)).toEqual(["dor:901:h901", "dor:902:h902"]);
    expect(rows.every((r) => r.global === tick && r.ts === "T42")).toBe(true);
  });
  it("an empty or missing buffer yields no rows", () => {
    expect(tickPolledRows(new Map(), tick)).toEqual([]);
  });
});

// A full tie (same figure, same count / fleet, same name) is broken by the id, so the order never
// depends on the input order — the explorer and the rail build their inputs differently.
describe("the level sorts are total — input order never decides", () => {
  it("countries: a full tie orders by country code", () => {
    const a = { cc: "fi", country: "Finland", count: 2 };
    const b = { cc: "de", country: "Germany", count: 2 };
    const by = new Map<string, NodeRow[]>();
    expect(countriesLevel([a, b], by, "nodes").map((x) => x.c.cc)).toEqual(["de", "fi"]);
    expect(countriesLevel([b, a], by, "nodes").map((x) => x.c.cc)).toEqual(["de", "fi"]);
  });
  it("networks: a full tie orders by id", () => {
    const net = (id: string) => ({ id, name: id, nodes: [] }) as unknown as MetaInfo;
    expect(networksLevel([net("zz"), net("aa")], [], "nodes").map((x) => x.m.id)).toEqual(["aa", "zz"]);
  });
  it("a global snapshot's networks: two catalog ids sharing one name order by id", () => {
    // BioFi's current address and its former one (config `formerIds`) resolve to the same name.
    const tick = { ordinal: 1, timestamp: "T1" } as unknown as GlobalSnapshot;
    const ids = ["DAG6A8Dw78yWv9z8pHqjJ4JVwSqq9V9Ha7CRUQnY", "DAG2JaVh5yYiPCGLLEFi6tfkKk77WA4FzivVdBek"];
    const ex = (metaId: string) => ({ metaId, ordinal: 1, fee: 0, bytes: 0 });
    const order = (rows: ReturnType<typeof ex>[]) => tickNetworksLevel(tick, [], rows, () => true).map((n) => n.id);
    expect(order([ex(ids[0]!), ex(ids[1]!)])).toEqual(order([ex(ids[1]!), ex(ids[0]!)]));
  });
});
