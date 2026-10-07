// A NETWORK'S ADDRESS LINEAGE (user, 2026-10-02: "we need the deliberate merge of the two
// addresses; apparently this can happen, so let's take it into account by design").
//
// A metagraph's id IS its state-channel address, and a metagraph can be RE-REGISTERED: BioFi's
// first chain stopped on 2026-08-16 and a new one began under a new address on 2026-09-18. To the
// chain those are two metagraphs; to a reader they are one network with one history. The catalog
// says so — a row names its current `id` and lists the addresses it used before in `formerIds` —
// and this is the one home that turns that fact into answers:
//
//   · which network an address belongs to (`currentIdOf`) — a former address reads as its
//     network, never as "unlisted";
//   · every address worth tracking (`lineageIds`) — the listed sets, and the rebuild script's
//     walk, which must keep the retired chains' days;
//   · one history per network (`foldLineage`) — the trends store keeps each chain under its own
//     address (that is what it measured), and the read path folds the former addresses' series
//     into the current one's, so a chart shows the network's whole life.
//
// Pure: plain data in, plain data out. It reads the catalog and nothing else.
import { CATALOG, type NetworkId } from "@/src/engine/config";

const catalogOf = (net: string) => CATALOG[net as NetworkId] ?? [];

/** Is this catalog row RETIRED — a network that has stopped, kept for its history (`retiredAt`)? */
export function isRetired(m: { retiredAt?: string }): boolean {
  return !!m.retiredAt;
}

/** The rows still worth READING: everything the catalog lists, minus the retired networks. */
export function activeRows<T extends { retiredAt?: string }>(rows: readonly T[]): T[] {
  return rows.filter((m) => !isRetired(m));
}

/** The current ids the trends sampler reads — every catalog network that is not retired. */
export function sampledIds(net: string): string[] {
  return activeRows(catalogOf(net)).map((m) => m.id).filter((id): id is string => !!id);
}

/** Every address the network's catalog has ever tracked — current ids and former ones. */
export function lineageIds(net: string): string[] {
  return catalogOf(net).flatMap((m) => [m.id, ...(m.formerIds ?? [])]).filter((id): id is string => !!id);
}

/** The CURRENT id of the network an address belongs to; an address the catalog does not know is
 *  returned unchanged (and is, to every caller, unlisted). */
export function currentIdOf(net: string, id: string): string {
  for (const m of catalogOf(net)) if (m.id === id || m.formerIds?.includes(id)) return m.id;
  return id;
}

/** Is this address one the catalog tracks — as a current id or a former one? */
export function isTracked(net: string, id: string): boolean {
  return catalogOf(net).some((m) => m.id === id || m.formerIds?.includes(id) === true);
}

/** Fold every FORMER address's series into its network's current one.
 *
 *  A series name carries its network's address as one dot-delimited segment (`m.<address>.snaps`,
 *  `f.nodes.<address>`, `f.layer.<address>.l0`). Every series naming a FORMER address is merged
 *  into the same name under the current address, bucket by bucket, and removed, so the payload
 *  carries one family per network. The chains are consecutive, not concurrent, so in practice one side of each bucket is
 *  empty; where both hold a value the series' own operator decides (`opOf`: counters add, maxima
 *  take the larger, gauges keep the current chain's). A bucket neither measured stays null. */
export function foldLineage(
  net: string,
  series: Record<string, (number | null)[]>,
  opOf: (name: string) => "add" | "max" | "set",
): Record<string, (number | null)[]> {
  const formers = catalogOf(net).flatMap((m) => (m.formerIds ?? []).map((f) => [f, m.id] as const));
  if (formers.length === 0) return series;
  const out = { ...series };
  for (const [former, current] of formers) {
    for (const name of Object.keys(out)) {
      // The address is one dot-delimited SEGMENT of the name, wherever the family puts it:
      // `m.<address>.snaps`, `f.nodes.<address>`, `f.layer.<address>.l0`.
      const parts = name.split(".");
      const at = parts.indexOf(former);
      if (at < 0) continue;
      parts[at] = current;
      const target = parts.join(".");
      const a = out[target];
      const b = out[name];
      delete out[name];
      if (!a) { out[target] = b; continue; }
      const op = opOf(target);
      out[target] = a.map((v, i) => {
        const w = b[i] ?? null;
        if (v == null) return w;
        if (w == null) return v;
        return op === "add" ? v + w : op === "max" ? Math.max(v, w) : v;
      });
    }
  }
  return out;
}
