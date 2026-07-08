import type { PickDescriptor } from "./types";
import { hex } from "@/src/util/format";
import { COLORS } from "@/src/engine/config";
import { identityHudHex } from "@/src/palette/identity";

// Core cyan (the DAG spine) — the identity hue for every NON-metagraph subject (a DAG-core
// validator, the L0 core, a global snapshot). From the plain-constant config, NOT network.ts
// (browser-only), so this module stays Node-test-safe.
const CORE = hex((COLORS as { core: number }).core);

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
  ident: string; // identity ticker: a metagraph symbol, or "DAG" / "L0"
  name: string; // the subject: node id/ip, metagraph name, "Global L0", or "#<ordinal>"
  color: string; // identity hue hex (metagraph colour, or core cyan)
  mono?: boolean; // name is a machine hash → render monospace + short
}

export function tooltipSubject(p: PickDescriptor | null | undefined): HoverSubject | null {
  if (!p) return null;
  switch (p.kind) {
    case "metanode":
      return {
        ident: p.meta?.symbol || p.meta?.name || "metagraph",
        name: p.node?.id || p.node?.ip || "node",
        color: p.meta ? identityHudHex(p.meta.id) : CORE,
        mono: !!p.node?.id,
      };
    case "l0":
    case "l1":
      return { ident: "DAG", name: p.node?.id || p.node?.ip || "validator", color: CORE, mono: !!p.node?.id };
    case "core":
      return { ident: "DAG", name: "Global L0", color: CORE, mono: false };
    case "meta":
      return { ident: p.cfg.ticker || p.cfg.name, name: p.cfg.name, color: identityHudHex(p.cfg.id), mono: false };
    case "snapshot":
      return { ident: "L0", name: "#" + p.data.ordinal, color: CORE, mono: false };
    case "layer":
      // A settlement-stack floor plane (Snapshots view) — structural, so core cyan.
      return { ident: "LAYER", name: p.name, color: CORE, mono: false };
    default:
      return null; // geoLive is a rail-only proxy, never a 3D-hover subject
  }
}
