// THE TRENDS FILL — the manual tool that completes the measured history (`/api/trends`) from the
// explorer's own records. Three commands, one of them the everyday one:
//
//   npx tsx scripts/rebuild-trends.ts --net=mainnet fill --from=2023-11-13
//   npx tsx scripts/rebuild-trends.ts --net=mainnet fill --from=2026-09-01 --to=2026-09-10 --recompute
//   npx tsx scripts/rebuild-trends.ts --net=mainnet fill --from=2026-09-01 --to=2026-09-10 --recompute --chain=DAG0CyySf3
//   npx tsx scripts/rebuild-trends.ts --net=mainnet fill --from=2023-11-13 --dry-run
//   npx tsx scripts/rebuild-trends.ts --net=mainnet rebuild --days=90     # wipe + rebuild, asks first
//   npx tsx scripts/rebuild-trends.ts --net=mainnet wipe                  # asks first
//
// `fill` MAKES A SPAN OF UTC DAYS COMPLETE — every series a day has, from the chains' complete
// records, in ONE WALK (user, 2026-10-30: "I just want one walk from now on … fill buckets,
// resilient, and with the ability to make data fixes or partial reloads if needed but not as the
// default"). The design is docs/superpowers/specs/2026-10-30-trends-fill-design.md; the pure
// decisions (commands and the redirects for every flag this replaced, the span's rules, the
// cursor pre-flight, the tier floor) are app/api/trends/fillPlan.ts, tested.
//
//   · Without --recompute it is an EXTENSION: --to is derived — the store's oldest covered day
//     (the first day holding g.ticks in the daily tier), partially covered, recomputed whole —
//     and --from must be older. Everything older than that day is a disjoint record set, so no
//     double count is possible (user, 2026-09-07: "without removing/duplicating data").
//   · With --recompute both ends are given, --to at most yesterday, and every day in the span
//     is rewritten whole from the records: the DATA FIX and the PARTIAL RELOAD (2026-09-07, found
//     live: a sampler catch-up past the pager's cap accepts a gap, and the day then carries a
//     measured-looking floor that reads as a crash). --chain=<prefix> narrows it to ONE chain's
//     own m.<id>.* fields: the floors (every chain's sum), the global spine and u.cov are then
//     left alone, and the summary says so.
//   · WHAT ONE WALK WRITES for every day of the span: each catalog chain's m.<id>.snaps/fee/kb/
//     blocks/gapSum/gapMax/ticks; each UNLISTED chain's the same, outside the floors (one walk —
//     the separate --backfill-unlisted that used to follow an extension was forgotten twice);
//     the global spine's g.ticks/anchors/blocks/gapSum/gapMax; the floors g.feeFloor/g.kbFloor,
//     every catalog chain folded; and u.cov on every bucket of the span — ONLY when every unlisted
//     chain in the pinned list was walked, else suppressed for the span and said. Never: f.*
//     (the FLEET family has no historical record anywhere upstream; node counts, layers, make-ups,
//     countries and providers begin the day their sampler shipped), today's buckets, any cron
//     cursor, the lock.
//   · NO SAMPLER LOCK, EVER. Nothing a fill writes is a field the cron still writes — provided the
//     cron is past the span. The cron adds only records newer than its cursors, so a recompute
//     collides with it only while a cursor's timestamp (gTs, mTs.<id>) is still inside the span:
//     shortly after UTC midnight, or during a catch-up after an outage. The fill checks the
//     cursors BEFORE it starts and refuses while any is inside (`cursorsInsideSpan`), naming the
//     cursor, instead of holding a lock that pauses production for the whole run (the 6-hour lock
//     of the old walks paused sampling twice in one day, 2026-10-26, and the FLEET gauges, read
//     live only, lost those hours for good).
//   · THE SPAN'S OLDEST EDGE KEEPS ITS GAP: a recompute reads one record older than --from on
//     every chain and on the spine and threads the gap chain from it, so day --from keeps its
//     cross-midnight gap. An extension's edge is a chain's genesis: no predecessor, no invented gap.
//   · FINE GRAIN IS NEVER INVENTED BACKWARD: hourly and 5m fields exist for days ≥ TIER_SINCE
//     (2025-07-01), pruned in one place (`flushFinal`, `tierExistsAt`); older days are daily alone.
//
// CRASH SAFETY (2026-09-11 — an overnight recompute died at hour 13 with every write still queued
// behind the last chain; nothing landed): each chain is walked newest→oldest from a crafted
// explorer cursor at the span's newest day (`seekBoundary`), bucketed per page, its FINALIZED
// buckets flushed as the walk passes them and the cursor plus the still-filling frontier
// checkpointed to .rebuild-trends-ckpt/{net}/ every 500K records. A bucket is final once the
// frontier sits two whole UTC days below it — only complete buckets ever reach the store (a
// partial sum would read as a crash, rule 10); the frontier rides the checkpoint, never the store.
// The two shared floor series (bucketMetas adds EVERY chain's fee into the same field, so no single
// chain may HSET them) divert into the checkpoints and are written once, after the last chain; the
// global spine walks LAST, so the coverage frontier (g.ticks, what /trends' leading trim reveals)
// only advances over days every chain already holds — history appears complete or not at all.
// A KILLED FILL RESUMES BY ITSELF: a start that finds a checkpoint for the same span continues it
// (finished chains skip, the in-flight chain rides its saved cursor), a checkpoint for another
// span refuses and names --fresh, which discards it. The span and the unlisted chain list are
// PINNED in the checkpoint at the start and never re-derived: the pin wins over a store the
// previous attempt already advanced. Every page read and every store write RIDES OUT A BLIP
// (`retrying`, ~15 min of backoff — 2026-10-29: two walks of 50 minutes died in a write phase on
// a Wi-Fi drop the pager would have survived).
//
// `rebuild --days=N` is the DISASTER PATH and the bootstrap of an EMPTY store (a fill needs
// existing history to find its boundary): it takes the sampler lock, wipes t:{net}:* (never the
// lock it holds), rebuilds N ≤ 400 days through today, sets the cron cursors to the newest
// ordinals and marks unlisted coverage; the 15-min cron resumes from those cursors. The store's
// write path is merge-based (add-series accumulate), so a rebuild over existing data would
// double-count — wipe-and-rebuild is its only honest contract. `wipe` is the wipe alone. Both ask
// before deleting (--yes answers; a non-interactive run without it refuses).
//
// HONESTY (rule 10): everything written here is a REAL record read from the explorer's indexer,
// through the SAME bucketing/merge modules the live sampler uses (bucketing.ts, merge.ts), so a
// fill and the live writes cannot disagree.
//
// Mechanics worth knowing:
//  - The explorer pages by an opaque `meta.next` cursor (probed live 2026-09-06 — `?limit=&next=`
//    walks newest→oldest; `offset` is silently ignored). ~330 B/record, 600/page.
//  - Global records are day-chunked through bucketGlobals so the gap chain threads across chunks.
//  - A few chains walk at a time (FILL_POOL); the spine walks alone, last.
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

