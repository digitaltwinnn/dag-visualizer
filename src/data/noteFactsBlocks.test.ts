import { describe, it, expect } from "vitest";
import { blocksFacts, BLOCK_NOTE_HOURS, type BlocksFactsInput } from "@/src/data/noteFactsBlocks";
import { fact } from "@/src/data/noteFacts";
import { checkNote } from "@/src/data/noteHonesty";

const NAMES = { dag: "DAG", dor: "Dor", usdc: "USDC.dag" };

/** `total` blocks spread over the 24 hourly buckets the note reads. */
const day = (total: number): (number | null)[] => Array.from({ length: BLOCK_NOTE_HOURS }, (_, i) => (i === 0 ? total - (BLOCK_NOTE_HOURS - 1) : 1));

const base = (over: Partial<BlocksFactsInput> = {}): BlocksFactsInput => ({
  blocks: { dag: day(40), dor: day(35) },
  transfers: { dag: day(60), dor: day(30) },
  names: NAMES,
  ...over,
});

const valueOf = (facts: { label: string; value: number }[], label: string) => facts.find((f) => f.label === label)?.value;

describe("blocksFacts", () => {
  it("names both chains, their blocks and the transfers those blocks carried", () => {
    const r = blocksFacts(base())!;
    expect(valueOf(r.facts, "DAG blocks")).toBe(40);
    expect(valueOf(r.facts, "DAG transfers")).toBe(60);
    expect(valueOf(r.facts, "Dor token blocks")).toBe(35);
    expect(valueOf(r.facts, "Dor token transfers")).toBe(30);
    // The gate names networks by the whole catalog.
    expect(r.names).toEqual(["DAG", "Dor", "USDC.dag"]);
    expect(r.lead).toEqual({ kind: "now" });
  });

  it("states no open tips and no DAG height: neither tells the reader anything (D5; user, 2026-11-09)", () => {
    const r = blocksFacts(base())!;
    expect(r.facts.some((f) => /\btips?\b|frontier|height/i.test(f.label))).toBe(false);
    expect(r.facts.map((f) => f.label)).toEqual(["DAG blocks", "DAG transfers", "Dor token blocks", "Dor token transfers"]);
  });

  it("transfers: an unmeasured hour is a floor, none measured states nothing, a chain with no blocks none", () => {
    const partial = day(60);
    partial[2] = null;
    const r = blocksFacts(base({ transfers: { dag: partial, dor: Array(BLOCK_NOTE_HOURS).fill(null) } }))!;
    expect(valueOf(r.facts, "DAG transfers, at least")).toBe(59);
    expect(r.facts.some((f) => f.label.startsWith("Dor token transfers"))).toBe(false);
    const idle = blocksFacts(base({ blocks: { dag: Array(BLOCK_NOTE_HOURS).fill(0) }, transfers: { dag: Array(BLOCK_NOTE_HOURS).fill(0) } }))!;
    expect(idle.facts.map((f) => f.label)).toEqual(["DAG blocks"]);
  });

  it("a chain with an unmeasured hour states its count as a floor", () => {
    const partial = day(40);
    partial[5] = null;
    const r = blocksFacts(base({ blocks: { dag: partial } }))!;
    expect(valueOf(r.facts, "DAG blocks, at least")).toBe(39);
    expect(valueOf(r.facts, "DAG blocks")).toBeUndefined();
  });

  it("a token chain with no blocks over the span is not listed; the DAG's own zero is a reading", () => {
    const r = blocksFacts(base({ blocks: { dag: Array(BLOCK_NOTE_HOURS).fill(0), usdc: Array(BLOCK_NOTE_HOURS).fill(0) } }))!;
    expect(valueOf(r.facts, "DAG blocks")).toBe(0);
    expect(r.facts.some((f) => f.label.startsWith("USDC.dag"))).toBe(false);
  });

  it("is null when no block series was measured: no note rather than a note about nothing", () => {
    expect(blocksFacts(base({ blocks: {} }))).toBeNull();
    expect(blocksFacts(base({ blocks: { dag: Array(BLOCK_NOTE_HOURS).fill(null) } }))).toBeNull();
  });

  it("a note in the house words passes the gate on these facts", () => {
    const r = blocksFacts(base())!;
    // The sources append the span's length, as they do for every note.
    const facts = [...r.facts, fact("Span length", 86_400, "duration")];
    const note = "Over the last 24 hours the DAG accepted 40 blocks carrying 60 transfers, and Dor accepted 35 token blocks carrying 30 transfers.";
    expect(checkNote(note, facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Over the last 24 hours the DAG accepted 41 blocks.", facts, r.names).ok).toBe(false);
  });
});
