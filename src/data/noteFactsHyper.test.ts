import { describe, it, expect } from "vitest";
import { hyperFacts, type HyperFactsInput } from "@/src/data/noteFactsHyper";
import { checkNote } from "@/src/data/noteHonesty";
import type { TrendsWindowData } from "@/src/data/trendWindow";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 27, 0); // the daily window opens 60 days before Nov 26
const NAMES = { dag: "Constellation", usdc: "USDC.dag", bio: "BioFi", dor: "Dor" };
const BLURBS = { usdc: "a stablecoin on the DAG", bio: "a biometric identity chain", dor: "a data marketplace" };

const row = (n: number, f: (i: number) => number | null): (number | null)[] => Array.from({ length: n }, (_, i) => f(i));

function win(n: number, stepMs: number, series: Record<string, (number | null)[]>, start: number): TrendsWindowData {
  return { buckets: row(n, (i) => start + i * stepMs) as number[], stepMs, series, now: start + n * stepMs + 1000 };
}

/** 30 days of the hourly tier: the DAG 100 nodes, USDC.dag 30, BioFi 10, Dor none. The total steps up from
 *  120 to 140 half way. */
function fleet(over: Record<string, (number | null)[]> = {}, n = 720): TrendsWindowData {
  const start = T0 + 30 * DAY;
  return win(n, HOUR, {
    "f.nodes": row(n, (i) => (i < n / 2 ? 120 : 140)),
    "f.nodes.dag": row(n, () => 100),
    "f.nodes.usdc": row(n, (i) => (i < n / 2 ? 10 : 30)),
    "f.nodes.bio": row(n, () => 10),
    "f.nodes.dor": row(n, () => 0),
    "f.layer.usdc.l0": row(n, () => 30),
    "f.layer.usdc.cl1": row(n, () => 20),
    "f.layer.usdc.dl1": row(n, () => 0),
    "f.type.usdc.l0+cl1": row(n, () => 20),
    "f.type.usdc.l0": row(n, () => 10),
    ...over,
  }, start);
}

/** 60 days of the daily tier: a 30-day lead-in, then the 30-day span. */
function daily(over: Record<string, (number | null)[]> = {}): TrendsWindowData {
  const n = 60;
  return win(n, DAY, {
    "g.ticks": row(n, () => 28_800),
    "u.cov": row(n, () => 0),
    "m.usdc.snaps": row(n, () => 100),
    "m.usdc.ticks": row(n, () => 50),
    "m.bio.snaps": row(n, () => 10),
    "m.bio.ticks": row(n, () => 8),
    "m.dor.snaps": row(n, () => 0),
    "m.dor.ticks": row(n, () => 0),
    ...over,
  }, T0);
}

function input(patch: Partial<HyperFactsInput> = {}): HyperFactsInput {
  const d = patch.daily ?? daily();
  return {
    subject: "all",
    fleet: fleet(),
    daily: d,
    span: { fromMs: d.buckets[30]!, toMs: d.buckets[59]! + DAY },
    names: NAMES,
    blurbs: BLURBS,
    ...patch,
  };
}

const find = (r: NonNullable<ReturnType<typeof hyperFacts>>, re: RegExp, kind?: string) =>
  r.facts.filter((f) => re.test(f.label) && (!kind || f.kind === kind));

