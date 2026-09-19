import { describe, it, expect } from "vitest";
import {
  DRAG_PX,
  EDGE_PX,
  HANDLE_PX,
  MIN_BUCKETS,
  WINDOW_MS,
  axisTicks,
  classifyPress,
  clampCursor,
  drawnSpan,
  isDrag,
  minSpanMs,
  msAtX,
  panRange,
  rangeFrom,
  sameBucket,
  stampInstant,
  stepCursor,
  tickLabel,
  trackRuns,
  windowSpan,
  xAtMs,
} from "./trendTimeline";
import { TIER_SINCE } from "./trendWindow";

// THE TIMELINE'S GEOMETRY AND GESTURE MATHS, as a specification (rule 4 — dataExportCoverage
// enforces this sibling). The band's timeline component is a thin shell over this module: every
// decision a pointer makes — is this a click or a drag, what is under the finger, where does a
// brushed span land, how far does an arrow key move the cursor — is stated here, where it can be
// tested without a browser, because vitest here runs `environment: "node"` (no DOM, no
// testing-library) and a gesture verified only by hand is a gesture nobody can re-verify.

const DAY = 86_400_000;
const HOUR = 3_600_000;
// A one-year track, 1000px wide, entirely inside the fine-tier era so the min span is the 5m one.
const G = { width: 1000, fromMs: Date.UTC(2026, 0, 1), toMs: Date.UTC(2027, 0, 1) };
const SPAN = G.toMs - G.fromMs;

describe("x ↔ ms", () => {
  it("maps the track's ends onto the span's ends", () => {
    expect(msAtX(0, G)).toBe(G.fromMs);
    expect(msAtX(G.width, G)).toBe(G.toMs);
    expect(xAtMs(G.fromMs, G)).toBe(0);
    expect(xAtMs(G.toMs, G)).toBe(G.width);
  });

  it("is linear and round-trips", () => {
    const mid = G.fromMs + SPAN / 2;
    expect(msAtX(500, G)).toBe(mid);
    expect(xAtMs(mid, G)).toBe(500);
    expect(msAtX(xAtMs(G.fromMs + 12345678, G), G)).toBeCloseTo(G.fromMs + 12345678, -1);
  });

  it("CLAMPS to the span — a pointer capture keeps reporting past the edges", () => {
    expect(msAtX(-40, G)).toBe(G.fromMs);
    expect(msAtX(G.width + 40, G)).toBe(G.toMs);
    expect(xAtMs(G.fromMs - SPAN, G)).toBe(0);
    expect(xAtMs(G.toMs + SPAN, G)).toBe(G.width);
  });

  it("answers a zero-width track without dividing by zero", () => {
    const z = { width: 0, fromMs: 0, toMs: 0 };
    expect(msAtX(10, z)).toBe(0);
    expect(xAtMs(10, z)).toBe(0);
  });
});

describe("click vs drag", () => {
  it("is a click below the threshold and a drag at or past it", () => {
    expect(isDrag(0)).toBe(false);
    expect(isDrag(DRAG_PX - 1)).toBe(false);
    expect(isDrag(DRAG_PX)).toBe(true);
    // Direction is immaterial — a leftward brush is a brush.
    expect(isDrag(-DRAG_PX)).toBe(true);
  });
});

