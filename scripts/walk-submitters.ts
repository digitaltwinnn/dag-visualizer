// BACK-FILL the submitters family (`sub:mainnet:<net>:…`, app/api/submitters/) for the hours before
// the sampler's first run:
//
//   npx tsx scripts/walk-submitters.ts --net=ded|dor [--from=YYYY-MM-DD] [--pool=8] [--state=<path>]
//   npx tsx scripts/walk-submitters.ts --net=ded|dor --holes [--pool=8]
//
// `--holes` (ruling R20) walks the HOLES instead: the hours a gap left unread inside the measured span
// (`sub:mainnet:<net>:holes`), each filled with the same SET discipline, its days' 1d recomputed and
// its field deleted under the sampler's lock (`walkHoles`). A hole the sampler is still inside is left
// for a later run; a failed read leaves its hole, and a rerun walks it again (idempotent).
//
// A thin CLI over `walkRange` (app/api/submitters/runSubmitters.ts), which carries the write
// discipline and its tests: oldest hour first from --from up to the measured span's `from` and never
// past it (the sampler owns those hours), each hour SET to its full tally (a rerun is idempotent),
// each day's 1d recomputed from its stored 1h fields, and span.from lowered to --from once the walk
// reaches it contiguously. Defaults: DED --from=2025-09-15 (dagscan's evidence starts that day), Dor
// --from=<today − 90 days>.
//
// How a day's records are found: the explorer's list pages newest → oldest from its tip only, so each
// day is SEEKED — a binary search over the per-ordinal records (`seekBoundary`, the trends fill's)
// finds the first record at/after the day's end, a crafted `{hash}` cursor lands ON it (inclusive),
// and the list is paged down to the day's start. Each snapshot is read from the network's OWN L0 by
// ordinal (the directory's `urls.l0`, read once). Every read and store write rides out a blip
// (`retrying`, ~15 min); a read that still fails stops the walk at its hour.
//
// RESUMABLE: the state file (default `./.walk-submitters.<net>.json`, gitignored) records the start and
// the frontier after every day and at a stop; a rerun with the same --from continues there (a resume
// is still one contiguous walk from --from, so it still lowers span.from to --from). A state file for
// another --from refuses — delete it to start over. Needs the Upstash WRITE token in .env.local
// (`vercel env pull`), as rebuild-trends.ts does. Never imported by app code.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { loadEnvLocal, craftCurrencyCursor, retrying } from "./lib/scriptKit";

const DAY = 86400000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

interface WalkState { net: string; fromMs: number; nextMs: number }