describe("hyperFacts on all", () => {
  it("counts the networks with nodes: four networks, one without, make three", () => {
    const r = hyperFacts(input())!;
    const [f] = find(r, /^Networks with nodes$/);
    expect(f!.value).toBe(3);
    expect(f!.text).toBe("3");
  });

  it("returns setKey, the sorted ids of the networks with nodes", () => {
    expect(hyperFacts(input())!.setKey).toBe("bio,dag,usdc");
    // A network that gained nodes joins the key; the order never follows the catalog's.
    const grown = fleet({ "f.nodes.dor": row(720, () => 5) });
    expect(hyperFacts(input({ fleet: grown }))!.setKey).toBe("bio,dag,dor,usdc");
  });

  it("names the three biggest by nodes, biggest first, and the three most active by global snapshots", () => {
    const r = hyperFacts(input())!;
    const big = r.facts.filter((f) => /biggest network\)$/.test(f.label));
    expect(big.map((f) => [f.label, f.value])).toEqual([
      ["Constellation, nodes (biggest network)", 100],
      ["USDC.dag, nodes (second biggest network)", 30],
      ["BioFi, nodes (third biggest network)", 10],
    ]);
    const act = r.facts.filter((f) => /most active network\)$/.test(f.label));
    expect(act.map((f) => [f.label, f.value])).toEqual([
      ["USDC.dag, global snapshots it was part of per day, last week (most active network)", 50],
      ["BioFi, global snapshots it was part of per day, last week (second most active network)", 8],
    ]);
  });

  it("counts the networks that anchored in the last day and the last week, and those with nodes that did not", () => {
    const r = hyperFacts(input())!;
    expect(find(r, /^Networks that anchored snapshots in the last day$/)[0]!.value).toBe(2);
    expect(find(r, /^Networks that anchored snapshots in the last week$/)[0]!.value).toBe(2);
    // The DAG has no anchoring row of its own, so it is neither anchoring nor quiet: nothing measured.
    expect(find(r, /^Networks with nodes that anchored nothing in the last week$/)[0]!.value).toBe(0);
    const dorAlive = hyperFacts(input({ fleet: fleet({ "f.nodes.dor": row(720, () => 5) }) }))!;
    expect(find(dorAlive, /^Networks with nodes that anchored nothing in the last week$/)[0]!.value).toBe(1);
  });

  it("makes the anchored count a floor when the unlisted chains were active", () => {
    const r = hyperFacts(input({ daily: daily({ "m.zz9.snaps": row(60, () => 7), "m.zz9.ticks": row(60, () => 7) }) }))!;
    const [f] = find(r, /^Networks that anchored snapshots in the last week, at least$/);
    expect(f!.value).toBe(3); // two listed, plus the unlisted chains as one
    expect(find(r, /^Networks that anchored snapshots in the last day, at least$/)[0]!.value).toBe(3);
  });

  it("states the total nodes through gaugeChange: start, end and the ratio, naming no network", () => {
    const r = hyperFacts(input())!;
    expect(find(r, /^Nodes across all networks at the start of the span$/)[0]!.value).toBe(120);
    expect(find(r, /^Nodes across all networks at the end of the span$/)[0]!.value).toBe(140);
    const [ratio] = find(r, /^Nodes across all networks, ratio end to start$/, "ratio");
    expect(ratio!.value).toBeCloseTo(140 / 120, 9);
    for (const n of Object.values(NAMES)) expect(ratio!.label).not.toContain(n);
  });

  it("states only the current level of a total that began after the span did", () => {
    const late = fleet({ "f.nodes": row(720, (i) => (i < 400 ? null : 140)) });
    const r = hyperFacts(input({ fleet: late }))!;
    expect(find(r, /^Nodes across all networks at the end of the span$/)[0]!.value).toBe(140);
    expect(find(r, /^Nodes across all networks at the start of the span$/)).toEqual([]);
    expect(find(r, /^Nodes across all networks, ratio end to start$/)).toEqual([]);
  });

  it("reports a network that started and one that stopped inside the span, not ones already running or resumed", () => {
    const newcomer = row(60, (i) => (i < 45 ? 0 : 6)); // first activity on day 45 of 60: inside the span
    const goner = row(60, (i) => (i < 50 ? 4 : 0)); // last activity on day 49, then quiet for ten days
    const r = hyperFacts(
      input({
        daily: daily({ "m.bio.snaps": newcomer, "m.dor.snaps": goner }),
        names: NAMES,
      }),
    )!;
    const started = find(r, /started anchoring/);
    expect(started.map((f) => f.label)).toEqual(["BioFi started anchoring, first day"]);
    expect(started[0]!.kind).toBe("date");
    expect(started[0]!.value).toBe(T0 + 45 * DAY);
    const stopped = find(r, /stopped anchoring/);
    expect(stopped.map((f) => f.label)).toEqual(["Dor stopped anchoring, last day"]);
    expect(stopped[0]!.value).toBe(T0 + 49 * DAY);
    // A network that was running before the span (USDC.dag) has no beginning to report.
    expect(find(r, /USDC\.dag (started|stopped)/)).toEqual([]);
    expect(r.blurbs).toEqual(expect.arrayContaining(["BioFi is: a biometric identity chain", "Dor is: a data marketplace"]));
  });

  it("does not call a network that merely resumed in the span a start", () => {
    const resumed = row(60, (i) => (i < 10 || i >= 40 ? 6 : 0)); // active in the lead-in, quiet, back in the span
    const r = hyperFacts(input({ daily: daily({ "m.bio.snaps": resumed }) }))!;
    expect(find(r, /BioFi started/)).toEqual([]);
  });

  it("returns every catalog name, and no blurb for a network the facts do not name", () => {
    const r = hyperFacts(input())!;
    expect(r.names).toEqual(expect.arrayContaining(Object.values(NAMES)));
    expect(r.blurbs).not.toContain("Dor is: a data marketplace");
  });

  it("returns null when no fleet sample is covered", () => {
    const empty = fleet({ "f.nodes": row(720, () => null), "f.nodes.usdc": row(720, () => null) });
    expect(hyperFacts(input({ fleet: empty }))).toBeNull();
  });

  it("copes with an empty daily window", () => {
    const none = win(0, DAY, {}, T0);
    const r = hyperFacts(input({ daily: none, span: { fromMs: T0, toMs: T0 + DAY } }))!;
    expect(find(r, /^Networks with nodes$/)[0]!.value).toBe(3);
    expect(find(r, /anchored/)).toEqual([]);
  });
});

