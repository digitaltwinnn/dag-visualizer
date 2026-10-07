import { describe, it, expect } from "vitest";
import { CHILD_OF, childStep, positionMarks, siblingSet, type SiblingState } from "@/components/railSiblings";
import {
  cohortToggleActions,
  compositionToggleActions,
  countryToggleActions,
  metaSnapSelectActions,
  tickNetSelectActions,
  nodeSelectActions,
  snapshotSelectActions,
} from "@/src/engine/domain/pickActions";
import { compositionGroups } from "@/src/data/composition";
import { cohortsLevel, countriesLevel, countryNodes, networksLevel, nodesByCountry, tickNetworksLevel } from "@/src/data/ladderLevels";
import type { ChannelSnapRow, GlobalSnapshot, MetaInfo, NodeRow, PickDescriptor } from "@/src/data/types";

// ---------------------------------------------------------------------------
// Fixtures — realistic shapes, cast where the full interface carries scene baggage.

const meta = (id: string, name: string, located: number, symbol?: string, nodes = 0) =>
  ({ id, name, symbol, located, nodes: Array.from({ length: nodes }, () => ({})) } as unknown as MetaInfo);

// Fleet sizes order the networks differently from `located` (ded, dor, tbc vs dor, ded, tbc), so a
// pager that kept the filter strip's order fails the Hypergraph one-list assertion.
const metaList = [meta("ded", "Dedicated Energy", 3, "DED", 5), meta("dor", "DOR Technologies", 22, "DOR", 2), meta("tbc", "TBC", 0, undefined, 1)];

const node = (opts: {
  ip: string;
  id?: string;
  cc?: string;
  country?: string;
  city?: string;
  isp?: string;
  roles?: string[];
}): NodeRow =>
  ({
    pick: {
      kind: "metanode",
      node: { ip: opts.ip, id: opts.id ?? `id-${opts.ip}`, roles: opts.roles ?? ["l0", "dl1"] },
      geo: { cc: opts.cc, city: opts.city, isp: opts.isp },
    },
    label: opts.ip,
    id: opts.id ?? `id-${opts.ip}`,
    cc: opts.cc ?? null,
    country: opts.country ?? null,
    city: opts.city ?? null,
    layer: "l0",
    roles: opts.roles ?? ["l0", "dl1"],
  } as unknown as NodeRow);

const deA = node({ ip: "1.1.1.1", id: "a1", cc: "de", country: "Germany", city: "Falkenstein", isp: "Hetzner" });
const deB = node({ ip: "1.1.1.2", id: "a2", cc: "de", country: "Germany", city: "Falkenstein", isp: "Hetzner" });
const deC = node({ ip: "1.1.1.3", id: "a3", cc: "de", country: "Germany", city: "Berlin", isp: "AWS" });
const fiA = node({ ip: "2.2.2.1", id: "b1", cc: "fi", country: "Finland", city: "Helsinki", isp: "Hetzner" });

const snapPick = { kind: "snapshot", data: { ordinal: 42, timestamp: "T" } } as unknown as Extract<
  PickDescriptor,
  { kind: "snapshot" }
>;

// The retained global window, oldest→newest like the LiveStrip's buffer. `live` marks the tip.
const tick = (ordinal: number, live = false) => ({
  data: { ordinal, timestamp: `T${ordinal}` } as unknown as GlobalSnapshot,
  isLiveTip: live,
  inStory: true,
});

const base = (over: Partial<SiblingState>): SiblingState => ({
  mode: "geo",
  filter: "all",
  tickNet: null,
  country: null,
  cohort: null,
  composition: null,
  inspect: null,
  snap: null,
  metaSnap: null,
  selNodes: [deA, deB, deC, fiA],
  metaList,
  countries: [
    { cc: "de", country: "Germany", count: 3 },
    { cc: "fi", country: "Finland", count: 1 },
  ],
  exactRows: null,
  following: false,
  ticks: [],
  geoMeasure: "nodes",
  hyperMeasure: "nodes",
  allNodes: [deA, deB, deC, fiA],
  tickNets: null,
  ...over,
});

// A ledger state whose tick networks are built by the SAME level function the hook calls, from the
// fixture's exact rows (no polled rows: the tests' ids are not in the app catalog, so `isListed`
// is the fixture's metaList, as `keyOf` already assumes).
const isListed = (id: string) => metaList.some((m) => m.id === id);
const ledger = (over: Partial<SiblingState>): SiblingState => {
  const s = base({ mode: "ledger", ...over });
  const t = s.snap ?? null;
  const tickNets = t ? tickNetworksLevel(t.data, [], (s.exactRows ?? null) as never, isListed) : null;
  return { ...s, isListed, tickNets };
};

// ---------------------------------------------------------------------------

