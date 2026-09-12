// REBUILD the trends store from the explorer's own history — the recovery tool (user,
// 2026-09-06: "this 'initial load' could be useful in the future as well when there is a bug").
// Run manually, like every scripts/ tool:
//
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --days=180
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --extend-to=2026-01-01
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --recompute-from=2026-09-06
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --recompute-from=2026-09-06 --resume
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --backfill-gaps=2026-01-01
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --backfill-blocks=2025-07-01
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --wipe-only
//
// CRASH SAFETY (2026-09-11 — the overnight recompute died at hour 13 with every write still
// queued behind the last chain; nothing landed): --recompute-from and --extend-to flush each
// chain's FINALIZED buckets as the walk passes them and checkpoint the cursor plus the
// still-filling frontier to .rebuild-trends-ckpt/{net}/ every 500K records. The walk descends
// newest→oldest, so a bucket is final once the frontier sits two whole UTC days below it —
// only complete buckets ever reach the store (a partial sum would read as a crash, rule 10);
// the frontier rides the checkpoint file, never the store. A killed run reruns with --resume:
// finished chains skip, the in-flight chain continues from its saved cursor. The two shared
// floor series (g.feeFloor/g.kbFloor — bucketMetas adds EVERY chain's fee into the same
// field, so no single chain may HSET them) divert into the checkpoints and are written once,
// after the last chain. The checkpoint directory is cleared only then.
//
// --backfill-gaps writes the per-network CONTINUITY series (m.{id}.gapSum/gapMax) for
// history: the ordinary backfills never kept record timestamps, so measuring gaps
// retroactively means re-walking each chain — but ONLY the timestamps are collected, only
// the two gap fields are written (complete-day recomputations, HSET overwrite), TODAY is
// excluded (the live sampler's accruing bucket must not be double-counted), and every other
// field is untouched. Runs under the sampler lock like everything else here.
//
// --recompute-from REPAIRS RECENT DAYS (2026-09-07, found live the day it was needed): a
// sampler catch-up that runs past the pager's 600-record cap ACCEPTS a gap — honest, but the
// affected day then carries a measured-looking floor that reads as a crash. This mode
// recomputes every day from the given date through YESTERDAY (UTC) completely from the tip —
// all chains, every tier overwritten whole, today's partial day and the cron cursor untouched.
// Locally-driven stores need it after manual sampling; a production cron never should.
//
// --extend-to EXTENDS HISTORY BACKWARD WITHOUT WIPING (user, 2026-09-07: "without removing/
// duplicating data"): everything strictly older than the store's oldest covered day is a
// DISJOINT record set, so no double-count is possible — and the one boundary day (partial,
// because the original cutoff landed mid-day) is recomputed COMPLETELY from its full records
// and OVERWRITTEN, which replaces partial sums with complete ones. The walk does not re-page
// from the tip: the explorer's `meta.next` cursor is a craftable {created_at, ordinal} token
// (probed live — created_at is the record's own timestamp), so each chain seeks its boundary
// by binary-searching the per-ordinal endpoint, then walks only the missing span. Writes go
// to the DAILY tier alone — the hourly tier only serves the 7d/30d windows, which never reach
// this far back — and the cron cursor is untouched (the extension is backward-only).
// The SAME walk also yields the per-network continuity fields (user, 2026-09-09: every
// metric the store holds, one walk): each chain's record timestamps fold into
// m.{id}.gapSum/gapMax exactly as --backfill-gaps does, so an extension never needs a
// second re-walk. The span's first record opens the chain (no invented gap at extend-to),
// and the boundary day's gap fields are recomputed whole — now INCLUDING the cross-midnight
// gap from the day before it, which the original forward-only gaps walk could not see.
//
// A rebuild ALWAYS wipes `t:{net}:*` first: the store's write path is merge-based (add-series
// accumulate), so backfilling over existing data would double-count — wipe-and-rebuild is the
// only honest contract, and the 15-min cron then resumes seamlessly from the cursor this tool
// leaves behind (the newest backfilled ordinal per chain).
//
// HONESTY (rule 10): everything written here is a REAL record read from the explorer's indexer
// — full fidelity, every record in the window, through the SAME bucketing/merge modules the live
// sampler uses, so backfill and live writes cannot disagree. The one thing that cannot be
// backfilled is the FLEET family: no historical node/geo records exist anywhere upstream, so
// f.* series honestly begin at the first live sampler run after the rebuild.
//
// Mechanics worth knowing:
//  - The explorer pages by an opaque `meta.next` cursor (probed live 2026-09-06 — `?limit=&next=`
//    walks newest→oldest; `offset` is silently ignored). ~330 B/record, 600/page: a 90-day
//    rebuild is a few thousand requests, run sequentially per chain and a few chains in parallel.
//  - Global records are day-chunked through bucketGlobals so the gap chain threads across chunks
//    while the 5m coverage zero-fill stays bounded: 5m-tier fields older than the tier's own 48 h
//    retention are pruned as we go instead of being written and left to expire.
//  - The script holds the SAMPLER'S OWN LOCK for its whole run (cron runs skip meanwhile and
//    self-heal after), so the store has exactly one writer and the write passes need no
//    read-merge: chunked applyWrites transactions carry the folded IncMap.
import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

// ---- env: scripts run outside Next, so .env.local (vercel env pull) is parsed by hand --------
function loadEnvLocal(): void {
  let raw = "";
  try {
    raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  } catch {
    console.error("no .env.local — run `vercel env pull` first");
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!(k in process.env)) process.env[k] = v.replace(/^"|"$/g, "");
  }
}

