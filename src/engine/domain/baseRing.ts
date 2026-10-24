// THE BASE RINGS — the located fleet under the globe as three NESTED rings that follow the
// Geography explorer's OWN LADDER (user, 2026-10-23: "Country should be the outer layer? We should
// keep things consistent, use the rung functionality"): the outer ring the fleet by COUNTRY (the
// explorer's root rung), the middle each country's arc subdivided by PROVIDER (the cohort rung),
// the inner each provider's arc subdivided by NETWORK, where the identity hues appear — denser
// toward the centre. The thread: "think of a graphic / data visualization to put under the globe?
// Like some subtle circle/circles representing the metagraphs / nodes / providers"; design A of the
// brainstorm's `globe-ring.html` (one ring, by network); then "add the inner rings as well … outer
// to inner rings will show denser segments"; then the ladder order above. A ring that RE-DEALT per
// rung was the other design and was dropped because "subject zoom in will not show anything" — the
// base plane leaves the frame at the deeper poses — so the rings are one fixed picture of the whole
// fleet, read at the rest pose, and the committed or hovered subject LIGHTS its arcs on every level
// rather than redrawing them. Pure arithmetic over plain objects; `scene/objects/BaseRing.ts`
// draws it.
//
// THE UNIT IS THE EXPLORER'S: A NODE IS A NETWORK PARTICIPANT, NOT A MACHINE (`geoStats.
// countryTallies` — "the five mainnet machines that run both a validator and a metagraph node are
// two nodes here, exactly as they are two chips on the globe"). A first cut deduplicated machines
// across networks and its Finland arc did not match the Countries list's fifth (user, 2026-10-23:
// "finland (20 nodes out of almost 100 total) should have 1/5 of the whole circle but doesn't").
// Every level partitions the same participants — the ring the vitals band's donut rule asks for —
// the DAG core listed last so its validators read as the neutral remainder. A participant whose
// country or provider the lookup could not name is an UNKNOWN sub-arc, never dropped and never
// guessed (rule 10).

export interface RingMachine {
  ip: string;
  /** ISO country code of the machine's place, or null when the lookup could not say. */
  cc: string | null;
  /** The hosting provider, or null when unknown. */
  isp: string | null;
}

export interface RingNet {
  id: string;
  /** The network's scene-lane colour (`MetaLayout.color`), carried through for the adapter. */
  color: number;
  /** Its LOCATED participants, each once — the caller (the Globe) hands the `geoPrimary` records
   *  the Countries list counts, so a hybrid on several layers is one node here as there. */
  machines: readonly RingMachine[];
}

export interface RingSegment {
  /** The country code (null = unknown) — every level carries it. */
  cc: string | null;
  /** The provider (null = unknown) — the provider and network levels carry it. */
  isp?: string | null;
  /** The network — the network level only. */
  net?: string;
  /** Every network with a machine under this arc (one entry on the network level): what a
   *  network selector lights. */
  nets: string[];
  count: number;
  /** Of the located fleet, 0..1 (every level sums to one). */
  share: number;
  /** Arc angles in radians, clockwise from the top (−π/2), gaps already taken. */
  from: number;
  to: number;
  /** The network's hue on the network level; `null` elsewhere and for the DAG remainder, drawn
   *  in the structural accent. */
  color: number | null;
}

export interface RingLevels {
  countries: RingSegment[];
  providers: RingSegment[];
  networks: RingSegment[];
}

/** The gap between two arcs of the outer ring, radians — one hairline at the ring's radius; the
 *  inner levels keep half of it between siblings so a parent's span stays readable as one. */
export const RING_GAP = 0.05; // 0.02 → 0.05 (user, 2026-10-24: "the gaps between sections bigger")
export const RING_SUB_GAP = RING_GAP / 2;
/** An arc's tier under the selectors: `rest` while nothing is selected (every arc at the ring's
 *  resting presence), `lit` for the subject's arcs, `dim` for the rest. The adapter turns the tier
 *  into presence with the geo view's OWN focus row (`dimModel.FOCUS_TUNE.geo` — boost and back, the
 *  numbers the chips answer to), so the ring never carries a dim of its own (user, 2026-10-23:
 *  "be careful with one-off deviations if there is a clear standard for the app"). */
export type RingTier = "rest" | "lit" | "dim";

interface Owned extends RingMachine { net: string; color: number | null }

