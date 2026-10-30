import { TIER_SINCE } from "@/src/data/trendWindow";

// THE FILL'S PURE DECISIONS (spec 2026-10-30-trends-fill-design) — the parts of
// `scripts/rebuild-trends.ts` that must be tested and that `scripts/` cannot test: the three
// commands and the redirects for every flag they replaced, the span's rules, the cursor pre-flight
// that stands in for a sampler lock, the fine-tier floor and the one-chain resolver. The script
// imports these and does I/O; nothing here reads the store or the network.

export type Net = "mainnet" | "integrationnet" | "testnet";
const NETS: readonly Net[] = ["mainnet", "integrationnet", "testnet"];

export type Command =
  | { kind: "fill"; fromMs: number; toMs: number | null; recompute: boolean; chain: string | null; fresh: boolean; dryRun: boolean }
  | { kind: "rebuild"; days: number; yes: boolean }
  | { kind: "wipe"; yes: boolean };
export interface Parsed { net: Net; command: Command }

/** A usage mistake; the message is what to run instead. */
export class UsageError extends Error {}

/** Chains walked at a time (the full rebuild's pool). The global spine walks alone, last. */
export const FILL_POOL = 3;
/** The rebuild's reach; older history is the fill's. */
export const REBUILD_MAX_DAYS = 400;

const USAGE = [
  "usage:",
  "  fill --from=YYYY-MM-DD                                  extend history back to that day (one walk)",
  "  fill --from=YYYY-MM-DD --to=YYYY-MM-DD --recompute [--chain=<id prefix>]   rewrite covered days (a data fix)",
  "  fill … [--fresh] [--dry-run]",
  "  rebuild [--days=N] [--yes]                              wipe and rebuild N days (asks first)",
  "  wipe [--yes]                                            wipe alone (asks first)",
  "  (--net=mainnet|integrationnet|testnet before the command)",
].join("\n");

/** The one-off flags the fill replaced: each names the command that does its work now. */
const REDIRECTS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^--extend-to=(\d{4}-\d{2}-\d{2})$/, (m) => `--extend-to is now a fill — use: fill --from=${m[1]}`],
  [/^--recompute-from=(\d{4}-\d{2}-\d{2})$/, (m) => `--recompute-from is now a fill — use: fill --from=${m[1]} --to=<yesterday> --recompute`],
  [/^--backfill-gaps=/, () => "--backfill-gaps is folded into fill: every day a fill writes carries its gaps and anchorings — use: fill --from=… --to=… --recompute"],
  [/^--backfill-blocks=/, () => "--backfill-blocks is folded into fill: every day a fill writes carries its blocks — use: fill --from=… --to=… --recompute"],
  [/^--backfill-unlisted$/, () => "--backfill-unlisted is folded into fill: the unlisted chains walk with every fill — use: fill --from=… [--to=… --recompute]"],
  [/^--no-unlisted$/, () => "--no-unlisted is gone: a fill always walks the unlisted chains (one walk)"],
  [/^--resume(=force)?$/, () => "--resume is gone: a fill continues its own checkpoint by itself (--fresh discards it)"],
  [/^--gaps-from-chain=/, () => "--gaps-from-chain is gone: a fill resumes at the chain it stopped on; --chain=<prefix> rewrites one chain with --recompute"],
  [/^--wipe-only$/, () => "--wipe-only is now a command — use: wipe"],
  [/^--days=(\d+)$/, (m) => `--days alone is the rebuild — use: rebuild --days=${m[1]}`],
];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const dayOf = (flag: string, v: string): number => {
  const m = DATE_RE.exec(v);
  if (!m) throw new UsageError(`${flag} wants YYYY-MM-DD (UTC)`);
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!);
};

