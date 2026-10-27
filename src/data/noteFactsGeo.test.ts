import { describe, it, expect } from "vitest";
import { geoFacts, type GeoFactsInput } from "@/src/data/noteFactsGeo";
import { checkNote } from "@/src/data/noteHonesty";

const NAMES = { dag: "Constellation", usdc: "USDC.dag", bio: "BioFi" };
const COUNTRIES = { DE: "Germany", US: "United States", FR: "France", NL: "Netherlands" };
const PROVIDERS = {
  "hetzner-online-gmbh": "Hetzner Online GmbH",
  "hetzner-online-ag": "Hetzner Online AG",
  "ovh-sas": "OVH SAS",
  "amazon-com-inc": "Amazon.com, Inc.",
};

interface DaySpec {
  cc: Record<string, number>;
  isp: Record<string, number>;
  net?: Record<string, { cc: Record<string, number>; isp?: Record<string, number> }>;
}

/** One stored geo day's fields, as the sampler writes them. */
function day(spec: DaySpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cc, n] of Object.entries(spec.cc)) out[`f.cc.${cc}`] = n;
  for (const [k, n] of Object.entries(spec.isp)) out[`f.isp.${k}`] = n;
  for (const [id, by] of Object.entries(spec.net ?? {})) {
    for (const [cc, n] of Object.entries(by.cc)) out[`f.cc.${id}.${cc}`] = n;
    for (const [k, n] of Object.entries(by.isp ?? {})) out[`f.isp.${id}.${k}`] = n;
  }
  return out;
}

/** The fleet: 100 located nodes, 80 of them with a known provider (Hetzner 30 + 20 = 50 merged). */
const NOW: DaySpec = {
  cc: { DE: 50, US: 30, FR: 15, NL: 5 },
  isp: { "hetzner-online-gmbh": 30, "hetzner-online-ag": 20, "ovh-sas": 10, "amazon-com-inc": 20 },
  net: {
    dag: { cc: { DE: 30, US: 15, FR: 10 }, isp: { "hetzner-online-gmbh": 20, "ovh-sas": 10 } },
    usdc: { cc: { DE: 20, US: 10 }, isp: { "hetzner-online-ag": 20 } },
    bio: { cc: { US: 5 }, isp: { "amazon-com-inc": 5 } },
  },
};

/** The same fleet scaled, for the neighbouring days. */
function scaled(k: number, base: DaySpec = NOW): DaySpec {
  const f = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([a, n]) => [a, Math.round(n * k)]));
  return {
    cc: f(base.cc),
    isp: f(base.isp),
    net: Object.fromEntries(Object.entries(base.net ?? {}).map(([id, v]) => [id, { cc: f(v.cc), isp: v.isp && f(v.isp) }])),
  };
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const D = (s: string) => Date.parse(`${s}T00:00:00Z`);
const DAY = 86_400_000;
/** `n` consecutive days ending on `end`, each from `spec(i)`. */
function run(end: string, n: number, spec: (i: number) => DaySpec): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (let i = 0; i < n; i++) out[iso(D(end) - (n - 1 - i) * DAY)] = day(spec(i));
  return out;
}
/** The tiers' fleet `f.cc.<cc>` per day. */
const ccOf = (geo: Record<string, Record<string, number>>, k = 1): Record<string, Record<string, number>> =>
  Object.fromEntries(Object.entries(geo).map(([d, f]) => [d, Object.fromEntries(Object.entries(f).filter(([key]) => /^f\.cc\.[^.]+$/.test(key)).map(([key, n]) => [key, Math.round(n * k)]))]));

function input(over: Partial<GeoFactsInput> = {}): GeoFactsInput {
  const geoDays = { "2026-10-27": day(NOW) };
  return { subject: "all", geoDays, ccDays: ccOf(geoDays), providerNames: PROVIDERS, countryNames: COUNTRIES, names: NAMES, ...over };
}

const find = (r: NonNullable<ReturnType<typeof geoFacts>>, re: RegExp) => r.facts.filter((f) => re.test(f.label));
const one = (r: NonNullable<ReturnType<typeof geoFacts>>, re: RegExp) => {
  const m = find(r, re);
  expect(m, String(re)).toHaveLength(1);
  return m[0]!;
};

