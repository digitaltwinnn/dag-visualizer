// A LAYER'S ROSTER, ASKED OF A PEER WHEN ITS LISTED ADDRESS DOES NOT ANSWER (2026-11-23).
//
// The directory lists ONE address per layer, and for most metagraphs that address is one of the
// network's own nodes rather than a load balancer. When that one node's layer process is down, the
// roster read fails, and a failed read used to count as an empty layer: BioFi's listed L0 node
// answered 502 while its other two nodes sealed snapshots as usual, and every surface read "this
// network runs cL1 only" beside a Snapshots view full of its snapshots (user: "it says BIOFI only
// runs cL1 … but the snapshot view confirms it does snapshots?").
//
// A layer's processes share one port across a network's machines, and `cluster/info` is the same
// answer from any member. So the machines learned from the layers that DID answer are asked for the
// failed layer on its own port. Pure: the addresses to try, in order; the fetching is the caller's.

/** The addresses to ask for a layer whose listed one failed: the same scheme and port on each
 *  known peer, the listed host left out, at most `max`. Empty when the listed address cannot be
 *  parsed or names no port (nothing to carry to a peer). */
export function peerRosterUrls(listed: string, peerIps: readonly string[], max = 3): string[] {
  let u: URL;
  try {
    u = new URL(listed);
  } catch {
    return [];
  }
  if (!u.port) return [];
  const out: string[] = [];
  for (const ip of peerIps) {
    if (!ip || ip === u.hostname || out.length >= max) continue;
    const url = `${u.protocol}//${ip}:${u.port}`;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}