export function parseCommand(argv: readonly string[]): Parsed {
  let net: Net = "mainnet";
  const rest: string[] = [];
  for (const a of argv) {
    if (a.startsWith("--net=")) {
      const n = a.slice(6);
      if (!(NETS as readonly string[]).includes(n)) throw new UsageError(`--net: unknown network "${n}" (mainnet | integrationnet | testnet)`);
      net = n as Net;
    } else rest.push(a);
  }
  const cmd = rest[0];
  if (cmd == null || cmd.startsWith("--")) {
    for (const a of rest) for (const [re, say] of REDIRECTS) { const m = re.exec(a); if (m) throw new UsageError(say(m)); }
    throw new UsageError(USAGE);
  }
  const flags = rest.slice(1);
  const take = (name: string): string | null => {
    const f = flags.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
    if (!f) return null;
    flags.splice(flags.indexOf(f), 1);
    return f.includes("=") ? f.slice(f.indexOf("=") + 1) : "";
  };
  const has = (name: string): boolean => take(name) != null;
  const noneLeft = () => { if (flags.length) throw new UsageError(`unknown flag for ${cmd}: ${flags[0]}\n${USAGE}`); };

  if (cmd === "fill") {
    const from = take("from");
    const to = take("to");
    const recompute = has("recompute");
    const chain = take("chain");
    const fresh = has("fresh");
    const dryRun = has("dry-run");
    noneLeft();
    if (from == null) throw new UsageError(`fill needs --from=YYYY-MM-DD (the oldest day to fill)\n${USAGE}`);
    const fromMs = dayOf("--from", from);
    if (to != null && !recompute) throw new UsageError("fill: --to is for --recompute only — an extension derives its own --to (the store's oldest covered day)");
    if (recompute && to == null) throw new UsageError("fill --recompute needs --to=YYYY-MM-DD (the newest day to rewrite, at most yesterday)");
    if (chain != null && !recompute) throw new UsageError("fill: --chain is for --recompute only (an extension walks every chain)");
    if (chain === "") throw new UsageError("fill: --chain wants an id prefix");
    const toMs = to != null ? dayOf("--to", to) : null;
    if (toMs != null && toMs < fromMs) throw new UsageError("fill: --to is before --from (--from is the oldest day, --to the newest)");
    return { net, command: { kind: "fill", fromMs, toMs, recompute, chain, fresh, dryRun } };
  }
  if (cmd === "rebuild") {
    const days = take("days");
    const yes = has("yes");
    noneLeft();
    const n = days == null ? 90 : Number(days);
    if (!Number.isInteger(n) || n < 1 || n > REBUILD_MAX_DAYS) throw new UsageError(`rebuild: --days wants 1..${REBUILD_MAX_DAYS} (older history is the fill's)`);
    return { net, command: { kind: "rebuild", days: n, yes } };
  }
  if (cmd === "wipe") {
    const yes = has("yes");
    noneLeft();
    return { net, command: { kind: "wipe", yes } };
  }
  throw new UsageError(`unknown command "${cmd}"\n${USAGE}`);
}

/** THE CURSOR PRE-FLIGHT. The cron adds only records newer than its cursors, so a fill collides
 *  with it only while a cursor's timestamp (`gTs`, `mTs.<id>`) is still inside the span — shortly
 *  after UTC midnight for a span that ends yesterday, or during a catch-up after an outage. These
 *  are the cursors inside `[…, spanEndMs)`; a non-empty answer refuses the fill. A missing cursor
 *  is not inside: that chain is skipped by the walk itself. */
export function cursorsInsideSpan(
  cursor: Readonly<Record<string, string | number>>,
  ids: readonly string[],
  spanEndMs: number,
  withSpine: boolean,
): string[] {
  const names = [...(withSpine ? ["gTs"] : []), ...ids.map((id) => `mTs.${id}`)];
  return names.filter((n) => cursor[n] != null && Number(cursor[n]) < spanEndMs);
}

/** Whether a bucket of this tier may exist at this instant: the fine tiers begin at `TIER_SINCE`,
 *  the daily tier always existed. The one home of the floor the fill prunes by. */
export function tierExistsAt(tier: "5m" | "1h" | "1d", bucketStartMs: number): boolean {
  return tier === "1d" || bucketStartMs >= TIER_SINCE[tier];
}

/** `--chain=<prefix>` names exactly one chain. */
export function resolveChain(prefix: string, ids: readonly string[]): { id: string } | { error: string } {
  const hits = ids.filter((id) => id.startsWith(prefix));
  if (hits.length === 1) return { id: hits[0]! };
  if (!hits.length) return { error: `--chain: no chain starts with ${prefix}` };
  return { error: `--chain: ${hits.length} chains start with ${prefix} (${hits.map((h) => h.slice(0, 10)).join(", ")}) — give more of the id` };
}