describe("what is under the press", () => {
  const brush = { fromMs: G.fromMs + SPAN * 0.25, toMs: G.fromMs + SPAN * 0.75 }; // x 250…750
  const cursor = G.fromMs + SPAN * 0.5; // x 500

  it("finds the cursor handle first — hit order follows PAINT order", () => {
    expect(classifyPress(500, G, brush, cursor)).toEqual({ kind: "cursor" });
    expect(classifyPress(500 + HANDLE_PX, G, brush, cursor)).toEqual({ kind: "cursor" });
    expect(classifyPress(500 + HANDLE_PX + 1, G, brush, cursor)).toEqual({ kind: "inside" });
  });

  it("finds either brush edge inside its hit zone", () => {
    expect(classifyPress(250, G, brush, null)).toEqual({ kind: "edge", edge: "from" });
    expect(classifyPress(250 + EDGE_PX, G, brush, null)).toEqual({ kind: "edge", edge: "from" });
    expect(classifyPress(750 - EDGE_PX, G, brush, null)).toEqual({ kind: "edge", edge: "to" });
    expect(classifyPress(750, G, brush, null)).toEqual({ kind: "edge", edge: "to" });
  });

  it("finds the brush's interior between its edges, and empty track outside", () => {
    expect(classifyPress(500, G, brush, null)).toEqual({ kind: "inside" });
    expect(classifyPress(100, G, brush, null)).toEqual({ kind: "empty" });
    expect(classifyPress(900, G, brush, null)).toEqual({ kind: "empty" });
  });

  it("is EMPTY everywhere when no brush stands and no cursor is picked", () => {
    expect(classifyPress(500, G, null, null)).toEqual({ kind: "empty" });
  });

  it("still finds the cursor handle with no brush standing", () => {
    expect(classifyPress(500, G, null, cursor)).toEqual({ kind: "cursor" });
    expect(classifyPress(300, G, null, cursor)).toEqual({ kind: "empty" });
  });

  it("ignores a cursor outside the track's own span — nothing is drawn there to grab", () => {
    expect(classifyPress(0, G, null, G.fromMs - DAY)).toEqual({ kind: "empty" });
  });

  // ⚠️ THE SPAN IT IS GIVEN IS THE ONE ON SCREEN, not the committed range (review, 2026-09-18).
  // With a window pill selected the track paints the span that pill implies, and a rectangle the
  // reader can see must be a rectangle the reader can grab — so the same classification has to
  // hold for a window-implied span as for a brushed one.
  it("grabs a WINDOW-IMPLIED span exactly as it grabs a committed one", () => {
    const w = windowSpan("30d", G)!;
    const a = xAtMs(w.fromMs, G);
    const b = xAtMs(w.toMs, G);
    expect(classifyPress(a, G, w, null)).toEqual({ kind: "edge", edge: "from" });
    expect(classifyPress(b, G, w, null)).toEqual({ kind: "edge", edge: "to" });
    expect(classifyPress((a + b) / 2, G, w, null)).toEqual({ kind: "inside" });
    // OUTSIDE the drawn span is still bare track — that is how a fresh brush starts.
    expect(classifyPress(a - EDGE_PX - 1, G, w, null)).toEqual({ kind: "empty" });
  });

  it("leaves the WHOLE track grabbable for a fresh brush when `all` draws no span", () => {
    expect(windowSpan("all", G)).toBeNull();
    expect(classifyPress(G.width / 2, G, windowSpan("all", G), null)).toEqual({ kind: "empty" });
  });
});

describe("the minimum span", () => {
  it("is MIN_BUCKETS of the finest tier the range's START can honestly carry", () => {
    // Inside the fine-history era: the 5-minute tier, so twelve five-minute buckets.
    expect(minSpanMs(Date.UTC(2026, 0, 1))).toBe(MIN_BUCKETS * 5 * 60_000);
    // Before it, only the daily tier exists — a finer brush there would fetch empty tiles and
    // chart an outage about an era that is measured perfectly well one tier up.
    expect(minSpanMs(TIER_SINCE["5m"] - DAY)).toBe(MIN_BUCKETS * DAY);
  });
});