describe("siblingSet — context (network) rung", () => {
  it("steps the explorer's network order (the picked figure), with the committed network at index", () => {
    const s = base({ mode: "hyper", filter: "ded" });
    const set = siblingSet("context", s)!;
    expect(set.items.map((i) => i.key)).toEqual(networksLevel(metaList, s.allNodes, "nodes").map((x) => x.m.id));
    expect(set.items[set.index]!.key).toBe("ded");
    expect(set.parentLabel).toBe("Networks");
  });
  it("a step to a DIFFERENT network is a plain filter select", () => {
    const set = siblingSet("context", base({ filter: "ded" }))!;
    const other = set.items.find((i) => i.key !== "ded")!;
    expect(other.actions).toEqual([{ kind: "filter", id: other.key }]);
  });
  it("the CURRENT item builds the deselect-toggle (documented: the pager never invokes it)", () => {
    const set = siblingSet("context", base({ filter: "ded" }))!;
    expect(set.items[set.index]!.actions).toEqual([{ kind: "filter", id: "all" }]);
  });
  it("no committed filter → no set", () => {
    expect(siblingSet("context", base({}))).toBeNull();
  });
});

describe("siblingSet — country rung", () => {
  it("steps the leaderboard order and agrees with countryToggleActions", () => {
    const s = base({ mode: "geo", country: "de" });
    const set = siblingSet("country", s)!;
    expect(set.items.map((i) => i.key)).toEqual(["de", "fi"]);
    expect(set.index).toBe(0);
    expect(set.items[1]!.actions).toEqual(
      countryToggleActions("fi", { country: "de", hasInspect: false, cohort: null }),
    );
    expect(set.parentLabel).toBe("All networks");
  });
  it("committed country missing from the leaderboard (stale state) → no set", () => {
    expect(siblingSet("country", base({ country: "xx" }))).toBeNull();
  });
});

describe("siblingSet — cohort (provider) rung", () => {
  const cohort = { cc: "de", city: "Falkenstein", isp: "Hetzner" };
  it("steps the committed country's cohorts, count-desc, other countries excluded", () => {
    const set = siblingSet("cohort", base({ mode: "geo", country: "de", cohort }))!;
    expect(set.items.map((i) => i.label)).toEqual(["Hetzner, Falkenstein", "AWS, Berlin"]);
    expect(set.index).toBe(0);
    expect(set.parentLabel).toBe("Germany");
  });
  it("agrees with cohortToggleActions for the step target", () => {
    const set = siblingSet("cohort", base({ mode: "geo", country: "de", cohort }))!;
    expect(set.items[1]!.actions).toEqual(
      cohortToggleActions({ cc: "de", city: "Berlin", isp: "AWS" }, { cohort, hasInspect: false }),
    );
  });
});

describe("siblingSet — composition rung (hyper)", () => {
  // deA/deB/deC/fiA are hybrids (l0·dl1); one dedicated data node splits the groups.
  const dataOnly = node({ ip: "3.3.3.3", id: "c1", roles: ["dl1"] });
  const rows = [deA, deB, deC, fiA, dataOnly];
  const groups = compositionGroups(rows);
  it("steps the explorer's size-desc group order", () => {
    const sel = { netId: "dor", key: groups[0]!.key };
    const set = siblingSet("composition", base({ mode: "hyper", filter: "dor", composition: sel, selNodes: rows }))!;
    expect(set.items.map((i) => i.key)).toEqual(groups.map((g) => g.key));
    expect(set.index).toBe(0);
    expect(set.items[1]!.actions).toEqual(
      compositionToggleActions(
        { netId: "dor", key: groups[1]!.key },
        { composition: sel, hasInspect: false, filter: "dor" },
      ),
    );
  });
});

