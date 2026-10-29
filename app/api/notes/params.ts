import type { NoteView } from "@/src/data/noteTypes";
import { roleKey } from "@/src/data/composition";
import { currentIdOf, isTracked } from "@/src/net/lineage";
import { KIND_TIMING, isSubjectNote, snapSpan, timingOf, type NoteSpan } from "./keys";

// THE NOTE ROUTES' INPUT — one home for what a request may ask for, so the read route, the request
// route and the CDN all see the same shapes. Bad input is an ERROR with a short fixed message,
// never an echo of what was sent.
//
// A subject is `all`, `dag` (the ledger's is `all`: one whole network, one note), a network the catalog tracks (a FORMER address answers as its network's
// current id, so a re-registered network keeps one note), or a country `cc:XX` for Geography. A
// SUBJECT NOTE is one selection's: Geography's `<net>/cc:XX`, `isp:<key>` and `<net>/isp:<key>`,
// Hypergraph's `<net>/type:<roleKey>`, where `<net>` is `dag` or a tracked network resolved as
// above, `<key>` a provider's slug (`providerKey`) and `<roleKey>` a make-up spelled as `roleKey`
// spells it, so one make-up has one key. The span is fixed by the view except History's: a
// pill, or a brushed `from`/`to` snapped by `snapSpan` so near-identical brushes share one key.
// Notes exist for mainnet only, so the catalog asked is
// mainnet's; whether this particular view writes a note for this subject is the generator's call
// (`noteSupported`), which answers `none` rather than an error.

const VIEWS: readonly NoteView[] = ["hyper", "geo", "ledger", "trend"];
const FIXED_SPAN: Partial<Record<NoteView, NoteSpan>> = { hyper: "day", geo: "day", ledger: "hours" };
const PILLS: readonly NoteSpan[] = ["1h", "24h", "7d", "30d", "1y", "all"];
/** History's one on-request pill (`timingOf` says on-request); the request route writes it, a
 *  brushed range and the subject notes. */
const ON_REQUEST_PILL: NoteSpan = "1h";
const CC_RE = /^cc:[A-Z]{2}$/;
const ISP_RE = /^isp:[a-z0-9-]{1,48}$/;
const TYPE_RE = /^type:((?:l0|cl1|dl1)(?:\+(?:l0|cl1|dl1)){0,2}|none)$/;
const MS_RE = /^\d{1,15}$/;
const NET = "mainnet";

export interface NoteParams {
  view: NoteView;
  subject: string;
  span: NoteSpan;
}
/** `none`: a well-formed brush with no span in it (empty, shorter than one bucket, or in the
 *  future once snapped). Not an error: the reader's brush is legitimate, there is just no note for
 *  it, so the route answers `none` and the card stays away rather than reading "unavailable". */
type Parsed = NoteParams | { error: string } | { none: true };

/** A tracked network as its current id; null for an address the catalog does not track. */
function networkOf(raw: string): string | null {
  if (!isTracked(NET, raw)) return null;
  const current = currentIdOf(NET, raw);
  return current && isTracked(NET, current) ? current : null;
}

/** A subject note's selection, per view. A make-up must be its own `roleKey` (vocabulary order, no
 *  repeat), so `cl1+l0` and `l0+l0` are refused rather than given a second key for one make-up. */
function selectionOk(view: NoteView, tail: string): boolean {
  if (view === "geo") return CC_RE.test(tail) || ISP_RE.test(tail);
  if (view !== "hyper") return false;
  const m = TYPE_RE.exec(tail);
  return m != null && roleKey({ roles: m[1]!.split("+") }) === m[1];
}

function subjectOf(view: NoteView, raw: string | null): string | null {
  if (raw == null) return null;
  if (raw === "all") return raw;
  // The ledger reads `dag` as the whole network, the same facts as `all`: ONE subject, one note.
  if (raw === "dag") return view === "ledger" ? "all" : raw;
  if (CC_RE.test(raw) || ISP_RE.test(raw)) return view === "geo" ? raw : null;
  const slash = raw.indexOf("/");
  if (slash < 0) return networkOf(raw);
  const scope = raw.slice(0, slash);
  const net = scope === "dag" ? scope : networkOf(scope);
  // A query read as a form decodes a bare `+` as a space, so a make-up written into a URL by hand
  // (`type:l0+cl1`) arrives as `type:l0 cl1`: the same make-up, given its one spelling back.
  const tail = raw.slice(slash + 1).replace(/ /g, "+");
  return net && selectionOk(view, tail) ? `${net}/${tail}` : null;
}

/** The query of `GET /api/notes`: `view`, `subject`, and for History `span` or `from`/`to` (ms). */
export function parseNoteParams(sp: URLSearchParams, nowMs: number): Parsed {
  const view = sp.get("view") as NoteView | null;
  if (!view || !VIEWS.includes(view)) return { error: "bad view" };
  const subject = subjectOf(view, sp.get("subject"));
  if (!subject) return { error: "bad subject" };
  const span = sp.get("span");
  const fixed = FIXED_SPAN[view];
  if (fixed) return span == null || span === fixed ? { view, subject, span: fixed } : { error: "bad span" };

  const from = sp.get("from");
  const to = sp.get("to");
  if (from == null && to == null) {
    return span != null && PILLS.includes(span as NoteSpan) ? { view, subject, span: span as NoteSpan } : { error: "bad span" };
  }
  if (span != null || from == null || to == null || !MS_RE.test(from) || !MS_RE.test(to)) return { error: "bad span" };
  if (Number(to) < Number(from)) return { error: "bad span" }; // reversed: no brush draws that
  const snapped = snapSpan(Number(from), Number(to), nowMs);
  return snapped ? { view, subject, span: `r${snapped.fromMs}-${snapped.toMs}` } : { none: true };
}

/** The body of `POST /api/notes/request`: `{ view: "trend", subject, span: "1h" }`,
 *  `{ view: "trend", subject, fromMs, toMs }`, or a subject note `{ view: "hyper" | "geo", subject }`
 *  (no span: its view's fixed one applies). Every other kind is warmed or written on a read. */
export function parseNoteRequest(body: unknown, nowMs: number): Parsed {
  if (body == null || typeof body !== "object") return { error: "bad body" };
  const { view, subject, span, fromMs, toMs } = body as Record<string, unknown>;
  if (typeof subject !== "string") return { error: "bad body" };
  if ((view === "hyper" || view === "geo") && isSubjectNote(subject)) {
    if (span !== undefined || fromMs !== undefined || toMs !== undefined) return { error: "bad body" };
    return parseNoteParams(new URLSearchParams({ view, subject }), nowMs);
  }
  if (view !== "trend") return { error: "bad body" };
  const sp = new URLSearchParams({ view, subject });
  if (span === ON_REQUEST_PILL && fromMs === undefined && toMs === undefined) sp.set("span", ON_REQUEST_PILL);
  else if (span === undefined && Number.isSafeInteger(fromMs) && Number.isSafeInteger(toMs)) {
    sp.set("from", String(fromMs));
    sp.set("to", String(toMs));
  } else return { error: "bad body" };
  return parseNoteParams(sp, nowMs);
}

/** THE ONE PLACE that says which requests the limits apply to: a brushed range, whose key space
 *  is unbounded, and a subject note, whose key space is bounded but large enough that a visitor
 *  walking the selections would spend the Gate's burst limit. Every other kind is bounded by its
 *  key and the singleflight. */
export function isLimitedNote(view: NoteView, subject: string, span: NoteSpan): boolean {
  const timing = timingOf(view, span, subject);
  return timing === KIND_TIMING.range || timing === KIND_TIMING.subject;
}