describe("a brushed range", () => {
  it("orders its ends whichever way the drag ran", () => {
    const a = G.fromMs + 100 * DAY;
    const b = G.fromMs + 200 * DAY;
    expect(rangeFrom(a, b, G)).toEqual({ fromMs: a, toMs: b });
    expect(rangeFrom(b, a, G)).toEqual({ fromMs: a, toMs: b });
  });

  it("clamps both ends into the track's span", () => {
    const r = rangeFrom(G.fromMs - 10 * DAY, G.toMs + 10 * DAY, G);
    expect(r).toEqual({ fromMs: G.fromMs, toMs: G.toMs });
  });

  it("grows a too-short drag AWAY FROM THE ANCHOR, so the pressed end stays put", () => {
    const anchor = G.fromMs + 100 * DAY;
    const min = minSpanMs(anchor);
    const right = rangeFrom(anchor, anchor + 1000, G);
    expect(right).toEqual({ fromMs: anchor, toMs: anchor + min });
    const left = rangeFrom(anchor, anchor - 1000, G);
    expect(left).toEqual({ fromMs: anchor - min, toMs: anchor });
  });

  it("grows THROUGH the anchor when the track's edge is in the way", () => {
    const min = minSpanMs(G.fromMs);
    // Anchored on the very last instant and dragged right: there is no room to the right.
    const r = rangeFrom(G.toMs, G.toMs, G);
    expect(r.toMs).toBe(G.toMs);
    expect(r.toMs - r.fromMs).toBe(min);
  });

  it("gives up gracefully on a track shorter than the minimum — the whole track", () => {
    const tiny = { width: 100, fromMs: G.fromMs, toMs: G.fromMs + 60_000 };
    expect(rangeFrom(tiny.fromMs, tiny.fromMs, tiny)).toEqual({ fromMs: tiny.fromMs, toMs: tiny.toMs });
  });

  // ⚠️ A RESIZE DRAGGED TOWARD ITS PARTNER hits the floor, and the floor has to move SOMETHING.
  // It moves the edge the user is NOT holding — the anchor — because the held edge is the one the
  // finger is on, and an edge that refuses to follow the pointer reads as a broken control.
  it("moves the ANCHOR, not the held edge, when a resize is dragged under the minimum", () => {
    const to = G.fromMs + 200 * DAY;
    const min = minSpanMs(G.fromMs + 199 * DAY);
    // Dragging the `from` edge right, up against `to`: `to` is the anchor and it is what gives.
    const r = rangeFrom(to, to - 1000, G);
    expect(r.toMs).toBe(to);
    expect(r.fromMs).toBe(to - min);
    expect(r.toMs - r.fromMs).toBe(min);
    // And it stays inside the track whichever end it had to grow through.
    expect(r.fromMs).toBeGreaterThanOrEqual(G.fromMs);
    expect(r.toMs).toBeLessThanOrEqual(G.toMs);
  });

  it("keeps a floored resize inside the track when the anchor sits against an edge", () => {
    const min = minSpanMs(G.fromMs);
    // The `to` edge dragged left onto the very first instant, anchored there: there is no room
    // to the LEFT, so the span grows right and both ends stay in the track.
    const r = rangeFrom(G.fromMs, G.fromMs, G);
    expect(r.fromMs).toBe(G.fromMs);
    expect(r.toMs).toBe(G.fromMs + min);
    expect(r.toMs).toBeLessThanOrEqual(G.toMs);
  });

  it("RESIZES by anchoring the opposite edge — the same one function", () => {
    const r = { fromMs: G.fromMs + 100 * DAY, toMs: G.fromMs + 200 * DAY };
    // Dragging the `to` edge left: the `from` edge is the anchor.
    expect(rangeFrom(r.fromMs, G.fromMs + 150 * DAY, G)).toEqual({ fromMs: r.fromMs, toMs: G.fromMs + 150 * DAY });
    // Dragging the `to` edge PAST the `from` edge flips the span rather than inverting it.
    const flipped = rangeFrom(r.fromMs, G.fromMs + 50 * DAY, G);
    expect(flipped.fromMs).toBe(G.fromMs + 50 * DAY);
    expect(flipped.toMs).toBe(r.fromMs);
  });
});

describe("panning a range", () => {
  const r = { fromMs: G.fromMs + 100 * DAY, toMs: G.fromMs + 200 * DAY };

  it("moves it while KEEPING ITS SPAN — a pan is not a resize", () => {
    const out = panRange(r, 10 * DAY, G);
    expect(out).toEqual({ fromMs: r.fromMs + 10 * DAY, toMs: r.toMs + 10 * DAY });
    expect(out.toMs - out.fromMs).toBe(r.toMs - r.fromMs);
  });

  it("stops at each end of the track instead of shrinking against it", () => {
    const left = panRange(r, -SPAN, G);
    expect(left).toEqual({ fromMs: G.fromMs, toMs: G.fromMs + 100 * DAY });
    const right = panRange(r, SPAN, G);
    expect(right).toEqual({ fromMs: G.toMs - 100 * DAY, toMs: G.toMs });
  });

  it("parks a range wider than the track at its start rather than going negative", () => {
    const wide = { fromMs: G.fromMs - DAY, toMs: G.toMs + DAY };
    expect(panRange(wide, 5 * DAY, G).fromMs).toBe(G.fromMs);
  });
});

