// WHERE THE FLEET RUNS, as counts (2026-10-27) — the tally the sampler stores once an hour into
// the geo family (`keys.ts` `geoSlotOf`), so Geography gets a past: by country and by hosting
// provider, for the whole fleet and for each network. Pure: the route hands it the same cached
// geo maps `/api/geo` and `/api/metagraphs` serve, so it costs no upstream read.
import type { GeoMap } from "@/src/data/types";

export interface FleetGeo {
  /** Every geolocated IP ONCE (validators first, then metagraph machines not already seen) —
   *  the rule the stored `f.cc.<cc>` gauge has always used. */
  countries: Record<string, number>;
  providers: Record<string, number>;
  /** Each network's OWN nodes (the DAG's are its validators), by country / provider key. A
   *  network none of whose nodes is geolocated is absent, never an empty map. */
  perNetCountries: Record<string, Record<string, number>>;
  perNetProviders: Record<string, Record<string, number>>;
  /** provider key → the lookup's provider name, as the explorer shows it. */
  providerNames: Record<string, string>;
}

const KEY_MAX = 48;

/** A provider name as ONE series segment: lowercase, every run of anything but a letter or a
 *  digit one dash. No dot (lineage folding splits series names on dots) and no bar (the field
 *  grammar's separator). Keyed by NAME, not ASN, because the explorer groups hosts by name. Null
 *  for an unknown host: it is left uncounted, never filed under an invented bucket. */
export function providerKey(isp: string | undefined): string | null {
  const k = (isp ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, KEY_MAX);
  return k || null;
}

const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

export function fleetGeo(
  dagGeo: GeoMap,
  metagraphs: readonly { id: string; nodes: readonly { ip?: string }[] }[],
  metaGeo: GeoMap,
): FleetGeo {
  const out: FleetGeo = { countries: {}, providers: {}, perNetCountries: {}, perNetProviders: {}, providerNames: {} };
  const tally = (ip: string, cc: Record<string, number>, prov: Record<string, number>, geo = metaGeo[ip] ?? dagGeo[ip]) => {
    if (!geo) return;
    if (geo.cc) bump(cc, geo.cc);
    const k = providerKey(geo.isp);
    if (k) { bump(prov, k); out.providerNames[k] ??= geo.isp!; }
  };
  const seen = new Set<string>();
  for (const ip of Object.keys(dagGeo)) { seen.add(ip); tally(ip, out.countries, out.providers, dagGeo[ip]); }
  for (const ip of Object.keys(metaGeo)) if (!seen.has(ip)) { seen.add(ip); tally(ip, out.countries, out.providers, metaGeo[ip]); }

  const perNet = (id: string, ips: readonly (string | undefined)[], own?: GeoMap) => {
    const cc: Record<string, number> = {};
    const prov: Record<string, number> = {};
    for (const ip of ips) if (ip) tally(ip, cc, prov, own ? own[ip] : undefined);
    if (Object.keys(cc).length) out.perNetCountries[id] = cc;
    if (Object.keys(prov).length) out.perNetProviders[id] = prov;
  };
  perNet("dag", Object.keys(dagGeo), dagGeo);
  for (const m of metagraphs) perNet(m.id, m.nodes.map((n) => n.ip));
  return out;
}
