import { describe, it, expect } from "vitest";
import { nodeStatus, statusBreakdown, labelBreakdown, statusItems, BUCKET_COLOR, BUCKET_WORD } from "./nodeStatus";

describe("nodeStatus", () => {
  it("buckets Ready as green consensus", () => {
    const s = nodeStatus("Ready");
    expect(s.bucket).toBe("ready");
    expect(s.color).toBe(BUCKET_COLOR.ready);
    expect(s.label).toBe("ready");
  });
  it("buckets the in-progress lifecycle states as amber with a short label", () => {
    expect(nodeStatus("Observing")).toMatchObject({ bucket: "progress", label: "observing" });
    expect(nodeStatus("WaitingForReady")).toMatchObject({ bucket: "progress", label: "waiting" });
    expect(nodeStatus("DownloadInProgress")).toMatchObject({ bucket: "progress", label: "syncing" });
    expect(nodeStatus("SessionStarted")).toMatchObject({ bucket: "progress", label: "joining" });
    expect(nodeStatus("Observing").color).toBe(BUCKET_COLOR.progress);
  });
  it("buckets Offline/Leaving as red down", () => {
    expect(nodeStatus("Offline")).toMatchObject({ bucket: "down", label: "offline" });
    expect(nodeStatus("Leaving")).toMatchObject({ bucket: "down", label: "leaving" });
  });
  it("buckets unknown/absent as muted", () => {
    expect(nodeStatus("SomethingNew").bucket).toBe("unknown");
    expect(nodeStatus(null).bucket).toBe("unknown");
    expect(nodeStatus(undefined).color).toBe(BUCKET_COLOR.unknown);
  });
});

describe("statusBreakdown", () => {
  it("counts per bucket", () => {
    const b = statusBreakdown(["Ready", "Ready", "Observing", "Offline", "Ready", null]);
    expect(b).toEqual({ ready: 3, progress: 1, down: 1, unknown: 1 });
  });
});

describe("labelBreakdown", () => {
  it("spells out the progress bucket's exact states, most-populous first", () => {
    const states = ["WaitingForReady", "DownloadInProgress", "WaitingForReady", "ReadyToDownload", "Ready"];
    expect(labelBreakdown(states, "progress")).toEqual([
      { label: "waiting", count: 2 },
      { label: "syncing", count: 2 },
    ]);
  });
  it("returns an empty list when the bucket has no members", () => {
    expect(labelBreakdown(["Ready", "Ready"], "progress")).toEqual([]);
  });
  it("collapses states that share a label (Observing/WaitingForObserving → observing)", () => {
    expect(labelBreakdown(["Observing", "WaitingForObserving"], "progress")).toEqual([
      { label: "observing", count: 2 },
    ]);
  });
});

// The one row derivation both status tables render (the dossier schedule and the vitals
// band's Node status cell): ready/unknown as their bucket word, progress/down spelled out
// by exact state, colour always the bucket's.
describe("statusItems", () => {
  it("non-zero buckets in lifecycle order, progress spelled out, bucket colour throughout", () => {
    expect(statusItems(["Ready", "Ready", "DownloadInProgress", "Offline", "Martian"])).toEqual([
      { label: BUCKET_WORD.ready, count: 2, color: BUCKET_COLOR.ready },
      { label: "syncing", count: 1, color: BUCKET_COLOR.progress },
      { label: "offline", count: 1, color: BUCKET_COLOR.down },
      { label: BUCKET_WORD.unknown, count: 1, color: BUCKET_COLOR.unknown },
    ]);
  });
  it("an all-ready fleet is one row", () => {
    expect(statusItems(["Ready", "Ready"])).toEqual([{ label: "ready", count: 2, color: BUCKET_COLOR.ready }]);
  });
});
