import { describe, it, expect } from "vitest";
import { blocksFacts, BLOCK_NOTE_HOURS, type BlocksFactsInput } from "@/src/data/noteFactsBlocks";
import { fact } from "@/src/data/noteFacts";
import { checkNote } from "@/src/data/noteHonesty";

const NAMES = { dag: "DAG", dor: "Dor", usdc: "USDC.dag" };

/** `total` blocks spread over the 24 hourly buckets the note reads. */
const day = (total: number): (number | null)[] => Array.from({ length: BLOCK_NOTE_HOURS }, (_, i) => (i === 0 ? total - (BLOCK_NOTE_HOURS - 1) : 1));

const base = (over: Partial<BlocksFactsInput> = {}): BlocksFactsInput => ({
  blocks: { dag: day(40), dor: day(35) },
  height: 51_234,
  subHeight: 1_904,
  names: NAMES,
  ...over,
});

const valueOf = (facts: { label: string; value: number }[], label: string) => facts.find((f) => f.label === label)?.value;

describe("blocksFacts", () => {
  it("names both chains and both counts, and the DAG's height and sub-height", () => {
    const r = blocksFacts(base())!;
    expect(valueOf(r.facts, "DAG blocks")).toBe(40);
    expect(valueOf(r.facts, "Dor token blocks")).toBe(35);
    expect(valueOf(r.facts, "DAG height")).toBe(51_234);
    expect(valueOf(r.facts, "Global snapshots since the DAG height last moved")).toBe(1_904);
    // The gate names networks by the whole catalog, and the note reads the height as it is now.
    expect(r.names).toEqual(["DAG", "Dor", "USDC.dag"]);
    expect(r.lead).toEqual({ kind: "now" });
  });

  it("states no open tips: the note's facts hold none (design round D5, 2026-11-07)", () => {
    const r = blocksFacts(base())!;
    expect(r.facts.some((f) => /\btips?\b|frontier/i.test(f.label))).toBe(false);
    expect(r.facts.map((f) => f.label)).toEqual(["DAG blocks", "Dor token blocks", "DAG height", "Global snapshots since the DAG height last moved"]);
  });

  it("an unread height or sub-height is left out, never a zero", () => {
    const r = blocksFacts(base({ height: null, subHeight: null }))!;
    expect(r.facts.some((f) => /height/i.test(f.label))).toBe(false);
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
    const note = "Over the last 24 hours the DAG accepted 40 blocks and Dor 35 token blocks. The DAG's height stands at 51,234.";
    expect(checkNote(note, facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Over the last 24 hours the DAG accepted 41 blocks.", facts, r.names).ok).toBe(false);
  });
});
