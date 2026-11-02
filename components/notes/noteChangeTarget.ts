import { compositionGroups, compositionKey, roleKeyLabel } from "@/src/data/composition";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { cohortOfProvider } from "@/src/data/ladderLevels";
import type { NoteChange, NoteChangeSubject, NoteGlobal, NoteView } from "@/src/data/noteTypes";
import { metaSnapHoverKey, type GlobalSnapshot, type MetaSnapSel, type NodeRow, type PickDescriptor, type TickNetSel } from "@/src/data/types";
import type { CohortSel, CompositionSel } from "@/src/engine/domain/focusLadder";
import {
  compositionToggleActions,
  countryToggleActions,
  metaSnapSelectActions,
  noteCohortActions,
  railNetActions,
  snapshotSelectActions,
  tickNetSelectActions,
  type ClickAction,
} from "@/src/engine/domain/pickActions";
import { heldOut, viewNetwork } from "@/src/engine/domain/viewNetwork";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// WHAT A NOTABLE CHANGE'S ROW IS ABOUT (user, 2026-10-31: "related to a clickable subject"): the
// row commits what the view's own explorer row for that subject commits, through the same table
// (rule 2), and hovers on the same channel (rule 9). So in Snapshots a network commits INSIDE a
// tick and never writes the filter, and in Geography neither a country nor a provider does.

export interface ChangeState {
  filter: string;
  /** Snapshots: the tick and the follow state its rows commit against. */
  following?: boolean;
  pinnedOrdinal?: number | null;
  inspect?: PickDescriptor | null;
  tickNet?: TickNetSel | null;
  railNet: string | null;
  country: string | null;
  cohort: CohortSel | null;
  composition: CompositionSel | null;
  hasInspect: boolean;
  metaSnap: MetaSnapSel | null;
  /** The network the Snapshots card stands on (`ledgerNetwork`). */
  ledgerNet: string | null;
}

/** A global snapshot as a pick: the record a row carries, the road the raw log takes to an old tick. */
const globalPick = (g: NoteGlobal): Extract<PickDescriptor, { kind: "snapshot" }> => ({ kind: "snapshot", title: `Global snapshot #${g.ordinal}`, data: g as GlobalSnapshot });

const compKeyOf = (type: string): string => {
  const { label, codes } = roleKeyLabel(type);
  return compositionKey(label, codes);
};

/** The clicks a row makes, or null when its subject has nothing to open any more. `tick` is the
 *  newest tick the row's network anchored into (`latestTickOf`), read only in Snapshots. */
export function changeActions(
  { subject }: NoteChange,
  view: NoteView,
  s: ChangeState,
  rows: readonly NodeRow[],
  tick: GlobalSnapshot | null,
): ClickAction[] | null {
  switch (subject.kind) {
    case "network":
      if (!VIEW_POLICIES[view].tickScoped)
        return subject.id === viewNetwork(s) || heldOut(s.filter, subject.id) ? null : railNetActions(subject.id, s.filter);
      if (!tick || subject.id === "dag") return null; // the chamber's own row names no network to open
      return tickNetSelectActions(subject.id, { kind: "snapshot", title: `Global snapshot #${tick.ordinal}`, data: tick }, {
        metaSnap: s.metaSnap,
        hasInspect: s.hasInspect,
        net: s.ledgerNet,
      });
    case "type":
      return compositionToggleActions({ netId: subject.netId, key: compKeyOf(subject.type) }, { ...s, filter: s.railNet ?? s.filter });
    case "country":
      return countryToggleActions(subject.cc, s);
    case "provider": {
      const c = cohortOfProvider(rows, subject.keys, subject.cc, subject.city);
      return c ? noteCohortActions({ cc: c.cc, city: c.city, isp: c.isp }, s) : null;
    }
    case "metaSnap":
      return metaSnapSelectActions(subject.sel, globalPick(subject.global), { metaSnap: s.metaSnap, following: s.following, inspect: s.inspect ?? null });
    case "global":
      return snapshotSelectActions(globalPick(subject.global), false, {
        pinnedOrdinal: s.pinnedOrdinal ?? null,
        metaSnap: s.metaSnap,
        hasInspect: s.hasInspect,
        tickNet: s.tickNet,
      });
    case "self":
      return null;
  }
}

/** Whether a row's clicks leave the card it sits on standing: an explorer row toggles, but a row on a
 *  subject's own card must not clear the subject under the reader. */
export const staysOnCard = (acts: readonly ClickAction[]): boolean =>
  !acts.some((a) => (a.kind === "cohort" && a.sel == null) || (a.kind === "country" && a.cc == null));

/** The store channel a row previews on, the key its explorer row uses, and the nodes it lights. */
export interface ChangeHover {
  channel: "filter" | "country" | "group" | "metaSnap" | "snap";
  key: string;
  nodes?: string[];
  cc?: string;
}

const nodeKeys = (rows: readonly NodeRow[]) => rows.map((r) => hoverKeyOf(r.pick)).filter((k): k is string => !!k);

export function changeHover({ subject }: { subject: NoteChangeSubject }, rows: NodeRow[]): ChangeHover | null {
  switch (subject.kind) {
    case "self":
      return null;
    case "metaSnap":
      return { channel: "metaSnap", key: metaSnapHoverKey(subject.sel.metaId, subject.sel.ordinal) };
    case "global":
      return { channel: "snap", key: String(subject.global.ordinal) };
    case "network":
      return { channel: "filter", key: subject.id };
    case "country":
      return { channel: "country", key: subject.cc };
    case "type": {
      const key = compKeyOf(subject.type);
      const group = compositionGroups(rows).find((g) => g.key === key);
      return group ? { channel: "group", key: `${subject.netId}|${key}`, nodes: nodeKeys(group.rows) } : null;
    }
    case "provider": {
      const c = cohortOfProvider(rows, subject.keys, subject.cc, subject.city);
      return c ? { channel: "group", key: `${c.cc}|${c.city}|${c.isp}`, nodes: nodeKeys(c.rows), cc: c.cc } : null;
    }
  }
}
