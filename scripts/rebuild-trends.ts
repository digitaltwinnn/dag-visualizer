// REBUILD the trends store from the explorer's own history — the recovery tool (user,
// 2026-09-06: "this 'initial load' could be useful in the future as well when there is a bug").
// Run manually, like every scripts/ tool:
//
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --days=180
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --extend-to=2026-01-01
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --wipe-only
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
//  - The store starts empty (wiped), and this is the only writer while it runs, so the final
//    write pass needs no read-merge: chunked applyWrites transactions carry the folded IncMap.
import { readFileSync } from "node:fs";
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

interface Args { net: "mainnet" | "integrationnet" | "testnet"; days: number; wipeOnly: boolean; extendToMs: number | null }
function parseArgs(): Args {
  const a: Args = { net: "mainnet", days: 90, wipeOnly: false, extendToMs: null };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--wipe-only") a.wipeOnly = true;
    else if (arg.startsWith("--net=")) a.net = arg.slice(6) as Args["net"];
    else if (arg.startsWith("--days=")) a.days = Number(arg.slice(7));
    else if (arg.startsWith("--extend-to=")) {
      const m = arg.slice(12).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) a.extendToMs = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      else { console.error("--extend-to wants YYYY-MM-DD (UTC)"); process.exit(1); }
    }
    else { console.error(`unknown arg ${arg}`); process.exit(1); }
  }
  if (!["mainnet", "integrationnet", "testnet"].includes(a.net) || !(a.days > 0 && a.days <= 400)) {
    console.error("usage: --net=... --days=1..400 [--wipe-only] [--extend-to=YYYY-MM-DD]");
    process.exit(1);
  }
  if (a.extendToMs != null && a.wipeOnly) { console.error("--extend-to and --wipe-only are exclusive"); process.exit(1); }
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
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`${r.status}`);
      return (await r.json()) as Page<T>;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}

