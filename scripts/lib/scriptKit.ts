// Helpers the store scripts share (`rebuild-trends.ts`, `walk-submitters.ts`, `seed-ded-names.ts`):
// the hand-parsed .env.local, the blip-riding retry and the explorer's crafted currency cursor.
// Script-only: never imported by app code.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---- env: scripts run outside Next, so .env.local (vercel env pull) is parsed by hand --------
export function loadEnvLocal(): void {
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

// ⚠️ The CURRENCY lists page by a `{hash}` cursor (probed live 2026-09-07), and a CRAFTED cursor
// lands INCLUSIVELY on its own record (server-issued next tokens are exclusive; ours are not).
export function craftCurrencyCursor(hash: string): string {
  return Buffer.from(JSON.stringify({ hash })).toString("base64");
}

/** RIDE OUT A BLIP. Backoff reaches ~15 min cumulative (21 attempts, waits capped at 30s): a
 *  multi-hour walk must survive a transient DNS or network blip (one killed a 3-hour gaps walk
 *  at 83%, 2026-09-08 — EAI_AGAIN) AND a short explorer outage (2026-10-26: 20s timeouts past
 *  the old ~1.5-min budget killed a 2025-07-01 gaps walk seven hours in). ONE helper for the
 *  explorer pages AND the store's writes (2026-10-29: two unlisted backfills walked every chain
 *  for 50 minutes, then died in their write phase on a Wi-Fi drop — the pager retried, the
 *  writes did not). HSET/EXPIRE set the fields they name, so a retried write is the same write. */
export async function retrying<T>(op: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (e) {
      if (attempt >= 20) throw e;
      await new Promise((res) => setTimeout(res, Math.min(30000, 1000 * 2 ** attempt)));
    }
  }
}
