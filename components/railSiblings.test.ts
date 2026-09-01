import { describe, it, expect } from "vitest";
import { siblingSet, type SiblingState } from "@/components/railSiblings";
import {
  cohortToggleActions,
  compositionToggleActions,
  countryToggleActions,
  metaSnapSelectActions,
  nodeSelectActions,
  snapshotSelectActions,
} from "@/src/engine/domain/pickActions";
import { compositionGroups } from "@/src/data/composition";
import type { ChannelSnapRow, GlobalSnapshot, MetaInfo, NodeRow, PickDescriptor } from "@/src/data/types";

// ---------------------------------------------------------------------------
// Fixtures — realistic shapes, cast where the full interface carries scene baggage.

const meta = (id: string, name: string, located: number, symbol?: string) =>
  ({ id, name, symbol, located } as unknown as MetaInfo);

const metaList = [meta("ded", "Dedicated Energy", 3, "DED"), meta("dor", "DOR Technologies", 22, "DOR"), meta("tbc", "TBC", 0)];

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
  ...over,
});

// ---------------------------------------------------------------------------

describe("siblingSet — context (network) rung", () => {
  it("steps the picker's located-desc order, with the committed network at index", () => {
    const set = siblingSet("context", base({ filter: "ded" }))!;
    expect(set.items.map((i) => i.key)).toEqual(["dor", "ded", "tbc"]);
    expect(set.index).toBe(1);
    expect(set.parentLabel).toBe("Networks");
  });
  it("a step to a DIFFERENT network is a plain filter select", () => {
    const set = siblingSet("context", base({ filter: "ded" }))!;
    expect(set.items[0]!.actions).toEqual([{ kind: "filter", id: "dor" }]);
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
    expect(set.items.map((i) => i.label)).toEqual(["Falkenstein · Hetzner", "Berlin · AWS"]);
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
    expect(set.parentLabel).toBe("Falkenstein · Hetzner");
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
  const s = base({ mode: "ledger", filter: "ded", metaSnap: cur, snap: snapPick, exactRows: rows });

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
    expect(set.parentLabel).toBe("DED · Global 42");
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
        { filter: "ded", metaSnap: cur },
      ),
    );
  });
  it("a metagraph with a single snapshot in the tick gets NO pager", () => {
    const only = { ...cur, metaId: "dor", ordinal: 900 };
    expect(siblingSet("metaSnap", base({ ...s, filter: "dor", metaSnap: only }))).toBeNull();
  });
  it("undecodable rows say so and get position-unique keys", () => {
    const two = [row("ded", 0), row("ded", 0)];
    const undec = { ...cur, ordinal: 0 };
    const set = siblingSet("metaSnap", base({ ...s, metaSnap: undec, exactRows: two }))!;
    expect(set.items.map((i) => i.label)).toEqual(["undecoded", "undecoded"]);
    const keys = set.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("needs the pinned global of the SAME tick — mismatch or no exact read → no set", () => {
    expect(siblingSet("metaSnap", { ...s, snap: null })).toBeNull();
    expect(siblingSet("metaSnap", { ...s, exactRows: null })).toBeNull();
    const otherTick = { kind: "snapshot", data: { ordinal: 41 } } as unknown as SiblingState["snap"];
    expect(siblingSet("metaSnap", { ...s, snap: otherTick })).toBeNull();
  });
});

describe("siblingSet — global snapshot slot (the OPEN set)", () => {
  // A window of four retained ticks with #44 live; the card is pinned to #42 (snapPick).
  const ticks = [tick(41), tick(42), tick(43), tick(44, true)];
  const s = base({ mode: "ledger", filter: "all", snap: snapPick, ticks });

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
        { pinnedOrdinal: 42, metaSnap: null, filter: "all", tickHasFilter: true },
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
  it("a tick the committed network never anchored into releases the filter (the story rule)", () => {
    // #41 carries no anchor from the committed network; #42 (the shown tick) does.
    const away = [{ ...tick(41), inStory: false }, tick(42)];
    const set = siblingSet("snap", base({ ...s, filter: "ded", snap: snapPick, ticks: away }))!;
    expect(set.items[0]!.actions[0]).toEqual({ kind: "filter", id: "all" });
    const kept = siblingSet("snap", base({ ...s, filter: "ded", snap: snapPick, ticks: [tick(41), tick(42)] }))!;
    expect(kept.items[0]!.actions[0]).not.toEqual({ kind: "filter", id: "all" });
  });
  it("no shown tick, a window too short to step, or a pin aged OUT of it → no set", () => {
    expect(siblingSet("snap", base({ ticks }))).toBeNull();
    expect(siblingSet("snap", base({ snap: snapPick, ticks: [tick(42, true)] }))).toBeNull();
    expect(siblingSet("snap", base({ snap: snapPick, ticks: [tick(60), tick(61, true)] }))).toBeNull();
  });
});

describe("siblingSet — non-pager slots", () => {
  it("about/tool never page", () => {
    expect(siblingSet("about", base({}))).toBeNull();
    expect(siblingSet("tool", base({}))).toBeNull();
  });
  it("a single-member set is no set (nothing to step to)", () => {
    const s = base({ mode: "geo", country: "de", cohort: { cc: "de", city: "Berlin", isp: "AWS" }, inspect: deC.pick });
    expect(siblingSet("node", s)).toBeNull(); // Berlin·AWS holds one machine
  });
});
