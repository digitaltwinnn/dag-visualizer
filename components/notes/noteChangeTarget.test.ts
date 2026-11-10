import { metaSnapHoverKey } from "@/src/data/types";
import { describe, expect, it } from "vitest";

import type { NoteChange, NoteChangeSubject } from "@/src/data/noteTypes";
import type { GlobalSnapshot, NodeRow } from "@/src/data/types";
import { changeActions, changeHover, staysOnCard, type ChangeState } from "./noteChangeTarget";

const change = (subject: NoteChangeSubject): NoteChange => ({ kind: "lost", size: 1, text: "", subject });
const STATE: ChangeState = { filter: "all", railNet: null, country: null, cohort: null, composition: null, hasInspect: false, metaSnap: null };
const row = (ip: string, isp: string, cc = "DE", city = "Falkenstein") =>
  ({ cc, city, id: ip, label: ip, pick: { kind: "metanode", node: { ip }, geo: { isp } } }) as unknown as NodeRow;
const TICK = { ordinal: 7, timestamp: "t" } as GlobalSnapshot;

describe("changeActions: a row commits what the view's explorer row commits", () => {
  it("a network in Hypergraph stands the view on it, and writes no filter", () => {
    expect(changeActions(change({ kind: "network", id: "dor" }), "hyper", STATE, [], null)).toEqual([{ kind: "railNet", id: "dor" }]);
  });
  it("the network the view already stands on has nowhere to go", () => {
    expect(changeActions(change({ kind: "network", id: "dor" }), "hyper", { ...STATE, railNet: "dor" }, [], null)).toBeNull();
    expect(changeActions(change({ kind: "network", id: "dor" }), "hyper", { ...STATE, filter: "dor" }, [], null)).toBeNull();
  });
  it("a layer group opens its card under its network", () => {
    const acts = changeActions(change({ kind: "type", netId: "dag", type: "l0+cl1" }), "hyper", { ...STATE, filter: "dag" }, [], null);
    expect(acts).toEqual([{ kind: "composition", sel: { netId: "dag", key: "Hybrid|L0·cL1" } }]);
  });
  it("a country opens its card, the filter untouched", () => {
    expect(changeActions(change({ kind: "country", cc: "DE" }), "geo", STATE, [], null)).toEqual([{ kind: "country", cc: "DE" }]);
  });
  it("a provider opens the group of its nodes the note can reach", () => {
    const acts = changeActions(change({ kind: "provider", keys: ["hetzner"], cc: null, city: null }), "geo", STATE, [row("1", "Hetzner")], null);
    expect(acts).toEqual([
      { kind: "country", cc: "DE" },
      { kind: "cohort", sel: { cc: "DE", city: "Falkenstein", isp: "Hetzner" } },
    ]);
  });
  it("a provider with no nodes left has nothing to open", () => {
    expect(changeActions(change({ kind: "provider", keys: ["gone"], cc: null, city: null }), "geo", STATE, [row("1", "Hetzner")], null)).toBeNull();
  });
  it("a network in Snapshots commits inside its tick and never writes the filter", () => {
    const acts = changeActions(change({ kind: "network", id: "dor" }), "ledger", STATE, [], TICK)!;
    expect(acts.some((a) => a.kind === "filter")).toBe(false);
    expect(acts.at(-1)).toEqual({ kind: "tickNet", sel: { metaId: "dor", globalOrdinal: 7 } });
  });
  it("the chamber's own row has no network to open in Snapshots", () => {
    expect(changeActions(change({ kind: "network", id: "dag" }), "ledger", STATE, [], TICK)).toBeNull();
  });
  const GLOBAL = { ordinal: 7218758, timestamp: "2026-11-02T09:00:00.000Z", hash: "g" };
  const SEL = { metaId: "dor", ordinal: 55, hash: "h", globalOrdinal: 7218758, ts: GLOBAL.timestamp };
  it("a snapshot row opens that snapshot, under its tick and its network, and writes no filter", () => {
    const acts = changeActions(change({ kind: "metaSnap", sel: SEL, global: GLOBAL }), "ledger", STATE, [], null)!;
    expect(acts.some((a) => a.kind === "filter")).toBe(false);
    expect(acts.find((a) => a.kind === "snapshot")).toMatchObject({ pick: { kind: "snapshot", data: { ordinal: 7218758 } }, follow: false });
    expect(acts.at(-1)?.kind === "metaSnap" || acts.some((a) => a.kind === "metaSnap")).toBe(true);
  });
  it("a global snapshot row opens that tick", () => {
    const acts = changeActions(change({ kind: "global", global: GLOBAL }), "ledger", STATE, [], null)!;
    expect(acts).toContainEqual(expect.objectContaining({ kind: "snapshot", follow: false }));
  });
  it("those rows hover the channel their explorer rows do (rule 9)", () => {
    expect(changeHover(change({ kind: "metaSnap", sel: SEL, global: GLOBAL }), [])).toEqual({ channel: "metaSnap", key: metaSnapHoverKey("dor", 55) });
    expect(changeHover(change({ kind: "global", global: GLOBAL }), [])).toEqual({ channel: "snap", key: "7218758" });
  });
  it("a card's own row has nowhere to go", () => {
    expect(changeActions(change({ kind: "self" }), "geo", STATE, [], null)).toBeNull();
    expect(changeHover(change({ kind: "self" }), [])).toBeNull();
  });
  it("a row on a card never closes the card it sits on", () => {
    expect(staysOnCard([{ kind: "cohort", sel: null }])).toBe(false);
    expect(staysOnCard([{ kind: "country", cc: null }])).toBe(false);
    expect(staysOnCard([{ kind: "country", cc: "DE" }, { kind: "cohort", sel: { cc: "DE", city: "Falkenstein", isp: "Hetzner" } }])).toBe(true);
  });
  it("a network with no tick in reach has nothing to open", () => {
    expect(changeActions(change({ kind: "network", id: "dor" }), "ledger", STATE, [], null)).toBeNull();
  });
});

describe("changeActions under a filter", () => {
  // user, 2026-11-02: only the top bar leaves the network a filter stands on.
  it("opens no other network", () => {
    expect(changeActions(change({ kind: "network", id: "dor" }), "hyper", { ...STATE, filter: "swap" }, [], null)).toBeNull();
  });
});

describe("changeHover: a row hovers the subject it would commit (rule 9)", () => {
  it("a network rides the filter channel", () => {
    expect(changeHover(change({ kind: "network", id: "dor" }), [])).toEqual({ channel: "filter", key: "dor" });
  });
  it("a country rides its own", () => {
    expect(changeHover(change({ kind: "country", cc: "DE" }), [])).toEqual({ channel: "country", key: "DE" });
  });
  it("a provider lights its nodes, keyed as its explorer row", () => {
    expect(changeHover(change({ kind: "provider", keys: ["hetzner"], cc: null, city: null }), [row("1", "Hetzner")])).toEqual({
      channel: "group", key: "DE|Falkenstein|Hetzner", nodes: ["1"], cc: "DE",
    });
  });
  it("a layer group lights its nodes, keyed as its explorer row", () => {
    const r = { ...row("1", "x"), pick: { kind: "metanode", node: { ip: "1", roles: ["l0"] } } } as unknown as NodeRow;
    expect(changeHover(change({ kind: "type", netId: "dor", type: "l0" }), [r])).toEqual({ channel: "group", key: "dor|Consensus|L0", nodes: ["1"] });
  });
  it("a subject with no live nodes hovers nothing", () => {
    expect(changeHover(change({ kind: "provider", keys: ["gone"], cc: null, city: null }), [])).toBeNull();
  });
});
