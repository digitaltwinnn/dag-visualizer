import { describe, expect, it } from "vitest";

import type { NoteChange, NoteChangeSubject } from "@/src/data/noteTypes";
import type { GlobalSnapshot, NodeRow } from "@/src/data/types";
import { changeActions, changeHover, type ChangeState } from "./noteChangeTarget";

const change = (subject: NoteChangeSubject): NoteChange => ({ kind: "lost", size: 1, text: "", subject });
const STATE: ChangeState = { filter: "all", country: null, cohort: null, composition: null, hasInspect: false, metaSnap: null, ledgerNet: null };
const row = (ip: string, isp: string, cc = "DE", city = "Falkenstein") =>
  ({ cc, city, id: ip, label: ip, pick: { kind: "metanode", node: { ip }, geo: { isp } } }) as unknown as NodeRow;
const TICK = { ordinal: 7, timestamp: "t" } as GlobalSnapshot;

describe("changeActions: a row commits what the view's explorer row commits", () => {
  it("a network in Hypergraph commits the filter", () => {
    expect(changeActions(change({ kind: "network", id: "dor" }), "hyper", STATE, [], null)).toEqual([{ kind: "filter", id: "dor" }]);
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
  it("a network with no tick in reach has nothing to open", () => {
    expect(changeActions(change({ kind: "network", id: "dor" }), "ledger", STATE, [], null)).toBeNull();
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