describe("hyperFacts reads nodes through an outage-robust level", () => {
  const N = 720;
  const patched = (_id: string, base: number, bad: number | null, k = 1) =>
    row(N, (i) => (i >= N - k ? bad : base));
  const digest = (fl: TrendsWindowData) => {
    const r = hyperFacts(input({ fleet: fl }))!;
    return {
      withNodes: find(r, /^Networks with nodes$/)[0]!.value,
      biggest: r.facts.filter((f) => /biggest network\)$/.test(f.label)).map((f) => [f.label, f.value]),
      setKey: r.setKey,
    };
  };
  const base = digest(fleet());

  it("an hour that reads 0 for one network changes nothing", () => {
    expect(digest(fleet({ "f.nodes.usdc": patched("usdc", 30, 0) }))).toEqual({ ...base });
  });

  it("an hour that reads a partial low count changes nothing", () => {
    expect(digest(fleet({ "f.nodes.usdc": patched("usdc", 30, 4) }))).toEqual(base);
    const r = hyperFacts(input({ subject: "usdc", fleet: fleet({ "f.nodes.usdc": patched("usdc", 30, 4) }) }))!;
    expect(find(r, /^USDC\.dag rank by nodes$/)[0]!.value).toBe(2);
  });

  it("a network that genuinely emptied leaves the set and states no shape", () => {
    const emptied = fleet({ "f.nodes.usdc": patched("usdc", 30, 0, 8), "f.layer.usdc.l0": row(N, (i) => (i < N - 8 ? 30 : null)) });
    const d = digest(emptied);
    expect(d.withNodes).toBe(2);
    expect(d.setKey).toBe("bio,dag");
    const r = hyperFacts(input({ subject: "usdc", fleet: emptied }))!;
    expect(find(r, /layer/)).toEqual([]);
    expect(find(r, /nodes running/)).toEqual([]);
    expect(find(r, /rank by nodes/)).toEqual([]);
  });

  it("reads the end of the span's shape at the last agreeing sample when a layer's roles vanish for an hour", () => {
    // The last hour: nodes low (the cL1 fetch failed) and its role / type rows absent. L0 grew
    // from 25 to 30 early in the span; the bad hour's 10 and its missing cL1 row are never read.
    const r = hyperFacts(
      input({
        subject: "usdc",
        fleet: fleet({
          "f.nodes.usdc": patched("usdc", 30, 10),
          "f.layer.usdc.l0": row(N, (i) => (i < 10 ? 25 : i < N - 1 ? 30 : 10)),
          "f.layer.usdc.cl1": row(N, (i) => (i < N - 1 ? 20 : null)),
          "f.type.usdc.l0+cl1": row(N, (i) => (i < N - 1 ? 20 : null)),
          "f.type.usdc.l0": row(N, (i) => (i < N - 1 ? 10 : 10)),
        }),
      }),
    )!;
    expect(find(r, /^USDC\.dag nodes on the L0 layer at the start of the span$/)[0]!.value).toBe(25);
    expect(find(r, /^USDC\.dag nodes on the L0 layer at the end of the span$/)[0]!.value).toBe(30);
    expect(find(r, /cL1 layer/)).toEqual([]);
    expect(find(r, /nodes running/)).toEqual([]);
    expect(find(r, /^USDC\.dag layers whose node count changed over the span$/)[0]!.value).toBe(1);
  });
});

