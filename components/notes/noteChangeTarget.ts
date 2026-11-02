import { compositionGroups, compositionKey, roleKeyLabel } from "@/src/data/composition";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { cohortOfProvider } from "@/src/data/ladderLevels";
import type { NoteChange, NoteChangeSubject, NoteView } from "@/src/data/noteTypes";
import type { GlobalSnapshot, MetaSnapSel, NodeRow } from "@/src/data/types";
import type { CohortSel, CompositionSel } from "@/src/engine/domain/focusLadder";
import {
  compositionToggleActions,
  countryToggleActions,
  filterToggleActions,
  noteCohortActions,
  tickNetSelectActions,
  type ClickAction,
} from "@/src/engine/domain/pickActions";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// WHAT A NOTABLE CHANGE'S ROW IS ABOUT (user, 2026-10-31: "related to a clickable subject"): the
// row commits what the view's own explorer row for that subject commits, through the same table
// (rule 2), and hovers on the same channel (rule 9). So in Snapshots a network commits INSIDE a
// tick and never writes the filter, and in Geography neither a country nor a provider does.

export interface ChangeState {
  filter: string;
  railNet: string | null;
  country: string | null;
  cohort: CohortSel | null;
  composition: CompositionSel | null;
  hasInspect: boolean;
  metaSnap: MetaSnapSel | null;
  /** The network the Snapshots card stands on (`ledgerNetwork`). */
  ledgerNet: string | null;
}

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
      if (!VIEW_POLICIES[view].tickScoped) return filterToggleActions(subject.id, s.filter, s.railNet);
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
  }
}

/** The store channel a row previews on, the key its explorer row uses, and the nodes it lights. */
export interface ChangeHover {
  channel: "filter" | "country" | "group";
  key: string;
  nodes?: string[];
  cc?: string;
}

const nodeKeys = (rows: readonly NodeRow[]) => rows.map((r) => hoverKeyOf(r.pick)).filter((k): k is string => !!k);

export function changeHover({ subject }: { subject: NoteChangeSubject }, rows: NodeRow[]): ChangeHover | null {
  switch (subject.kind) {
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
