"use client";

import type { CSSProperties } from "react";

import type { ExplorerRowSpec } from "@/components/explorer/Explorer";
import { IdentityDot, RoleChips } from "@/components/inspector/parts";
import { layerCodesOf } from "@/src/data/composition";
import { shortHash } from "@/src/data/network";
import { nodeStatus } from "@/src/data/nodeStatus";
import type { NodeRow } from "@/src/data/types";
import { midHash } from "@/src/util/format";

// THE ONE NODE ROW (design session 2026-09-26, `node-rows.html` D): a node level is the last step
// in every explorer — under a composition in Hypergraph, under a city · provider cohort in
// Geography, under a snapshot in Snapshots (its signers) — and the three used to differ in id
// length, in what the tag said and in whether there was a glyph. Every one of them now builds its
// rows here, so they agree by construction (user: "ensure they are consistent").
//
//   glyph   · the node's network, as its hue dot
//   name    · the node id, mono, ONE length everywhere
//   tag     · the network's TICKER where the level mixes networks (a cohort), then the node's
//             LAYER chips (the same `RoleChips` the composition rows wear), then its STATE as a
//             small dot in the state's bucket colour
//
// The state dot is colour, and identity is never colour alone (the design system's rule), so the
// state's word rides the dot as its accessible name and the row's title spells everything out:
// the id in its short form, the network, the layers, the state.

/** The state as a dot in its bucket colour; the word is the dot's accessible name. */
export function StateDot({ state }: { state?: string | null }) {
  const s = nodeStatus(state);
  return (
    <span
      role="img"
      aria-label={s.label}
      title={s.label}
      className="inline-block size-1.5 flex-none rounded-full"
      style={{ background: s.color, boxShadow: `0 0 0 2px color-mix(in oklch, ${s.color} 24%, transparent)` } as CSSProperties}
    />
  );
}

/** One length for every node id, in every explorer. */
// Fourteen: beside the widest tag (a ticker or three chips, and the dot) the id still shows whole.
export const NODE_ID_GLYPHS = 14;

export function nodeRowSpec(args: {
  key: string;
  row: NodeRow;
  /** The row's network: its hue, and the ticker where the level shows one. */
  hue: string;
  ticker?: string;
  on: boolean;
  onClick: () => void;
  pair: ExplorerRowSpec["pair"];
}): ExplorerRowSpec {
  const { row, hue, ticker } = args;
  const id = row.id ?? row.label;
  const codes = layerCodesOf([row]);
  const status = nodeStatus(row.state);
  return {
    key: args.key,
    glyph: <IdentityDot hue={hue} />,
    name: midHash(id, NODE_ID_GLYPHS),
    nameMono: true,
    tag: (
      <>
        {ticker && <span>{ticker}</span>}
        {codes.length > 0 && <RoleChips codes={codes} tight />}
        <StateDot state={row.state} />
      </>
    ),
    on: args.on,
    hue,
    // The hover names the row's facts in words; the id stays in its SHORT form (a full 128-glyph
    // id was "a very long text" — user, 2026-09-26). The whole id is the Node card's, one click on.
    title: `${shortHash(id)}${ticker ? ` · ${ticker}` : ""}${codes.length ? ` · ${codes.join(" ")}` : ""} · ${status.label}`,
    onClick: args.onClick,
    pair: args.pair,
  };
}

/** A signer that resolves to no node: the same row, faint, with the honest word for its tag and
 *  no affordance — there is no node to commit. */
export function unknownNodeRowSpec(args: { key: string; id: string; label: string; title: string; hue: string }): ExplorerRowSpec {
  return {
    key: args.key,
    glyph: <IdentityDot hue={args.hue} />,
    name: midHash(args.id, NODE_ID_GLYPHS),
    nameMono: true,
    tag: <span className="italic">{args.label}</span>,
    faint: true,
    title: args.title,
  };
}