describe("siblingSet — node rung", () => {
  it("scopes to the committed COHORT and steps its machines only", () => {
    const cohort = { cc: "de", city: "Falkenstein", isp: "Hetzner" };
    const s = base({ mode: "geo", country: "de", cohort, inspect: deA.pick });
    const set = siblingSet("node", s)!;
    expect(set.items.map((i) => i.key)).toEqual(["1.1.1.1", "1.1.1.2"]);
    expect(set.index).toBe(0);
    expect(set.parentLabel).toBe("Hetzner, Falkenstein");
    expect(set.items[1]!.actions).toEqual(
      nodeSelectActions(deB.pick, { mode: "geo", currentFilter: "all", deselect: false, compositionSel: undefined }),
    );
  });
  it("scopes to the committed COUNTRY when no cohort is committed", () => {
    const s = base({ mode: "geo", country: "de", inspect: deC.pick });
    const set = siblingSet("node", s)!;
    // GeoExplore's within-country order: city asc → Berlin before Falkenstein.
    expect(set.items.map((i) => i.key)).toEqual(["1.1.1.3", "1.1.1.1", "1.1.1.2"]);
    expect(set.index).toBe(0);
    expect(set.parentLabel).toBe("Germany");
  });
  it("network scope dedupes to machines (a hybrid's shells are one step)", () => {
    const dupe = { ...deA }; // second layer-row of the same machine (same ip)
    const s = base({ mode: "geo", selNodes: [deA, dupe, fiA], inspect: fiA.pick });
    const set = siblingSet("node", s)!;
    expect(set.items).toHaveLength(2);
    expect(set.parentLabel).toBe("All networks");
  });
  it("hyper steps within the committed composition group, carrying it as ancestry", () => {
    const dataOnly = node({ ip: "3.3.3.3", id: "c1", roles: ["dl1"] });
    const rows = [deA, deB, dataOnly];
    const groups = compositionGroups(rows);
    const sel = { netId: "dor", key: groups[0]!.key }; // the 2-machine hybrid group
    const s = base({ mode: "hyper", filter: "dor", composition: sel, selNodes: rows, inspect: deA.pick });
    const set = siblingSet("node", s)!;
    expect(set.items.map((i) => i.key)).toEqual(["1.1.1.1", "1.1.1.2"]);
    expect(set.parentLabel).toBe(groups[0]!.label);
    expect(set.items[1]!.actions).toEqual(
      nodeSelectActions(deB.pick, { mode: "hyper", currentFilter: "dor", deselect: false, compositionSel: sel }),
    );
  });
  it("hyper with NO composition committed walks every group in explorer order, each row carrying ITS group", () => {
    const dataOnly = node({ ip: "3.3.3.3", id: "c1", roles: ["dl1"] });
    const rows = [deA, deB, dataOnly];
    const groups = compositionGroups(rows);
    const s = base({ mode: "hyper", filter: "dor", selNodes: rows, inspect: dataOnly.pick });
    const set = siblingSet("node", s)!;
    expect(set.items.map((i) => i.key)).toEqual(["1.1.1.1", "1.1.1.2", "3.3.3.3"]);
    expect(set.index).toBe(2);
    expect(set.items[2]!.actions).toEqual(
      nodeSelectActions(dataOnly.pick, {
        mode: "hyper",
        currentFilter: "dor",
        deselect: false,
        compositionSel: { netId: "dor", key: groups[1]!.key },
      }),
    );
  });
  it("nothing inspected → no set", () => {
    expect(siblingSet("node", base({}))).toBeNull();
  });
});