describe("the cursor", () => {
  it("clamps INSIDE the span — the last instant belongs to the last bucket, not past it", () => {
    expect(clampCursor(G.fromMs - DAY, G)).toBe(G.fromMs);
    expect(clampCursor(G.toMs + DAY, G)).toBe(G.toMs - 1);
  });

  it("steps one bucket of the STACK's own tier, and ten with a modifier", () => {
    const at = G.fromMs + 100 * DAY;
    expect(stepCursor(at, HOUR, 1, G)).toBe(at + HOUR);
    expect(stepCursor(at, HOUR, -1, G)).toBe(at - HOUR);
    expect(stepCursor(at, HOUR, 10, G)).toBe(at + 10 * HOUR);
    expect(stepCursor(at, DAY, -10, G)).toBe(at - 10 * DAY);
  });

  it("starts at the span's END when nothing is picked yet — the newest reading is the default", () => {
    expect(stepCursor(null, DAY, -1, G)).toBe(G.toMs - 1);
    expect(stepCursor(null, DAY, 1, G)).toBe(G.toMs - 1);
  });

  it("stops at the span's ends rather than wrapping", () => {
    expect(stepCursor(G.fromMs, DAY, -5, G)).toBe(G.fromMs);
    expect(stepCursor(G.toMs - 1, DAY, 5, G)).toBe(G.toMs - 1);
  });
});

describe("the span on screen", () => {
  const brushed = { fromMs: G.fromMs + 100 * DAY, toMs: G.fromMs + 200 * DAY };

  it("prefers the live drag, then a committed range, then the window's own span", () => {
    const preview = { fromMs: G.fromMs, toMs: G.fromMs + 10 * DAY };
    expect(drawnSpan(preview, brushed, "30d", G)).toBe(preview);
    expect(drawnSpan(null, brushed, "30d", G)).toBe(brushed);
    expect(drawnSpan(null, null, "30d", G)).toEqual(windowSpan("30d", G));
  });

  it("draws NOTHING for `all` — the absence is the statement", () => {
    expect(drawnSpan(null, null, "all", G)).toBeNull();
  });

  // ⚠️ THE POINT OF THE FUNCTION. What is painted is what is hit-tested: feeding `classifyPress`
  // the committed range instead left a window-implied rectangle visible and ungrabbable.
  it("is what classifyPress must be given — a window's span is as grabbable as a brushed one", () => {
    const shown = drawnSpan(null, null, "7d", G)!;
    expect(classifyPress(xAtMs(shown.fromMs, G), G, shown, null)).toEqual({ kind: "edge", edge: "from" });
    // …whereas the committed range (there is none) would have classified the same press as bare
    // track, which is the defect this function exists to make impossible.
    expect(classifyPress(xAtMs(shown.fromMs, G), G, null, null)).toEqual({ kind: "empty" });
  });
});

describe("the scrub's quantiser", () => {
  const t = Date.UTC(2026, 0, 1, 12, 0);

  it("is the SAME bucket for two instants the planes cannot tell apart", () => {
    expect(sameBucket(t, t + 60_000, HOUR)).toBe(true);
    expect(sameBucket(t, t + HOUR - 1, HOUR)).toBe(true);
  });

  it("is a CHANGE the moment the containing bucket does", () => {
    expect(sameBucket(t, t + HOUR, HOUR)).toBe(false);
    expect(sameBucket(t, t - 1, HOUR)).toBe(false);
  });

  it("follows the STACK's grain, not the track's — a day and an hour disagree on purpose", () => {
    expect(sameBucket(t, t + 3 * HOUR, DAY)).toBe(true);
    expect(sameBucket(t, t + 3 * HOUR, HOUR)).toBe(false);
  });

  it("treats a first write as a change, and never divides by a zero step", () => {
    expect(sameBucket(null, t, HOUR)).toBe(false);
    expect(sameBucket(t, t, 0)).toBe(false);
  });
});

describe("the window a pill implies", () => {
  it("measures back from the track's newest instant", () => {
    expect(windowSpan("24h", G)).toEqual({ fromMs: G.toMs - DAY, toMs: G.toMs });
    expect(windowSpan("7d", G)).toEqual({ fromMs: G.toMs - 7 * DAY, toMs: G.toMs });
    expect(windowSpan("1h", G)).toEqual({ fromMs: G.toMs - HOUR, toMs: G.toMs });
  });

  it("draws NOTHING for `all` — the absence IS the statement that the whole span is showing", () => {
    expect(windowSpan("all", G)).toBeNull();
    expect(WINDOW_MS.all).toBeNull();
  });

  it("never opens before the track does", () => {
    const short = { width: 100, fromMs: G.toMs - DAY, toMs: G.toMs };
    expect(windowSpan("1y", short)).toEqual({ fromMs: short.fromMs, toMs: short.toMs });
  });
});

