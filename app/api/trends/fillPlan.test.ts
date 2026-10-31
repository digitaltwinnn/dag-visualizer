import { describe, it, expect } from "vitest";
import { TIER_SINCE } from "@/src/data/trendWindow";
import { bucketWritable, coverageSuppressedBy, cursorsInsideSpan, FILL_POOL, parseCommand, resolveChain, seekBoundary, tierExistsAt, UsageError } from "./fillPlan";

// THE FILL'S PURE DECISIONS (spec 2026-10-30-trends-fill-design): what the script may not decide
// inline because scripts/ has no test harness — the commands and their redirects, the span's
// rules, the cursor pre-flight that replaces a lock, the fine-tier floor, the one-chain resolver.

const D = 86_400_000;
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);

describe("parseCommand — fill", () => {
  it("an extension names only --from; its --to is derived later", () => {
    expect(parseCommand(["fill", "--from=2023-11-13"])).toEqual({
      net: "mainnet",
      command: { kind: "fill", fromMs: day("2023-11-13"), toMs: null, recompute: false, chain: null, fresh: false, dryRun: false },
    });
  });
  it("a recompute names both ends, and may name one chain, --fresh and --dry-run", () => {
    expect(parseCommand(["--net=testnet", "fill", "--from=2026-09-01", "--to=2026-09-10", "--recompute", "--chain=DAG0Cy", "--fresh", "--dry-run"])).toEqual({
      net: "testnet",
      command: { kind: "fill", fromMs: day("2026-09-01"), toMs: day("2026-09-10"), recompute: true, chain: "DAG0Cy", fresh: true, dryRun: true },
    });
  });
  it("refuses --to without --recompute: the extension derives its own", () => {
    expect(() => parseCommand(["fill", "--from=2026-09-01", "--to=2026-09-10"])).toThrow(/derives its own --to/);
  });
  it("refuses --recompute without --to, --chain without --recompute, --to before --from, and no --from", () => {
    expect(() => parseCommand(["fill", "--from=2026-09-01", "--recompute"])).toThrow(/--to/);
    expect(() => parseCommand(["fill", "--from=2026-09-01", "--to=2026-09-02", "--chain=DAG0"])).toThrow(/--recompute/);
    expect(() => parseCommand(["fill", "--from=2026-09-10", "--to=2026-09-01", "--recompute"])).toThrow(/before/);
    expect(() => parseCommand(["fill"])).toThrow(/--from/);
    expect(() => parseCommand(["fill", "--from=2026-9-1"])).toThrow(/YYYY-MM-DD/);
  });
  it("throws UsageError, whose message is what to run instead", () => {
    expect(() => parseCommand(["fill"])).toThrow(UsageError);
  });
});

describe("parseCommand — the old flags redirect to the three commands", () => {
  const cases: [string[], RegExp][] = [
    [["--extend-to=2023-11-13"], /fill --from=2023-11-13/],
    [["--recompute-from=2026-09-06"], /fill --from=2026-09-06 --to=<yesterday> --recompute/],
    [["--backfill-gaps=2025-07-01"], /fill/],
    [["--backfill-blocks=2025-07-01"], /fill/],
    [["--backfill-unlisted"], /fill/],
    [["--no-unlisted"], /fill/],
    [["--resume"], /fill/],
    [["--gaps-from-chain=DAG7"], /fill/],
    [["--wipe-only"], /\bwipe\b/],
    [["--days=90"], /rebuild --days=90/],
    [[], /fill|rebuild|wipe/],
  ];
  for (const [argv, want] of cases) {
    it(`${argv.join(" ") || "(nothing)"} → ${want}`, () => {
      expect(() => parseCommand(argv)).toThrow(want);
    });
  }
});

describe("parseCommand — rebuild and wipe", () => {
  it("rebuild takes --days (capped at 400) and --yes; wipe takes --yes", () => {
    expect(parseCommand(["rebuild", "--days=90", "--yes"])).toEqual({ net: "mainnet", command: { kind: "rebuild", days: 90, yes: true } });
    expect(parseCommand(["rebuild"])).toEqual({ net: "mainnet", command: { kind: "rebuild", days: 90, yes: false } });
    expect(() => parseCommand(["rebuild", "--days=401"])).toThrow(/400/);
    expect(parseCommand(["wipe"])).toEqual({ net: "mainnet", command: { kind: "wipe", yes: false } });
    expect(parseCommand(["wipe", "--yes"]).command).toEqual({ kind: "wipe", yes: true });
  });
  it("an unknown command or flag is a usage error", () => {
    expect(() => parseCommand(["walk"])).toThrow(UsageError);
    expect(() => parseCommand(["fill", "--from=2026-09-01", "--loud"])).toThrow(/--loud/);
    expect(() => parseCommand(["--net=moonnet", "wipe"])).toThrow(/--net/);
  });
});

describe("cursorsInsideSpan — the pre-flight that replaces the sampler lock", () => {
  const end = day("2026-10-29"); // the span's exclusive end: the day after --to
  it("names every cursor whose timestamp is still inside the span; one exactly at the end has passed", () => {
    expect(cursorsInsideSpan({ gTs: end - 1, "mTs.a": end, "mTs.b": end + 5, g: 1, "m.a": 2 }, ["a", "b"], end, true)).toEqual(["gTs"]);
    expect(cursorsInsideSpan({ gTs: end - 1, "mTs.a": end - D, "mTs.b": end }, ["a", "b"], end, true)).toEqual(["gTs", "mTs.a"]);
  });
  it("leaves the spine out when the fill does (--chain), and a missing cursor is not inside (that chain is skipped elsewhere)", () => {
    expect(cursorsInsideSpan({ gTs: end - 1, "mTs.a": end }, ["a", "zz"], end, false)).toEqual([]);
    expect(cursorsInsideSpan({}, ["a"], end, true)).toEqual([]);
  });
  it("reads a cursor stored as a string", () => {
    expect(cursorsInsideSpan({ "mTs.a": String(end - 1) }, ["a"], end, false)).toEqual(["mTs.a"]);
  });
});

