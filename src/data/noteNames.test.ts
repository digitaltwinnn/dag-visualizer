import { describe, expect, it } from "vitest";

import { noteSegments, takeSegments, type NoteSegment } from "@/src/data/noteNames";

const DOR = "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM";
const named = (text: string) => noteSegments(text).filter((s) => s.id).map((s) => [s.text, s.id]);

describe("noteSegments", () => {
  it("finds a network by its full name and keeps every character", () => {
    const text = "Dor Technologies and BioFi grew, while DAG nodes fell.";
    const segs = noteSegments(text);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs[0]).toMatchObject({ text: "Dor Technologies", id: DOR });
    expect(named(text).map(([t]) => t)).toEqual(["Dor Technologies", "BioFi", "DAG"]);
  });
  it("finds a ticker, and the two safe short forms", () => {
    expect(named("DOR and DED").map(([t]) => t)).toEqual(["DOR", "DED"]);
    expect(named("Dor lost a node, and Upsider AI held.").map(([t]) => t)).toEqual(["Dor", "Upsider AI"]);
  });
  it("takes the longest form", () => {
    expect(named("The Upsider AI held.").map(([t]) => t)).toEqual(["The Upsider AI"]);
    expect(named("USDC.dag rose.").map(([t]) => t)).toEqual(["USDC.dag"]);
  });
  it("leaves words a name merely sits inside", () => {
    expect(named("Dorset and BioFiber, undated")).toEqual([]);
  });
  it("leaves words that only start a name", () => {
    expect(named("Common nodes, a National average, El Nino")).toEqual([]);
  });
  it("never reads a short uppercase ticker as a name", () => {
    expect(named("fees went UP")).toEqual([]);
  });
  it("leaves DAG the unit", () => {
    expect(named("Fees of 333 DAG, or 1,204.5 DAG a day.")).toEqual([]);
    expect(named("The DAG took 333 DAG in fees.").map(([t]) => t)).toEqual(["DAG"]);
  });
  it("is case-sensitive: the word is not the name", () => {
    expect(named("a dag of snapshots")).toEqual([]);
  });
  it("a note naming nobody is one plain segment", () => {
    expect(noteSegments("Nodes held steady.")).toEqual([{ text: "Nodes held steady.", id: null }]);
  });
});

describe("takeSegments", () => {
  const segs: NoteSegment[] = [{ text: "Dor", id: DOR }, { text: " grew", id: null }];
  it("cuts inside a name, so the colour types in with its letters", () => {
    expect(takeSegments(segs, 2)).toEqual([{ text: "Do", id: DOR }]);
  });
  it("carries on into the next segment", () => {
    expect(takeSegments(segs, 5)).toEqual([{ text: "Dor", id: DOR }, { text: " g", id: null }]);
  });
  it("is nothing at 0 and everything past the end", () => {
    expect(takeSegments(segs, 0)).toEqual([]);
    expect(takeSegments(segs, 99)).toEqual(segs);
  });
});