describe("siblingSet — metagraph snapshot rung", () => {
  const row = (metaId: string, ordinal: number): ChannelSnapRow => ({
    metaId, ordinal, decoded: ordinal > 0, fee: 1, bytes: 10,
    signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null,
  });
  // One tick with two DED snapshots (a fast metagraph batches several into one global), one DOR,
  // and one undecodable unlisted channel.
  const rows: ChannelSnapRow[] = [row("ded", 100), row("dor", 900), row("DAG5unknownaddr", 0), row("ded", 101)];
  const cur = { metaId: "ded", ordinal: 100, hash: "h", globalOrdinal: 42, ts: "T" };
  const s = ledger({ filter: "ded", metaSnap: cur, snap: snapPick, exactRows: rows });

  // ⚠️ OLDEST → NEWEST, so `›` MEANS FORWARD IN TIME. This asserted ordinal DESC until
  // 2026-09-01, when the user named what that cost: "forward swipe goes to the parent, which is
  // earlier on the timeline of the chain — that's inverse logic". It also put the two snapshot
  // pagers in one rail on opposite headings, the global one already stepping oldest→newest so its
  // `›` walks the way the bars do. The rows are consecutive links of one chain (each snapshot's
  // `lastSnapshotHash` IS the previous one's hash, verified live), so the direction is the chain's
  // own, not a preference: `‹` follows the parent links back, `›` follows them forward.
  it("is scoped to the SUBJECT'S OWN metagraph, oldest first so a step goes FORWARD in time", () => {
    const set = siblingSet("metaSnap", s)!;
    expect(set.items.map((i) => i.label)).toEqual(["100", "101"]);
    expect(set.index).toBe(0);
    expect(set.parentLabel).toBe("DED in global 42");
  });
  it("excludes the tick's OTHER networks — a step must never move the coarser network rung", () => {
    const set = siblingSet("metaSnap", s)!;
    const stepped = set.items.flatMap((i) => i.actions);
    expect(stepped.some((a) => a.kind === "filter" && a.id !== "ded")).toBe(false);
    expect(stepped.every((a) => a.kind !== "metaSnap" || !a.sel || a.sel.metaId === "ded")).toBe(true);
  });
  it("a step agrees with metaSnapSelectActions", () => {
    const set = siblingSet("metaSnap", s)!;
    // The NEXT item — index 0 is now the subject itself (it is the oldest of the two), and
    // committing the subject is a deselect, which would test the wrong builder.
    expect(set.items[1]!.actions).toEqual(
      metaSnapSelectActions(
        { metaId: "ded", ordinal: 101, hash: "", globalOrdinal: 42, ts: "T" },
        snapPick,
        { metaSnap: cur, inspect: null },
      ),
    );
  });
  it("a metagraph with a single snapshot in the tick gets NO pager", () => {
    const only = { ...cur, metaId: "dor", ordinal: 900 };
    expect(siblingSet("metaSnap", ledger({ ...s, filter: "dor", metaSnap: only }))).toBeNull();
  });
  it("undecodable rows say so and get position-unique keys", () => {
    const two = [row("ded", 0), row("ded", 0)];
    const undec = { ...cur, ordinal: 0 };
    const set = siblingSet("metaSnap", ledger({ ...s, metaSnap: undec, exactRows: two }))!;
    expect(set.items.map((i) => i.label)).toEqual(["undecoded", "undecoded"]);
    const keys = set.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("needs the pinned global of the SAME tick — mismatch or no exact read → no set", () => {
    expect(siblingSet("metaSnap", ledger({ ...s, snap: null }))).toBeNull();
    expect(siblingSet("metaSnap", ledger({ ...s, exactRows: null }))).toBeNull();
    const otherTick = { kind: "snapshot", data: { ordinal: 41 } } as unknown as SiblingState["snap"];
    expect(siblingSet("metaSnap", ledger({ ...s, snap: otherTick }))).toBeNull();
  });
});

describe("siblingSet — global snapshot slot (the OPEN set)", () => {
  // A window of four retained ticks with #44 live; the card is pinned to #42 (snapPick).
  const ticks = [tick(41), tick(42), tick(43), tick(44, true)];
  const s = ledger({ filter: "all", snap: snapPick, ticks });

  it("steps the retained window in the LiveStrip's own order (oldest→newest), index at the pin", () => {
    const set = siblingSet("snap", s)!;
    expect(set.items.map((i) => i.key)).toEqual(["41", "42", "43", "44"]);
    expect(set.index).toBe(1);
    expect(set.items.map((i) => i.label)).toEqual(["41", "42", "43", "44"]);
  });
  it("is OPEN — the chain is ongoing, so the plank shows no n / N", () => {
    expect(siblingSet("snap", s)!.open).toBe(true);
    expect(siblingSet("snap", s)!.parentLabel).toBe("Snapshot stream");
    // Every other rung stays a counted set under a real parent.
    expect(siblingSet("context", base({ filter: "ded" }))!.open).toBeUndefined();
  });
  it("a step agrees with snapshotSelectActions — the same descriptor the LiveStrip bar builds", () => {
    const set = siblingSet("snap", s)!;
    expect(set.items[0]!.actions).toEqual(
      snapshotSelectActions(
        { kind: "snapshot", title: "Global snapshot #41", data: ticks[0]!.data },
        false,
        { pinnedOrdinal: 42, metaSnap: null },
      ),
    );
  });
  it("stepping onto the LIVE tip resumes following; older ticks pin", () => {
    const set = siblingSet("snap", s)!;
    expect(set.items[3]!.actions).toEqual([{ kind: "snapshot", pick: expect.anything(), follow: true }]);
    expect(set.items[0]!.actions).toEqual([{ kind: "snapshot", pick: expect.anything(), follow: false }]);
  });
  it("while FOLLOWING there is no pin, so even the current item is a plain select", () => {
    const set = siblingSet("snap", base({ ...s, snap: snapPick, following: true }))!;
    // pinnedOrdinal: null → the tip-of-window rule alone decides `follow`, and re-selecting the
    // shown tick is not the deselect-toggle it would be under a pin.
    expect(set.items[set.index]!.actions).toEqual([{ kind: "snapshot", pick: expect.anything(), follow: false }]);
  });
  it("stepping to a tick the committed network sat out leaves the filter alone", () => {
    const away = [{ ...tick(41), inStory: false }, tick(42)];
    const set = siblingSet("snap", base({ ...s, filter: "ded", snap: snapPick, ticks: away }))!;
    expect(set.items[0]!.actions.some((a) => a.kind === "filter")).toBe(false);
  });
  it("no shown tick, a window too short to step, or a pin aged OUT of it → no set", () => {
    expect(siblingSet("snap", base({ ticks }))).toBeNull();
    expect(siblingSet("snap", base({ snap: snapPick, ticks: [tick(42, true)] }))).toBeNull();
    expect(siblingSet("snap", base({ snap: snapPick, ticks: [tick(60), tick(61, true)] }))).toBeNull();
  });
});

describe("siblingSet — non-pager slots", () => {
  it("the tool card never pages", () => {
    expect(siblingSet("tool", base({}))).toBeNull();
  });
  it("a single-member set is no set (nothing to step to)", () => {
    const s = base({ mode: "geo", country: "de", cohort: { cc: "de", city: "Berlin", isp: "AWS" }, inspect: deC.pick });
    expect(siblingSet("node", s)).toBeNull(); // Berlin·AWS holds one machine
  });
});

// ---------------------------------------------------------------------------

// The plank's DOWN step where nothing finer is committed (user, 2026-09-11): the FIRST child
// of the boxed rung, in the explorer's own order, through the same pickActions builders a
// click uses. Leaves and rungs with no child vocabulary answer null — the control hides.
describe("childStep — the first-child DOWN step", () => {
  it("geo network opens the first country (the explorer's count-desc order)", () => {
    const step = childStep("context", base({ filter: "ded" }))!;
    expect(step.label).toBe("Germany");
    expect(step.actions).toEqual(countryToggleActions("de", { country: null, hasInspect: false, cohort: null }));
  });
  it("hyper network opens the first composition group (size-desc)", () => {
    const s = base({ mode: "hyper", filter: "ded" });
    const g = compositionGroups(s.selNodes)[0]!;
    const step = childStep("context", s)!;
    expect(step.key).toBe(g.key);
    expect(step.actions).toEqual(
      compositionToggleActions({ netId: "ded", key: g.key }, { composition: null, hasInspect: false, filter: "ded" }),
    );
  });
  it("the ledger network and 'all' have no first child to open", () => {
    expect(childStep("context", ledger({ filter: "ded" }))).toBeNull();
    expect(childStep("context", base({}))).toBeNull();
  });
  it("a country opens its first cohort (count-desc then city)", () => {
    const step = childStep("country", base({ country: "de" }))!;
    expect(step.label).toBe("Hetzner, Falkenstein"); // 2 machines beat Berlin's 1
    expect(step.actions).toEqual(
      cohortToggleActions({ cc: "de", city: "Falkenstein", isp: "Hetzner" }, { cohort: null, hasInspect: false }),
    );
  });
  it("a cohort opens its first machine (the node pager's own order)", () => {
    const s = base({ country: "de", cohort: { cc: "de", city: "Falkenstein", isp: "Hetzner" } });
    const step = childStep("cohort", s)!;
    expect(step.label).toBe(deA.label);
    expect(step.actions).toEqual(nodeSelectActions(deA.pick, { mode: "geo", currentFilter: "all", deselect: false }));
  });
  // ⚠️ THE TICK'S CHILD IS A NETWORK (user, 2026-09-15 — the lane runs tick → metagraph →
  // metagraph snapshot → node). Under the old lane ∨ skipped the dossier and landed two levels
  // down, dragging the filter along as a SIDE EFFECT of opening a snapshot, which is what made
  // "go finer" read as "and also filter". The step is one level, and the tick card already
  // offers exactly this list.
  // ⚠️ AND IT IS NOT THE FILTER (user, 2026-10-02, reversing 2026-09-15's "the filter IS the step"):
  // "it correctly filters out the related metagraphs but it should not actually set the metagraph
  // as the global application filter". The step commits the network INSIDE the tick — the pin
  // holds, the chamber dims the same, the top bar is never written.
  it("the global tick opens the network that anchored most into it — inside the tick, never the filter", () => {
    const rows = [
      { metaId: "dor", ordinal: 900, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
      { metaId: "dor", ordinal: 901, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
      { metaId: "ded", ordinal: 500, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
    ] as unknown as SiblingState["exactRows"];
    const s = ledger({ snap: snapPick, exactRows: rows });
    const step = childStep("snap", s)!;
    expect(step.key).toBe("dor");
    expect(step.actions).toEqual(tickNetSelectActions("dor", snapPick, { metaSnap: null }));
    expect(step.actions.some((a) => a.kind === "filter")).toBe(false);
    // The tick stays PINNED through the step (it used to re-enter live: a filter commit does).
    expect(step.actions).toContainEqual({ kind: "snapshot", pick: snapPick, follow: false });
  });

  it("a network already committed inside the tick is what the Metagraph card steps — again never the filter", () => {
    const rows = [
      { metaId: "dor", ordinal: 900, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
      { metaId: "ded", ordinal: 500, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
    ] as unknown as SiblingState["exactRows"];
    const ord = snapPick.data.ordinal;
    const s = ledger({ snap: snapPick, exactRows: rows, tickNet: { metaId: "dor", globalOrdinal: ord } });
    // The tick has its child, so ∨ from the tick has nothing new to open…
    expect(childStep("snap", s)).toBeNull();
    // …and the card's own ‹ › move the tick-local commit.
    const set = siblingSet("context", s)!;
    expect(set.items.every((i) => i.actions.every((a) => a.kind !== "filter"))).toBe(true);
    // ∨ from the Metagraph card opens THAT network's own snapshot in this tick.
    expect(childStep("context", s)!.key).toBe("dor:900");
  });

  // ⚠️ THE BUSIEST LISTED ONE, not "the busiest, and give up if it is unlisted" (review find,
  // 2026-09-15). An unlisted channel names no filter, so it cannot be the step — but a tick LED by
  // one still has committable networks under it, and dimming ∨ there would hide them behind an
  // anchor the reader cannot act on anyway.
  it("an unlisted leader is listed last, as the explorer lists it — the tick opens the top listed network", () => {
    const rows = [
      { metaId: "DAG-not-in-catalog", ordinal: 1, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
      { metaId: "DAG-not-in-catalog", ordinal: 2, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
      { metaId: "DAG-not-in-catalog", ordinal: 3, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
      { metaId: "ded", ordinal: 500, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
    ] as unknown as SiblingState["exactRows"];
    const step = childStep("snap", ledger({ snap: snapPick, exactRows: rows }))!;
    expect(step.key).toBe("ded");
    expect(step.actions).toEqual(tickNetSelectActions("ded", snapPick, { metaSnap: null }));
  });

  it("a tick holding only an unlisted channel still has a rung to open, and a snapshot under it", () => {
    const rows = [
      { metaId: "DAG-not-in-catalog", ordinal: 7, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
    ] as unknown as SiblingState["exactRows"];
    const tick = ledger({ snap: snapPick, exactRows: rows });
    expect(childStep("snap", tick)!.key).toBe("unlisted");
    // …and from the unlisted card, ∨ opens that channel's snapshot — the rung that used to be skipped.
    const under = { ...tick, tickNet: { metaId: "unlisted", globalOrdinal: snapPick.data.ordinal } };
    expect(childStep("context", under)!.key).toBe("DAG-not-in-catalog:7");
  });

  // …and the dossier's own child is that network's snapshot in the shown tick — the rung now
  // directly beneath it.
  it("the dossier opens the committed network's snapshot in the shown tick", () => {
    const rows = [
      { metaId: "ded", ordinal: 500, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
    ] as unknown as SiblingState["exactRows"];
    const s = ledger({ filter: "ded", snap: snapPick, exactRows: rows });
    const step = childStep("context", s)!;
    expect(step.label).toContain("500");
    expect(step.actions).toEqual(
      metaSnapSelectActions(
        { metaId: "ded", ordinal: 500, hash: "", globalOrdinal: 42, ts: "T" },
        snapPick,
        { metaSnap: null, inspect: null },
      ),
    );
  });

  it("a network that did not anchor into this tick has nothing to open", () => {
    const rows = [
      { metaId: "dor", ordinal: 900, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
    ] as unknown as SiblingState["exactRows"];
    expect(childStep("context", ledger({ filter: "ded", snap: snapPick, exactRows: rows }))).toBeNull();
  });

  // The scope rule, restated for the new lane: a ∨ may commit the rung directly below it, and
  // the network IS that rung under the tick — so the tick may name a filter. Every step BELOW
  // the dossier must not, because from there the network is an ancestor.
  it("no ∨ below the dossier moves the filter", () => {
    const rows = [
      { metaId: "ded", ordinal: 500, decoded: true, fee: 1, bytes: 10, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null },
    ] as unknown as SiblingState["exactRows"];
    for (const slot of ["context", "metaSnap", "node"] as const) {
      const step = childStep(slot, ledger({ filter: "ded", snap: snapPick, exactRows: rows, inspect: deA.pick }));
      if (!step) continue;
      for (const a of step.actions) {
        if (a.kind !== "filter") continue;
        expect(a.id).toBe("ded"); // a restatement of what is already committed, never a change
      }
    }
  });

  it("an unread tick and the leaf rungs answer null", () => {
    expect(childStep("snap", ledger({ snap: snapPick, exactRows: [] }))).toBeNull();
    expect(childStep("node", base({ inspect: deA.pick }))).toBeNull();
    expect(childStep("metaSnap", base({}))).toBeNull();
  });
  // A filter is a LENS (the explorer's previewOnly rule): the tick's ∨ opens the committed
  // story's own first row, never a cross-network row whose builder would filter-first and
  // silently re-commit the network — and with no row for the story in this tick, nothing.
  // The 2026-09-11 review find — ∨ from the tick must never release the committed story by
  // re-filtering to whichever network leads the exact read — is now answered by the LANE rather
  // than by a guard: with a filter committed the tick's child is the dossier, which IS that
  // network, so it is already populated and the pager re-boxes it without reaching childStep.
  // The concern itself moved one rung down, to `context`, and is asserted there: the dossier
  // opens its OWN network's row, and answers null when that network did not anchor here.
  it("under a committed filter the tick has no child step — the dossier below it is the lens", () => {
    const rows = [
      { metaId: "dor", ordinal: 900 },
      { metaId: "ded", ordinal: 55 },
    ] as unknown as SiblingState["exactRows"];
    expect(childStep("snap", ledger({ filter: "ded", snap: snapPick, exactRows: rows }))).toBeNull();
    expect(childStep("snap", ledger({ filter: "paca", snap: snapPick, exactRows: rows }))).toBeNull();
  });
});

// ⚠️ A GLOBAL SNAPSHOT'S CHILDREN ARE THE NETWORKS IT HOLDS (user, 2026-09-29: "I should only be
// able to swipe the metagraphs that are part of that global snapshot … there must be a
// parent-child relation that determines what can be swiped"). In the ledger the metagraph card
// hangs under the tick, so its pager steps the tick's own networks — the same set the tick's ∨
// opens the first of — and a pinned tick stays pinned across the swipe.
describe("siblingSet — context rung under a ledger tick", () => {
  const rows = [
    { metaId: "dor", ordinal: 1 },
    { metaId: "unlisted-x", ordinal: 1 },
    { metaId: "ded", ordinal: 9 },
    { metaId: "dor", ordinal: 2 },
    { metaId: "unlisted-x", ordinal: 2 },
    { metaId: "unlisted-x", ordinal: 3 },
  ] as unknown as SiblingState["exactRows"];
  const s = ledger({ filter: "ded", snap: snapPick, exactRows: rows });

  it("steps the tick's own networks, busiest first, the unlisted set LAST — never the whole catalog", () => {
    const set = siblingSet("context", s)!;
    expect(set.items.map((i) => i.key)).toEqual(["dor", "ded", "unlisted"]); // tbc never anchored here
    expect(set.index).toBe(1);
  });
  it("a swipe commits the neighbour INSIDE the tick and pins it — never the filter", () => {
    const set = siblingSet("context", s)!;
    expect(set.items.find((i) => i.key === "dor")!.actions).toEqual(tickNetSelectActions("dor", snapPick, { metaSnap: null, hasInspect: false, net: "ded" }));
    expect(set.items.every((i) => i.actions.every((a) => a.kind !== "filter"))).toBe(true);
  });
  it("…and from LIVE a swipe pins the tick it steps inside (a network in a tick needs its tick)", () => {
    const set = siblingSet("context", { ...s, following: true })!;
    expect(set.items.find((i) => i.key === "dor")!.actions).toContainEqual({ kind: "snapshot", pick: snapPick, follow: false });
  });
  it("the tick's ∨ opens the FIRST of the same set", () => {
    const step = childStep("snap", { ...s, filter: "all" })!;
    expect(step.key).toBe(siblingSet("context", s)!.items[0]!.key);
  });
  it("no tick read yet → no pager rather than the catalog", () => {
    expect(siblingSet("context", ledger({ ...s, exactRows: null }))).toBeNull();
    expect(siblingSet("context", ledger({ ...s, snap: null }))).toBeNull();
  });
});

// ∨ FROM A METAGRAPH SNAPSHOT OPENS ITS VALIDATORS (user, 2026-09-29), and the node card under it
// pages ONLY the nodes that signed it — the explorer's signer level, row for row.
describe("the ledger's node rung under a metagraph snapshot", () => {
  const signer = (id: string) =>
    ({ ...deA, id, label: id, pick: { kind: "metanode", meta: { id: "ded" }, node: { id, ip: id, roles: ["l0"] }, geo: {} } } as unknown as NodeRow);
  const s1 = signer("aa11ffff"), s2 = signer("bb22ffff"), other = signer("cc33ffff");
  const rows = [{ metaId: "ded", ordinal: 500, signers: ["bb22", "aa11", "zz99"] }] as unknown as SiblingState["exactRows"];
  const ms = { metaId: "ded", ordinal: 500, hash: "", globalOrdinal: 42, ts: "T" };
  const s = ledger({ filter: "ded", snap: snapPick, metaSnap: ms, exactRows: rows, selNodes: [s1, s2, other] });

  it("∨ commits the FIRST signer the explorer lists", () => {
    const step = childStep("metaSnap", s)!;
    expect(step).not.toBeNull();
    expect(step.actions).toEqual(nodeSelectActions(s2.pick, { mode: "ledger", currentFilter: "ded" }));
  });
  it("the node pager steps the signers only, in signature order", () => {
    const set = siblingSet("node", { ...s, inspect: s1.pick })!;
    expect(set.items.length).toBe(2);
    expect(set.index).toBe(1);
  });
  it("a node that did NOT sign pages its network, not the signers (the snapshot is not its parent)", () => {
    const set = siblingSet("node", { ...s, inspect: other.pick })!;
    expect(set).not.toBeNull();
    expect(set.items.length).toBe(3);
  });
  it("no signer known → no ∨", () => {
    expect(childStep("metaSnap", { ...s, selNodes: [other] })).toBeNull();
  });
});

describe("positionMarks", () => {
  // Every card's pager DRAWS its position (user, 2026-10-04: "make it consistent with all the
  // other cards" — Geography's 28-node set was the one card still writing "1 of 28"). A set
  // longer than the run slides a fixed-width window that keeps the current mark in view, and an
  // end mark with more beyond it is drawn small.
  it("a set that fits draws every mark, none small", () => {
    expect(positionMarks(2, 5, 15)).toEqual({ start: 0, end: 5, fadeStart: false, fadeEnd: false });
  });
  it("a long set's window starts at the front while the current mark is near it", () => {
    expect(positionMarks(0, 28, 15)).toEqual({ start: 0, end: 15, fadeStart: false, fadeEnd: true });
  });
  it("mid-set the window centres the current mark and both ends fade", () => {
    expect(positionMarks(14, 28, 15)).toEqual({ start: 7, end: 22, fadeStart: true, fadeEnd: true });
  });
  it("at the back the window clamps to the end", () => {
    expect(positionMarks(27, 28, 15)).toEqual({ start: 13, end: 28, fadeStart: true, fadeEnd: false });
  });
  it("the window is always the run's width, so the strip never re-composes", () => {
    for (let i = 0; i < 213; i++) {
      const w = positionMarks(i, 213, 15);
      expect(w.end - w.start).toBe(15);
      expect(i >= w.start && i < w.end).toBe(true);
    }
  });
});

// ONE LIST PER LEVEL (2026-10-07): the next ghost opens the FIRST row the explorer lists, and the
// pager steps the explorer's list in the explorer's order. A future copy cannot drift silently.
describe("one list per level — the rail steps the explorer's own lists", () => {
  // The leaderboard's count order (Finland first) and the PROVIDERS order (Germany's two beat
  // Finland's one) disagree, so a rail that kept count order fails here.
  const countries = [
    { cc: "fi", country: "Finland", count: 5 },
    { cc: "de", country: "Germany", count: 3 },
  ];
  it("geo: the network's ghost opens the explorer's top country, under a non-default figure too", () => {
    for (const geoMeasure of ["nodes", "metagraphs", "providers"] as const) {
      const s = base({ mode: "geo", filter: "ded", geoMeasure, countries });
      const top = countriesLevel(s.countries, nodesByCountry(s.selNodes), geoMeasure)[0]!.c.cc;
      expect(childStep("context", s)!.key).toBe(top);
    }
  });
  it("geo: the country pager steps the explorer's countries in order", () => {
    const s = base({ mode: "geo", country: "de", geoMeasure: "providers", countries });
    expect(siblingSet("country", s)!.items.map((i) => i.key)).toEqual(
      countriesLevel(s.countries, nodesByCountry(s.selNodes), "providers").map((x) => x.c.cc),
    );
  });
  it("geo: the country's ghost opens its top provider", () => {
    const s = base({ mode: "geo", country: "de" });
    const g = cohortsLevel(countryNodes("de", s.countries, nodesByCountry(s.selNodes)))[0]!;
    expect(childStep("country", s)!.key).toBe(`de|${g.city}|${g.isp}`);
  });
  it("ledger: the tick's ghost and the Metagraph card's pager step the explorer's networks", () => {
    const rows = [
      { metaId: "dor", ordinal: 1 },
      { metaId: "unlisted-x", ordinal: 1 },
      { metaId: "ded", ordinal: 9 },
      { metaId: "dor", ordinal: 2 },
    ] as unknown as SiblingState["exactRows"];
    const s = ledger({ snap: snapPick, exactRows: rows });
    const ids = s.tickNets!.map((n) => n.id);
    expect(childStep("snap", s)!.key).toBe(ids[0]);
    const under = ledger({ snap: snapPick, exactRows: rows, tickNet: { metaId: "ded", globalOrdinal: snapPick.data.ordinal } });
    expect(siblingSet("context", under)!.items.map((i) => i.key)).toEqual(ids);
  });
  it("ledger: the Metagraph card's ghost opens the explorer's newest snapshot; its pager steps the same list oldest first", () => {
    const rows = [
      { metaId: "ded", ordinal: 100 },
      { metaId: "ded", ordinal: 102 },
      { metaId: "ded", ordinal: 101 },
    ] as unknown as SiblingState["exactRows"];
    const s = ledger({ filter: "ded", snap: snapPick, exactRows: rows });
    expect(childStep("context", s)!.key).toBe("ded:102");
    const cur = { metaId: "ded", ordinal: 101, hash: "", globalOrdinal: 42, ts: "T" };
    const set = siblingSet("metaSnap", ledger({ filter: "ded", snap: snapPick, exactRows: rows, metaSnap: cur }))!;
    expect(set.items.map((i) => i.label)).toEqual(["100", "101", "102"]);
  });
  it("every parent with a child step is covered above or by the per-rung tests", () => {
    // A tripwire: a new CHILD_OF entry must earn a one-list assertion here.
    const pairs = Object.entries(CHILD_OF).flatMap(([mode, m]) => Object.keys(m ?? {}).map((k) => `${mode}:${k}`));
    expect(pairs.sort()).toEqual(
      ["geo:context", "geo:country", "geo:cohort", "hyper:context", "hyper:composition", "ledger:snap", "ledger:context", "ledger:metaSnap"].sort(),
    );
  });
});
