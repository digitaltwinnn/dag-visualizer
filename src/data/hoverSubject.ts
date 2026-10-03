import type { PickDescriptor } from "./types";
import { METAGRAPHS } from "@/src/net/current";
import { identityHudCss } from "@/src/palette/identity";
import { UNLISTED_HUE } from "@/src/data/unlistedId";

// THE COLOUR IS THE HOVERED OBJECT'S OWN (user, 2026-10-03: "hover should take the color from the
// object it hovers (not the filter color)"). The DAG's nodes, its core and a global snapshot are
// the DAG's, and the DAG has an identity hue like any network (the unified node model) — they
// used to hover in the structural accent, which is also the colour of the "All" filter, so a blue
// DAG node hovered cyan. `identityHudCss` is a CSS expression resolved at render time, so this
// module stays Node-test-safe (no DOM read).
const DAG = identityHudCss("dag");
// A country belongs to no network: its hover keeps the structural accent its border preview
// is drawn in. `var(--primary)` tracks the network's [data-net] accent override by itself.
const CORE = "var(--primary)";

// The stable hover-pairing KEY for a NODE pick: a validator by its MACHINE id (so a hybrid's
// several layer-shells read as one machine), a metagraph node by its IP. Anything else → null.
// Shared by the engine (3D raycast) and the geo explorer rows so both sides pair identically.
export function hoverKeyOf(p: PickDescriptor | null | undefined): string | null {
  if (!p) return null;
  if (p.kind === "metanode") return p.node?.ip ?? null;
  if (p.kind === "l0" || p.kind === "l1") return p.node?.id ?? null;
  return null;
}

// A lean tooltip label for a hovered 3D subject: identity ticker, short subject name, identity
// hue (core cyan for non-metagraph subjects). `mono` marks a machine-hash name to short-render.
// Facts (state/layer/location) are NOT here — they live in the card that opens on click.
export interface HoverSubject {
  /** WHAT the pointer is on — the hover card wears that kind's mark, the one its card wears
   *  (2026-10-03). Before it, a global snapshot and a metagraph snapshot both hovered as a bare
   *  number, and the global one borrowed an "L0" chip that read as a layer. */
  kind: "node" | "network" | "snapshot" | "metaSnap" | "country";
  /** The network whose logo a `network` hover draws. */
  netId?: string;
  ident: string; // identity ticker: a metagraph symbol or "DAG"; "" where the subject has none
  name: string; // the subject: node id/ip, metagraph name, "Global L0", an ordinal, a country code
  color: string; // identity hue hex (metagraph colour, or core cyan)
  mono?: boolean; // name is a machine hash → render monospace + short
}

export function tooltipSubject(p: PickDescriptor | null | undefined): HoverSubject | null {
  if (!p) return null;
  switch (p.kind) {
    case "metanode":
      return {
        kind: "node",
        ident: p.meta?.symbol || p.meta?.name || "metagraph",
        name: p.node?.id || p.node?.ip || "node",
        color: p.meta ? identityHudCss(p.meta.id) : DAG,
        mono: !!p.node?.id,
      };
    case "l0":
    case "l1":
      return { kind: "node", ident: "DAG", name: p.node?.id || p.node?.ip || "node", color: DAG, mono: !!p.node?.id };
    case "core":
      return { kind: "network", netId: "dag", ident: "DAG", name: "Global L0", color: DAG, mono: false };
    case "meta":
      return { kind: "network", netId: p.cfg.id, ident: p.cfg.ticker || p.cfg.name, name: p.cfg.name, color: identityHudCss(p.cfg.id), mono: false };
    case "snapshot":
      return { kind: "snapshot", ident: "", name: p.data.ordinal.toLocaleString(), color: DAG, mono: false };
    case "metaSnap": {
      // A tile on the metagraph-snapshot floor. Same vocabulary as its card: the metagraph's own
      // ticker as the identity, its OWN ordinal as the subject. An UNLISTED channel has no config
      // row, so its address is the only name it has (the card's fallback, shortened here).
      const cfg = METAGRAPHS.find((m) => m.id === p.sel.metaId);
      const ident = cfg?.ticker || cfg?.name || p.sel.metaId.slice(0, 6) + "…";
      // ⚠️ AN UNLISTED CHANNEL HOVERS IN THE UNLISTED SET'S NEUTRAL, like its card (2026-10-03).
      // Hashing its address through the identity palette minted a hue per channel — the fault
      // the card dropped on 2026-08-08 ("pink icons for a set that deliberately has no identity
      // of its own") had survived here, one surface over.
      return { kind: "metaSnap", ident, name: p.sel.ordinal.toLocaleString(), color: cfg ? identityHudCss(cfg.id) : UNLISTED_HUE, mono: false };
    }
    default:
      return null; // geoLive is a rail-only proxy, never a 3D-hover subject
  }
}

/** The hover card for LAND in Geography (2026-10-03): moving over a country lit its border and
 *  said nothing — the one place the scene answered the pointer without naming what it was on.
 *  `name` is the ISO code; the card resolves the display name, as the country's own card does. */
export function countrySubject(cc: string): HoverSubject {
  return { kind: "country", ident: "", name: cc, color: CORE, mono: false };
}
