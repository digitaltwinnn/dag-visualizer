import { describe, it, expect } from "vitest";
import { fleetCountries, geoFacts, type GeoFactsInput } from "@/src/data/noteFactsGeo";
import { checkNote } from "@/src/data/noteHonesty";
import { pairsOf } from "@/src/data/testkit/notePairs";

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
    expect(one(r, /^Germany, share of the network's located nodes/).value).toBeCloseTo(0.5);
    expect(one(r, /^United States, share of the network's located nodes/).value).toBeCloseTo(0.3);
    expect(one(r, /^France, share of the network's located nodes/).value).toBeCloseTo(0.15);
    expect(find(r, /^Netherlands, /)).toHaveLength(0);
    expect(one(r, /^Germany, nodes/).value).toBe(50);
    expect(one(r, /^Germany, share/).kind).toBe("share");
  });

  it("folds the Hetzner GmbH and AG keys into one provider whose count is their sum", () => {
    const r = geoFacts(input())!;
    expect(find(r, /GmbH|\bAG\b/)).toHaveLength(0);
    const nodes = one(r, /^Hetzner Online, nodes/);
    expect(nodes.value).toBe(50);
    expect(one(r, /^Hetzner Online, share of the network's nodes with a known provider/).value).toBeCloseTo(50 / 80); // of the 80 nodes with a known provider
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
    expect(r.facts.filter((f) => /against a week ago|a week ago/.test(f.label))).toHaveLength(0);
  });

  it("emits country changes from ccDays but no provider change when geoDays holds only today", () => {
    const geoDays = { "2026-10-27": day(NOW) };
    const ccDays = { ...ccOf(geoDays), "2026-10-20": ccOf({ x: day(scaled(0.5)) }).x! };
    const r = geoFacts(input({ geoDays, ccDays }))!;
    const de = one(r, /^Germany, nodes now against a week ago/);
    expect(de.kind).toBe("ratio");
    expect(de.value).toBeCloseTo(2);
    expect(one(r, /^Germany, nodes a week ago/).value).toBe(25);
    expect(one(r, /^Located nodes in the network, now against a week ago/).value).toBeCloseTo(100 / 51); // the halved fleet rounds to 51
    expect(one(r, /^Located nodes in the network a week ago$/).value).toBe(51);
    expect(find(r, /^(Hetzner|OVH|Amazon).*week ago/)).toHaveLength(0);
  });

  it("emits a provider change once both ends are stored", () => {
    const geoDays = { "2026-10-20": day(scaled(0.5)), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!;
    const h = one(r, /^Hetzner Online, nodes now against a week ago/);
    expect(h.value).toBeCloseTo(2);
    expect(one(r, /^Hetzner Online, nodes a week ago/).value).toBe(25);
  });

  it("states no change when the nearest earlier day is nowhere near a week back", () => {
    const geoDays = { "2026-10-26": day(scaled(0.5)), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!;
    expect(r.facts.filter((f) => /week ago/.test(f.label))).toHaveLength(0);
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

  it("does not read ccDays past an outage day at the end: no country figure from it, no change (R58)", () => {
    const geoDays = run("2026-10-27", 2, () => NOW);
    const ccDays = {
      ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [iso(D("2026-10-21") + i * DAY), ccOf({ x: day(NOW) }).x!])),
      "2026-10-20": ccOf({ x: day(scaled(0.5)) }).x!,
      "2026-10-27": { "f.cc.DE": 1 },
    };
    const r = geoFacts(input({ geoDays, ccDays }))!;
    expect(one(r, /^Germany, nodes \(/).value).toBe(50); // the geo family's, not 1
    expect(find(r, /week ago/)).toHaveLength(0); // not 50 (Oct 26) against 25, a day the counts are not from
  });

  it("compares with the measured day nearest a week earlier, skipping an outage day", () => {
    const geoDays = {
      ...run("2026-10-19", 6, () => scaled(0.5)),
      "2026-10-20": day({ cc: { DE: 1 }, isp: { "ovh-sas": 1 } }), // the day a week back is an outage
      "2026-10-27": day(NOW),
    };
    const r = geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^Germany, nodes now against a week ago/).value).toBeCloseTo(2);
    expect(one(r, /^Hetzner Online, nodes now against a week ago/).value).toBeCloseTo(2);
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
    expect(one(r, /^USDC\.dag, share of the network's nodes in Germany/).value).toBeCloseTo(20 / 50);
    expect(one(r, /^USDC\.dag, share of the network's located nodes/).value).toBeCloseTo(30 / 100);
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

  it("returns null for a network with only provider fields on the newest fleet day", () => {
    const geoDays = run("2026-10-26", 6, () => NOW);
    geoDays["2026-10-27"] = { ...day({ ...NOW, net: { dag: NOW.net!.dag!, bio: NOW.net!.bio! } }), "f.isp.usdc.hetzner-online-ag": 20 };
    expect(geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))).toBeNull();
  });

  it("states no fleet-relative fact on a day the fleet's own list was an outage", () => {
    const geoDays = run("2026-10-26", 6, () => NOW);
    geoDays["2026-10-27"] = day({ cc: { DE: 3 }, isp: { "ovh-sas": 1 }, net: { usdc: NOW.net!.usdc! } }); // validator fetch failed
    const r = geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^USDC\.dag, nodes in Germany/).value).toBe(20);
    expect(find(r, /share of the fleet/)).toHaveLength(0);
  });

  it("states where it stood a week ago when its own day a week back is measured", () => {
    const back = scaled(0.5, { ...NOW, net: { ...NOW.net, usdc: { cc: { DE: 20 }, isp: { "hetzner-online-ag": 20 } } } });
    const geoDays = { "2026-10-20": day(back), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^USDC\.dag, located nodes a week ago$/).value).toBe(10);
    expect(one(r, /^USDC\.dag, countries with nodes a week ago$/).value).toBe(1);
    const ratio = one(r, /^USDC\.dag, located nodes now against a week ago$/);
    expect(ratio.kind).toBe("ratio");
    expect(ratio.value).toBeCloseTo(30 / 10);
  });

  it("states no ratio when the located count is the same as a week ago", () => {
    const geoDays = { "2026-10-20": day(NOW), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^USDC\.dag, located nodes a week ago$/).value).toBe(30);
    expect(find(r, /now against a week ago/)).toHaveLength(0);
  });

  it("states nothing about a week ago without a measured day of its own there", () => {
    expect(find(geoFacts(input({ subject: "usdc" }))!, /week ago/)).toHaveLength(0);
    // The fleet was measured a week back but the network had no list of its own that day.
    const geoDays = { "2026-10-20": day({ ...NOW, net: { dag: NOW.net!.dag! } }), "2026-10-27": day(NOW) };
    expect(find(geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))!, /week ago/)).toHaveLength(0);
    // Its nearest earlier day is nowhere near a week back.
    const near = { "2026-10-25": day(scaled(0.5)), "2026-10-27": day(NOW) };
    expect(find(geoFacts(input({ subject: "usdc", geoDays: near, ccDays: ccOf(near) }))!, /week ago/)).toHaveLength(0);
  });

  it("names the network and no other in its ratio-bearing labels", () => {
    const geoDays = { "2026-10-20": day(scaled(0.5)), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))!;
    expect(r.facts.some((x) => x.kind === "ratio")).toBe(true);
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
    expect(one(r, /^Networks with nodes in Germany, at least$/).value).toBe(1); // a floor: USDC.dag was dropped
    expect(find(r, /^Networks with nodes in Germany$/)).toHaveLength(0);
  });

  it("states the plain count when no network was dropped", () => {
    const r = geoFacts(input({ subject: { cc: "DE" } }))!;
    expect(find(r, /at least/)).toHaveLength(0);
    expect(one(r, /^Networks with nodes in Germany$/).value).toBe(2);
  });

  it("states the country's nodes, share of the fleet and rank", () => {
    const r = geoFacts(input({ subject: { cc: "FR" } }))!;
    expect(one(r, /^France, nodes$/).value).toBe(15);
    expect(one(r, /^France, share of the network's located nodes/).value).toBeCloseTo(0.15);
    expect(one(r, /^France, rank by nodes$/).value).toBe(3);
  });

  it("returns null for a country with no nodes", () => {
    expect(geoFacts(input({ subject: { cc: "JP" } }))).toBeNull();
  });

  it("carries the country's change since a week ago", () => {
    const geoDays = { "2026-10-27": day(NOW) };
    const ccDays = { ...ccOf(geoDays), "2026-10-20": ccOf({ x: day(scaled(0.5)) }).x! };
    const r = geoFacts(input({ subject: { cc: "DE" }, geoDays, ccDays }))!;
    expect(one(r, /^Germany, nodes now against a week ago/).value).toBeCloseTo(2);
  });
});

// SUBJECT NOTES (2026-10-29): a card's own note, scoped as the card is. A network's figures read the
// geo family alone; a week ago only from the network's own measured day there.
describe("geoFacts on a country within a network", () => {
  /** A week of the geo family with the network present, and the day a week back at half. */
  const week = () => ({ "2026-10-20": day(scaled(0.5)), ...run("2026-10-27", 7, () => NOW) });

  it("a network's nodes in a country: count, share of its located nodes, rank, with the week-ago pair and ratio from its own measured day", () => {
    const geoDays = week();
    const r = geoFacts(input({ subject: { cc: "US", net: "usdc" }, geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^USDC\.dag, nodes in United States$/)).toMatchObject({ value: 10, kind: "count", pair: { key: "usdc:cc:US", end: "to" } });
    expect(one(r, /^USDC\.dag, share of its located nodes in United States$/).value).toBeCloseTo(10 / 30);
    expect(one(r, /^United States, rank among USDC\.dag's countries by nodes$/).value).toBe(2);
    expect(one(r, /^USDC\.dag, located nodes$/).value).toBe(30);
    expect(one(r, /^USDC\.dag, countries with nodes$/).value).toBe(2);
    expect(one(r, /^USDC\.dag, nodes in United States a week ago$/)).toMatchObject({ value: 5, pair: { key: "usdc:cc:US", end: "from" } });
    const ratio = one(r, /^USDC\.dag, nodes in United States now against a week ago$/);
    expect([ratio.kind, ratio.value]).toEqual(["ratio", 2]);
    expect([...pairsOf(r.facts).values()]).toEqual([["USDC.dag, nodes in United States a week ago", 5, "USDC.dag, nodes in United States", 10]]);
    // Its own figures only: nothing of the fleet's, nor of another network.
    expect(find(r, /^(Germany|Located nodes in the network|Countries hosting|Constellation|BioFi)/)).toHaveLength(0);
  });

  it("a network's country note states no week ago while the family is younger than a week", () => {
    const geoDays = run("2026-10-27", 3, () => NOW);
    const r = geoFacts(input({ subject: { cc: "DE", net: "usdc" }, geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^USDC\.dag, nodes in Germany$/).value).toBe(20);
    expect(one(r, /^USDC\.dag, nodes in Germany$/).pair).toBeUndefined();
    expect(find(r, /week ago/)).toHaveLength(0);
    expect(r.facts.filter((f) => f.kind === "ratio")).toHaveLength(0);
  });

  it("states no ratio when the network's count there held", () => {
    const geoDays = { "2026-10-20": day(NOW), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ subject: { cc: "DE", net: "usdc" }, geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^USDC\.dag, nodes in Germany a week ago$/).value).toBe(20);
    expect(find(r, /now against a week ago/)).toHaveLength(0);
  });

  it("a network with no nodes in the country now is nothing to describe", () => {
    expect(geoFacts(input({ subject: { cc: "FR", net: "usdc" } }))).toBeNull();
    expect(geoFacts(input({ subject: { cc: "DE", net: "nope" } }))).toBeNull();
  });
});

describe("geoFacts on a provider", () => {
  it("a fleet provider: nodes, share of nodes with a known provider, rank, how many providers, and its week-ago pair", () => {
    const geoDays = { "2026-10-20": day(scaled(0.5)), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ subject: { isp: "hetzner-online-ag" }, geoDays, ccDays: ccOf(geoDays) }))!; // merged with the GmbH key
    expect(one(r, /^Hetzner Online, nodes$/)).toMatchObject({ value: 50, pair: { key: "provider:hetzner online", end: "to" } });
    expect(one(r, /^Hetzner Online, share of the network's nodes with a known provider$/).value).toBeCloseTo(50 / 80);
    expect(one(r, /^Hetzner Online, rank by nodes among providers$/).value).toBe(1);
    expect(one(r, /^Providers hosting nodes$/).value).toBe(3);
    expect([...pairsOf(r.facts).values()]).toEqual([["Hetzner Online, nodes a week ago", 25, "Hetzner Online, nodes", 50]]);
    expect(one(r, /^Hetzner Online, nodes now against a week ago$/).value).toBeCloseTo(2);
    expect(find(r, /^(Germany|United States|Located nodes|Countries hosting|OVH|Amazon)/)).toHaveLength(0);
    expect(one(geoFacts(input({ subject: { isp: "ovh-sas" } }))!, /^OVH, rank by nodes among providers$/).value).toBe(3);
  });

  it("a fleet provider states no week ago with no measured day a week back", () => {
    const r = geoFacts(input({ subject: { isp: "ovh-sas" } }))!;
    expect(one(r, /^OVH, nodes$/).pair).toBeUndefined();
    expect(find(r, /week ago/)).toHaveLength(0);
  });

  it("a provider hosting no node now is null", () => {
    expect(geoFacts(input({ subject: { isp: "nope" } }))).toBeNull();
    expect(geoFacts(input({ subject: { isp: "amazon-com-inc", net: "dag" } }))).toBeNull(); // in the network, not in Constellation's
  });

  it("a network's provider: the network's nodes with it, share of its known-provider nodes, rank among its providers", () => {
    const geoDays = { "2026-10-20": day(scaled(0.5)), ...run("2026-10-27", 7, () => NOW) };
    const r = geoFacts(input({ subject: { isp: "ovh-sas", net: "dag" }, geoDays, ccDays: ccOf(geoDays) }))!;
    expect(one(r, /^Constellation, nodes with OVH$/)).toMatchObject({ value: 10, pair: { key: "dag:provider:ovh", end: "to" } });
    expect(one(r, /^Constellation, share of its nodes with a known provider with OVH$/).value).toBeCloseTo(10 / 30);
    expect(one(r, /^OVH, rank among Constellation's providers by nodes$/).value).toBe(2);
    expect(one(r, /^Constellation, providers with nodes$/).value).toBe(2);
    expect([...pairsOf(r.facts).values()]).toEqual([["Constellation, nodes with OVH a week ago", 5, "Constellation, nodes with OVH", 10]]);
    expect(one(r, /^Constellation, nodes with OVH now against a week ago$/).value).toBeCloseTo(2);
    expect(find(r, /^(Providers hosting|Hetzner Online, |Germany|USDC)/)).toHaveLength(0);
  });

  it("a network's provider states no week ago while the family is younger than a week", () => {
    const r = geoFacts(input({ subject: { isp: "hetzner-online-gmbh", net: "dag" } }))!;
    expect(one(r, /^Constellation, nodes with Hetzner Online$/)).toMatchObject({ value: 20 });
    expect(one(r, /^Constellation, nodes with Hetzner Online$/).pair).toBeUndefined();
    expect(find(r, /week ago/)).toHaveLength(0);
  });

  it("names include the provider's forms and the country", () => {
    const p = geoFacts(input({ subject: { isp: "hetzner-online-ag", net: "usdc" } }))!;
    expect(p.names).toEqual(expect.arrayContaining(["Hetzner Online AG", "Hetzner Online", "Hetzner", "USDC.dag"]));
    const f = geoFacts(input({ subject: { isp: "hetzner-online-gmbh" } }))!;
    expect(f.names).toEqual(expect.arrayContaining(["Hetzner Online GmbH", "Hetzner Online AG", "Hetzner Online", "Hetzner"]));
    const c = geoFacts(input({ subject: { cc: "DE", net: "usdc" } }))!;
    expect(c.names).toEqual(expect.arrayContaining(["Germany", "USDC.dag"]));
  });

  it("is the gate's source: a scoped sentence passes, a figure of another scope does not", () => {
    const geoDays = { "2026-10-20": day(scaled(0.5)), ...run("2026-10-27", 7, () => NOW) };
    const r = geoFacts(input({ subject: { cc: "DE", net: "usdc" }, geoDays, ccDays: ccOf(geoDays) }))!;
    expect(checkNote("USDC.dag runs 20 nodes in Germany, doubled from 10 a week ago.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("USDC.dag runs 50 nodes in Germany.", r.facts, r.names).ok).toBe(false); // the fleet's count there
  });
});

// R74 (user, 2026-10-29): the view's own facts first, then the common activity reading, last.
describe("geoFacts appends the common activity reading last", () => {
  const DAY_MS = 86_400_000;
  const dailyRow = (n: number, f: (i: number) => number | null) => Array.from({ length: n }, (_, i) => f(i));
  const daily = (over: Record<string, (number | null)[]> = {}) => {
    const n = 28;
    const start = D("2026-09-30");
    return { buckets: dailyRow(n, (i) => start + i * DAY_MS) as number[], stepMs: DAY_MS, now: start + n * DAY_MS + 1000, series: { "g.ticks": dailyRow(n, (i) => (i >= 21 ? 8000 : 6000)), "m.usdc.snaps": dailyRow(n, () => 100), "m.usdc.ticks": dailyRow(n, (i) => (i >= 21 ? 60 : 40)), ...over } };
  };
  it("a network: its global snapshots per day last week against the weeks before, after every place fact", () => {
    const r = geoFacts(input({ subject: "usdc", daily: daily() }))!;
    const labels = r.facts.map((f) => f.label);
    const at = labels.indexOf("USDC.dag global snapshots it was part of per day, last week");
    expect(at).toBeGreaterThan(0);
    expect(labels.slice(at)).toEqual([
      "USDC.dag global snapshots it was part of per day, last week",
      "USDC.dag global snapshots it was part of per day, the weeks before",
      "USDC.dag global snapshots it was part of per day, ratio last week to the weeks before",
    ]);
    expect(labels.slice(0, at).some((l) => /global snapshots/.test(l))).toBe(false);
    expect(r.facts[at]!.value).toBe(60);
  });
  it("the whole network: global snapshots per day, last", () => {
    const r = geoFacts(input({ daily: daily() }))!;
    const labels = r.facts.map((f) => f.label);
    expect(labels.slice(-3)).toEqual(["Global snapshots per day, last week", "Global snapshots per day, the weeks before", "Global snapshots per day, ratio last week to the weeks before"]);
    expect(r.facts[labels.length - 3]!.value).toBe(8000);
  });
  it("a country, or no daily read, gets none", () => {
    expect(find(geoFacts(input({ subject: { cc: "DE" }, daily: daily() }))!, /global snapshots/)).toEqual([]);
    expect(find(geoFacts(input())!, /global snapshots/)).toEqual([]);
  });
  it("a subject note appends no common reading even when daily is given", () => {
    for (const subject of [{ cc: "DE", net: "usdc" }, { isp: "ovh-sas" }, { isp: "hetzner-online-ag", net: "usdc" }]) {
      const r = geoFacts(input({ subject, daily: daily() }))!;
      expect(r, JSON.stringify(subject)).not.toBeNull();
      expect(find(r, /global snapshots/i)).toEqual([]);
    }
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
  it("accepts honest network sentences and rejects one with a number the facts do not hold, or the word fleet", () => {
    const r = geoFacts(input())!;
    expect(checkNote("Germany hosts 50% of the network's located nodes, and the nodes run on three providers.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Hetzner carries 50 nodes.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Nodes are spread over four countries.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Germany hosts 60% of the network's located nodes.", r.facts, r.names).ok).toBe(false);
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
    const ccDays = { ...ccOf(geoDays), "2026-10-20": ccOf({ x: day(scaled(0.5)) }).x! };
    const r = geoFacts(input({ geoDays, ccDays }))!;
    expect(checkNote("Germany doubled its nodes since a week ago, from 25 to 50.", r.facts, r.names)).toEqual({ ok: true });
  });

  it("accepts a network's growth since a week ago and rejects a wrong earlier count", () => {
    const geoDays = { "2026-10-20": day(scaled(0.5)), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))!;
    expect(checkNote("USDC.dag has 30 located nodes, doubled from 15 a week ago.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("USDC.dag has 30 located nodes, up from 16 a week ago.", r.facts, r.names).ok).toBe(false);
  });
});

describe("geoFacts tags each change as a pair (R54)", () => {

  it("keys the fleet, each top country and each top provider, a week ago to now, the standing fact as the now end", () => {
    const geoDays = { "2026-10-20": day(scaled(0.5)), "2026-10-27": day(NOW) };
    const r = geoFacts(input({ geoDays, ccDays: ccOf(geoDays) }))!;
    expect([...pairsOf(r.facts).values()]).toEqual([
      ["Located nodes in the network a week ago", 51, "Located nodes in the network", 100],
      ["Germany, nodes a week ago", 25, "Germany, nodes (biggest country)", 50],
      ["United States, nodes a week ago", 15, "United States, nodes (second biggest country)", 30],
      ["France, nodes a week ago", 8, "France, nodes (third biggest country)", 15],
      ["Hetzner Online, nodes a week ago", 25, "Hetzner Online, nodes (biggest provider)", 50],
      ["Amazon.com, nodes a week ago", 10, "Amazon.com, nodes (second biggest provider)", 20],
      ["OVH, nodes a week ago", 5, "OVH, nodes (third biggest provider)", 10],
    ]);
  });

  it("keys a network's located nodes and its countries, and a country's own nodes", () => {
    const back = scaled(0.5, { ...NOW, net: { ...NOW.net, usdc: { cc: { DE: 20 }, isp: { "hetzner-online-ag": 20 } } } });
    const geoDays = { "2026-10-20": day(back), "2026-10-27": day(NOW) };
    const net = geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays) }))!;
    expect([...pairsOf(net.facts).values()]).toEqual([
      ["USDC.dag, located nodes a week ago", 10, "USDC.dag, located nodes", 30],
      ["USDC.dag, countries with nodes a week ago", 1, "USDC.dag, countries with nodes", 2],
    ]);
    const cc = geoFacts(input({ subject: { cc: "DE" }, geoDays, ccDays: ccOf(geoDays) }))!;
    expect([...pairsOf(cc.facts).values()]).toEqual([["Germany, nodes a week ago", 25, "Germany, nodes", 50]]);
  });
});

describe("geoFacts states ONE figure per quantity: countries and the fleet from the tiers (R58)", () => {
  // The live dump of 2026-10-27: the geo family locates 80 nodes today while the tiers' history,
  // the only source of "a week ago" (173), counts 86. Germany is 33 in both; the United States
  // reads 29 in the tiers, 27 in the geo family. Providers exist only in the geo family.
  const providers = { hetzner: "Hetzner Online GmbH", amazon: "Amazon.com, Inc.", ionos: "IONOS SE" };
  const countries = { DE: "Germany", US: "United States", FI: "Finland", NL: "Netherlands" };
  const geoToday = { cc: { DE: 33, US: 27, FI: 17, NL: 3 }, isp: { hetzner: 51, amazon: 9, ionos: 9 } };
  const tiersToday = { "f.cc.DE": 33, "f.cc.US": 29, "f.cc.FI": 17, "f.cc.NL": 7 };
  const tiersThen = { "f.cc.DE": 67, "f.cc.US": 58, "f.cc.FI": 41, "f.cc.NL": 7 };
  const dump = (subject: GeoFactsInput["subject"] = "all", ccDays: GeoFactsInput["ccDays"] = { "2026-10-20": tiersThen, "2026-10-27": tiersToday }) =>
    geoFacts({ subject, geoDays: { "2026-10-27": day(geoToday) }, ccDays, providerNames: providers, countryNames: countries, names: NAMES })!;

  it("states the tiers' count now as the fleet's one figure, the now end of its week-ago pair", () => {
    const r = dump();
    const now = one(r, /^Located nodes in the network$/);
    expect([now.value, now.pair?.end]).toEqual([86, "to"]);
    expect(one(r, /^Located nodes in the network a week ago$/)).toMatchObject({ value: 173, pair: { key: now.pair!.key, end: "from" } });
    expect(one(r, /^Located nodes in the network, now against a week ago$/).value).toBeCloseTo(86 / 173);
    expect(find(r, /counted as/)).toHaveLength(0);
    expect(r.facts.filter((f) => f.value === 80)).toHaveLength(0); // the geo family's total is stated nowhere
  });

  it("reads every country figure from the tiers: counts, shares, the country count, each pair", () => {
    const r = dump();
    expect(one(r, /^Countries hosting nodes$/).value).toBe(4);
    expect(one(r, /^United States, nodes \(second biggest country\)$/)).toMatchObject({ value: 29, pair: { end: "to" } });
    expect(one(r, /^United States, share of the network's located nodes$/).value).toBeCloseTo(29 / 86);
    expect(one(r, /^United States, nodes now against a week ago$/).value).toBeCloseTo(29 / 58);
    expect(one(r, /^Germany, nodes \(biggest country\)$/)).toMatchObject({ value: 33, pair: { end: "to" } });
  });

  it("keeps providers on the geo family, their shares of the nodes with a known provider", () => {
    const r = dump();
    expect(one(r, /^Hetzner Online, nodes \(biggest provider\)$/).value).toBe(51);
    expect(one(r, /^Hetzner Online, share of the network's nodes with a known provider$/).value).toBeCloseTo(51 / 69);
    expect(one(r, /^Providers hosting nodes$/).value).toBe(3);
  });

  it("reads a country's own note from the tiers too: its count, share, rank and pair", () => {
    const r = dump({ cc: "US" });
    expect(one(r, /^United States, nodes$/)).toMatchObject({ value: 29, pair: { end: "to" } });
    expect(one(r, /^United States, share of the network's located nodes$/).value).toBeCloseTo(29 / 86);
    expect(one(r, /^United States, rank by nodes$/).value).toBe(2);
    expect(one(r, /^United States, nodes a week ago$/)).toMatchObject({ value: 58, pair: { end: "from" } });
  });

  it("states no network count in a country above the tiers' count for that country (M4)", () => {
    // The geo family puts 30 of Constellation's nodes in Germany; the tiers count 25 there.
    const geoDays = { "2026-10-27": day(NOW) };
    const ccDays = { "2026-10-27": { ...ccOf(geoDays)["2026-10-27"]!, "f.cc.DE": 25 } };
    const r = geoFacts(input({ subject: { cc: "DE" }, geoDays, ccDays }))!;
    expect(one(r, /^Germany, nodes$/).value).toBe(25);
    expect(find(r, /^Constellation, nodes in Germany$/)).toHaveLength(0);
    expect(one(r, /^Constellation, share of its nodes in Germany$/).value).toBeCloseTo(30 / 55); // its own reading
    expect(one(r, /^USDC\.dag, nodes in Germany$/).value).toBe(20);
    expect(one(r, /^Networks with nodes in Germany$/).value).toBe(2);
  });

  it("keeps a network's note on the geo family: the tiers hold no per-network countries", () => {
    const geoDays = { "2026-10-27": day(NOW) };
    const r = geoFacts(input({ subject: "usdc", geoDays, ccDays: ccOf(geoDays, 0.9) }))!;
    expect(one(r, /^USDC\.dag, share of the network's located nodes$/).value).toBeCloseTo(30 / 100);
    expect(one(r, /^USDC\.dag, share of the network's nodes in Germany$/).value).toBeCloseTo(20 / 50);
  });

  it("falls back to the geo family, with no week-ago figure, when the tiers' newest day is missing or unmeasured", () => {
    const cases: GeoFactsInput["ccDays"][] = [
      {}, // no tiers at all
      { "2026-10-20": tiersThen, "2026-10-26": tiersToday }, // the tiers' newest day is older than today's reading
      { "2026-10-20": tiersThen, "2026-10-26": tiersToday, "2026-10-27": { "f.cc.DE": 2 } }, // an outage day
    ];
    for (const ccDays of cases) {
      const r = dump("all", ccDays);
      expect(one(r, /^Located nodes in the network$/).value).toBe(80);
      expect(one(r, /^United States, nodes \(second biggest country\)$/).value).toBe(27);
      expect(r.facts.filter((f) => /week ago/.test(f.label))).toHaveLength(0);
      expect(r.facts.filter((f) => f.pair && !/provider/.test(f.label))).toHaveLength(0);
    }
  });

  it("is the gate's source for the live failure: only the tiers' one figure ends the change from 173", () => {
    const r = dump();
    const gate = (t: string) => checkNote(t, r.facts, r.names);
    const live = gate("Located nodes fell from 173 a week ago to 9. Germany dropped from 67 to 33.");
    expect(live.ok).toBe(false);
    if (!live.ok) expect(live.reasons).toEqual(["173 is a past value; the figure beside it, 9, is not its current figure 86"]);
    expect(gate("Located nodes fell from 173 a week ago to just 9.").ok).toBe(false);
    expect(gate("Located nodes stand at 9, down from 173 a week ago.").ok).toBe(false);
    expect(gate("Located nodes fell from 173 a week ago to 86.")).toEqual({ ok: true });
    expect(gate("The network has 86 located nodes, down from 173.")).toEqual({ ok: true });
    expect(gate("Located nodes fell from 173 a week ago to 80.").ok).toBe(false);
    expect(gate("Germany dropped from 67 to 33.")).toEqual({ ok: true });
    expect(gate("Germany dropped from 67 to 27.").ok).toBe(false);
    expect(gate("The United States fell from 58 to 29.")).toEqual({ ok: true });
    expect(gate("The United States fell from 58 to 27.").ok).toBe(false);
    expect(gate("The network locates 86 nodes, 33 of them in Germany.")).toEqual({ ok: true });
  });
});

// M5: the warm pass plans its country notes from `fleetCountries`, so it plans exactly the countries
// a country note states: the same reading `geoFacts` takes its country figures from (R58).
describe("fleetCountries: the countries a country note exists for", () => {
  const countries = { DE: "Germany", US: "United States", FR: "France", SE: "Sweden" };
  const geoToday = day({ cc: { DE: 33, US: 27, FR: 2 }, isp: {} });
  const tiersToday = { "f.cc.DE": 33, "f.cc.US": 29, "f.cc.SE": 4 };
  const noteFor = (cc: string, ccDays: GeoFactsInput["ccDays"]) =>
    geoFacts({ subject: { cc }, geoDays: { "2026-10-27": geoToday }, ccDays, providerNames: {}, countryNames: countries, names: NAMES });

  it("reads the tiers while they are current: a country only there is listed, one only in the geo family is not", () => {
    const ccDays = { "2026-10-27": tiersToday };
    const listed = fleetCountries({ geoDays: { "2026-10-27": geoToday }, ccDays });
    expect(listed).toEqual(["DE", "SE", "US"]);
    for (const cc of listed) expect(noteFor(cc, ccDays), cc).not.toBeNull();
    expect(noteFor("FR", ccDays)).toBeNull();
  });

  it("falls back to the geo family's countries with the facts, when the tiers' newest day is older", () => {
    const ccDays = { "2026-10-26": tiersToday };
    const listed = fleetCountries({ geoDays: { "2026-10-27": geoToday }, ccDays });
    expect(listed).toEqual(["DE", "FR", "US"]);
    for (const cc of listed) expect(noteFor(cc, ccDays), cc).not.toBeNull();
    expect(noteFor("SE", ccDays)).toBeNull();
  });

  it("lists nothing with no measured geo day: no country note exists then", () => {
    expect(fleetCountries({ geoDays: {}, ccDays: { "2026-10-27": tiersToday } })).toEqual([]);
  });
});
