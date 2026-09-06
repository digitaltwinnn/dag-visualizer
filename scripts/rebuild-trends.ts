// REBUILD the trends store from the explorer's own history — the recovery tool (user,
// 2026-09-06: "this 'initial load' could be useful in the future as well when there is a bug").
// Run manually, like every scripts/ tool:
//
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --days=180
//   npx tsx scripts/rebuild-trends.ts --net=mainnet --wipe-only
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

interface Args { net: "mainnet" | "integrationnet" | "testnet"; days: number; wipeOnly: boolean }
function parseArgs(): Args {
  const a: Args = { net: "mainnet", days: 90, wipeOnly: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--wipe-only") a.wipeOnly = true;
    else if (arg.startsWith("--net=")) a.net = arg.slice(6) as Args["net"];
    else if (arg.startsWith("--days=")) a.days = Number(arg.slice(7));
    else { console.error(`unknown arg ${arg}`); process.exit(1); }
  }
  if (!["mainnet", "integrationnet", "testnet"].includes(a.net) || !(a.days > 0 && a.days <= 400)) {
    console.error("usage: --net=mainnet|integrationnet|testnet --days=1..400 [--wipe-only]");
    process.exit(1);
  }
  return a;
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
): Promise<number> {
  let next: string | undefined;
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
  const { net, days, wipeOnly } = parseArgs();

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