describe("the overview's own ink", () => {
  const g = { width: 100, fromMs: 0, toMs: 100 };
  const buckets = [0, 10, 20, 30, 40];

  it("breaks the line at a GAP — a null bucket is not a zero (rule 10)", () => {
    const runs = trackRuns([1, null, 1, 1, null], buckets, 10, g, 1, 50);
    expect(runs.length).toBe(2);
    // x is the bucket's MIDPOINT, not its left edge — a bucket is a span (see trackRuns).
    expect(runs[0]).toEqual([{ x: 5, y: 0 }]);
    expect(runs[1].map((p) => p.x)).toEqual([25, 35]);
  });

  it("puts the peak at the top of the plot and a zero on its floor", () => {
    const runs = trackRuns([0, 5, 10], [0, 10, 20], 10, g, 10, 50);
    expect(runs[0].map((p) => p.y)).toEqual([50, 25, 0]);
  });

  it("yields an ISOLATED measured point as a run of one — the caller draws a dot", () => {
    const runs = trackRuns([null, 3, null], [0, 10, 20], 10, g, 3, 50);
    expect(runs).toEqual([[{ x: 15, y: 0 }]]);
  });

  it("floors a series with no measured peak rather than dividing by zero", () => {
    const runs = trackRuns([0, 0], [0, 10], 10, g, 0, 50);
    expect(runs[0].every((p) => p.y === 50)).toBe(true);
  });

  it("draws nothing at all from an empty series", () => {
    expect(trackRuns([], [], 10, g, 1, 50)).toEqual([]);
  });
});

describe("the month marks under the track", () => {
  const year = Array.from({ length: 365 }, (_, i) => Date.UTC(2026, 0, 1) + i * DAY);

  it("marks where the UTC month turns, never the arbitrary first bucket", () => {
    const ticks = axisTicks(year, DAY, { width: 4000, fromMs: year[0], toMs: year[364] + DAY }, 10);
    expect(ticks).toContain(Date.UTC(2026, 1, 1));
    expect(ticks).toContain(Date.UTC(2026, 11, 1));
    expect(ticks).not.toContain(year[0]);
  });

  it("THINS to the width it has — a label every month over six years is a smear", () => {
    const wide = axisTicks(year, DAY, { width: 4000, fromMs: year[0], toMs: year[364] + DAY }, 10);
    const narrow = axisTicks(year, DAY, { width: 120, fromMs: year[0], toMs: year[364] + DAY }, 30);
    expect(wide.length).toBe(11);
    expect(narrow.length).toBeLessThan(wide.length);
    // Whatever survives is still a real month start.
    for (const t of narrow) expect(new Date(t).getUTCDate()).toBe(1);
  });

  // THE COARSE BRANCH (stepMs > 1d). A daily window's marks snap back to the month's 1st, because
  // some day inside that month is the first one measured and the CALENDAR boundary is what the
  // label names. Once the buckets are wider than a day that snap becomes a lie: the 1st need not
  // be a bucket at all, so the mark would sit where no measurement is. The bucket's own instant
  // is marked instead. Built with a 45-day step, which is the one shape that separates the two.
  it("marks the BUCKET ITSELF once the buckets are coarser than a day", () => {
    const STEP = 45 * DAY;
    const buckets = [Date.UTC(2026, 0, 20), Date.UTC(2026, 0, 20) + STEP]; // Jan 20 → Mar 6
    const g = { width: 300, fromMs: buckets[0], toMs: buckets[1] + STEP };
    expect(axisTicks(buckets, STEP, g, 10)).toEqual([buckets[1]]);
    // The same axis read at a DAILY step snaps to the calendar instead — the branches differ.
    expect(axisTicks(buckets, DAY, g, 10)).toEqual([Date.UTC(2026, 2, 1)]);
  });

  it("names a January by its YEAR and every other month by its name", () => {
    expect(tickLabel(Date.UTC(2026, 0, 1))).toBe("2026");
    expect(tickLabel(Date.UTC(2026, 3, 1))).toMatch(/^[^\d]+$/);
  });
});

describe("the cursor's readout", () => {
  it("states the DATE at the daily tier — an hour a chart cannot resolve would be invented", () => {
    const s = stampInstant(Date.UTC(2026, 8, 18, 13, 45), DAY);
    expect(s).toMatch(/18/);
    expect(s).toMatch(/2026/);
    expect(s).not.toMatch(/:/);
  });

  it("adds the clock time, in UTC, once the stack's buckets are finer than a day", () => {
    const s = stampInstant(Date.UTC(2026, 8, 18, 13, 45), HOUR);
    expect(s).toMatch(/13:45/);
    expect(s).toMatch(/UTC$/);
  });
});