function usage(msg: string): never {
  console.error(`${msg}\nusage: npx tsx scripts/walk-submitters.ts --net=ded|dor [--from=YYYY-MM-DD] [--pool=8] [--state=<path>]\n       npx tsx scripts/walk-submitters.ts --net=ded|dor --holes [--pool=8]`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = new Map(process.argv.slice(2).map((a) => {
    if (a === "--holes") return ["holes", "1"] as const;
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (!m) usage(`unknown argument: ${a}`);
    return [m[1]!, m[2]!] as const;
  }));
  for (const k of args.keys()) if (!["net", "from", "pool", "state", "holes"].includes(k)) usage(`unknown flag: --${k}`);
  const holesMode = args.has("holes");
  if (holesMode && (args.has("from") || args.has("state"))) usage("--holes takes no --from or --state: it walks every hole the store records");
  const which = args.get("net");
  if (which !== "ded" && which !== "dor") usage("--net wants ded or dor");
  const today = Math.floor(Date.now() / DAY) * DAY;
  const fromArg = args.get("from") ?? (which === "ded" ? "2025-09-15" : new Date(today - 90 * DAY).toISOString().slice(0, 10));
  const dm = DATE_RE.exec(fromArg);
  if (!dm) usage("--from wants YYYY-MM-DD (UTC)");
  const fromMs = Date.UTC(+dm[1]!, +dm[2]! - 1, +dm[3]!);
  const pool = Number(args.get("pool") ?? 8);
  if (!Number.isInteger(pool) || pool < 1 || pool > 32) usage("--pool wants 1..32");
  const statePath = args.get("state") ?? `./.walk-submitters.${which}.json`;

  loadEnvLocal();
  // Deferred: store.ts reads env at construction, so env must be loaded first.
  const { HOSTS } = await import("../src/engine/config");
  const { DED_ID, DOR_ID } = await import("../src/data/submitters");
  const { writeStore } = await import("../app/api/trends/store");
  const { getJson, pageCurrencySnapshots } = await import("../app/api/trends/explorerPages");
  const { seekBoundary } = await import("../app/api/trends/fillPlan");
  const { walkHoles, walkRange } = await import("../app/api/submitters/runSubmitters");
  const { subSpanKeyOf } = await import("../app/api/submitters/keys");
  const net = which === "ded" ? DED_ID : DOR_ID;
  const be = HOSTS.be;

  // Every read and write retries; the lock is not retried (a lost SET NX reply would read as held).
  const raw = writeStore();
  const store = {
    ...raw,
    hgetall: (k: string) => retrying(() => raw.hgetall(k)),
    hmget: (k: string, f: string[]) => retrying(() => raw.hmget(k, f)),
    hset: (k: string, m: Record<string, string | number>) => retrying(() => raw.hset(k, m)),
    get: (k: string) => retrying(() => raw.get(k)),
    mget: (k: string[]) => retrying(() => raw.mget(k)),
    applyWrites: (w: Parameters<typeof raw.applyWrites>[0]) => retrying(() => raw.applyWrites(w)),
  };

  const span = await store.hgetall(subSpanKeyOf(net));
  const spanFrom = Number(span?.from ?? NaN);
  if (!Number.isFinite(spanFrom)) { console.error(`${which}: no measured span yet — the sampler must run first`); process.exit(1); }
  if (!holesMode && fromMs >= spanFrom) { console.log(`${which}: the span already starts at ${iso(spanFrom)}, at or before --from — nothing to walk`); return; }

  let resumeMs = fromMs;
  let prev: WalkState | null = null;
  if (!holesMode) {
    try { prev = JSON.parse(readFileSync(statePath, "utf8")) as WalkState; } catch { /* a fresh walk */ }
  }
  if (prev) {
    if (prev.net !== net || prev.fromMs !== fromMs) { console.error(`${statePath} is a walk of ${prev.net.slice(0, 10)} from ${iso(prev.fromMs)} — rerun with that --from, or delete it to start over`); process.exit(1); }
    resumeMs = prev.nextMs;
    console.log(`${which}: resuming at ${iso(resumeMs)}`);
  }
  const save = (nextMs: number) => writeFileSync(statePath, JSON.stringify({ net, fromMs, nextMs } satisfies WalkState));

  // The crafted cursor's dialect, probed once: a drifted format aborts rather than walking the tip.
  const probe = await retrying(() => pageCurrencySnapshots(be, net, 2));
  if (!probe.next) throw new Error("cursor probe: no next");
  const keys = Object.keys(JSON.parse(Buffer.from(probe.next, "base64").toString("utf8")) as object).sort().join(",");
  if (keys !== "hash") throw new Error(`cursor probe: format drifted (${keys}, wanted hash) — refusing to seek`);
  const tip = probe.data[0]?.ordinal ?? 1;

  const dir = (await retrying(() => getJson(`${HOSTS.directory}/metagraphs/${net}?v=v2`, 10000))) as { data?: { urls?: { l0?: string } } };
  const l0 = dir.data?.urls?.l0?.replace(/\/$/, "");
  if (!l0) throw new Error("the directory lists no L0 url");

  type Rec = { ordinal: number; timestamp: string; hash?: string };
  const deps = {
    store,
    // Inside the sampler's lock, the raw client: no retry loop may outlast the lock's TTL.
    lockedStore: raw,
    pool,
    pageMeta: (id: string, limit: number, next?: string) => retrying(() => pageCurrencySnapshots(be, id, limit, next)),
    fetchSnap: (_id: string, o: number) => retrying(() => getJson(`${l0}/snapshots/${o}`, 15000)),
    cursorAt: async (id: string, ms: number) => {
      const sk = await seekBoundary(
        async (o) => ((await retrying(() => getJson(`${be}/currency/${id}/snapshots/${o}`, 20000))) as { data?: Rec }).data ?? null,
        tip,
        ms,
      );
      if (sk.kind === "born-after") return null;
      if (sk.kind === "all-older") return undefined;
      if (!sk.record.hash) throw new Error(`record ${sk.record.ordinal} has no hash — cannot seek`);
      return craftCurrencyCursor(sk.record.hash);
    },
  };

  if (holesMode) {
    console.log(`${which}: walking the holes from ${l0}, pool ${pool}`);
    const res = await walkHoles(deps, net, (p) => console.log(`  hole ${iso(p.hole.from)} → ${iso(p.hole.to)}: ${p.read} snapshots read so far`));
    if (res.failedAt != null) {
      console.error(`${which}: stopped — ${res.failedAt < 0 ? "the explorer list" : `L0 snapshot ${res.failedAt}`} would not read; ${res.filled} hole(s) filled, rerun to walk the rest`);
      process.exit(1);
    }
    console.log(`${which}: ${res.filled} hole(s) filled, ${res.left} left (the sampler is still inside one, or it moved), ${res.read} snapshots read`);
    return;
  }

  console.log(`${which}: walking ${iso(resumeMs)} → ${iso(spanFrom)} (span.from) from ${l0}, pool ${pool}`);
  const res = await walkRange(
    deps,
    net,
    fromMs,
    spanFrom,
    (p) => {
      save(p.tsMs);
      console.log(`  ${iso(p.tsMs - 1).slice(0, 10)}: through ordinal ${p.ordinal}, ${p.read} snapshots read`);
    },
    resumeMs,
  );

  if (res.failedAt != null) {
    save(res.nextMs);
    console.error(`${which}: stopped at ${iso(res.nextMs)} — ${res.failedAt < 0 ? "the explorer list" : `L0 snapshot ${res.failedAt}`} would not read; rerun to resume there`);
    process.exit(1);
  }
  rmSync(statePath, { force: true });
  if (res.lowered) console.log(`${which}: done — ${res.read} snapshots read; the measured span now starts ${iso(fromMs)}`);
  else console.log(`${which}: walked to ${iso(res.nextMs)} — ${res.read} snapshots read; span.from left at its own value (it moved during the walk, or is not on an hour edge)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
