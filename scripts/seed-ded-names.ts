// ONE-OFF: seed Digital Evidence's organisation NAMES from dagscan's evidence summary.
//
//   npx tsx scripts/seed-ded-names.ts
//
// The sampler names organisations from DED's own `/v1/fingerprints/latest`, which lists an
// organisation only while it is submitting — so an organisation that stopped before the sampler's
// first run would stay "Org <id>". dagscan's summary lists every organisation it has seen; it is
// read ONCE here, merged as source `dagscan` (`seedNames` → `nameWrites`: never over a `ded` name,
// an unchanged one not written) into `sub:mainnet:<DED>:names`, under the sampler's lock so a run's
// own names write cannot interleave. Needs the Upstash WRITE token in .env.local. Never imported
// by app code.
import { loadEnvLocal, retrying } from "./lib/scriptKit";

const SUMMARY = "https://api.dagscan.io/metagraphs/DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M/evidence/summary";

async function main(): Promise<void> {
  loadEnvLocal();
  const { DED_ID } = await import("../src/data/submitters");
  const { writeStore } = await import("../app/api/trends/store");
  const { getJson } = await import("../app/api/trends/explorerPages");
  const { parseDagscanSummary } = await import("../app/api/submitters/names");
  const { seedNames } = await import("../app/api/submitters/runSubmitters");
  if (!SUMMARY.includes(DED_ID)) throw new Error("the summary URL names another network");

  const seen = parseDagscanSummary(await retrying(() => getJson(SUMMARY, 20000)));
  const n = Object.keys(seen).length;
  if (!n) { console.error("dagscan's summary named no organisations — nothing written"); process.exit(1); }

  const changed = await seedNames(writeStore(), seen, "dagscan", Date.now());
  console.log(`dagscan named ${n} organisation(s); ${changed} name(s) written, the rest already held (a ded name is never replaced)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