import { cursorsInsideSpan, FILL_POOL, parseCommand, resolveChain, tierExistsAt, UsageError, type Parsed } from "../app/api/trends/fillPlan";


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
/** RIDE OUT A BLIP. Backoff reaches ~15 min cumulative (21 attempts, waits capped at 30s): a
 *  multi-hour walk must survive a transient DNS or network blip (one killed a 3-hour gaps walk
 *  at 83%, 2026-09-08 — EAI_AGAIN) AND a short explorer outage (2026-10-26: 20s timeouts past
 *  the old ~1.5-min budget killed a 2025-07-01 gaps walk seven hours in). ONE helper for the
 *  explorer pages AND the store's writes (2026-10-29: two unlisted backfills walked every chain
 *  for 50 minutes, then died in their write phase on a Wi-Fi drop — the pager retried, the
 *  writes did not). HSET/EXPIRE set the fields they name, so a retried write is the same write. */
async function retrying<T>(op: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (e) {
      if (attempt >= 20) throw e;
      await new Promise((res) => setTimeout(res, Math.min(30000, 1000 * 2 ** attempt)));
    }
  }
}

async function getPage<T>(url: string): Promise<Page<T>> {
  return retrying(async () => {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${r.status}`);
    return (await r.json()) as Page<T>;
  });
}

/** Walk a chain newest→oldest until `cutoffMs`, streaming each page (newest-first) to `onPage`,
 *  with the page's records OLDER than the cutoff as `older` (newest-first; non-empty only on the
 *  last page — the span's predecessors, which open its gap chain). `onPageEnd` (checkpointing)
 *  sees the NEXT page's cursor after each processed page — saving it and later resuming from it
 *  re-enters the walk exactly where it left off (server-issued tokens are exclusive). */
async function walkChain<T extends { timestamp: string }>(
  base: string,
  cutoffMs: number,
  onPage: (recs: T[], older: T[]) => void,
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
    const all = page.data ?? [];
    const recs = all.filter((r) => Date.parse(r.timestamp) >= cutoffMs);
    const older = all.filter((r) => Date.parse(r.timestamp) < cutoffMs);
    total += recs.length;
    if (recs.length || older.length) onPage(recs, older);
    pages++;
    if (pages % 25 === 0) process.stdout.write(`\r  ${label}: ${total} records (${pages} pages)…`);
    const nextCursor = page.meta?.next;
    const done = !nextCursor || (page.data ?? []).length === 0 || recs.length < (page.data ?? []).length;
    if (done) break;
    next = nextCursor;
    if (onPageEnd) await onPageEnd(next);
  }
  process.stdout.write(`\r  ${label}: ${total} records (${pages} pages)\n`);
  return total;
}

class Abort extends Error {}

async function main(): Promise<void> {
  loadEnvLocal();
  let parsed: Parsed;
  try {
    parsed = parseCommand(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) { console.error(e.message); process.exit(1); }
    throw e;
  }
  const { net, command } = parsed;

  // Deferred imports: store.ts reads env at construction, so env must be loaded first.
  const { Redis } = await import("@upstash/redis");
  const { NETWORKS, CATALOG } = await import("../src/engine/config");
  // Every address the catalog has EVER tracked — a re-registered network's retired chain keeps its
  // days in the store, so a fill must walk it too (`src/net/lineage.ts`).
  const { lineageIds, untrackedIds } = await import("../src/net/lineage");
  const { fetchChainIds } = await import("../app/api/network/chainList");
  const { TTL_S, slotOf, cursorKeyOf, lockKeyOf } = await import("../app/api/trends/keys");
  const { TIER_SINCE } = await import("../src/data/trendWindow");
  const { bucketGlobals, bucketMetas, addInc, markUnlistedCoverage } = await import("../app/api/trends/bucketing");
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

  // ⚠️ THE PRODUCTION CRON IS A CONCURRENT WRITER (review find, 2026-09-07). A REBUILD takes the
  // sampler's own lock for its whole run (cron runs skip meanwhile and self-heal after), and its
  // wipe must never delete the lock key it is standing on. A FILL takes NO lock (header): its
  // writes are disjoint from the cron's by construction, and the cursor pre-flight below refuses
  // the one case where they would not be.
  const lockStore = writeStore();
  const holdsLock = command.kind !== "fill";
  if (holdsLock && !(await lockStore.acquireLock(lockKeyOf(net), 21600))) {
    console.error("the sampler lock is held (a cron run or another rebuild is writing) — try again shortly (a killed rebuild's lock expires on its own within 6 h)");
    process.exit(1);
  }
  // ⚠️ AN INTERRUPTED RUN RELEASES THE LOCK (2026-10-08 — a run killed by a shell timeout left its
  // 6-hour lock standing, and the production cron skipped every run until it was released by hand).
  // `finally` does not run on a signal, so SIGINT/SIGTERM release it explicitly before exiting. Only
  // a REBUILD-CLASS lock is released (TTL > 900 s): a cron run's lives ≤ 900 s and is never stomped.
  let releasing = false;
  const releaseOnSignal = (sig: string, code: number) => {
    if (releasing) return;
    releasing = true;
    console.error(`\n${sig}: releasing the sampler lock before exit …`);
    const release = redis.ttl(lockKeyOf(net)).then((ttl) => (ttl > 900 ? lockStore.releaseLock(lockKeyOf(net)) : undefined));
    Promise.race([release, new Promise((r) => setTimeout(r, 5000))]).finally(() => process.exit(code));
  };
  if (holdsLock) {
    process.once("SIGINT", () => releaseOnSignal("SIGINT", 130));
    process.once("SIGTERM", () => releaseOnSignal("SIGTERM", 143));
    process.once("SIGHUP", () => releaseOnSignal("SIGHUP", 129));
  }
  try {

  const be0 = NETWORKS[net].be;

  // ---- crash-safe walk machinery (2026-09-11) — the fill's walk, per chain and for the spine.
  // See CRASH SAFETY in the header. The finality margin is deliberately a full spare day
  // beyond the frontier's own: page streams are only loosely ordered, and a bucket flushed
  // early would be OVERWRITTEN with a fragment by a later round, not merged.
  // Every write of the walks retries like the pager (`retrying`): a blip in a write phase that
  // runs for half an hour must not cost the walk before it.
  const rawStore = writeStore();
  const store = { ...rawStore, applyWrites: (w: Parameters<typeof rawStore.applyWrites>[0]) => retrying(() => rawStore.applyWrites(w)) };
  const CKPT_ROOT = join(process.cwd(), ".rebuild-trends-ckpt", net);
  const FLUSH_EVERY = 500_000; // records between flush+checkpoint rounds (user, 2026-09-11)
  const FLOOR_SERIES = new Set(["g.feeFloor", "g.kbFloor"]);
  type SerInc = [string, [string, number][]][];
  interface ChainCkpt { done?: boolean; cursor?: string; records?: number; minTs?: number; residualInc?: SerInc; residualStamps?: number[]; residualGlobals?: GlobalRec[]; floors?: SerInc }
  /** The fill's pin: its span, its mode and the unlisted chains it read at the start. */
  interface FillMeta { mode: "fill"; fromMs: number; toMs: number; recompute: boolean; chain: string | null; unlisted: string[] }
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
        const start = bucketStartOf(key, field);
        if (start < cutMs) continue;
        map.delete(field);
        if (expired5m) continue;
        if (!tierExistsAt(tier, start)) continue; // fine grain is never invented backward (header)
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
  /** Day-chunk every buffered global at/above the cut through bucketGlobals (ascending, the
   *  gap chain threaded from the newest record below the cut — exactly the one-shot path's
   *  prevTs discipline) and return the residue. */
  const finalizeGlobals = (buf: GlobalRec[], cutMs: number, cinc: IncMap, pred: number | null): GlobalRec[] => {
    buf.sort((a, b) => a.ordinal - b.ordinal);
    let split = buf.length;
    while (split > 0 && Date.parse(buf[split - 1].timestamp) >= cutMs) split--;
    const final = buf.slice(split);
    const residual = buf.slice(0, split);
    if (final.length) {
      // The span's oldest edge keeps its gap (header): the record just older than --from, else null.
      let prevTs = residual.length ? Date.parse(residual[residual.length - 1].timestamp) : pred;
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
  /** Answers the oldest global timestamp the list served (Infinity when it served none): the
   *  explorer's LIST has a floor the per-ordinal endpoint does not (found 2026-10-30: nothing
   *  older than 2025-05-20 pages, while ordinal 1 is 2022-09-28), and a fill must say when the
   *  spine stopped short of the span rather than leave those days quietly uncovered. */
  const walkGlobalCkpt = async (floorMs: number, upperMs: number, seedCursor?: string): Promise<number> => {
    const prev = readJson<ChainCkpt>("global");
    if (prev?.done) { console.log("  global: complete in the checkpoint — skipped"); return prev.minTs ?? -Infinity; }
    const cinc = deserInc(prev?.residualInc);
    let buf: GlobalRec[] = prev?.residualGlobals ?? [];
    let minTs = prev?.minTs ?? Infinity;
    let processed = prev?.records ?? 0;
    let sinceFlush = 0;
    let pred: number | null = null; // the record just older than the span, seen on the last page
    const round = async (cursor: string | undefined, drain: boolean): Promise<void> => {
      const cut = cutOf(minTs, drain);
      buf = finalizeGlobals(buf, cut, cinc, drain ? pred : null);
      const n = await flushFinal(cinc, cut, null);
      writeJson("global", drain
        ? { done: true, records: processed, minTs } satisfies ChainCkpt
        : { cursor, records: processed, minTs, residualInc: serInc(cinc), residualGlobals: buf } satisfies ChainCkpt);
      console.log(`\n  global: ${drain ? "done" : "checkpoint"} at ${processed} records — ${n} fields flushed`);
    };
    await walkChain<GlobalRec & { timestamp: string }>(`${be0}/global-snapshots`, floorMs, (recs, older) => {
      for (const o of older) { const t = Date.parse(o.timestamp); if (pred == null || t > pred) pred = t; }
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
    return minTs;
  };
  /** Crash-safe metagraph-chain walk: bucket per page, fold the gaps that are final, flush,
   *  divert floors, checkpoint. Skips itself when the checkpoint says done. */
  const walkMetaCkpt = async (id: string, floorMs: number, upperMs: number, seedCursor: string | undefined, floors: boolean): Promise<void> => {
    const label = id.slice(0, 10);
    const prev = readJson<ChainCkpt>(label);
    if (prev?.done) { console.log(`  ${label}: complete in the checkpoint — skipped`); return; }
    const cinc = deserInc(prev?.residualInc);
    const cfloors = floors ? deserInc(prev?.floors) : null; // an unlisted chain, or --chain: no floor share
    let pred: number | null = null; // the record just older than the span, seen on the last page
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
        // collected (the walk descends) — so gaps at/above the cut are final. The span's oldest
        // record is measured from the predecessor just older than the span when the walk saw one
        // (a recompute), else it opens the chain with no invented gap (an extension at genesis).
        const before = i > 0 ? stamps[i - 1] : drain ? pred : null;
        if (before != null && stamps[i] >= cut) addIncGap(cinc, net, stamps[i], id, Math.max(0, Math.round((stamps[i] - before) / 1000)));
        // ANCHORINGS (m.{id}.ticks — bucketMetas' note): a distinct stamp is one global tick.
        // The 2-day cut margin keeps every record of one tick on the same side of the cut.
        if (stamps[i] >= cut && (i === 0 || stamps[i] !== stamps[i - 1])) addInc(cinc, net, stamps[i], `m.${id}.ticks`, 1);
        if (stamps[i] < cut) keep.push(stamps[i]);
      }
      stamps = keep;
      const n = await flushFinal(cinc, cut, cfloors);
      writeJson(label, drain
        ? { done: true, records: processed, floors: serInc(cfloors ?? new Map()) } satisfies ChainCkpt
        : { cursor, records: processed, minTs, residualInc: serInc(cinc), residualStamps: stamps, floors: serInc(cfloors ?? new Map()) } satisfies ChainCkpt);
      console.log(`\n  ${label}: ${drain ? "done" : "checkpoint"} at ${processed} records — ${n} fields flushed`);
    };
    await walkChain<MetaRec & { timestamp: string }>(`${be0}/currency/${id}/snapshots`, floorMs, (recs, older) => {
      for (const o of older) { const t = Date.parse(o.timestamp); if (pred == null || t > pred) pred = t; }
      const w = recs.filter((r) => Date.parse(r.timestamp) < upperMs);
      for (const r of w) {
        const t = Date.parse(r.timestamp);
        stamps.push(t);
        if (t < minTs) minTs = t;
      }
      bucketMetas(cinc, net, id, w.map((r) => ({ ordinal: r.ordinal, timestamp: r.timestamp, fee: r.fee, sizeInKB: r.sizeInKB, blocks: r.blocks })), undefined, floors);
      processed += w.length;
      sinceFlush += w.length;
    }, label, prev?.cursor ?? seedCursor, async (cursor) => {
      if (sinceFlush >= FLUSH_EVERY) { sinceFlush = 0; await round(cursor, false); }
    });
    await round(undefined, true);
  };
  /** Merge every chain's diverted floor contributions and write them — meaningful only once
   *  ALL chains are done (each adds into the same shared fields), which is why this runs after
   *  the last chain. The checkpoint directory is cleared by the fill itself, at its very end. */
  const writeFloors = async (ids: string[]): Promise<void> => {
    const floors: IncMap = new Map();
    for (const id of ids) {
      for (const [key, fields] of readJson<ChainCkpt>(id.slice(0, 10))?.floors ?? []) {
        for (const [f, v] of fields) addInto(floors, key, f, v);
      }
    }
    const n = await flushFinal(floors, -Infinity, null);
    console.log(`  floors: ${n} shared fee/size fields written (every chain folded in).`);
  };

  const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

  // ---- FILL: one walk that completes a span of days (header) ----
  if (command.kind === "fill") {
    const { fromMs, recompute, chain: chainPrefix, fresh, dryRun } = command;
    const todayStartMs = dayFloor(Date.now());
    if (fresh) rmSync(CKPT_ROOT, { recursive: true, force: true });
    const pinned = readJson<FillMeta>("_meta");

    // THE SPAN. An extension derives --to from the store: its oldest covered day, recomputed whole.
    // A recompute is given both ends. Pinned once; a resume trusts the pin over the store.
    let toMs: number;
    if (pinned) {
      if (pinned.mode !== "fill" || pinned.fromMs !== fromMs || pinned.recompute !== recompute || pinned.chain !== chainPrefix || (command.toMs != null && pinned.toMs !== command.toMs)) {
        console.error(`a checkpoint for another fill stands in ${CKPT_ROOT} (${isoDay(pinned.fromMs)} → ${isoDay(pinned.toMs)}${pinned.recompute ? " --recompute" : ""}${pinned.chain ? ` --chain=${pinned.chain}` : ""}) — rerun that fill to finish it, or pass --fresh to discard it`);
        throw new Abort();
      }
      toMs = pinned.toMs;
      console.log(`resuming the fill ${isoDay(fromMs)} → ${isoDay(toMs)}${recompute ? " (--recompute)" : ""}`);
    } else if (recompute) {
      toMs = command.toMs!;
      if (toMs >= todayStartMs) { console.error(`fill --recompute: --to must be at most yesterday (${isoDay(todayStartMs - 86400000)}) — today is the cron's`); throw new Abort(); }
    } else {
      // Scanned across every year hash from --from to now — a span may cross year boundaries.
      let oldest: number | null = null;
      for (let y = new Date(fromMs).getUTCFullYear(); y <= new Date().getUTCFullYear(); y++) {
        const dayHash = (await retrying(() => redis.hgetall<Record<string, string>>(`t:${net}:1d:${y}`))) ?? {};
        const covered = Object.keys(dayHash).filter((f) => f.endsWith("|g.ticks")).map((f) => f.slice(0, 5)).sort();
        if (covered.length) { oldest = Date.UTC(y, +covered[0]!.slice(0, 2) - 1, +covered[0]!.slice(3)); break; }
      }
      if (oldest == null) { console.error("fill: the store holds no covered day — an empty store is bootstrapped by `rebuild --days=N`, and a fill extends it from there"); throw new Abort(); }
      if (fromMs >= oldest) { console.error(`fill: the store already reaches ${isoDay(oldest)} — ${isoDay(fromMs)} is covered; add --to=… --recompute to rewrite covered days`); throw new Abort(); }
      toMs = oldest;
    }
    const spanEndMs = toMs + 86400000; // exclusive

    // THE CHAINS: every catalog chain and every unlisted chain (one walk), or the one --chain.
    const catalog = lineageIds(net);
    const unlistedList = pinned?.unlisted ?? untrackedIds(net, await retrying(() => fetchChainIds(be0)));
    const unlistedSet = new Set(unlistedList);
    let ids = [...catalog, ...unlistedList.filter((id) => !catalog.includes(id))];
    let only: string | null = null;
    if (chainPrefix != null) {
      const r = resolveChain(chainPrefix, ids);
      if ("error" in r) { console.error(`fill: ${r.error}`); throw new Abort(); }
      only = r.id;
      ids = [only];
    }
    const withSpine = only == null;
    const withFloors = only == null;
    const withCoverage = only == null;

    // THE CURSOR PRE-FLIGHT (header): refuse while the cron is still inside the span. A cursor
    // inside the span is only a candidate: a DORMANT chain's cursor sits at its own tip forever
    // (found on the first dry run — an unlisted chain last seen 2024-06-19), and the cron has
    // nothing to add there. So each candidate is compared with its chain's tip: caught up (the
    // tip's ordinal is the cursor's) is past the span; anything newer upstream is not.
    const cur = (await retrying(() => redis.hgetall<Record<string, string>>(cursorKeyOf(net)))) ?? {};
    const candidates = cursorsInsideSpan(cur, ids, spanEndMs, withSpine);
    const stillInside: string[] = [];
    for (const name of candidates) {
      const list = name === "gTs" ? `${be0}/global-snapshots` : `${be0}/currency/${name.slice(4)}/snapshots`;
      const ordKey = name === "gTs" ? "g" : `m.${name.slice(4)}`;
      const tipOrd = (await getPage<{ ordinal: number }>(`${list}?limit=1`)).data?.[0]?.ordinal;
      if (tipOrd != null && tipOrd > Number(cur[ordKey] ?? 0)) stillInside.push(name);
    }
    if (stillInside.length) {
      const at = (n: string) => new Date(Number(cur[n])).toISOString().slice(0, 19) + "Z";
      console.error(`fill: the sampler has not finished ${isoDay(toMs)} yet — cursor ${stillInside[0]} is at ${at(stillInside[0]!)}${stillInside.length > 1 ? ` (and ${stillInside.length - 1} more)` : ""}; rerun once it passes`);
      throw new Abort();
    }

    const tiers = (["1d", "1h", "5m"] as const).filter((t) => tierExistsAt(t, spanEndMs - 1));
    /** The global spine's seek and the list-floor probe: the crafted cursor at the span's end, and
     *  whether the list serves anything at or below it (one page). Null seed: nothing to walk. */
    const seekSpine = async (): Promise<{ seed: string; listServes: boolean } | null> => {
      const gBoundary = await seekBoundary(
        async (o) => ((await getPage<never>(`${be0}/global-snapshots/${o}`)) as unknown as { data?: { ordinal: number; timestamp: string } }).data ?? null,
        Number(cur.g ?? 0) || 1,
        spanEndMs,
      );
      if (!gBoundary) return null;
      const seed = craftGlobalCursor(gBoundary.timestamp, gBoundary.ordinal);
      const probe = await getPage<{ timestamp: string }>(`${be0}/global-snapshots?limit=1&next=${encodeURIComponent(seed)}`);
      return { seed, listServes: (probe.data ?? []).length > 0 };
    };
    const spineFloorNote = (oldestServedMs: number): string | null =>
      oldestServedMs === Infinity
        ? `the explorer's global list serves NOTHING at or below ${isoDay(toMs)}: the spine cannot be filled for this span, so these days stay uncovered (History trims by g.ticks) — the per-ordinal endpoint still has them, which a fill does not use`
        : oldestServedMs > fromMs + 86400000
          ? `the explorer's global list ends at ${isoDay(oldestServedMs)}: the spine covers ${isoDay(oldestServedMs)} → ${isoDay(toMs)} only, and ${isoDay(fromMs)} → ${isoDay(oldestServedMs - 86400000)} stays uncovered (History trims by g.ticks)`
          : null;
    const summary = `${isoDay(fromMs)} → ${isoDay(toMs)}${recompute ? " --recompute" : " (extension)"}${only ? ` --chain=${only.slice(0, 10)}` : ""}`;
    if (dryRun) {
      console.log(`fill ${net} ${summary} — dry run, nothing written`);
      console.log(`  chains: ${ids.length} (${catalog.filter((c) => ids.includes(c)).length} catalog, ${ids.filter((c) => unlistedSet.has(c)).length} unlisted)${withSpine ? " + the global spine" : ""}`);
      console.log(`  tiers: ${tiers.join(", ")} (hourly and 5m from ${isoDay(TIER_SINCE["1h"])})`);
      console.log(`  floors: ${withFloors ? "every catalog chain folded, written after the last chain" : "untouched (--chain)"}; u.cov: ${withCoverage ? "every bucket of the span, unless an unlisted chain is skipped" : "untouched (--chain)"}`);
      console.log(`  lock: none (cursors past the span: ${withSpine ? "gTs, " : ""}${ids.length} chain cursor(s) checked${candidates.length ? `; ${candidates.length} dormant at their tip` : ""})`);
      if (withSpine) {
        const sp = await seekSpine();
        console.log(`  spine: ${!sp ? "no global at or after the span's end — nothing to walk" : sp.listServes ? "the list serves the span's end; how far down it reaches shows as the walk runs" : "⚠️ " + spineFloorNote(Infinity)}`);
      }
      console.log(`  checkpoint: ${pinned ? "resuming" : "fresh"} in ${CKPT_ROOT}`);
      return;
    }
    if (!pinned) {
      writeJson("_meta", { mode: "fill", fromMs, toMs, recompute, chain: chainPrefix, unlisted: unlistedList } satisfies FillMeta);
      console.log(`fill ${net} ${summary}: ${ids.length} chain(s)${withSpine ? " + the global spine" : ""}, tiers ${tiers.join("/")}, no lock (flush + checkpoint every ${FLUSH_EVERY / 1000}K records)`);
    }

    await probeCursorShape(`${be0}/global-snapshots`, "created_at,ordinal");
    const anyMeta = CATALOG[net].find((m) => m.id)?.id;
    if (anyMeta) await probeCursorShape(`${be0}/currency/${anyMeta}/snapshots`, "hash");

    // Chains, a few at a time: per-chain seek + crash-safe walk. A chain with no cursor in the
    // store is skipped (recorded done, so a resume never re-seeks it); an unlisted one skipped this
    // way suppresses the span's coverage marker (rule 10: "measured, none" must be true of every
    // unlisted chain). Crafted cursors land ON their record — walkMetaCkpt's upper filter keeps
    // only what is strictly before the span's end.
    let coverageSuppressedBy: string | null = null;
    const fillChain = async (id: string): Promise<void> => {
      const label = id.slice(0, 10);
      const prev = readJson<ChainCkpt>(label);
      if (prev?.done) { console.log(`  ${label}: complete in the checkpoint — skipped`); return; }
      let seed: string | undefined;
      if (!prev?.cursor) {
        const tip = Number(cur[`m.${id}`] ?? 0);
        if (!tip) {
          console.log(`  ${label}: no cursor — skipped (chain unseen by the store)`);
          if (unlistedSet.has(id)) coverageSuppressedBy = label;
          writeJson(label, { done: true } satisfies ChainCkpt);
          return;
        }
        const bnd = await seekBoundary(
          // No catch: getPage already retried — a persistent probe failure ABORTS the run instead
          // of reading as "born at the boundary".
          async (o) => ((await getPage<never>(`${be0}/currency/${id}/snapshots/${o}`)) as unknown as { data?: { ordinal: number; timestamp: string; hash?: string } }).data ?? null,
          tip,
          spanEndMs,
        );
        if (!bnd) { console.log(`  ${label}: born at/after the span's end — nothing to fill`); writeJson(label, { done: true } satisfies ChainCkpt); return; }
        if (!bnd.hash) { console.error(`  ${label}: boundary record has no hash — cannot seek`); throw new Abort(); }
        seed = craftCurrencyCursor(bnd.hash);
      }
      await walkMetaCkpt(id, fromMs, spanEndMs, seed, withFloors && !unlistedSet.has(id));
    };
    for (let i = 0; i < ids.length; i += FILL_POOL) await Promise.all(ids.slice(i, i + FILL_POOL).map(fillChain));

    // The global spine, LAST (header). A resume rides its saved cursor; only a fresh start seeks —
    // and probes the list floor first, so a span the list cannot serve is said, not walked.
    let spineNote: string | null = null;
    if (withSpine) {
      const prevG = readJson<ChainCkpt>("global");
      let seedG: string | undefined;
      let walk = true;
      if (!prevG?.done && !prevG?.cursor) {
        const sp = await seekSpine();
        if (!sp) { console.error("fill: could not seek the global boundary"); throw new Abort(); }
        if (!sp.listServes) {
          spineNote = spineFloorNote(Infinity);
          console.log(`  global: ⚠️ ${spineNote}`);
          writeJson("global", { done: true, records: 0, minTs: Infinity } satisfies ChainCkpt);
          walk = false;
        }
        seedG = sp.seed;
      }
      if (walk) spineNote = spineFloorNote(await walkGlobalCkpt(fromMs, spanEndMs, seedG));
    }
    if (withFloors) await writeFloors(catalog);

    // u.cov: every bucket of the span, generated (the unlisted chains were walked for these days).
    let covFields = 0;
    if (withCoverage && coverageSuppressedBy == null) {
      const inc: IncMap = new Map();
      const STEP: Record<Tier, number> = { "5m": 300000, "1h": 3600000, "1d": 86400000 };
      for (const tier of tiers) {
        for (let t = fromMs; t < spanEndMs; t += STEP[tier]) {
          if (!tierExistsAt(tier, t)) continue;
          const slot = slotOf(net, tier, t);
          let m = inc.get(slot.key);
          if (!m) { m = new Map(); inc.set(slot.key, m); }
          m.set(`${slot.bucket}|u.cov`, 0);
        }
      }
      for (const [key, map] of inc) {
        const entries = [...map.entries()];
        for (let i = 0; i < entries.length; i += 400) {
          await store.applyWrites([{ key, map: Object.fromEntries(entries.slice(i, i + 400)), ttlS: TTL_S[key.split(":")[2] as Tier] }]);
        }
        covFields += entries.length;
      }
    }
    rmSync(CKPT_ROOT, { recursive: true, force: true });
    const notes = [
      only ? "floors, spine and u.cov untouched (--chain)" : null,
      coverageSuppressedBy ? `coverage NOT marked — unlisted chain ${coverageSuppressedBy} was skipped, so the span's unlisted figure stays "not measured"` : null,
      spineNote ? `⚠️ ${spineNote}` : null,
    ].filter(Boolean);
    console.log(`filled ${summary}: ${ids.length} chain(s) (${ids.filter((c) => unlistedSet.has(c)).length} unlisted)${withSpine ? ", the global spine" : ""}${withFloors ? ", the floors" : ""}${covFields ? `, ${covFields} coverage fields` : ""}${notes.length ? ` — ${notes.join("; ")}` : ""}; cursor untouched, checkpoint cleared.`);
    return;
  }

  // ---- REBUILD / WIPE: the disaster path (header) — ASKS FIRST ----
  // What is about to be deleted is counted and shown; `yes` on a terminal or --yes proceeds, and a
  // run with neither (a script, a cron) refuses rather than guessing.
  {
    let count = 0;
    let scan0 = "0";
    do {
      const [c, keys] = await retrying(() => redis.scan(scan0, { match: `t:${net}:*`, count: 200 }));
      scan0 = String(c);
      count += (keys as string[]).filter((k) => k !== lockKeyOf(net)).length;
    } while (scan0 !== "0");
    const what = command.kind === "wipe" ? "wipe" : `wipe and rebuild ${command.days} day(s) of`;
    console.log(`about to ${what} t:${net}:* — ${count} key(s) will be DELETED (every tier, the cursors, the unlisted coverage).`);
    if (!command.yes) {
      if (!process.stdin.isTTY) { console.error("refusing: not a terminal and no --yes"); throw new Abort(); }
      process.stdout.write("type yes to continue: ");
      const answer = await new Promise<string>((resolve) => {
        process.stdin.setEncoding("utf8");
        process.stdin.once("data", (d) => resolve(String(d).trim()));
      });
      process.stdin.pause();
      if (answer !== "yes") { console.error("not confirmed — nothing deleted"); throw new Abort(); }
    }
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
  if (command.kind === "wipe") return;
  const { days } = command;

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
  // The UNLISTED chains ride along (2026-10-08): a wipe-and-rebuild that skipped them would erase
  // their measured counts and the coverage marker; they stay out of the catalog floors.
  const unlistedList = await fetchChainIds(be).then((ids) => untrackedIds(net, ids)).catch(() => null);
  const unlistedSet = new Set(unlistedList ?? []);
  const metaIds = [...lineageIds(net), ...(unlistedList ?? [])];
  const newestMetaOrd: Record<string, number> = {};
  const POOL = 3; // polite: a few chains at a time
  for (let i = 0; i < metaIds.length; i += POOL) {
    await Promise.all(metaIds.slice(i, i + POOL).map(async (id) => {
      await walkChain<MetaRec & { timestamp: string; lastSnapshotHash?: string }>(
        `${be}/currency/${id}/snapshots`, cutoffMs, (recs) => {
          if (!(id in newestMetaOrd)) newestMetaOrd[id] = recs[0].ordinal; // first page is the newest
          bucketMetas(inc, net, id, recs.map((r) => ({ ordinal: r.ordinal, timestamp: r.timestamp, fee: r.fee, sizeInKB: r.sizeInKB, blocks: r.blocks })), undefined, !unlistedSet.has(id));
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

  // The unlisted channels were measured wherever the spine was — when their list was read.
  if (unlistedList) markUnlistedCoverage(inc);

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
    if (holdsLock) await lockStore.releaseLock(lockKeyOf(net));
  }
}

// An ABORT has already said why on stderr; it is thrown (not process.exit) so the `finally` that
// releases the sampler lock runs — `process.exit` skips it, which left the cron blocked for hours
// (the branch review, 2026-10-08).
main().catch((e) => {
  if (!(e instanceof Abort)) console.error(e);
  process.exit(1);
});
