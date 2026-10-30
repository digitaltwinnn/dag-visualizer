import { parseCompositionKey, roleKeyOfCodes } from "@/src/data/composition";
import { providerKey } from "@/src/data/providerKey";
import type { NoteReq } from "./noteLoader";

// A SUBJECT CARD'S OWN NOTE (spec 2026-10-29-subject-notes): the request a Country, Provider,
// Composition or Range card asks with, in the subject forms the server accepts
// (`app/api/notes/keys.ts`). Pure: the caller hands in the network the card's lead is scoped by
// and the repo's "is this the unlisted network" predicate, so this module reads no store.
//
// One note per card, SCOPED AS THE LEAD: a country or provider card counts the filter's nodes, so
// its note does too — the fleet's (`cc:FI`) with no filter, the network's (`dor/cc:FI`) under one.
// "dag" is a network here, not the fleet. The unlisted network has no measured history of its own,
// so no note.

type Unlisted = (id: string) => boolean;

/** The network a subject note is scoped to: null for the fleet ("all" or no filter); an unlisted network has no note (undefined = none). */
export function noteScopeOf(network: string | null, unlisted: Unlisted): string | null | undefined {
  if (network == null || network === "all") return null;
  return unlisted(network) ? undefined : network;
}

function scoped(tail: string, network: string | null, unlisted: Unlisted): NoteReq | null {
  const scope = noteScopeOf(network, unlisted);
  if (scope === undefined) return null;
  return { view: "geo", subject: scope == null ? tail : `${scope}/${tail}` };
}

/** Geography's country: `cc:XX` for the fleet, `<net>/cc:XX` under a filter. */
export function countryNoteReq(cc: string, network: string | null, unlisted: Unlisted): NoteReq | null {
  return scoped(`cc:${cc}`, network, unlisted);
}

/** Geography's provider, keyed by the slug the sampler's series carry (`providerKey`); an unknown
 *  host is left uncounted there, so it has no note here either. */
export function providerNoteReq(isp: string | null, network: string | null, unlisted: Unlisted): NoteReq | null {
  const key = providerKey(isp);
  return key ? scoped(`isp:${key}`, network, unlisted) : null;
}

/** Hypergraph's layer group: always one network's (`sel.netId`), its codes as the stored type key.
 *  The DAG core's groups included since 2026-10-30: the sampler has written `f.type.dag.*` since
 *  the 2026-10-29 19:00Z run (PR #80), so the guard that spared an ask that could only answer
 *  `none` is lifted (user: "Composition card is missing its AI section"). */
export function typeNoteReq(sel: { netId: string; key: string }, unlisted: Unlisted): NoteReq | null {
  if (unlisted(sel.netId)) return null;
  return { view: "hyper", subject: `${sel.netId}/type:${roleKeyOfCodes(parseCompositionKey(sel.key).codes)}` };
}

/** History's brushed range, on the plane the card stands on — the hypergraph ("dag") for all, the
 *  core or no card, as the top card folds it (`noteSubjectOf`). No range brushed, no note. */
export function rangeNoteReq(trendCard: string | null, range: { fromMs: number; toMs: number } | null, unlisted: Unlisted): NoteReq | null {
  if (!range) return null;
  const net = trendCard == null || trendCard === "all" ? "dag" : trendCard;
  if (unlisted(net)) return null;
  // WHOLE MILLISECONDS (review 2026-10-29): a brush is read off the pointer (`msAtX`), so its ends
  // are fractional, and both the loader's range pattern and the route's `MS_RE` take digits only —
  // a fractional span was a `bad span`, and the Range card's note never appeared for a brush under
  // two days (the only ones `snapRange` leaves unsnapped).
  return { view: "trend", subject: net, span: `r${Math.round(range.fromMs)}-${Math.round(range.toMs)}` };
}

/** THE RANGE CARD'S NOTE IN BOTH ITS MODES (user, 2026-10-30: "the range card never shows an AI
 *  note in the default mode [until now]"). Brushed, the range's (`rangeNoteReq`). Standing on the
 *  WINDOW, the plane the card stands on over the window pill (`cardNetwork`: the plane brought
 *  forward, else the filter, the hypergraph for All) — ALWAYS (the same day, second round: "the
 *  default range never shows an AI section, fix it … for DAG only I noticed"). A first cut left it
 *  out where it was the top Gate AI card's own subject (the pile rule), which read as the card
 *  having no note under the DAG filter; a second cut repeated the top card's note there, which
 *  "looks strange", so the window mode asks the SPAN FACET: its own question over the plane's facts. */
export function rangeCardNoteReq(
  trendCard: string | null,
  range: { fromMs: number; toMs: number } | null,
  windowId: string,
  unlisted: Unlisted,
): NoteReq | null {
  if (range) return rangeNoteReq(trendCard, range, unlisted);
  const net = trendCard == null || trendCard === "all" ? "dag" : trendCard;
  if (unlisted(net)) return null;
  // THE SPAN FACET (`<net>/span`, `app/api/notes/keys.ts`): the plane's own facts over the window,
  // asked the span's question, so the card never repeats the top card's note (user, 2026-10-30:
  // "direct copy looks strange").
  return { view: "trend", subject: `${net}/span`, span: windowId };
}
