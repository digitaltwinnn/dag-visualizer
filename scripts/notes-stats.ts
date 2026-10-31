// THE AI NOTES GO/NO-GO INSTRUMENT (2026-10-27): prints the day counters the generator keeps in
// `ai:mainnet:stats:{day}` for the last 14 UTC days, one row a day, one column per outcome. Read
// it before deciding to keep the free model: a high `gateFail` is the honesty gate throwing the
// model's notes away, `rate` / `http` / `timeout` are the Gate failing, `nokey` is a missing key.
//
//   npx tsx scripts/notes-stats.ts
//
// READ-ONLY by construction: it uses the read-only Upstash token and issues HGETALL only. The
// columns come from `NOTE_STATS` (the generator's own list) and the key from `statsKeyOf`, so a
// new outcome shows up here without an edit. Never prints a token.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const NET = "mainnet";
const DAYS = 14;
const DAY_MS = 86_400_000;

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

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.UPSTASH_KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_READ_ONLY_TOKEN;
  if (!url || !token) {
    console.error("UPSTASH_KV_REST_API_URL / UPSTASH_KV_REST_API_READ_ONLY_TOKEN missing from .env.local");
    process.exit(1);
  }
  // Deferred imports, like rebuild-trends: env first, then the modules.
  const { Redis } = await import("@upstash/redis");
  const { NOTE_STATS } = await import("../app/api/notes/generate");
  const { statsKeyOf } = await import("../app/api/notes/keys");
  const redis = new Redis({ url, token });

  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const days = Array.from({ length: DAYS }, (_, i) => new Date(today - i * DAY_MS).toISOString().slice(0, 10));
  const rows = await Promise.all(
    days.map(async (day) => {
      const h = (await redis.hgetall<Record<string, number | string>>(statsKeyOf(NET, day))) ?? {};
      return { day, counts: NOTE_STATS.map((f) => Number(h[f] ?? 0)) };
    }),
  );

  const w = 8;
  console.log(["day".padEnd(10), ...NOTE_STATS.map((f) => f.padStart(w))].join(" "));
  for (const r of rows) console.log([r.day.padEnd(10), ...r.counts.map((n) => String(n).padStart(w))].join(" "));
  const total = NOTE_STATS.map((_, i) => rows.reduce((a, r) => a + r.counts[i]!, 0));
  console.log(["total".padEnd(10), ...total.map((n) => String(n).padStart(w))].join(" "));
  const ok = total[NOTE_STATS.indexOf("ok")]!;
  const gateFail = total[NOTE_STATS.indexOf("gateFail")]!;
  if (ok + gateFail > 0) console.log(`\ngate pass rate: ${((100 * ok) / (ok + gateFail)).toFixed(1)}% (${ok} ok, ${gateFail} gateFail)`);
}

main().catch((e) => {
  console.error("notes-stats failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
