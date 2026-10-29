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

/** Hypergraph's make-up group: always one network's (`sel.netId`), its codes as the stored type key.
 *  The DAG core's make-ups have none: the sampler writes no `f.type.dag.*` series (the DAG node-type
 *  stack is the open sampler follow-up), and an ask that can only answer `none` would flash
 *  "writing…" and spend a limited request (final review I2). */
export function typeNoteReq(sel: { netId: string; key: string }, unlisted: Unlisted): NoteReq | null {
  if (unlisted(sel.netId) || sel.netId === "dag") return null;
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