/** Walk a chain newest→oldest until `cutoffMs`, streaming each page (newest-first) to `onPage`. */
async function walkChain<T extends { timestamp: string }>(
  base: string,
  cutoffMs: number,
  onPage: (recs: T[]) => void,
  label: string,
  startCursor?: string,
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
  }
  process.stdout.write(`\r  ${label}: ${total} records (${pages} pages)\n`);
  return total;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { net, days, wipeOnly, extendToMs } = parseArgs();

  // Deferred imports: store.ts reads env at construction, so env must be loaded first.
  const { Redis } = await import("@upstash/redis");
  const { NETWORKS, CATALOG } = await import("../src/engine/config");
  const { TTL_S, slotOf, cursorKeyOf } = await import("../app/api/trends/keys");
  const { bucketGlobals, bucketMetas } = await import("../app/api/trends/bucketing");
  const { writeStore } = await import("../app/api/trends/store");
  type IncMap = import("../app/api/trends/bucketing").IncMap;
  type GlobalRec = import("../app/api/trends/bucketing").GlobalRec;
  type MetaRec = import("../app/api/trends/bucketing").MetaRec;
  type Tier = import("../app/api/trends/keys").Tier;

  const redis = new Redis({
    url: process.env.UPSTASH_KV_REST_API_URL!,
    token: process.env.UPSTASH_KV_REST_API_TOKEN!,
  });

  const be0 = NETWORKS[net].be;

  // ---- EXTEND mode: backward-only, wipeless (see the header) ----
  if (extendToMs != null) {
    const inc: IncMap = new Map();
    const tierOf = (key: string): Tier => key.split(":")[2] as Tier;

    // The store's oldest covered day is the overwrite boundary.
    const yearKey = `t:${net}:1d:${new Date(extendToMs).getUTCFullYear()}`;
    const dayHash = (await redis.hgetall<Record<string, string>>(yearKey)) ?? {};
    const covered = Object.keys(dayHash).filter((f) => f.endsWith("|g.ticks")).map((f) => f.slice(0, 5)).sort();
    if (!covered.length) { console.error("extend: the store is empty — run a plain rebuild instead"); process.exit(1); }
    const d0 = covered[0]; // "MM-DD" — recomputed completely and overwritten
    const year = new Date(extendToMs).getUTCFullYear();
    const d1StartMs = Date.UTC(year, +d0.slice(0, 2) - 1, +d0.slice(3)) + 86400000;
    console.log(`extending ${new Date(extendToMs).toISOString().slice(0, 10)} → ${year}-${d0} (boundary day recomputed whole; daily tier only)`);

    await probeCursorShape(`${be0}/global-snapshots`, "created_at,ordinal");
    const anyMeta = CATALOG[net].find((m) => m.id)?.id;
    if (anyMeta) await probeCursorShape(`${be0}/currency/${anyMeta}/snapshots`, "hash");
    /** Crafted cursors land ON their record — keep only what is strictly before the boundary. */
    const beforeBoundary = <T extends { timestamp: string }>(recs: T[]): T[] =>
      recs.filter((r) => Date.parse(r.timestamp) < d1StartMs);
    const cur = (await redis.hgetall<Record<string, string>>(cursorKeyOf(net))) ?? {};

    // Globals: seek the boundary, walk down to extend-to, day-chunk with a clean gap chain.
    const gBoundary = await seekBoundary(
      async (o) => {
        try { return ((await getPage<never>(`${be0}/global-snapshots/${o}`)) as unknown as { data?: { ordinal: number; timestamp: string } }).data ?? null; }
        catch { return null; }
      },
      Number(cur.g ?? 0) || 1,
      d1StartMs,
    );
    if (!gBoundary) { console.error("extend: could not seek the global boundary"); process.exit(1); }
    const globals: GlobalRec[] = [];
    await walkChain<GlobalRec & { timestamp: string }>(`${be0}/global-snapshots`, extendToMs, (recs) => {
      for (const r of beforeBoundary(recs)) globals.push({ ordinal: r.ordinal, timestamp: r.timestamp, metagraphSnapshotCount: r.metagraphSnapshotCount, blocks: r.blocks });
    }, "global", craftGlobalCursor(gBoundary.timestamp, gBoundary.ordinal));
    globals.sort((a, b) => a.ordinal - b.ordinal);
    {
      let dayStart = 0;
      let prevTs: number | null = null; // the span's first record opens the chain — no invented gap
      for (let i = 1; i <= globals.length; i++) {
        const boundary = i === globals.length ||
          new Date(Date.parse(globals[i].timestamp)).getUTCDate() !== new Date(Date.parse(globals[dayStart].timestamp)).getUTCDate();
        if (!boundary) continue;
        const chunk = globals.slice(dayStart, i);
        bucketGlobals(inc, net, chunk, prevTs);
        prevTs = Date.parse(chunk[chunk.length - 1].timestamp);
        dayStart = i;
      }
    }

    // Metagraphs: per-chain seek + walk, streamed. A chain born after the boundary skips.
    const ids = CATALOG[net].map((m) => m.id).filter((id): id is string => !!id);
    for (const id of ids) {
      const tip = Number(cur[`m.${id}`] ?? 0);
      if (!tip) { console.log(`  ${id.slice(0, 10)}: no cursor — skipped (chain unseen by the store)`); continue; }
      const bnd = await seekBoundary(
        async (o) => {
          try { return ((await getPage<never>(`${be0}/currency/${id}/snapshots/${o}`)) as unknown as { data?: { ordinal: number; timestamp: string; hash?: string } }).data ?? null; }
          catch { return null; }
        },
        tip,
        d1StartMs,
      );
      if (!bnd) { console.log(`  ${id.slice(0, 10)}: born at/after the boundary — nothing older`); continue; }
      if (!bnd.hash) { console.error(`  ${id.slice(0, 10)}: boundary record has no hash — cannot seek`); process.exit(1); }
      await walkChain<MetaRec & { timestamp: string }>(
        `${be0}/currency/${id}/snapshots`, extendToMs, (recs) => {
          bucketMetas(inc, net, id, beforeBoundary(recs).map((r) => ({ ordinal: r.ordinal, timestamp: r.timestamp, fee: r.fee, sizeInKB: r.sizeInKB })));
        }, id.slice(0, 10), craftCurrencyCursor(bnd.hash));
    }

    // Daily tier only; plain HSET overwrites the boundary day with its complete recomputation.
    console.log("writing (daily tier) …");
    const store = writeStore();
    const CHUNK = 400;
    let fields = 0;
    for (const [key, map] of inc) {
      if (tierOf(key) !== "1d") continue;
      const entries = [...map.entries()];
      for (let i = 0; i < entries.length; i += CHUNK) {
        await store.applyWrites([{ key, map: Object.fromEntries(entries.slice(i, i + CHUNK)), ttlS: null }]);
      }
      fields += entries.length;
    }
    console.log(`  ${fields} daily fields; cursor untouched — the cron never noticed.`);
    return;
  }

  // ---- wipe: SCAN t:{net}:* and delete — the rebuild contract's first half ----
  console.log(`wiping t:${net}:* …`);
  let cursor = "0";
  let wiped = 0;
  do {
    const [c, keys] = await redis.scan(cursor, { match: `t:${net}:*`, count: 200 });
    cursor = String(c);
    if (keys.length) {
      await redis.del(...(keys as string[]));
      wiped += keys.length;
    }
  } while (cursor !== "0");
  console.log(`  wiped ${wiped} keys`);
  if (wipeOnly) return;

  const be = NETWORKS[net].be;
  const now = Date.now();
  const cutoffMs = now - days * 86400000;
  const fresh5mFloor = now - TTL_S["5m"]! * 1000; // 5m fields older than the tier's retention are pruned

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
          bucketMetas(inc, net, id, recs.map((r) => ({ ordinal: r.ordinal, timestamp: r.timestamp, fee: r.fee, sizeInKB: r.sizeInKB })));
        }, id.slice(0, 10));
    }));
    prune5m();
  }

  // ---- write: chunked applyWrites transactions + the cursor the cron resumes from ----
  console.log("writing …");
  const store = writeStore();
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
}

main().catch((e) => { console.error(e); process.exit(1); });
