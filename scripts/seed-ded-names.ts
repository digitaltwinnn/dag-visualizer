// ONE-OFF: seed Digital Evidence's organisation NAMES from dagscan's evidence summary.
//
//   npx tsx scripts/seed-ded-names.ts
//
// The sampler names organisations from DED's own `/v1/fingerprints/latest`, which lists an
// organisation only while it is submitting — so an organisation that stopped before the sampler's
// first run would stay "Org <id>". dagscan's summary lists every organisation it has seen; it is
// read ONCE here, merged as source `dagscan` (`mergeNames`: never over a `ded` name, an unchanged
// one left byte-identical) into `sub:mainnet:<DED>:names`, under the sampler's lock so a run's
// own names write cannot interleave. Needs the Upstash WRITE token in .env.local. Never imported
// by app code.
import { loadEnvLocal, retrying } from "./lib/scriptKit";

const SUMMARY = "https://api.dagscan.io/metagraphs/DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M/evidence/summary";

async function main(): Promise<void> {
  loadEnvLocal();
  const { DED_ID } = await import("../src/data/submitters");
  const { writeStore } = await import("../app/api/trends/store");
  const { getJson } = await import("../app/api/trends/explorerPages");
  const { subNamesKeyOf } = await import("../app/api/submitters/keys");
  const { mergeNames, parseDagscanSummary } = await import("../app/api/submitters/names");
  const { withSubmittersLock } = await import("../app/api/submitters/runSubmitters");
  if (!SUMMARY.includes(DED_ID)) throw new Error("the summary URL names another network");

  const seen = parseDagscanSummary(await retrying(() => getJson(SUMMARY, 20000)));
  const n = Object.keys(seen).length;
  if (!n) { console.error("dagscan's summary named no organisations — nothing written"); process.exit(1); }

  const store = writeStore();
  const changed = await withSubmittersLock(store, async () => {
    const prev = (await store.hgetall(subNamesKeyOf(DED_ID))) ?? {};
    const merged = mergeNames(prev, seen, "dagscan", Date.now());
    const diff = Object.fromEntries(Object.entries(merged).filter(([id, v]) => prev[id] !== v));
    if (Object.keys(diff).length) await store.hset(subNamesKeyOf(DED_ID), diff);
    return Object.keys(diff).length;
  });
  console.log(`dagscan named ${n} organisation(s); ${changed} name(s) written, the rest already held (a ded name is never replaced)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
