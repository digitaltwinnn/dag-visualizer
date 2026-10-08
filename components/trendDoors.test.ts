import { beforeEach, describe, expect, it } from "vitest";
import { openRecords } from "@/components/trendDoors";
import { useStore } from "@/src/store/store";

// THE DOOR CARRIES THE CARD'S OWN WORDS FOR ITS SPAN (user, 2026-10-07). A daily Moment is a UTC
// day; turned into the reader's local days it read as two ("Sep 22 – Sep 23" east of Greenwich), so
// the log's applied chip repeats what the card said instead of re-deriving it.
describe("openRecords hands the log the span and its words", () => {
  beforeEach(() => useStore.setState({ logSeek: null, mode: "trend", section: "scene" }));

  it("passes the label through with the exact span", () => {
    openRecords("dor", { fromMs: 1_000, toMs: 2_000, label: "Sep 22, 2026" });
    expect(useStore.getState().logSeek).toEqual({ metaId: "dor", fromMs: 1_000, toMs: 2_000, label: "Sep 22, 2026" });
  });
});

// THE DOOR BRINGS THE READER BACK TO WHAT THEY HAD (the tester pass, 2026-10-07): closing the log
// returned to History with the plane focus gone — the Metagraph card empty, another chart in front.
describe("closing the log returns the History focus", () => {
  beforeEach(() => useStore.setState({ logSeek: null, mode: "trend", section: "scene", trendFocus: "dor", rawReturnMode: null }));

  it("restores the view and the plane brought forward", () => {
    openRecords("dor", { fromMs: 1_000, toMs: 2_000 });
    expect(useStore.getState().mode).toBe("ledger");
    useStore.getState().setSection("scene");
    expect(useStore.getState().mode).toBe("trend");
    expect(useStore.getState().trendFocus).toBe("dor");
  });
});
