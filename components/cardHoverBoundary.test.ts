// A SUBJECT CARD HOVERS ITS OWN SUBJECT (user, 2026-11-09: "Right card rung, hover on 'data block'
// card but metagraph snapshot gets the hover; fix structurally"). Convention 9 says a surface hovers
// the subject it would COMMIT. The Data block card broke it quietly: with no channel of its own it
// paired on its snapshot's (`hoverMetaSnap`), so hovering the data block lit the snapshot's tile and
// card. It has its own channel now (`hoverDataBlock`), and this file keeps every rail card on its own.
//
// Scope: each subject card's file, and the hover channels its `subjectPairing` calls may name. A
// file with several cards (Inspector's snapshot, node, country and group cards) lists each card's
// channel. Two cards of different subjects may never pair on one channel, and every
// `components/inspector/*Pane.tsx` that pairs must be listed here, so a new card joins the table.
// Exempt, with its reason: `TrendInstantPane.tsx` pairs the network ROWS inside the Moment card on
// `hoverFilter` (each row is a network, the subject it commits); the card itself pairs nothing.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Each subject card's file → the hover channels its pairings may name (one per card it holds). */
const CARD_CHANNELS: Record<string, readonly string[]> = {
  "components/Inspector.tsx": ["hoverSnapOrd", "hoverNodeId", "hoverCountry", "hoverGroup"],
  "components/ContextCard.tsx": ["hoverFilter"],
  "components/inspector/MetaSnapPane.tsx": ["hoverMetaSnap"],
  "components/inspector/BlockPane.tsx": ["hoverBlock"],
  "components/inspector/DataBlockPane.tsx": ["hoverDataBlock"],
};
/** Panes whose pairings are rows inside the card, not the card (see the header). */
const ROW_PAIRING = new Set(["components/inspector/TrendInstantPane.tsx"]);

/** The first argument of every `subjectPairing(` call in a source. */
function pairedChannels(src: string): string[] {
  return [...src.matchAll(/subjectPairing(?:<[^>]*>)?\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!);
}

describe("a subject card hovers its own subject", () => {
  it("every card pairs only on its own subject's channel", () => {
    const offenders: string[] = [];
    for (const [file, allowed] of Object.entries(CARD_CHANNELS)) {
      for (const ch of pairedChannels(readFileSync(file, "utf8"))) {
        if (!allowed.includes(ch)) offenders.push(`${file} pairs on ${ch}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  it("the Data block card pairs on the data block's channel, never its snapshot's", () => {
    const channels = pairedChannels(readFileSync("components/inspector/DataBlockPane.tsx", "utf8"));
    expect(channels).toEqual(["hoverDataBlock"]);
  });
  it("no two cards of different subjects share a channel", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const [file, channels] of Object.entries(CARD_CHANNELS)) {
      for (const ch of channels) {
        const prev = owner.get(ch);
        if (prev && prev !== file) clashes.push(`${ch}: ${prev} and ${file}`);
        owner.set(ch, file);
      }
    }
    expect(clashes).toEqual([]);
  });
  it("every inspector pane that pairs is in the table", () => {
    const dir = "components/inspector";
    const missing = readdirSync(dir)
      .filter((n) => n.endsWith("Pane.tsx"))
      .map((n) => join(dir, n))
      .filter((f) => !ROW_PAIRING.has(f) && !(f in CARD_CHANNELS) && pairedChannels(readFileSync(f, "utf8")).length > 0);
    expect(missing).toEqual([]);
  });
});