describe("geoFacts on the fleet", () => {
  it("counts the countries and the providers, the merged providers as one", () => {
    const r = geoFacts(input())!;
    expect(one(r, /^Countries hosting nodes$/).value).toBe(4);
    expect(one(r, /^Providers hosting nodes$/).value).toBe(3); // Hetzner (merged), OVH, Amazon
  });

  it("states the top three countries with their shares of the fleet", () => {
    const r = geoFacts(input())!;
    expect(one(r, /^Germany, share of the fleet's located nodes/).value).toBeCloseTo(0.5);
    expect(one(r, /^United States, share of the fleet's located nodes/).value).toBeCloseTo(0.3);
    expect(one(r, /^France, share of the fleet's located nodes/).value).toBeCloseTo(0.15);
    expect(find(r, /^Netherlands, /)).toHaveLength(0);
    expect(one(r, /^Germany, nodes/).value).toBe(50);
    expect(one(r, /^Germany, share/).kind).toBe("share");
  });

  it("folds the Hetzner GmbH and AG keys into one provider whose count is their sum", () => {
    const r = geoFacts(input())!;
    expect(find(r, /GmbH|\bAG\b/)).toHaveLength(0);
    const nodes = one(r, /^Hetzner Online, nodes/);
    expect(nodes.value).toBe(50);
    expect(one(r, /^Hetzner Online, share of the fleet's nodes with a known provider/).value).toBeCloseTo(50 / 80); // of the 80 nodes with a known provider
  });

  it("returns null when no day holds the fleet", () => {
    expect(geoFacts(input({ geoDays: {}, ccDays: {} }))).toBeNull();
    expect(geoFacts(input({ geoDays: { "2026-10-27": {} } }))).toBeNull();
  });

  it("never grades concentration in a label", () => {
    for (const subject of ["all", "usdc", { cc: "DE" }] as const) {
      const r = geoFacts(input({ subject }))!;
      for (const f of r.facts) expect(f.label).not.toMatch(/decentrali|concentrat/i);
    }
  });
});

describe("geoFacts before history exists", () => {
  it("emits no change fact at all when only today is stored", () => {
    const r = geoFacts(input())!;
    expect(r.facts.filter((f) => /against a month ago|a month ago/.test(f.label))).toHaveLength(0);
  });

  it("emits country changes from ccDays but no provider change when geoDays holds only today", () => {
    const geoDays = { "2026-10-27": day(NOW) };
    const ccDays = { ...ccOf(geoDays), "2026-09-27": ccOf({ x: day(scaled(0.5)) }).x! };
    const r = geoFacts(input({ geoDays, ccDays }))!;
    const de = one(r, /^Germany, nodes now against a month ago/);
    expect(de.kind).toBe("ratio");
    expect(de.value).toBeCloseTo(2);
    expect(one(r, /^Germany, nodes a month ago/).value).toBe(25);
    expect(one(r, /^Located nodes in the fleet, now against a month ago/).value).toBeCloseTo(100 / 51); // the halved fleet rounds to 51
    expect(find(r, /^(Hetzner|OVH|Amazon).*month ago/)).toHaveLength(0);
  });

  it("emits a provider change once both ends are stored", () => {
    const geoDays = { "2026-09-27": day(scaled(0.5)), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!;
    const h = one(r, /^Hetzner Online, nodes now against a month ago/);
    expect(h.value).toBeCloseTo(2);
    expect(one(r, /^Hetzner Online, nodes a month ago/).value).toBe(25);
  });

  it("states no change when the nearest earlier day is nowhere near a month back", () => {
    const geoDays = { "2026-10-26": day(scaled(0.5)), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!;
    expect(r.facts.filter((f) => /month ago/.test(f.label))).toHaveLength(0);
  });
});

describe("geoFacts reads through an outage hour (R22)", () => {
  it("skips a newest day whose fleet total is far below its neighbours and reads the previous", () => {
    const geoDays = run("2026-10-26", 6, () => NOW);
    geoDays["2026-10-27"] = day({ cc: { DE: 2 }, isp: { "ovh-sas": 1 } });
    const r = geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^Germany, nodes \(/).value).toBe(50);
    expect(one(r, /^Countries hosting nodes$/).value).toBe(4);
  });

  it("treats a day with no node list at all as unmeasured", () => {
    const geoDays = run("2026-10-26", 3, () => NOW);
    geoDays["2026-10-27"] = {};
    expect(one(geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!, /^Germany, nodes \(/).value).toBe(50);
  });

  it("measures a single day alone, and keeps a real shift of under 10%", () => {
    expect(geoFacts(input())).not.toBeNull();
    const geoDays = { ...run("2026-10-26", 6, () => NOW), "2026-10-27": day(scaled(0.95)) };
    expect(one(geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!, /^Germany, nodes \(/).value).toBe(Math.round(50 * 0.95));
  });

  it("does the same on ccDays: an outage day at the end is skipped for the change", () => {
    const geoDays = run("2026-10-27", 2, () => NOW);
    const ccDays = {
      ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [iso(D("2026-10-21") + i * DAY), ccOf({ x: day(NOW) }).x!])),
      "2026-09-27": ccOf({ x: day(scaled(0.5)) }).x!,
      "2026-10-27": { "f.cc.DE": 1 },
    };
    const r = geoFacts(input({ geoDays, ccDays }))!;
    expect(one(r, /^Germany, nodes now against a month ago/).value).toBeCloseTo(2); // 50 (Oct 26) over 25, not 1 over 25
  });

  it("compares with the measured day nearest a month earlier, skipping an outage day", () => {
    const geoDays = {
      ...run("2026-09-26", 6, () => scaled(0.5)),
      "2026-09-27": day({ cc: { DE: 1 }, isp: { "ovh-sas": 1 } }), // the day a month back is an outage
      "2026-10-27": day(NOW),
    };
    const r = geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^Germany, nodes now against a month ago/).value).toBeCloseTo(2);
    expect(one(r, /^Hetzner Online, nodes now against a month ago/).value).toBeCloseTo(2);
  });
});

describe("geoFacts on a network", () => {
  it("returns null for a network absent from geoDays", () => {
    expect(geoFacts(input({ subject: "nope" }))).toBeNull();
    expect(geoFacts(input({ subject: "usdc", geoDays: { "2026-10-27": day({ ...NOW, net: { dag: NOW.net!.dag! } }) } }))).toBeNull();
  });

  it("gives the footprint against its own nodes and the fleet's", () => {
    const r = geoFacts(input({ subject: "usdc" }))!;
    expect(one(r, /^USDC\.dag, countries with nodes$/).value).toBe(2);
    expect(one(r, /^USDC\.dag, providers with nodes$/).value).toBe(1);
    expect(one(r, /^USDC\.dag, nodes in Germany/).value).toBe(20);
    expect(one(r, /^USDC\.dag, share of its nodes in Germany/).value).toBeCloseTo(20 / 30);
    expect(one(r, /^USDC\.dag, share of the fleet's nodes in Germany/).value).toBeCloseTo(20 / 50);
    expect(one(r, /^USDC\.dag, share of the fleet's located nodes/).value).toBeCloseTo(30 / 100);
    expect(one(r, /^USDC\.dag, nodes with Hetzner Online/).value).toBe(20);
  });

  it("reads the newest day on which the network's own total holds against its week", () => {
    const geoDays = run("2026-10-26", 6, () => NOW);
    // The fleet reading is fine that day but the network's own list collapsed.
    geoDays["2026-10-27"] = day({ ...NOW, net: { ...NOW.net, usdc: { cc: { DE: 1 }, isp: { "hetzner-online-ag": 1 } } } });
    const r = geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^USDC\.dag, nodes in Germany/).value).toBe(20);
  });

  it("returns null for a network that stopped publishing its list on the newest measured fleet day", () => {
    const geoDays = run("2026-10-26", 6, () => NOW);
    geoDays["2026-10-27"] = day({ ...NOW, net: { dag: NOW.net!.dag!, bio: NOW.net!.bio! } }); // usdc absent, fleet measured
    expect(geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))).toBeNull();
    expect(geoFacts(input({ subject: "bio", geoDays, ccDays: ccOf(geoDays) }))).not.toBeNull();
  });

  it("states no fleet-relative fact on a day the fleet's own list was an outage", () => {
    const geoDays = run("2026-10-26", 6, () => NOW);
    geoDays["2026-10-27"] = day({ cc: { DE: 3 }, isp: { "ovh-sas": 1 }, net: { usdc: NOW.net!.usdc! } }); // validator fetch failed
    const r = geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^USDC\.dag, nodes in Germany/).value).toBe(20);
    expect(find(r, /share of the fleet/)).toHaveLength(0);
  });

  it("names the network and no other in its ratio-bearing labels", () => {
    const r = geoFacts(input({ subject: "usdc" }))!;
    for (const f of r.facts.filter((x) => x.kind === "ratio")) expect(f.label).toContain("USDC.dag");
  });
});

describe("geoFacts on a country", () => {
  it("lists only the networks that have nodes there", () => {
    const r = geoFacts(input({ subject: { cc: "DE" } }))!;
    expect(one(r, /^USDC\.dag, nodes in Germany/).value).toBe(20);
    expect(one(r, /^Constellation, nodes in Germany/).value).toBe(30);
    expect(find(r, /^BioFi/)).toHaveLength(0);
    expect(one(r, /^Networks with nodes in Germany$/).value).toBe(2);
  });

  it("leaves out a network whose own list collapsed that day", () => {
    const geoDays = run("2026-10-26", 6, () => NOW);
    geoDays["2026-10-27"] = day({ ...NOW, net: { ...NOW.net, usdc: { cc: { DE: 1 }, isp: { "hetzner-online-ag": 1 } } } });
    const r = geoFacts(input({ subject: { cc: "DE" }, geoDays, ccDays: ccOf(geoDays) }))!;
    expect(find(r, /^USDC\.dag/)).toHaveLength(0);
    expect(one(r, /^Constellation, nodes in Germany/).value).toBe(30);
    expect(one(r, /^Networks with nodes in Germany$/).value).toBe(1);
  });

  it("states the country's nodes, share of the fleet and rank", () => {
    const r = geoFacts(input({ subject: { cc: "FR" } }))!;
    expect(one(r, /^France, nodes$/).value).toBe(15);
    expect(one(r, /^France, share of the fleet's located nodes/).value).toBeCloseTo(0.15);
    expect(one(r, /^France, rank by nodes$/).value).toBe(3);
  });

  it("returns null for a country with no nodes", () => {
    expect(geoFacts(input({ subject: { cc: "JP" } }))).toBeNull();
  });

  it("carries the country's change since a month ago", () => {
    const geoDays = { "2026-10-27": day(NOW) };
    const ccDays = { ...ccOf(geoDays), "2026-09-27": ccOf({ x: day(scaled(0.5)) }).x! };
    const r = geoFacts(input({ subject: { cc: "DE" }, geoDays, ccDays }))!;
    expect(one(r, /^Germany, nodes now against a month ago/).value).toBeCloseTo(2);
  });
});

describe("geoFacts names", () => {
  it("returns every catalog name, the countries and providers the facts mention, and their short forms", () => {
    const r = geoFacts(input())!;
    for (const n of Object.values(NAMES)) expect(r.names).toContain(n);
    expect(r.names).toEqual(expect.arrayContaining(["Germany", "United States", "France", "Hetzner Online GmbH", "Hetzner Online AG", "Hetzner Online", "Hetzner", "OVH SAS", "OVH"]));
  });
});

describe("geoFacts as a gate-passing source", () => {
  it("accepts honest fleet sentences and rejects one with a number the facts do not hold", () => {
    const r = geoFacts(input())!;
    expect(checkNote("Germany hosts 50% of the fleet's located nodes, and the nodes run on three providers.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Hetzner carries 50 nodes.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Nodes are spread over four countries.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Germany hosts 60% of the fleet's located nodes.", r.facts, r.names).ok).toBe(false);
    expect(checkNote("The nodes run on seven providers.", r.facts, r.names).ok).toBe(false);
  });

  it("accepts Hetzner's merged share", () => {
    const r = geoFacts(input())!;
    const share = Math.round(one(r, /^Hetzner Online, share/).value * 100);
    expect(checkNote(`Hetzner carries ${share}% of the nodes.`, r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote(`Hetzner carries ${share + 7}% of the nodes.`, r.facts, r.names).ok).toBe(false);
  });

  it("accepts a country growth sentence when the history is stored", () => {
    const geoDays = { "2026-10-27": day(NOW) };
    const ccDays = { ...ccOf(geoDays), "2026-09-27": ccOf({ x: day(scaled(0.5)) }).x! };
    const r = geoFacts(input({ geoDays, ccDays }))!;
    expect(checkNote("Germany doubled its nodes since a month ago, from 25 to 50.", r.facts, r.names)).toEqual({ ok: true });
  });
});
