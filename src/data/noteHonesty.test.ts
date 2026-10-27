import { describe, it, expect } from "vitest";
import { checkNote } from "@/src/data/noteHonesty";
import type { Fact } from "@/src/data/noteTypes";

const F = (label: string, value: number, kind: Fact["kind"], text: string): Fact => ({ label, value, kind, text });
const facts = [
  F("USDC.dag snapshots anchored, ratio to previous span", 2.48, "ratio", "2.48"),
  F("BioFi snapshots anchored, ratio to previous span", 1.37, "ratio", "1.37"),
  F("Global snapshots in span", 12159, "count", "12,159"),
  F("Networks anchoring", 3, "count", "3"),
  F("Hetzner share of nodes", 0.58, "share", "58%"),
  F("Longest pause", 79200, "duration", "22h"),
  F("Busiest day", Date.UTC(2026, 9, 19), "date", "Oct 19"),
];
const names = ["USDC.dag", "BioFi", "Hetzner Online GmbH"];
const ok = (t: string, o?: { maxSentences?: number }) => checkNote(t, facts, names, o).ok;

describe("checkNote — numbers must be backed by a fact", () => {
  it("passes a note with no numbers that a ratio fact backs", () => {
    expect(checkNote("USDC.dag more than doubled its pace.", facts, names)).toEqual({ ok: true });
  });
  it("matches a percentage to a ratio as (r-1)*100", () => {
    expect(ok("BioFi rose by 37% against the span before.")).toBe(true);
  });
  it("matches a count written in full, and compacted within its written precision", () => {
    expect(ok("The hypergraph made 12,159 global snapshots.")).toBe(true);
    expect(ok("The hypergraph made 12.2K global snapshots.")).toBe(true);
  });
  it("rejects a count no fact holds", () => {
    expect(ok("The hypergraph made 205,723 global snapshots.")).toBe(false);
  });
  it("reads number words, and a date phrase is not a number", () => {
    expect(ok("Three networks anchored on Oct 19.")).toBe(true);
    expect(ok("Five networks anchored.")).toBe(false);
  });
  it("leaves a date that no date fact holds to be checked as a number", () => {
    expect(ok("Three networks anchored on Oct 20.")).toBe(false);
  });
  it("matches a percentage to a share and a duration to seconds", () => {
    expect(ok("Hetzner carries 58% of the nodes.")).toBe(true);
    expect(ok("The longest pause lasted 22 hours.")).toBe(true);
    expect(ok("The longest pause lasted 30 hours.")).toBe(false);
  });
  it("reads every written form of a ratio, a date and a duration", () => {
    expect(ok("USDC.dag ran at 2.5x the previous span, 2.5 times in all.")).toBe(true);
    expect(ok("USDC.dag ran at 3x the previous span.")).toBe(false);
    expect(ok("Busiest on October 19, 2026, 19 Oct and 2026-10-19.")).toBe(true);
    expect(ok("The pause ran 1320 minutes.")).toBe(true);
    expect(ok("The pause ran 45s.")).toBe(false);
  });
  it("does not read number words inside other words", () => {
    expect(ok("Someone noticed none, often.")).toBe(true);
  });
  it("does not let a layer name count as a number", () => {
    expect(ok("Nodes run L0 and data L1 layers.")).toBe(true);
  });
});

describe("checkNote — ratio words need a ratio fact of that size", () => {
  it("holds a named network to its own ratio", () => {
    expect(ok("BioFi more than doubled its pace.")).toBe(false); // 1.37 < 2, even though USDC.dag's 2.48 exists
    expect(ok("BioFi tripled.")).toBe(false);
    expect(ok("USDC.dag doubled its pace.")).toBe(true);
    expect(ok("USDC.dag tripled.")).toBe(false); // 2.48 < 2.95
  });
  it("takes any ratio fact when no network is named", () => {
    expect(ok("The pace doubled.")).toBe(true);
    expect(ok("The pace quadrupled.")).toBe(false);
    expect(ok("The pace halved.")).toBe(false);
  });
});

describe("checkNote — the house voice", () => {
  it("rejects an em dash and a spaced en dash or hyphen, but not a joining hyphen", () => {
    expect(ok("USDC.dag doubled — a busy week.")).toBe(false);
    expect(ok("USDC.dag doubled – a busy week.")).toBe(false);
    expect(ok("USDC.dag doubled - a busy week.")).toBe(false);
    expect(ok("Data-fingerprinting kept a steady pace.")).toBe(true);
  });
  it("rejects banned vocabulary, on word starts only", () => {
    for (const bad of ["machines", "ticks", "L1 snapshots", "feeless", "decentralised", "decentralization"])
      expect(ok(`USDC.dag doubled its ${bad}.`), bad).toBe(false);
    expect(ok("A sticky pace.")).toBe(true);
  });
  it("lets a name carry a banned word, since the name is not the model's prose", () => {
    expect(checkNote("TickTock doubled.", facts, ["TickTock"]).ok).toBe(false); // no ratio fact names it
    expect(checkNote("TickTock held steady.", facts, ["TickTock"]).ok).toBe(true);
  });
  it("caps the sentence count, 3 by default and as asked", () => {
    expect(ok("One. Two. Three. Four.")).toBe(false);
    expect(ok("The pace held. It stayed calm. Nothing moved.")).toBe(true);
    expect(ok("USDC.dag doubled. BioFi rose.", { maxSentences: 1 })).toBe(false);
    expect(ok("USDC.dag doubled its pace.", { maxSentences: 1 })).toBe(true);
  });
  it("does not split a sentence on a dot inside a name or a number", () => {
    expect(ok("USDC.dag ran at 2.5x the previous span.", { maxSentences: 1 })).toBe(true);
  });
  it("rejects an empty note and reports a reason per failure", () => {
    expect(ok("   ")).toBe(false);
    const r = checkNote("Five machines — all busy.", facts, names);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.length).toBe(3);
  });
});