interface Args { net: "mainnet" | "integrationnet" | "testnet"; days: number; wipeOnly: boolean; extendToMs: number | null; recomputeFromMs: number | null; gapsFromMs: number | null; blocksFromMs: number | null; resume: "no" | "yes" | "force" }
function parseArgs(): Args {
  const a: Args = { net: "mainnet", days: 90, wipeOnly: false, extendToMs: null, recomputeFromMs: null, gapsFromMs: null, blocksFromMs: null, resume: "no" };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--wipe-only") a.wipeOnly = true;
    else if (arg === "--resume") a.resume = "yes";
    else if (arg === "--resume=force") a.resume = "force";
    else if (arg.startsWith("--net=")) a.net = arg.slice(6) as Args["net"];
    else if (arg.startsWith("--days=")) a.days = Number(arg.slice(7));
    else if (arg.startsWith("--extend-to=")) {
      const m = arg.slice(12).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) a.extendToMs = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      else { console.error("--extend-to wants YYYY-MM-DD (UTC)"); process.exit(1); }
    }
    else if (arg.startsWith("--recompute-from=")) {
      const m = arg.slice(17).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) a.recomputeFromMs = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      else { console.error("--recompute-from wants YYYY-MM-DD (UTC)"); process.exit(1); }
    }
    else if (arg.startsWith("--backfill-blocks=")) {
      const m = /^--backfill-blocks=(\d{4})-(\d{2})-(\d{2})$/.exec(arg);
      if (m) a.blocksFromMs = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      else { console.error("--backfill-blocks wants YYYY-MM-DD (UTC)"); process.exit(1); }
    }
    else if (arg.startsWith("--backfill-gaps=")) {
      const m = arg.slice(16).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) a.gapsFromMs = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      else { console.error("--backfill-gaps wants YYYY-MM-DD (UTC)"); process.exit(1); }
    }
    else { console.error(`unknown arg ${arg}`); process.exit(1); }
  }
  if (!["mainnet", "integrationnet", "testnet"].includes(a.net) || !(a.days > 0 && a.days <= 400)) {
    console.error("usage: --net=... --days=1..400 [--wipe-only] [--extend-to=YYYY-MM-DD]");
    process.exit(1);
  }
  if (a.extendToMs != null && a.wipeOnly) { console.error("--extend-to and --wipe-only are exclusive"); process.exit(1); }
  if (a.resume !== "no" && a.recomputeFromMs == null && a.extendToMs == null) {
    console.error("--resume only applies to --recompute-from and --extend-to (the checkpointed walks)");
    process.exit(1);
  }
  return a;
}

// ---- the seekable cursor (probed live 2026-09-06/07): meta.next decodes to
// {"created_at": <the record's own timestamp>, "ordinal": <hex ordinal>} — so a walk can be
// STARTED anywhere by crafting the token from a real record. Verified against the shape at
// runtime; a drifted format aborts loudly rather than walking from the tip. ----
// ⚠️ TWO cursor dialects, both probed live 2026-09-07: the GLOBAL list pages by
// {created_at, ordinal}, the CURRENCY lists by {hash} — and a CRAFTED cursor lands
// INCLUSIVELY on its own record (server-issued next tokens are exclusive; ours are not),
// so every seeded walk filters `ts < boundary` before bucketing. Without that filter the
// stray boundary record would seed a one-record daily bucket that the overwrite pass then
// stamps over a complete stored day.
function craftGlobalCursor(tsIso: string, ordinal: number): string {
  return Buffer.from(JSON.stringify({ created_at: tsIso, ordinal: ordinal.toString(16) })).toString("base64");
}
function craftCurrencyCursor(hash: string): string {
  return Buffer.from(JSON.stringify({ hash })).toString("base64");
}
async function probeCursorShape(base: string, expect: string): Promise<void> {
  const page = await getPage<{ ordinal: number; timestamp: string }>(`${base}?limit=2`);
  const next = page.meta?.next;
  if (!next) throw new Error("cursor probe: no meta.next");
  const decoded = JSON.parse(Buffer.from(next, "base64").toString("utf8")) as Record<string, string>;
  const keys = Object.keys(decoded).sort().join(",");
  if (keys !== expect) throw new Error(`cursor probe: format drifted (${keys}, wanted ${expect}) — refusing to seek`);
}
/** Smallest ordinal whose record timestamp >= boundaryMs, by binary search over the
 *  per-ordinal endpoint; null when the whole chain predates nothing (genesis already at or
 *  after the boundary — nothing older to extend). */
async function seekBoundary(
  oneOf: (ordinal: number) => Promise<{ ordinal: number; timestamp: string; hash?: string } | null>,
  tipOrdinal: number,
  boundaryMs: number,
): Promise<{ ordinal: number; timestamp: string; hash?: string } | null> {
  let lo = 1;
  let hi = tipOrdinal;
  const first = await oneOf(1);
  if (!first || Date.parse(first.timestamp) >= boundaryMs) return null; // chain born at/after the boundary
  let best: { ordinal: number; timestamp: string; hash?: string } | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const rec = await oneOf(mid);
    if (!rec) { hi = mid - 1; continue; } // unserved probe — tighten from above
    if (Date.parse(rec.timestamp) >= boundaryMs) { best = rec; hi = mid - 1; }
    else lo = mid + 1;
  }
  return best;
}

// ---- explorer paging (the probed `meta.next` cursor walk) ------------------------------------
interface Page<T> { data?: T[]; meta?: { next?: string } }
async function getPage<T>(url: string): Promise<Page<T>> {
  // Backoff reaches ~1.5 min cumulative: a multi-hour walk must survive a transient DNS or
  // network blip (one killed a 3-hour gaps walk at 83%, 2026-09-08 — EAI_AGAIN).
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`${r.status}`);
      return (await r.json()) as Page<T>;
    } catch (e) {
      if (attempt >= 6) throw e;
      await new Promise((res) => setTimeout(res, Math.min(30000, 1000 * 2 ** attempt)));
    }
  }
}