describe("hyperFacts on a network", () => {
  const usdc = () => hyperFacts(input({ subject: "usdc" }))!;

  it("states the node count and what it did", () => {
    const r = usdc();
    expect(find(r, /^USDC\.dag nodes at the start of the span$/)[0]!.value).toBe(10);
    expect(find(r, /^USDC\.dag nodes at the end of the span$/)[0]!.value).toBe(30);
    expect(find(r, /^USDC\.dag nodes, ratio end to start$/, "ratio")[0]!.value).toBeCloseTo(3, 9);
  });

  it("states no current-only breakdown: a shape that held is no layer or combination row", () => {
    const r = usdc();
    expect(find(r, /layer at the/)).toEqual([]);
    expect(find(r, /nodes running/)).toEqual([]);
    expect(find(r, /^USDC\.dag nodes on the L0 layer$/)).toEqual([]);
  });

  it("reads a role the sampler stopped writing as 0 at the latest recorded sample, never its stale count", () => {
    const n = 720;
    const r = hyperFacts(
      input({
        subject: "usdc",
        fleet: fleet({
          "f.layer.usdc.dl1": row(n, (i) => (i < 700 ? 4 : null)),
          "f.layer.usdc.l0": row(n, () => 30),
        }),
      }),
    )!;
    expect(find(r, /^USDC\.dag nodes on the dL1 layer at the start of the span$/)[0]!.value).toBe(4);
    const [end] = find(r, /^USDC\.dag nodes on the dL1 layer at the end of the span$/);
    expect(end!.value).toBe(0);
    expect(end!.text).toBe("0");
  });

  it("ranks the network by nodes and by activity among the networks", () => {
    const r = usdc();
    expect(find(r, /^USDC\.dag rank by nodes$/)[0]!.value).toBe(2);
    expect(find(r, /^Networks with nodes$/)[0]!.value).toBe(3);
    expect(find(r, /^USDC\.dag rank by global snapshots it was part of$/)[0]!.value).toBe(1);
    expect(find(r, /^Networks that were part of global snapshots in the last week$/)[0]!.value).toBe(2);
    expect(find(r, /^USDC\.dag global snapshots it was part of per day, last week$/)[0]!.value).toBe(50);
  });

  it("puts the blurb in blurbs, never in facts", () => {
    const r = usdc();
    expect(r.blurbs).toEqual(["USDC.dag is: a stablecoin on the DAG"]);
    expect(r.facts.some((f) => f.label.includes("stablecoin") || f.text.includes("stablecoin"))).toBe(false);
  });

  it("gives no setKey on a network", () => {
    expect(usdc().setKey).toBeUndefined();
  });

  it("has no activity rank for a network with no anchoring row, and treats the DAG as a network", () => {
    const r = hyperFacts(input({ subject: "dag" }))!;
    expect(find(r, /^Constellation nodes at the end of the span$/)[0]!.value).toBe(100);
    expect(find(r, /^Constellation rank by nodes$/)[0]!.value).toBe(1);
    expect(find(r, /rank by global snapshots/)).toEqual([]);
  });

  it("returns null for a network with nothing measured", () => {
    expect(hyperFacts(input({ subject: "ghost" }))).toBeNull();
  });
});