/** Every participant tagged with its network, the DAG core's last (the unit above). */
function ownMachines(nets: readonly RingNet[], dagId: string): Owned[] {
  const out: Owned[] = [];
  const metas = nets.filter((n) => n.id !== dagId);
  const dag = nets.find((n) => n.id === dagId);
  for (const n of [...metas, ...(dag ? [dag] : [])]) {
    for (const m of n.machines) out.push({ ...m, net: n.id, color: n.color });
  }
  return out;
}

/** All three levels: countries, each country's providers nested in its arc, each provider's
 *  networks nested in that. Sub-arcs tile their parent's span minus the gaps between siblings,
 *  biggest first; the unknown bucket (a null code or provider) sorts last. */
export function ringLevels(nets: readonly RingNet[], dagId: string, filter: string = "all"): RingLevels {
  // THE COMMITTED FILTER RE-PARTITIONS (user, 2026-10-24: "apply the filter"): the globe isolates
  // its off-filter nodes (`hide`), so the rings count the filtered network's participants alone —
  // its countries, their providers, one hue — rather than dimming the others in place.
  const owned = ownMachines(filter === "all" ? nets : nets.filter((n) => n.id === filter), dagId);
  const total = owned.length;
  const out: RingLevels = { countries: [], providers: [], networks: [] };
  if (total === 0) return out;
  const netsOf = (items: readonly Owned[]) => [...new Set(items.map((m) => m.net))];

  const byCc = groupBy(owned, (m) => m.cc);
  // One arc is a whole circle, not a circle with one gap (user, 2026-10-24: "if the circle has
  // only 1 segment, we don't need the empty space between segments"); the sub-levels already tile
  // with `groups − 1` gaps, so a lone child spans its parent.
  const sweep = Math.PI * 2 - (byCc.length > 1 ? RING_GAP * byCc.length : 0);
  let a = -Math.PI / 2;
  for (const c of byCc) {
    const from = a;
    const to = a + (c.items.length / total) * sweep;
    a = to + RING_GAP;
    out.countries.push({ cc: c.key, nets: netsOf(c.items), count: c.items.length, share: c.items.length / total, from, to, color: null });

    tile(groupBy(c.items, (m) => m.isp), from, to, (isp, pm, pf, pt) => {
      out.providers.push({ cc: c.key, isp, nets: netsOf(pm), count: pm.length, share: pm.length / total, from: pf, to: pt, color: null });
      tile(groupBy(pm, (m) => m.net), pf, pt, (net, nm, nf, nt) => {
        out.networks.push({ cc: c.key, isp, net: net!, nets: [net!], count: nm.length, share: nm.length / total, from: nf, to: nt, color: nm[0]!.color });
      });
    });
  }
  return out;
}

function groupBy<T extends RingMachine>(items: readonly T[], key: (m: T) => string | null): { key: string | null; items: T[] }[] {
  const map = new Map<string | null, T[]>();
  for (const m of items) {
    const k = key(m) || null;
    const arr = map.get(k);
    if (arr) arr.push(m);
    else map.set(k, [m]);
  }
  // Biggest first; the unknown bucket last whatever its size.
  return [...map.entries()]
    .map(([k, v]) => ({ key: k, items: v }))
    .sort((x, y) => (x.key == null ? 1 : 0) - (y.key == null ? 1 : 0) || y.items.length - x.items.length);
}

/** Lay `groups` along [from, to) with `RING_SUB_GAP` between siblings, proportional to size. */
function tile<T extends RingMachine>(
  groups: readonly { key: string | null; items: T[] }[],
  from: number,
  to: number,
  emit: (key: string | null, items: T[], f: number, t: number) => void,
): void {
  const n = groups.reduce((s, g) => s + g.items.length, 0);
  const sweep = Math.max(0, to - from - RING_SUB_GAP * (groups.length - 1));
  let a = from;
  for (const g of groups) {
    const f = a;
    const t = a + (g.items.length / n) * sweep;
    a = t + RING_SUB_GAP;
    emit(g.key, g.items, f, t);
  }
}

/** An arc's tier under the selectors: the network (the hover, else the committed filter — All
 *  selects nothing; an outer arc counts as the network's when a machine of that network sits under
 *  it) and the country (the hover, else the committed drill). With neither, every arc rests. The
 *  subject lights its arcs on every level; everything else dims. One rule for the rings, the chips
 *  and the explorer rows. */
export function ringPresence(seg: RingSegment, hover: string | null, filter: string, cc: string | null = null): RingTier {
  const sel = hover ?? filter;
  if (sel === "all" && cc == null) return "rest";
  const netLit = sel === "all" || seg.nets.includes(sel);
  const ccLit = cc == null || seg.cc === cc;
  return netLit && ccLit ? "lit" : "dim";
}
