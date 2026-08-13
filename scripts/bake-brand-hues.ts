// OFFLINE bake — run manually when the metagraph set changes: `npx tsx scripts/bake-brand-hues.ts`.
// Derives each metagraph's identity hue from its brand (logo, then site theme-color) and writes
// data/brand-hues.json. NEVER imported by the app/runtime — jimp is a devDependency only.
import { readFileSync, writeFileSync } from "node:fs";
import { Jimp } from "jimp";
import { parseSvgFills, pickBrandColor, snapToAllowedZone, hexToOklch, spreadColliding } from "../src/palette/brand";

type Meta = { id: string; name: string; iconUrl: string; siteUrl: string };
const overrides = JSON.parse(readFileSync("data/brand-hue-overrides.json", "utf8")) as Record<string, number>;

// The directory comes from the LIVE source, the same one /api/metagraphs reads — there is no
// baked copy to read: data/metagraphs.json was deleted deliberately (ddd318d, "stale data was
// worse than an honest error"), which left this script unrunnable and is why a metagraph added to
// the catalog later had no baked hue at all. `data/` holds build ARTIFACTS, and an input the app
// itself refuses to keep stale is not one of them.
const DIRECTORY = "https://production.dagexplorer-api.constellationnetwork.net/mainnet/metagraphs?limit=100";

async function fetchDirectory(): Promise<Meta[]> {
  const r = await fetch(DIRECTORY, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`directory ${r.status} — nothing baked (a partial roster would silently drop rows)`);
  const list = ((await r.json()) as { data?: Array<Record<string, string>> }).data ?? [];
  if (!list.length) throw new Error("directory returned no metagraphs — nothing baked");
  return list.filter((m) => m.id).map((m) => ({
    id: m.id, name: m.name || m.id, iconUrl: m.iconUrl || "", siteUrl: m.siteUrl || "",
  }));
}

async function fetchBuf(url: string): Promise<Buffer | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); }
  catch { return null; }
}

// Raster → candidate {rgb, weight} histogram (downscaled, quantised, alpha-gated).
async function rasterCandidates(buf: Buffer): Promise<{ rgb: number; weight: number }[]> {
  const img = await Jimp.read(buf);
  img.resize({ w: 64 });
  const hist = new Map<number, number>();
  const b = img.bitmap;
  for (let i = 0; i < b.data.length; i += 4) {
    if (b.data[i + 3] < 128) continue; // skip transparent
    const q = (v: number) => v & 0xf0; // quantise to 16 levels/channel
    const rgb = (q(b.data[i]) << 16) | (q(b.data[i + 1]) << 8) | q(b.data[i + 2]);
    hist.set(rgb, (hist.get(rgb) ?? 0) + 1);
  }
  return [...hist].map(([rgb, weight]) => ({ rgb, weight }));
}

function themeColor(html: string): number | null {
  const m = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']\s*(#[0-9a-fA-F]{3,6})/i);
  if (!m) return null;
  let h = m[1].slice(1); if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return parseInt(h.slice(0, 6), 16);
}

async function brandHueFor(m: Meta): Promise<{ hueDeg: number; srcHex: string; source: string } | null> {
  if (m.id in overrides) return { hueDeg: snapToAllowedZone(overrides[m.id]), srcHex: "", source: "override" };
  // 1) logo
  const buf = m.iconUrl ? await fetchBuf(m.iconUrl) : null;
  let chosen: number | null = null; let source = "";
  if (buf) {
    if (/\.svg(\?|$)/i.test(m.iconUrl) || buf.slice(0, 200).toString("utf8").includes("<svg")) {
      chosen = pickBrandColor(parseSvgFills(buf.toString("utf8")).map((rgb) => ({ rgb, weight: 1 })));
      source = "svg";
    } else {
      chosen = pickBrandColor(await rasterCandidates(buf)); source = "raster";
    }
  }
  // 2) theme-color fallback
  if (chosen === null && m.siteUrl) {
    const html = (await fetchBuf(m.siteUrl))?.toString("utf8");
    if (html) { chosen = themeColor(html); source = "theme-color"; }
  }
  if (chosen === null || Number.isNaN(hexToOklch(chosen).h)) return null;
  return { hueDeg: snapToAllowedZone(hexToOklch(chosen).h), srcHex: "#" + (chosen & 0xffffff).toString(16).padStart(6, "0"), source };
}

// Wrapped in an async main (not top-level await) — the project has no "type": "module" in
// package.json, so tsx transpiles this file as CJS, which doesn't support top-level await.
async function main() {
  const metas = await fetchDirectory();
  // The DAG itself is modelled as a metagraph-shaped "core" (see src/data/network.ts's DAG_CFG) and
  // gets its own brand hue too, distinct from the structural cyan used for the core sphere / "All"
  // filter. Not in the directory (it isn't a listed metagraph) — appended here so spreadColliding
  // sees it alongside the real metagraphs. Uses the official $DAG mark (same Stargazer asset bucket
  // DAG_CFG's iconUrl points at) + the Constellation Network site as the theme-color fallback.
  metas.push({
    id: "dag", name: "DAG",
    iconUrl: "https://stargazer-assets.s3.us-east-2.amazonaws.com/logos/dag.png",
    siteUrl: "https://constellationnetwork.io",
  });

  const out: Record<string, { hueDeg: number; srcHex: string; source: string }> = {};
  for (const m of metas) {
    const r = await brandHueFor(m);
    if (r) { out[m.id] = r; console.log(`${m.name.padEnd(22)} ${r.source.padEnd(11)} hue ${r.hueDeg.toFixed(1)}  ${r.srcHex}`); }
    else console.log(`${m.name.padEnd(22)} (no usable brand colour — will fall back to config)`);
  }

  // De-collide: several brands genuinely share the same snapped zone edge (e.g. multiple blues
  // all land on 248.999°), making them indistinguishable in the HUD/hubs. Spread colliding hues
  // apart within the allowed zones — deterministic, sorted by id — then overwrite hueDeg in place.
  const spread = spreadColliding(Object.entries(out).map(([id, r]) => ({ id, hueDeg: r.hueDeg })));
  for (const [id, hueDeg] of spread) out[id].hueDeg = hueDeg;

  writeFileSync("data/brand-hues.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote data/brand-hues.json (${Object.keys(out).length}/${metas.length} metagraphs)`);
}

main();