describe("hyperFacts on a network: the change of shape", () => {
  const N = 720;
  /** Dor: three nodes running every layer, then two more running only dL1 half way through. */
  const dor = (over: Record<string, (number | null)[]> = {}) =>
    fleet({
      "f.nodes.dor": row(N, (i) => (i < N / 2 ? 3 : 5)),
      "f.layer.dor.l0": row(N, () => 3),
      "f.layer.dor.cl1": row(N, () => 3),
      "f.layer.dor.dl1": row(N, (i) => (i < N / 2 ? 3 : 5)),
      "f.type.dor.l0+cl1+dl1": row(N, () => 3),
      "f.type.dor.dl1": row(N, (i) => (i < N / 2 ? null : 2)),
      ...over,
    });

  it("states a changed layer at both ends, counts the changed layers, and leaves an unchanged layer out", () => {
    const r = hyperFacts(input({ subject: "dor", fleet: dor() }))!;
    expect(find(r, /^Dor nodes on the dL1 layer at the start of the span$/)[0]!.value).toBe(3);
    expect(find(r, /^Dor nodes on the dL1 layer at the end of the span$/)[0]!.value).toBe(5);
    expect(find(r, /L0 layer|cL1 layer/)).toEqual([]);
    const [changed] = find(r, /^Dor layers whose node count changed over the span$/, "count");
    expect(changed!.value).toBe(1);
  });

  it("states a changed combination at both ends, a type absent at a recorded sample a measured 0", () => {
    const r = hyperFacts(input({ subject: "dor", fleet: dor() }))!;
    const [from] = find(r, /^Dor nodes running only dL1 at the start of the span$/);
    expect(from!.value).toBe(0);
    expect(find(r, /^Dor nodes running only dL1 at the end of the span$/)[0]!.value).toBe(2);
    expect(find(r, /running L0, cL1 and dL1/)).toEqual([]);
  });

  it("states a combination unknown at the start (no type recorded) not at all", () => {
    const r = hyperFacts(
      input({ subject: "dor", fleet: dor({ "f.type.dor.l0+cl1+dl1": row(N, (i) => (i < 5 ? null : 3)) }) }),
    )!;
    expect(find(r, /nodes running/)).toEqual([]);
    expect(find(r, /^Dor layers whose node count changed over the span$/)[0]!.value).toBe(1);
  });

  it("states the count 0 and no layer rows for a shape that held", () => {
    const r = hyperFacts(input({ subject: "bio", fleet: fleet({ "f.layer.bio.l0": row(N, () => 10), "f.type.bio.l0": row(N, () => 10) }) }))!;
    const [changed] = find(r, /^BioFi layers whose node count changed over the span$/);
    expect(changed!.value).toBe(0);
    expect(changed!.text).toBe("0");
    expect(find(r, /layer at the/)).toEqual([]);
    expect(find(r, /nodes running/)).toEqual([]);
  });

  it("reads the start at the OLDEST sample that agrees with the span's starting level, skipping an outage hour", () => {
    // The first hour read 1 node with one dL1 row: a partial fetch, never the start of the shape.
    const r = hyperFacts(
      input({
        subject: "dor",
        fleet: dor({
          "f.nodes.dor": row(N, (i) => (i === 0 ? 1 : i < N / 2 ? 3 : 5)),
          "f.layer.dor.l0": row(N, (i) => (i === 0 ? null : 3)),
          "f.layer.dor.cl1": row(N, (i) => (i === 0 ? null : 3)),
          "f.layer.dor.dl1": row(N, (i) => (i === 0 ? 1 : i < N / 2 ? 3 : 5)),
        }),
      }),
    )!;
    expect(find(r, /^Dor nodes on the dL1 layer at the start of the span$/)[0]!.value).toBe(3);
    expect(find(r, /L0 layer|cL1 layer/)).toEqual([]);
  });

  it("states no change of shape for a gauge that began after the span did", () => {
    const r = hyperFacts(input({ subject: "dor", fleet: dor({ "f.nodes.dor": row(N, (i) => (i < 400 ? null : 5)) }) }))!;
    expect(find(r, /layer/)).toEqual([]);
    expect(find(r, /nodes running/)).toEqual([]);
    expect(find(r, /^Dor nodes at the end of the span$/)[0]!.value).toBe(5);
  });

  it("states no change of shape when the layers were not recorded at the start", () => {
    const blank = (v: number) => row(N, (i) => (i < 100 ? null : v));
    const r = hyperFacts(
      input({ subject: "dor", fleet: dor({ "f.layer.dor.l0": blank(3), "f.layer.dor.cl1": blank(3), "f.layer.dor.dl1": row(N, (i) => (i < 100 ? null : i < N / 2 ? 3 : 5)) }) }),
    )!;
    expect(find(r, /layer/)).toEqual([]);
  });
});