describe("tierExistsAt — fine grain is never invented backward", () => {
  it("hourly and 5m exist from TIER_SINCE; daily always", () => {
    expect(tierExistsAt("1h", TIER_SINCE["1h"] - 1)).toBe(false);
    expect(tierExistsAt("1h", TIER_SINCE["1h"])).toBe(true);
    expect(tierExistsAt("5m", TIER_SINCE["5m"] - 1)).toBe(false);
    expect(tierExistsAt("5m", TIER_SINCE["5m"] + 300_000)).toBe(true);
    expect(tierExistsAt("1d", 0)).toBe(true);
  });
});

describe("resolveChain — --chain names exactly one chain", () => {
  const ids = ["DAG0aaaa", "DAG0bbbb", "DAG7cccc"];
  it("resolves a unique prefix, and errors on none or several", () => {
    expect(resolveChain("DAG7", ids)).toEqual({ id: "DAG7cccc" });
    expect(resolveChain("DAG0aaaa", ids)).toEqual({ id: "DAG0aaaa" });
    expect(resolveChain("DAG0", ids)).toEqual({ error: expect.stringMatching(/2 chains/) });
    expect(resolveChain("ZZZ", ids)).toEqual({ error: expect.stringMatching(/no chain/) });
  });
});

describe("FILL_POOL", () => {
  it("walks a few chains at a time, as the full rebuild does", () => {
    expect(FILL_POOL).toBe(3);
  });
});

describe("bucketWritable — nothing before the span, nothing below a tier's birth (final review 1)", () => {
  const from = day("2026-09-01");
  it("refuses a bucket that starts before the span's first day: the predecessor's own buckets are the store's, not the fill's", () => {
    // bucketGlobals zero-fills g.ticks from the predecessor it is handed, which sits in the day
    // BEFORE --from; written, that 0 would overwrite a real day's count.
    expect(bucketWritable("1d", from - D, from)).toBe(false);
    expect(bucketWritable("1h", from - 3_600_000, from)).toBe(false);
    expect(bucketWritable("5m", from - 300_000, from)).toBe(false);
    expect(bucketWritable("1d", from, from)).toBe(true);
    expect(bucketWritable("1h", from + 3_600_000, from)).toBe(true);
  });
  it("still refuses fine grain below the tier's birth, and an unbounded span (a rebuild) writes every tier it has", () => {
    expect(bucketWritable("1h", TIER_SINCE["1h"] - D, TIER_SINCE["1h"] - 30 * D)).toBe(false);
    expect(bucketWritable("1d", TIER_SINCE["1h"] - D, -Infinity)).toBe(true);
  });
});

describe("seekBoundary — where a chain stands against the span's end (final review 2)", () => {
  const chain = (stamps: string[]) => async (o: number) => (o >= 1 && o <= stamps.length ? { ordinal: o, timestamp: stamps[o - 1]!, hash: `h${o}` } : null);
  const end = day("2026-09-01");
  it("answers the first record at/after the boundary, to craft the walk's start from", async () => {
    const r = await seekBoundary(chain(["2026-08-30T00:00:00Z", "2026-08-31T12:00:00Z", "2026-09-01T00:00:05Z", "2026-09-02T00:00:00Z"]), 4, end);
    expect(r).toEqual({ kind: "at", record: { ordinal: 3, timestamp: "2026-09-01T00:00:05Z", hash: "h3" } });
  });
  it("a chain born at or after the boundary has nothing older: born-after", async () => {
    expect(await seekBoundary(chain(["2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"]), 2, end)).toEqual({ kind: "born-after" });
  });
  it("a chain that went quiet BEFORE the boundary is all-older: walked from its tip, never skipped as born-after", async () => {
    // BioFi's former address stopped 2026-08-16; a recompute of August must still fold its days
    // into the floors, and a dormant unlisted chain must still be read for its coverage.
    expect(await seekBoundary(chain(["2026-08-01T00:00:00Z", "2026-08-10T00:00:00Z", "2026-08-16T00:00:00Z"]), 3, end)).toEqual({ kind: "all-older" });
  });
});

describe("coverageSuppressedBy — a skipped unlisted chain is remembered across a resume (final review 3)", () => {
  it("reads the skip from each unlisted chain's checkpoint, not from memory", () => {
    const ckpt: Record<string, { done?: boolean; skipped?: string } | null> = { "DAG0aaaaaa": { done: true }, "DAG0bbbbbb": { done: true, skipped: "no-cursor" }, "DAG0cccccc": null };
    expect(coverageSuppressedBy(["DAG0aaaaaaXYZ", "DAG0bbbbbbXYZ", "DAG0ccccccXYZ"], (label) => ckpt[label] ?? null)).toBe("DAG0bbbbbb");
    expect(coverageSuppressedBy(["DAG0aaaaaaXYZ"], (label) => ckpt[label] ?? null)).toBeNull();
  });
});
