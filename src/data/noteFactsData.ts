import { BLOCK_WINDOW_TICKS } from "@/src/data/blockWindow";
import { fact } from "@/src/data/noteFacts";
import type { Fact, NoteLead } from "@/src/data/noteTypes";
import { SUBMITTERS, submitterLabel } from "@/src/data/submitters";
import type { ChannelSnapRow } from "@/src/data/types";
import { UNLISTED_ID } from "@/src/data/unlistedId";

// THE DATA BLOCKS' FACTS BUILDER — what the Data blocks register's note is shown (2026-11-07; user:
// "AI card content for each sub-view … I think it makes a lot of sense to focus on each separately",
// then "option 2, let's see if it holds up w.r.t. costs"). Its source is the LIVE WINDOW the chamber
// itself reads — the newest global snapshots' exact reads (`app/api/notes/dataWindow.ts`), the same
// rows the band's DATA UPDATES and the tiles' marks are drawn from — because no sampled series holds
// a data-block count: that fact exists only inside a decoded metagraph snapshot. So the note states,
// for the minutes the window covers, which networks carried data blocks, how many, and how many
// updates they carried; nothing earlier, so nothing "rose" or "fell".
//
// HONESTY (rule 10):
//   · a tick whose exact read did not land is NOT READ: the counts are a floor over the ticks read,
//     stated as "N of M global snapshots read" — never scaled up; with every read landed there is no
//     floor and the read count is not stated at all;
//   · a network that carried no data block over the window is not listed (a network that wrote
//     nothing is no news); the whole network's zero is a reading and stands;
//   · an undecodable row states no count, so a network with one is stated as a floor (", at least");
//   · null when no tick was read at all: no note rather than a note about nothing.
//
// THE WINDOW'S END IS A FACT (user, 2026-11-10): the note is written hourly and read for up to an hour
// after, so it never says "right now". The newest global snapshot's time is stated as a UTC clock
// time ("14:05 UTC", the `time` kind — a note is written for every reader, so the zone is the one
// they share), and the note says the counts are as of then.
//
// WHO SUBMITTED THE DATA (2026-11-27): ONE NETWORK'S note, for a network whose updates name their
// submitter (`submitters.ts`), states who, off the same rows (`DataBlockSummary.submitters`):
// Digital Evidence each organisation's batches in the window, by the label every surface gives it
// (`submitterLabel`, "Org 0f3a9b12" for one with no known name), every label joining `names` so the
// gate strips its digits; Dor how many devices checked in, never one of them. A block with no
// submitter read (unread, or a row that was not decoded) makes those counts a floor; none read at
// all states none. The whole network's note is unchanged.
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

/** The global snapshots the note reads: the chamber's own window (`BLOCK_WINDOW_TICKS`, 50). */
export const DATA_NOTE_TICKS = BLOCK_WINDOW_TICKS;

export interface DataTickRead {
  ordinal: number;
  /** The tick's anchored rows, or null where its exact read did not land. */
  rows: ChannelSnapRow[] | null;
}

export interface DataFactsInput {
  /** The window's ticks, any order. */
  ticks: DataTickRead[];
  /** catalog id → display name. A row whose address is not in it is the unlisted set's. */
  names: Record<string, string>;
  /** `netKeyOf`: the catalog id a row's address belongs to, or null for an uncataloged one. */
  keyOf: (metaId: string) => string | null;
  /** The window's END: the newest global snapshot's time (epoch ms), or null when it is unknown. */
  endMs?: number | null;
  /** ONE NETWORK'S NOTE (catalog id, 2026-11-20): its own data blocks alone — no whole-network totals,
   *  no count of networks — and null when it carried none over the window (no note about nothing). */
  only?: string;
  /** Organisation id → name (the `sub:` family's names hash), for the organisations `only` names.
   *  Absent (not read), no organisation is stated: "Org <id>" is a label only where the hash was
   *  read and holds no name. An empty hash is a read. */
  submitterNames?: Record<string, string>;
}