describe("hyperFacts on a network: the change of activity", () => {
  it("states the weeks before beside the last week, and their ratio when they differ", () => {
    const d = daily({ "m.usdc.ticks": row(60, (i) => (i >= 53 ? 60 : 40)) });
    const r = hyperFacts(input({ subject: "usdc", daily: d }))!;
    expect(find(r, /^USDC\.dag global snapshots it was part of per day, last week$/)[0]!.value).toBe(60);
    expect(find(r, /^USDC\.dag global snapshots it was part of per day, the weeks before$/)[0]!.value).toBe(40);
    const [ratio] = find(r, /^USDC\.dag global snapshots it was part of per day, ratio last week to the weeks before$/, "ratio");
    expect(ratio!.value).toBeCloseTo(1.5, 9);
  });

  it("states no ratio when the two are equal", () => {
    const r = hyperFacts(input({ subject: "usdc" }))!;
    expect(find(r, /the weeks before$/)[0]!.value).toBe(50);
    expect(find(r, /ratio last week/)).toEqual([]);
  });

  it("states nothing for the weeks before with fewer than seven measured days", () => {
    // Days 32..46 read 0 beside created snapshots: the field's absence, not none (anchorSeries).
    const d = daily({ "m.usdc.ticks": row(60, (i) => (i >= 53 ? 60 : i >= 47 ? 40 : 0)) });
    const r = hyperFacts(input({ subject: "usdc", daily: d }))!;
    expect(find(r, /weeks before/)).toEqual([]);
    expect(find(r, /per day, last week$/)[0]!.value).toBe(60);
  });
});