/** Walk a chain newest→oldest until `cutoffMs`, streaming each page (newest-first) to `onPage`.
 *  `onPageEnd` (checkpointing) sees the NEXT page's cursor after each processed page — saving
 *  it and later resuming from it re-enters the walk exactly where it left off (server-issued
 *  tokens are exclusive). */
async function walkChain<T extends { timestamp: string }>(
  base: string,
  cutoffMs: number,
  onPage: (recs: T[]) => void,
  label: string,
  startCursor?: string,
  onPageEnd?: (nextCursor: string) => Promise<void>,
): Promise<number> {
  let next: string | undefined = startCursor;
  let pages = 0;
  let total = 0;
  for (;;) {
    const url = `${base}?limit=600${next ? `&next=${encodeURIComponent(next)}` : ""}`;
    const page = await getPage<T>(url);
    const recs = (page.data ?? []).filter((r) => Date.parse(r.timestamp) >= cutoffMs);
    total += recs.length;
    if (recs.length) onPage(recs);
    pages++;
    if (pages % 25 === 0) process.stdout.write(`\r  ${label}: ${total} records (${pages} pages)…`);
    const done = !page.meta?.next || (page.data ?? []).length === 0 || recs.length < (page.data ?? []).length;
    if (done) break;
    next = page.meta.next;
    if (onPageEnd) await onPageEnd(next);
  }
  process.stdout.write(`\r  ${label}: ${total} records (${pages} pages)\n`);
  return total;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { net, days, wipeOnly, extendToMs, recomputeFromMs, gapsFromMs, blocksFromMs, resume } = parseArgs();

  // Deferred imports: store.ts reads env at construction, so env must be loaded first.
  const { Redis } = await import("@upstash/redis");
  const { NETWORKS, CATALOG } = await import("../src/engine/config");
  const { TIER_SINCE } = await import("../src/data/trendWindow");
  const { TTL_S, slotOf, cursorKeyOf, lockKeyOf } = await import("../app/api/trends/keys");
  const { bucketGlobals, bucketMetas, addInc } = await import("../app/api/trends/bucketing");
  const addIncGap = (inc: import("../app/api/trends/bucketing").IncMap, n: string, tsMs: number, id: string, gap: number) => {
    addInc(inc, n, tsMs, `m.${id}.gapSum`, gap);
    addInc(inc, n, tsMs, `m.${id}.gapMax`, gap);
  };
  const { writeStore } = await import("../app/api/trends/store");
  type IncMap = import("../app/api/trends/bucketing").IncMap;
  type GlobalRec = import("../app/api/trends/bucketing").GlobalRec;
  type MetaRec = import("../app/api/trends/bucketing").MetaRec;
  type Tier = import("../app/api/trends/keys").Tier;

  const redis = new Redis({
    url: process.env.UPSTASH_KV_REST_API_URL!,
    token: process.env.UPSTASH_KV_REST_API_TOKEN!,
  });

  // ⚠️ THE PRODUCTION CRON IS A CONCURRENT WRITER (review find, 2026-09-07 — this script
  // used to claim sole-writer status it never enforced). Take the sampler's own lock for the
  // whole run: cron runs skip while it's held (honest gaps, self-healed afterward), and the
  // wipe below must never delete the lock key it is standing on. TTL 6 h, deliberately NOT
  // refreshed by the multi-day walks (2026-09-11): their writes are disjoint from the cron's
  // by construction — recompute stops at its pinned today-boundary, the extension writes only
  // below the store's oldest day — so once the lock lapses the cron resumes live sampling
  // (the fleet gauges return) while the walk keeps flushing history. Released in finally.
  const lockStore = (await import("../app/api/trends/store")).writeStore();
  if (!(await lockStore.acquireLock(lockKeyOf(net), 21600))) {
    // A killed walk leaves its lock standing (up to 6 h) — which would block its own
    // --resume. Take it over ONLY on evidence: a resume was asked for, a checkpoint on disk
    // proves a rebuild died mid-walk, and the TTL says rebuild-class lock (a cron run's
    // lives ≤900 s — never stomp a live sampler write).
    let hasCkpt = false;
    try { hasCkpt = !!readFileSync(join(process.cwd(), ".rebuild-trends-ckpt", net, "_meta.json"), "utf8"); } catch { /* no checkpoint */ }
    const ttl = await redis.ttl(lockKeyOf(net));
    if (resume !== "no" && hasCkpt && ttl > 900) {
      console.log(`taking over the killed run's sampler lock (${Math.round(ttl / 60)} min of TTL remained)`);
      await lockStore.releaseLock(lockKeyOf(net));
      if (!(await lockStore.acquireLock(lockKeyOf(net), 21600))) {
        console.error("lock takeover lost a race — try again shortly");
        process.exit(1);
      }
    } else {
      console.error("the sampler lock is held (a cron run or another rebuild is writing) — try again shortly (a killed rebuild's lock expires on its own within 6 h)");
      process.exit(1);
    }
  }
  try {

  const be0 = NETWORKS[net].be;

  // ---- crash-safe walk machinery (2026-09-11) — shared by --recompute-from and --extend-to.
  // See CRASH SAFETY in the header. The finality margin is deliberately a full spare day
  // beyond the frontier's own: page streams are only loosely ordered, and a bucket flushed
  // early would be OVERWRITTEN with a fragment by a later round, not merged.
  const store = writeStore();
  const CKPT_ROOT = join(process.cwd(), ".rebuild-trends-ckpt", net);
  const FLUSH_EVERY = 500_000; // records between flush+checkpoint rounds (user, 2026-09-11)
  const FLOOR_SERIES = new Set(["g.feeFloor", "g.kbFloor"]);
  type SerInc = [string, [string, number][]][];
  interface ChainCkpt { done?: boolean; cursor?: string; records?: number; minTs?: number; residualInc?: SerInc; residualStamps?: number[]; residualGlobals?: GlobalRec[]; floors?: SerInc }
  interface CkptMeta { mode: "recompute" | "extend"; fromMs: number; boundaryMs: number }
  const serInc = (m: IncMap): SerInc => [...m.entries()].map(([k, f]) => [k, [...f.entries()]]);
  const deserInc = (s?: SerInc): IncMap => new Map((s ?? []).map(([k, f]) => [k, new Map(f)]));
  const addInto = (dst: IncMap, key: string, field: string, v: number): void => {
    let m = dst.get(key);
    if (!m) { m = new Map(); dst.set(key, m); }
    m.set(field, (m.get(field) ?? 0) + v);
  };
  const ckptPath = (name: string): string => join(CKPT_ROOT, `${name}.json`);
  const readJson = <T,>(name: string): T | null => {
    try { return JSON.parse(readFileSync(ckptPath(name), "utf8")) as T; } catch { return null; }
  };
  const writeJson = (name: string, obj: unknown): void => {
    mkdirSync(CKPT_ROOT, { recursive: true });
    writeFileSync(ckptPath(name) + ".tmp", JSON.stringify(obj));
    renameSync(ckptPath(name) + ".tmp", ckptPath(name)); // atomic — a kill mid-write keeps the old file
  };
  const dayFloor = (ms: number): number => Math.floor(ms / 86400000) * 86400000;
  /** Bucket start of an IncMap entry, decoded from the key/field grammar (keys.ts). */
  const bucketStartOf = (key: string, field: string): number => {
    const parts = key.split(":");
    const tier = parts[2] as Tier;
    const slot = parts.slice(3).join(":");
    const b = field.slice(0, field.indexOf("|"));
    if (tier === "5m") return Date.parse(`${slot}T${b}:00Z`);
    if (tier === "1h") return Date.parse(`${slot}-${b.slice(0, 2)}T${b.slice(3)}:00:00Z`);
    return Date.parse(`${slot}-${b}T00:00:00Z`);
  };
  const seriesOf = (field: string): string => field.slice(field.indexOf("|") + 1);
  /** The finality cut for a frontier: only buckets two whole UTC days above the oldest
   *  record seen are complete-and-safe. Draining finalizes everything. */
  const cutOf = (minTs: number, drain: boolean): number =>
    drain ? -Infinity : minTs === Infinity ? Infinity : dayFloor(minTs) + 2 * 86400000;
  /** HSET every bucket at/above `cutMs` out of `cinc` (retaining the younger rest for the
   *  next round), diverting shared floor fields into `cfloors` when given. */
  const flushFinal = async (cinc: IncMap, cutMs: number, cfloors: IncMap | null): Promise<number> => {
    const fresh5m = TTL_S["5m"] == null ? "" : slotOf(net, "5m", Date.now() - TTL_S["5m"] * 1000).key;
    let written = 0;
    for (const [key, map] of cinc) {
      const tier = key.split(":")[2] as Tier;
      const expired5m = tier === "5m" && key < fresh5m; // finite-era guard; inert under keep-forever
      const out: [string, number][] = [];
      for (const [field, v] of map) {
        if (bucketStartOf(key, field) < cutMs) continue;
        map.delete(field);
        if (expired5m) continue;
        if (cfloors && FLOOR_SERIES.has(seriesOf(field))) { addInto(cfloors, key, field, v); continue; }
        out.push([field, v]);
      }
      if (map.size === 0) cinc.delete(key);
      for (let i = 0; i < out.length; i += 400) {
        await store.applyWrites([{ key, map: Object.fromEntries(out.slice(i, i + 400)), ttlS: TTL_S[tier] }]);
      }
      written += out.length;
    }
    return written;
  };
  /** Fresh runs refuse to trample an existing checkpoint; resumed runs must match it. A
   *  recompute resumed across UTC midnight needs --resume=force (finished chains stop at the
   *  old boundary) and a follow-up sweep for the seam. */
  const ensureCkptMeta = (mode: CkptMeta["mode"], fromMs: number, boundaryMs: number): void => {
    const existing = readJson<CkptMeta>("_meta");
    if (resume === "no") {
      if (existing) {
        console.error(`a checkpoint exists in ${CKPT_ROOT} — pass --resume to continue it, or delete that directory to start over`);
        process.exit(1);
      }
      writeJson("_meta", { mode, fromMs, boundaryMs } satisfies CkptMeta);
      return;
    }
    if (!existing || existing.mode !== mode || existing.fromMs !== fromMs) {
      console.error(`--resume: no matching checkpoint in ${CKPT_ROOT} (wanted ${mode} from ${new Date(fromMs).toISOString().slice(0, 10)})`);
      process.exit(1);
    }
    if (existing.boundaryMs !== boundaryMs) {
      const seam = new Date(existing.boundaryMs).toISOString().slice(0, 10);
      if (resume !== "force") {
        console.error(`--resume: UTC midnight passed since the checkpoint — finished chains stop at ${seam}. Pass --resume=force to continue (later chains reach further), then sweep the seam with --recompute-from=${seam}.`);
        process.exit(1);
      }
      console.log(`  resuming across a day boundary — remember the follow-up sweep: --recompute-from=${seam}`);
    }
  };
  /** Day-chunk every buffered global at/above the cut through bucketGlobals (ascending, the
   *  gap chain threaded from the newest record below the cut — exactly the one-shot path's
   *  prevTs discipline) and return the residue. */
  const finalizeGlobals = (buf: GlobalRec[], cutMs: number, cinc: IncMap): GlobalRec[] => {
    buf.sort((a, b) => a.ordinal - b.ordinal);
    let split = buf.length;
    while (split > 0 && Date.parse(buf[split - 1].timestamp) >= cutMs) split--;
    const final = buf.slice(split);
    const residual = buf.slice(0, split);
    if (final.length) {
      let prevTs = residual.length ? Date.parse(residual[residual.length - 1].timestamp) : null;
      let dayStart = 0;
      for (let i = 1; i <= final.length; i++) {
        const boundary = i === final.length ||
          new Date(Date.parse(final[i].timestamp)).getUTCDate() !== new Date(Date.parse(final[dayStart].timestamp)).getUTCDate();
        if (!boundary) continue;
        const chunk = final.slice(dayStart, i);
        bucketGlobals(cinc, net, chunk, prevTs);
        prevTs = Date.parse(chunk[chunk.length - 1].timestamp);
        dayStart = i;
      }
    }
    return residual;
  };
  /** Crash-safe global-chain walk: buffer records, finalize whole days behind the frontier,
   *  flush, checkpoint the cursor. `upperMs` is exclusive (today for recompute, the boundary
   *  day's end for extend). */
  const walkGlobalCkpt = async (floorMs: number, upperMs: number, seedCursor?: string): Promise<void> => {
    const prev = resume !== "no" ? readJson<ChainCkpt>("global") : null;
    if (prev?.done) { console.log("  global: complete in the checkpoint — skipped"); return; }
    const cinc = deserInc(prev?.residualInc);
    let buf: GlobalRec[] = prev?.residualGlobals ?? [];
    let minTs = prev?.minTs ?? Infinity;
    let processed = prev?.records ?? 0;
    let sinceFlush = 0;
    const round = async (cursor: string | undefined, drain: boolean): Promise<void> => {
      const cut = cutOf(minTs, drain);
      buf = finalizeGlobals(buf, cut, cinc);
      const n = await flushFinal(cinc, cut, null);
      writeJson("global", drain
        ? { done: true, records: processed } satisfies ChainCkpt
        : { cursor, records: processed, minTs, residualInc: serInc(cinc), residualGlobals: buf } satisfies ChainCkpt);
      console.log(`\n  global: ${drain ? "done" : "checkpoint"} at ${processed} records — ${n} fields flushed`);
    };
    await walkChain<GlobalRec & { timestamp: string }>(`${be0}/global-snapshots`, floorMs, (recs) => {
      for (const r of recs) {
        const t = Date.parse(r.timestamp);
        if (t >= upperMs) continue;
        buf.push({ ordinal: r.ordinal, timestamp: r.timestamp, metagraphSnapshotCount: r.metagraphSnapshotCount, blocks: r.blocks });
        if (t < minTs) minTs = t;
        processed++;
        sinceFlush++;
      }
    }, "global", prev?.cursor ?? seedCursor, async (cursor) => {
      if (sinceFlush >= FLUSH_EVERY) { sinceFlush = 0; await round(cursor, false); }
    });
    await round(undefined, true);
  };
  /** Crash-safe metagraph-chain walk: bucket per page, fold the gaps that are final, flush,
   *  divert floors, checkpoint. Skips itself when the checkpoint says done. */
  const walkMetaCkpt = async (id: string, floorMs: number, upperMs: number, seedCursor?: string): Promise<void> => {
    const label = id.slice(0, 10);
    const prev = resume !== "no" ? readJson<ChainCkpt>(label) : null;
    if (prev?.done) { console.log(`  ${label}: complete in the checkpoint — skipped`); return; }
    const cinc = deserInc(prev?.residualInc);
    const cfloors = deserInc(prev?.floors);
    let stamps: number[] = prev?.residualStamps ?? [];
    let minTs = prev?.minTs ?? Infinity;
    let processed = prev?.records ?? 0;
    let sinceFlush = 0;
    const round = async (cursor: string | undefined, drain: boolean): Promise<void> => {
      const cut = cutOf(minTs, drain);
      stamps.sort((a, b) => a - b);
      const keep: number[] = [];
      for (let i = 0; i < stamps.length; i++) {
        // A gap belongs to the NEWER record of its pair, and every older partner is already
        // collected (the walk descends) — so gaps at/above the cut are final. The span's
        // oldest record opens the chain: no invented gap (i > 0), same as the one-shot path.
        if (i > 0 && stamps[i] >= cut) addIncGap(cinc, net, stamps[i], id, Math.max(0, Math.round((stamps[i] - stamps[i - 1]) / 1000)));
        if (stamps[i] < cut) keep.push(stamps[i]);
      }
      stamps = keep;
      const n = await flushFinal(cinc, cut, cfloors);
      writeJson(label, drain
        ? { done: true, records: processed, floors: serInc(cfloors) } satisfies ChainCkpt
        : { cursor, records: processed, minTs, residualInc: serInc(cinc), residualStamps: stamps, floors: serInc(cfloors) } satisfies ChainCkpt);
      console.log(`\n  ${label}: ${drain ? "done" : "checkpoint"} at ${processed} records — ${n} fields flushed`);
    };
    await walkChain<MetaRec & { timestamp: string }>(`${be0}/currency/${id}/snapshots`, floorMs, (recs) => {
      const w = recs.filter((r) => Date.parse(r.timestamp) < upperMs);
      for (const r of w) {
        const t = Date.parse(r.timestamp);
        stamps.push(t);
        if (t < minTs) minTs = t;
      }
      bucketMetas(cinc, net, id, w.map((r) => ({ ordinal: r.ordinal, timestamp: r.timestamp, fee: r.fee, sizeInKB: r.sizeInKB, blocks: r.blocks })));
      processed += w.length;
      sinceFlush += w.length;
    }, label, prev?.cursor ?? seedCursor, async (cursor) => {
      if (sinceFlush >= FLUSH_EVERY) { sinceFlush = 0; await round(cursor, false); }
    });
    await round(undefined, true);
  };
  /** Merge every chain's diverted floor contributions and write them — meaningful only once
   *  ALL chains are done (each adds into the same shared fields), which is why this runs
   *  last and why the checkpoint directory is cleared only here. */
  const writeFloorsAndFinish = async (ids: string[]): Promise<void> => {
    const floors: IncMap = new Map();
    for (const id of ids) {
      for (const [key, fields] of readJson<ChainCkpt>(id.slice(0, 10))?.floors ?? []) {
        for (const [f, v] of fields) addInto(floors, key, f, v);
      }
    }
    const n = await flushFinal(floors, -Infinity, null);
    rmSync(CKPT_ROOT, { recursive: true, force: true });
    console.log(`  floors: ${n} shared fee/size fields written (every chain folded in); checkpoint cleared.`);
  };

  // ---- GAPS BACKFILL mode: per-network continuity history (see the header) ----
  // ---- BLOCKS BACKFILL: per-network sealed-block counts from the chain's own records ----
  // (2026-09-11 — m.{id}.blocks joined bucketMetas for the cron; history needs this walk
  // once, or every covered old bucket would read "measured zero blocks", a fabrication.)
  if (blocksFromMs != null) {
    const todayStartMs = Math.floor(Date.now() / 86400000) * 86400000;
    console.log(`backfilling per-network block counts ${new Date(blocksFromMs).toISOString().slice(0, 10)} → yesterday …`);
    const tierOf = (key: string): Tier => key.split(":")[2] as Tier;
    let fields = 0;
    for (const id of CATALOG[net].map((m) => m.id).filter((v): v is string => !!v)) {
      // Timestamps + block counts only — one field is all this mode may write. Each chain
      // writes as soon as its walk ends (complete-day HSETs are idempotent), the gaps
      // walk's crash rule.
      const inc: IncMap = new Map();
      await walkChain<{ timestamp: string; blocks?: unknown[] }>(`${NETWORKS[net].be}/currency/${id}/snapshots`, blocksFromMs, (recs) => {
        for (const r of recs) {
          const t = Date.parse(r.timestamp);
          if (!(t < todayStartMs)) continue;
          // Whole days only, and each tier only past its own birthdate (TIER_SINCE): the
          // daily tier carries the deep history; fine grain is never invented backward.
          const tiers: Tier[] = ["1d"];
          if (t >= TIER_SINCE["1h"]) tiers.push("1h");
          if (t >= TIER_SINCE["5m"]) tiers.push("5m");
          addInc(inc, net, t, `m.${id}.blocks`, Array.isArray(r.blocks) ? r.blocks.length : 0, tiers);
        }
      }, id.slice(0, 10));
      for (const [key, map] of inc) {
        const entries = [...map.entries()];
        for (let i = 0; i < entries.length; i += 400) {
          await store.applyWrites([{ key, map: Object.fromEntries(entries.slice(i, i + 400)), ttlS: TTL_S[tierOf(key)] }]);
        }
        fields += entries.length;
      }
    }
    console.log(`  ${fields} block fields; every other field and the cursor untouched.`);
    return;
  }

  if (gapsFromMs != null) {
    const todayStartMs = Math.floor(Date.now() / 86400000) * 86400000;
    console.log(`backfilling per-network gap stats ${new Date(gapsFromMs).toISOString().slice(0, 10)} → yesterday …`);
    const tierOf = (key: string): Tier => key.split(":")[2] as Tier;
    // A null TTL means the tier keeps forever — the empty-string floor sorts below every key,
      // so nothing is skipped (2026-09-10, the keep-forever flip).
      const fresh5m = TTL_S["5m"] == null ? "" : slotOf(net, "5m", Date.now() - TTL_S["5m"] * 1000).key;
    let fields = 0;
    for (const id of CATALOG[net].map((m) => m.id).filter((v): v is string => !!v)) {
      // Timestamps only — the walk's records are otherwise discarded, and the two gap
      // fields are the only thing this mode may write. Each chain WRITES as soon as its
      // walk ends (complete-day HSET recomputations are idempotent), so a crash mid-run
      // loses one chain's walk, not the whole night's (learned at 83% of DOR, 2026-09-08).
      const stamps: number[] = [];
      await walkChain<{ timestamp: string }>(`${NETWORKS[net].be}/currency/${id}/snapshots`, gapsFromMs, (recs) => {
        for (const r of recs) {
          const t = Date.parse(r.timestamp);
          if (t < todayStartMs) stamps.push(t);
        }
      }, id.slice(0, 10));
      stamps.sort((a, b) => a - b);
      const inc: IncMap = new Map();
      for (let i = 1; i < stamps.length; i++) {
        const gap = Math.max(0, Math.round((stamps[i] - stamps[i - 1]) / 1000));
        addIncGap(inc, net, stamps[i], id, gap);
      }
      for (const [key, map] of inc) {
        const tier = tierOf(key);
        if (tier === "5m" && key < fresh5m) continue;
        const entries = [...map.entries()];
        for (let i = 0; i < entries.length; i += 400) {
          await store.applyWrites([{ key, map: Object.fromEntries(entries.slice(i, i + 400)), ttlS: TTL_S[tier] }]);
        }
        fields += entries.length;
      }
    }
    console.log(`  ${fields} gap fields; every other field and the cursor untouched.`);
    return;
  }

  // ---- RECOMPUTE mode: repair recent days whole, crash-safely (see the header) ----
  if (recomputeFromMs != null) {
    const todayStartMs = dayFloor(Date.now());
    if (recomputeFromMs >= todayStartMs) { console.error("recompute-from must be before today (UTC)"); process.exit(1); }
    ensureCkptMeta("recompute", recomputeFromMs, todayStartMs);
    console.log(`recomputing ${new Date(recomputeFromMs).toISOString().slice(0, 10)} → yesterday, whole days, from the tip (all tiers; flush + checkpoint every ${FLUSH_EVERY / 1000}K records${resume !== "no" ? "; resuming" : ""}) …`);
    await walkGlobalCkpt(recomputeFromMs, todayStartMs);
    const ids = CATALOG[net].map((m) => m.id).filter((v): v is string => !!v);
    for (const id of ids) await walkMetaCkpt(id, recomputeFromMs, todayStartMs);
    await writeFloorsAndFinish(ids);
    console.log("  every affected tier repaired; cursor untouched.");
    return;
  }

  // ---- EXTEND mode: backward-only, wipeless, crash-safe (see the header) ----
  if (extendToMs != null) {
    // The store's oldest covered day is the overwrite boundary, derived ONCE and pinned in
    // the checkpoint. The global spine flushes progressively and walks LAST, precisely so
    // the store's g.ticks frontier (which IS this boundary detector, and what /trends'
    // leading trim reveals) only ever advances over days every metagraph already covers —
    // history appears complete or not at all. A resumed run must therefore trust the pin,
    // never a re-scan of a store the previous attempt already extended.
    let d1StartMs: number;
    if (resume !== "no") {
      const m = readJson<CkptMeta>("_meta");
      if (!m || m.mode !== "extend" || m.fromMs !== extendToMs) {
        console.error(`--resume: no matching extend checkpoint in ${CKPT_ROOT}`);
        process.exit(1);
      }
      d1StartMs = m.boundaryMs;
      console.log(`resuming the extension to ${new Date(extendToMs).toISOString().slice(0, 10)} (boundary pinned at ${new Date(d1StartMs).toISOString().slice(0, 10)})`);
    } else {
      // Scanned across every year hash from the extend target to now — an extension may
      // cross year boundaries.
      let oldest: { year: number; d: string } | null = null;
      for (let y = new Date(extendToMs).getUTCFullYear(); y <= new Date().getUTCFullYear(); y++) {
        const dayHash = (await redis.hgetall<Record<string, string>>(`t:${net}:1d:${y}`)) ?? {};
        const covered = Object.keys(dayHash).filter((f) => f.endsWith("|g.ticks")).map((f) => f.slice(0, 5)).sort();
        if (covered.length) { oldest = { year: y, d: covered[0] }; break; }
      }
      if (!oldest) {
        console.error("extend: no covered days found in the daily tier — extending needs existing history (run a plain --days rebuild first, or check --net)");
        process.exit(1);
      }
      d1StartMs = Date.UTC(oldest.year, +oldest.d.slice(0, 2) - 1, +oldest.d.slice(3)) + 86400000;
      if (extendToMs >= d1StartMs) {
        console.error(`extend: the store already reaches ${oldest.year}-${oldest.d} — nothing to extend to ${new Date(extendToMs).toISOString().slice(0, 10)}`);
        process.exit(1);
      }
      ensureCkptMeta("extend", extendToMs, d1StartMs);
      console.log(`extending ${new Date(extendToMs).toISOString().slice(0, 10)} → ${oldest.year}-${oldest.d} (boundary day recomputed whole; all tiers; metagraphs first, the global spine last; flush + checkpoint every ${FLUSH_EVERY / 1000}K records)`);
    }

    await probeCursorShape(`${be0}/global-snapshots`, "created_at,ordinal");
    const anyMeta = CATALOG[net].find((m) => m.id)?.id;
    if (anyMeta) await probeCursorShape(`${be0}/currency/${anyMeta}/snapshots`, "hash");
    const cur = (await redis.hgetall<Record<string, string>>(cursorKeyOf(net))) ?? {};

    // Metagraphs: per-chain seek + crash-safe walk. A chain born after the boundary skips
    // (recorded done, so a resume never re-seeks it). Crafted cursors land ON their record —
    // walkMetaCkpt's upper filter keeps only what is strictly before the boundary.
    const ids = CATALOG[net].map((id0) => id0.id).filter((id0): id0 is string => !!id0);
    for (const id of ids) {
      const label = id.slice(0, 10);
      const prev = resume !== "no" ? readJson<ChainCkpt>(label) : null;
      if (prev?.done) { console.log(`  ${label}: complete in the checkpoint — skipped`); continue; }
      let seed: string | undefined;
      if (!prev?.cursor) {
        const tip = Number(cur[`m.${id}`] ?? 0);
        if (!tip) { console.log(`  ${label}: no cursor — skipped (chain unseen by the store)`); writeJson(label, { done: true } satisfies ChainCkpt); continue; }
        const bnd = await seekBoundary(
          // No catch: getPage already retried — a persistent probe failure ABORTS the run
          // instead of reading as "born at the boundary".
          async (o) => ((await getPage<never>(`${be0}/currency/${id}/snapshots/${o}`)) as unknown as { data?: { ordinal: number; timestamp: string; hash?: string } }).data ?? null,
          tip,
          d1StartMs,
        );
        if (!bnd) { console.log(`  ${label}: born at/after the boundary — nothing older`); writeJson(label, { done: true } satisfies ChainCkpt); continue; }
        if (!bnd.hash) { console.error(`  ${label}: boundary record has no hash — cannot seek`); process.exit(1); }
        seed = craftCurrencyCursor(bnd.hash);
      }
      await walkMetaCkpt(id, extendToMs, d1StartMs, seed);
    }

    // The global spine, LAST (see above). A resume rides its saved cursor; only a fresh
    // start seeks the boundary.
    const prevG = resume !== "no" ? readJson<ChainCkpt>("global") : null;
    let seedG: string | undefined;
    if (!prevG?.done && !prevG?.cursor) {
      const gBoundary = await seekBoundary(
        async (o) => ((await getPage<never>(`${be0}/global-snapshots/${o}`)) as unknown as { data?: { ordinal: number; timestamp: string } }).data ?? null,
        Number(cur.g ?? 0) || 1,
        d1StartMs,
      );
      if (!gBoundary) { console.error("extend: could not seek the global boundary"); process.exit(1); }
      seedG = craftGlobalCursor(gBoundary.timestamp, gBoundary.ordinal);
    }
    await walkGlobalCkpt(extendToMs, d1StartMs, seedG);
    await writeFloorsAndFinish(ids);
    console.log("  extension complete; cursor untouched — the cron never noticed.");
    return;
  }

  // ---- wipe: SCAN t:{net}:* and delete — the rebuild contract's first half ----
  console.log(`wiping t:${net}:* …`);
  let cursor = "0";
  let wiped = 0;
  do {
    const [c, keys] = await redis.scan(cursor, { match: `t:${net}:*`, count: 200 });
    cursor = String(c);
    const doomed = (keys as string[]).filter((k) => k !== lockKeyOf(net)); // never the lock we hold
    if (doomed.length) {
      await redis.del(...doomed);
      wiped += doomed.length;
    }
  } while (cursor !== "0");
  console.log(`  wiped ${wiped} keys`);
  if (wipeOnly) return;

  const be = NETWORKS[net].be;
  const now = Date.now();
  // Snapped DOWN to UTC midnight: the oldest rebuilt day is then COMPLETE, so the /trends
  // page never has to hide it as a partial (review find — the old mid-day cutoff left a
  // half-day first bucket forever).
  const cutoffMs = Math.floor((now - days * 86400000) / 86400000) * 86400000;
  const fresh5mFloor = TTL_S["5m"] == null ? -Infinity : now - TTL_S["5m"] * 1000; // 5m prune floor; -Infinity = keep-forever (2026-09-10)

  const inc: IncMap = new Map();
  const tierOfKey = (key: string): Tier => key.split(":")[2] as Tier;
  /** Drop 5m-tier keys whose whole UTC day predates the 48 h retention window. */
  const prune5m = () => {
    const keep = slotOf(net, "5m", fresh5mFloor).key;
    for (const key of [...inc.keys()]) {
      if (tierOfKey(key) === "5m" && key < keep) inc.delete(key);
    }
  };

  // ---- globals: buffer (a 90-day mainnet chain is ~280 K tiny records), day-chunk, gap-chain ----
  console.log(`backfilling ${days} days from ${be} …`);
  const globals: GlobalRec[] = [];
  await walkChain<GlobalRec & { timestamp: string }>(`${be}/global-snapshots`, cutoffMs, (recs) => {
    for (const r of recs) globals.push({ ordinal: r.ordinal, timestamp: r.timestamp, metagraphSnapshotCount: r.metagraphSnapshotCount, blocks: r.blocks });
  }, "global");
  globals.sort((a, b) => a.ordinal - b.ordinal);
  let dayStart = 0;
  let prevTs: number | null = null;
  for (let i = 1; i <= globals.length; i++) {
    const boundary = i === globals.length ||
      new Date(Date.parse(globals[i].timestamp)).getUTCDate() !== new Date(Date.parse(globals[dayStart].timestamp)).getUTCDate();
    if (!boundary) continue;
    const chunk = globals.slice(dayStart, i);
    bucketGlobals(inc, net, chunk, prevTs);
    prevTs = Date.parse(chunk[chunk.length - 1].timestamp);
    dayStart = i;
    prune5m();
  }

  // ---- metagraphs: stream pages straight into the IncMap (bounded — records aren't retained) ----
  const metaIds = CATALOG[net].map((m) => m.id).filter((id): id is string => !!id);
  const newestMetaOrd: Record<string, number> = {};
  const POOL = 3; // polite: a few chains at a time
  for (let i = 0; i < metaIds.length; i += POOL) {
    await Promise.all(metaIds.slice(i, i + POOL).map(async (id) => {
      await walkChain<MetaRec & { timestamp: string; lastSnapshotHash?: string }>(
        `${be}/currency/${id}/snapshots`, cutoffMs, (recs) => {
          if (!(id in newestMetaOrd)) newestMetaOrd[id] = recs[0].ordinal; // first page is the newest
          bucketMetas(inc, net, id, recs.map((r) => ({ ordinal: r.ordinal, timestamp: r.timestamp, fee: r.fee, sizeInKB: r.sizeInKB, blocks: r.blocks })));
        }, id.slice(0, 10));
      // A DORMANT chain (nothing inside the window) still gets a cursor — parked at its TIP,
      // or the cron's cold cursor would page its ancient records into pre-window buckets as
      // unlabeled partials (review find). An entirely empty chain stays unset.
      if (!(id in newestMetaOrd)) {
        const tipPage = await getPage<{ ordinal: number }>(`${be}/currency/${id}/snapshots?limit=1`);
        const tip = tipPage.data?.[0]?.ordinal;
        if (tip != null) newestMetaOrd[id] = tip;
      }
    }));
    prune5m();
  }

  // ---- write: chunked applyWrites transactions + the cursor the cron resumes from ----
  console.log("writing …");
  const CHUNK = 400; // fields per HSET slice — keeps each txn's payload modest
  let fields = 0;
  for (const [key, map] of inc) {
    const entries = [...map.entries()];
    const ttlS = TTL_S[tierOfKey(key)];
    for (let i = 0; i < entries.length; i += CHUNK) {
      await store.applyWrites([{ key, map: Object.fromEntries(entries.slice(i, i + CHUNK)), ttlS }]);
    }
    fields += entries.length;
  }
  const newestG = globals[globals.length - 1];
  const cursorMap: Record<string, string | number> = { v: 1 };
  if (newestG) { cursorMap.g = newestG.ordinal; cursorMap.gTs = Date.parse(newestG.timestamp); }
  for (const [id, ord] of Object.entries(newestMetaOrd)) cursorMap[`m.${id}`] = ord;
  await store.applyWrites([{ key: cursorKeyOf(net), map: cursorMap, ttlS: null }]);
  console.log(`  ${fields} fields across ${inc.size} keys; cursor g=${newestG?.ordinal ?? "—"} (+${Object.keys(newestMetaOrd).length} metagraph cursors)`);
  console.log("done — the 15-min cron resumes from here.");

  } finally {
    await lockStore.releaseLock(lockKeyOf(net));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
