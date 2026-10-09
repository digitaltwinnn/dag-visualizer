import { beforeEach, describe, expect, it } from "vitest";
import { openRecords } from "@/components/trendDoors";
import { useStore } from "@/src/store/store";
import { UNLISTED_ID } from "@/src/data/unlisted";
import { METAGRAPHS } from "@/src/net/current";

// THE DOOR CARRIES THE CARD'S OWN WORDS FOR ITS SPAN (user, 2026-10-07). A daily Moment is a UTC
// day; turned into the reader's local days it read as two ("Sep 22 – Sep 23" east of Greenwich), so
// the log's applied chip repeats what the card said instead of re-deriving it.
describe("openRecords hands the log the span and its words", () => {
  beforeEach(() => useStore.setState({ logSeek: null, mode: "trend", section: "scene" }));

  it("passes the label through with the exact span", () => {
    openRecords("dor", { fromMs: 1_000, toMs: 2_000, label: "Sep 22, 2026" });
    expect(useStore.getState().logSeek).toEqual({ metaId: "dor", fromMs: 1_000, toMs: 2_000, label: "Sep 22, 2026" });
  });
  it("hands the UNLISTED set over as the log's scope — its lens, never the app filter (2026-10-09)", () => {
    useStore.setState({ filter: "all" });
    openRecords(UNLISTED_ID, { fromMs: 1_000, toMs: 2_000 });
    expect(useStore.getState().logSeek).toEqual({ metaId: UNLISTED_ID, fromMs: 1_000, toMs: 2_000 });
    expect(useStore.getState().filter).toBe("all");
  });
  it("the DAG stays unscoped: the anchor log's chains are the metagraphs'", () => {
    openRecords("dag", { fromMs: 1_000, toMs: 2_000 });
    expect(useStore.getState().logSeek).toEqual({ metaId: null, fromMs: 1_000, toMs: 2_000 });
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

// ONE SELECTION, EVERY SURFACE (2026-10-09): a snapshot committed in the log is the app's commit, and
// History shows a committed network as the plane in front — so closing the log brings THAT network
// forward, not the plane that happened to be in front when the door opened.
describe("closing the log brings forward the network committed in it", () => {
  beforeEach(() => useStore.setState({ logSeek: null, mode: "trend", section: "scene", trendFocus: "dor", rawReturnMode: null, metaSnap: null, tickNet: null }));

  it("a snapshot picked in the log puts its network's plane in front", () => {
    // A catalog id is the network's ADDRESS; the plane is keyed by the same id.
    const biofi = METAGRAPHS.find((m) => m.ticker === "BIOFI")!.id;
    openRecords(null, { fromMs: 1_000, toMs: 2_000 });
    useStore.setState({ metaSnap: { metaId: biofi, ordinal: 1, hash: "", globalOrdinal: 2, ts: "2026-10-09T00:00:00Z" } });
    useStore.getState().setSection("scene");
    expect(useStore.getState().mode).toBe("trend");
    expect(useStore.getState().trendFocus).toBe(biofi);
  });
  it("a retired chain's snapshot puts its re-registered network's plane in front", () => {
    const re = METAGRAPHS.find((m) => m.formerIds?.length)!;
    openRecords(null, { fromMs: 1_000, toMs: 2_000 });
    useStore.setState({ metaSnap: { metaId: re.formerIds![0]!, ordinal: 1, hash: "", globalOrdinal: 2, ts: "2026-10-09T00:00:00Z" } });
    useStore.getState().setSection("scene");
    expect(useStore.getState().trendFocus).toBe(re.id);
  });
  it("an uncataloged channel's snapshot puts the Unlisted plane in front", () => {
    openRecords(null, { fromMs: 1_000, toMs: 2_000 });
    useStore.setState({ metaSnap: { metaId: "DAGnotinthecatalog", ordinal: 1, hash: "", globalOrdinal: 2, ts: "2026-10-09T00:00:00Z" } });
    useStore.getState().setSection("scene");
    expect(useStore.getState().trendFocus).toBe(UNLISTED_ID);
  });
});