describe("hyperFacts on all: the movers and the whole network's activity", () => {
  const N = 720;
  const names = { ...NAMES, ext: "Ext", late: "Late" };

  it("names the up-to-three networks whose node count changed most, unchanged and late-starting ones left out", () => {
    const fl = fleet({
      "f.nodes.dor": row(N, (i) => (i < N / 2 ? 0 : 5)), // +5
      "f.nodes.bio": row(N, (i) => (i < N / 2 ? 10 : 12)), // +2: fourth, out
      "f.nodes.ext": row(N, (i) => (i < N / 2 ? 50 : 44)), // −6
      "f.nodes.late": row(N, (i) => (i < 400 ? null : 100)), // began after the span: out
    });
    const r = hyperFacts(input({ fleet: fl, names }))!;
    const movers = r.facts.filter((f) => /^\S+ nodes at the (start|end) of the span$/.test(f.label));
    expect(movers.map((f) => [f.label, f.value])).toEqual([
      ["USDC.dag nodes at the start of the span", 10],
      ["USDC.dag nodes at the end of the span", 30],
      ["Ext nodes at the start of the span", 50],
      ["Ext nodes at the end of the span", 44],
      ["Dor nodes at the start of the span", 0],
      ["Dor nodes at the end of the span", 5],
    ]);
    expect(find(r, /^(Constellation|BioFi|Late) nodes at the/)).toEqual([]);
    expect(r.blurbs).toEqual(expect.arrayContaining(["Dor is: a data marketplace"]));
  });

  it("names no mover when no network's count changed", () => {
    const r = hyperFacts(input({ fleet: fleet({ "f.nodes.usdc": row(N, () => 30) }) }))!;
    expect(r.facts.filter((f) => /^\S+ nodes at the (start|end) of the span$/.test(f.label))).toEqual([]);
  });

  it("states global snapshots per day, last week against the weeks before, naming no network", () => {
    const r = hyperFacts(input({ daily: daily({ "g.ticks": row(60, (i) => (i >= 53 ? 30_000 : 24_000)) }) }))!;
    expect(find(r, /^Global snapshots per day, last week$/)[0]!.value).toBe(30_000);
    expect(find(r, /^Global snapshots per day, the weeks before$/)[0]!.value).toBe(24_000);
    const [ratio] = find(r, /^Global snapshots per day, ratio last week to the weeks before$/, "ratio");
    expect(ratio!.value).toBeCloseTo(1.25, 9);
    for (const n of Object.values(NAMES)) expect(ratio!.label).not.toContain(n);
  });

  it("reads covered days only, and states nothing for the weeks before under seven of them", () => {
    const r = hyperFacts(input({ daily: daily({ "g.ticks": row(60, (i) => (i >= 53 ? 30_000 : i >= 47 ? 24_000 : null)) }) }))!;
    expect(find(r, /^Global snapshots per day, last week$/)[0]!.value).toBe(30_000);
    expect(find(r, /^Global snapshots per day, the weeks before$/)).toEqual([]);
    expect(find(r, /^Global snapshots per day, ratio/)).toEqual([]);
    const same = hyperFacts(input())!;
    expect(find(same, /^Global snapshots per day, the weeks before$/)[0]!.value).toBe(28_800);
    expect(find(same, /^Global snapshots per day, ratio/)).toEqual([]);
  });
});

describe("hyperFacts as a gate-passing source", () => {
  it("accepts an honest digest sentence and rejects one with a number the facts do not hold", () => {
    const r = hyperFacts(input())!;
    expect(checkNote("Three networks have nodes, and two anchored snapshots in the last week.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Constellation is the biggest network with 100 nodes.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Nodes across all networks rose by 17%.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Seven networks have nodes.", r.facts, r.names).ok).toBe(false);
    expect(checkNote("Nodes across all networks rose by 40%.", r.facts, r.names).ok).toBe(false);
  });

  it("accepts an honest network sentence, layer tokens included, and rejects a wrong count", () => {
    const r = hyperFacts(input({ subject: "usdc" }))!;
    expect(checkNote("USDC.dag has 30 nodes on the L0 layer, ranking second of 3 by nodes.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("USDC.dag grew about threefold.", r.facts, r.names).ok).toBe(false);
    expect(checkNote("USDC.dag has 31 nodes on the L0 layer.", r.facts, r.names).ok).toBe(false);
  });

  it("accepts an honest change-of-shape sentence and rejects a wrong start count", () => {
    const N = 720;
    const fl = fleet({
      "f.nodes.dor": row(N, (i) => (i < N / 2 ? 3 : 5)),
      "f.layer.dor.l0": row(N, () => 3),
      "f.layer.dor.cl1": row(N, () => 3),
      "f.layer.dor.dl1": row(N, (i) => (i < N / 2 ? 3 : 5)),
    });
    const r = hyperFacts(input({ subject: "dor", fleet: fl }))!;
    expect(checkNote("Dor grew from 3 to 5 nodes, and one layer changed: dL1 went from 3 to 5.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Dor had 6 nodes on the dL1 layer at the start of the span.", r.facts, r.names).ok).toBe(false);
    expect(checkNote("Dor grew from 3 to 5 nodes, and two layers changed.", r.facts, r.names).ok).toBe(false);
  });

  it("accepts a sentence saying the shape held", () => {
    const N = 720;
    const r = hyperFacts(input({ subject: "bio", fleet: fleet({ "f.layer.bio.l0": row(N, () => 10) }) }))!;
    expect(checkNote("BioFi held 10 nodes over the span, and 0 layers changed.", r.facts, r.names)).toEqual({ ok: true });
  });
});