/** WHO SUBMITTED ONE NETWORK'S DATA over the ticks read (the header's rule), or nothing. */
function submitterFacts(input: DataFactsInput, read: DataTickRead[], id: string, floored: boolean): { facts: Fact[]; names: string[] } {
  const spec = SUBMITTERS[id]!;
  const by = new Map<string, number>();
  let known = 0;
  let floor = floored;
  for (const t of read) {
    for (const r of t.rows!) {
      if (input.keyOf(r.metaId) !== id) continue;
      if (!r.dataBlockRows) { if ((r.dataBlocks ?? 0) > 0) floor = true; continue; }
      for (const b of r.dataBlockRows) {
        if (!b.submitters) { floor = true; continue; }
        known++;
        for (const s of b.submitters) by.set(s.id, (by.get(s.id) ?? 0) + s.updates);
      }
    }
  }
  if (!known) return { facts: [], names: [] };
  const least = floor ? ", at least" : "";
  if (spec.kind === "device") return { facts: [fact(`Devices that checked in, in the window${least}`, by.size, "count")], names: [] };
  const names = input.submitterNames;
  if (!names) return { facts: [], names: [] };
  const ranked = [...by].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const labels = ranked.map(([sid]) => submitterLabel(sid, names));
  return { facts: ranked.map(([, n], i) => fact(`${labels[i]} ${spec.unit} in the window${least}`, n, "count")), names: labels };
}

export function dataFacts(input: DataFactsInput): { facts: Fact[]; names: string[]; lead: NoteLead; actors?: string[] } | null {
  const read = input.ticks.filter((t) => t.rows != null);
  if (!read.length) return null;
  const facts: Fact[] = [];
  if (input.endMs != null && Number.isFinite(input.endMs)) facts.push(fact("Window end, the newest global snapshot", input.endMs, "time"));
  // THE READ COUNT IS A FLOOR'S LABEL, NOT NEWS (user, 2026-11-09: "'all 52 global snapshots' read …
  // a technical confirmation which is of no use to the reader; focus on the core message"). Stated
  // only when a read is missing, which is the one time the counts below need it.
  if (read.length < input.ticks.length) {
    facts.push(fact("Global snapshots read", read.length, "count"));
    facts.push(fact("Global snapshots in the window", input.ticks.length, "count"));
  }

  const by = new Map<string, { blocks: number; updates: number; floor: boolean }>();
  let blocks = 0;
  let updates = 0;
  let anyFloor = false;
  for (const t of read) {
    for (const r of t.rows!) {
      const key = input.keyOf(r.metaId) ?? UNLISTED_ID;
      const e = by.get(key) ?? { blocks: 0, updates: 0, floor: false };
      if (!r.decoded) { e.floor = true; anyFloor = true; by.set(key, e); continue; }
      const b = r.dataBlocks ?? 0;
      if (b <= 0) { by.set(key, e); continue; }
      e.blocks += b;
      e.updates += r.dataTxCount ?? 0;
      blocks += b;
      updates += r.dataTxCount ?? 0;
      by.set(key, e);
    }
  }
  const only = input.only ?? null;
  if (only && !((by.get(only)?.blocks ?? 0) > 0)) return null;
  if (!only) {
    facts.push(fact(anyFloor ? "Data blocks, at least" : "Data blocks", blocks, "count"));
    facts.push(fact(anyFloor ? "Data updates, at least" : "Data updates", updates, "count"));
  }
  const order = Object.keys(input.names);
  const ids = [...by.keys()].filter((id) => by.get(id)!.blocks > 0 && (!only || id === only)).sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9));
  for (const id of ids) {
    const e = by.get(id)!;
    const name = input.names[id] ?? "unlisted networks";
    facts.push(fact(e.floor ? `${name} data blocks, at least` : `${name} data blocks`, e.blocks, "count"));
    facts.push(fact(e.floor ? `${name} data updates, at least` : `${name} data updates`, e.updates, "count"));
  }
  if (ids.length && !only) facts.push(fact("Networks that carried data blocks", ids.length, "count"));
  const subs = only && Object.hasOwn(SUBMITTERS, only) ? submitterFacts(input, read, only, by.get(only)!.floor) : null;
  if (subs) facts.push(...subs.facts);
  // The organisations named are the gate's actors (`CheckOptions.actors`), as History's are.
  const actors = subs?.names ?? [];
  return { facts, names: [...Object.values(input.names), ...actors], lead: { kind: "now" }, ...(actors.length ? { actors } : {}) };
}
