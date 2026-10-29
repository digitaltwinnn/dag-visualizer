import { roleKey } from "@/src/data/composition";
import { fact } from "@/src/data/noteFacts";
import { bannedWords, undash } from "@/src/data/noteHonesty";
import { geoFacts } from "@/src/data/noteFactsGeo";
import { comboWords, hyperFacts } from "@/src/data/noteFactsHyper";
import { hasCommonReading } from "@/src/data/noteFactsActivity";
import { ledgerFacts } from "@/src/data/noteFactsLedger";
import { trendFacts, type TrendFactsInput } from "@/src/data/noteFactsTrend";
import type { Fact, NotableDay, NoteView, NoteLead } from "@/src/data/noteTypes";
import { leadingTrim, pickRangeTier, type TrendsWindowData } from "@/src/data/trendWindow";
import { CATALOG, type NetworkId } from "@/src/engine/config";
import { assembleSpan, WINDOWS } from "../trends/assemble";
import { geoSlotOf, ispNamesKeyOf, slotsInWindow, type Tier } from "../trends/keys";
import { readStore, type TrendsStore } from "../trends/store";
import { isSubjectNote, subjectKindOf, type NoteSpan, type SubjectKind } from "./keys";

// THE SOURCES OF AI NOTES — the impure half of the facts: which stored payloads each view's note
// is written from, read and handed to that view's pure builder (`src/data/noteFacts*.ts`). The
// per-view parts are ONE TABLE keyed by `NoteView` (`VIEW_SOURCES`), so adding a view is one row,
// not a branch in the generator.
//
// The reads REUSE the trends store's own read path rather than re-implementing it: `readSpan` is
// the tile route's body (`slotsInWindow` + `hgetall` + `assembleSpan`, on the READ-ONLY token),
// and the payload is the store's, UNFOLDED — every builder folds the unlisted channels itself.
// `factsFor` takes its reads as an injected dependency, so tests never touch Upstash.
//
// HONESTY (rule 10): a read that throws propagates, so the generator answers `unavailable` (a store
// outage is an instrument state), never a guess from a partial read; a builder with nothing to
// describe answers null, and so does this.
//
// The ONE number this module adds to a builder's facts is the span's own length (R20): a
// `duration` fact, so a note that names its window ("the last 7 days") is backed by the gate, while
// the builders' labels stay digit-free.

const H = 3_600_000;
const D = 86_400_000;

/** A hash read: the one store command the notes' sources use. */
export type HashReader = Pick<TrendsStore, "hgetall">;

export interface GeoDaysRead {
  /** "YYYY-MM-DD" → that day's geo fields (`f.cc.*`, `f.isp.*`, per network `f.cc.<id>.*`, `f.isp.<id>.*`). */
  geoDays: Record<string, Record<string, number>>;
  /** provider key → display name (`geo:{net}:isp`). */
  providerNames: Record<string, string>;
}

/** What `factsFor` reads through. The default is the trends store's read client. */
export interface NoteReads {
  span(net: string, tier: Tier, fromMs: number, toMs: number): Promise<TrendsWindowData>;
  geoDays(net: string, fromMs: number, toMs: number): Promise<GeoDaysRead>;
}

/** ONE TIER over [fromMs, toMs): the tile route's body, at any span. */
export async function readSpan(
  net: string, tier: Tier, fromMs: number, toMs: number,
  store: HashReader = readStore(), nowMs: number = Date.now(),
): Promise<TrendsWindowData> {
  // `slotsInWindow` is end-INCLUSIVE and the span half-open, as `assembleSpan` reads it.
  const keys = [...new Set(slotsInWindow(net, tier, fromMs, toMs - 1).map((s) => s.key))];
  const hashes: Record<string, Record<string, string>> = {};
  await Promise.all(keys.map(async (k) => {
    const h = await store.hgetall(k);
    if (h) hashes[k] = h;
  }));
  const { buckets, stepMs, series, now } = assembleSpan(net, "tile", tier, fromMs, toMs, nowMs, hashes);
  return { buckets, stepMs, series, now };
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** THE GEO FAMILY over the UTC days [fromMs's day, toMs]: one `geo:{net}:{YYYY}` hash per year the
 *  window touches (fields `MM-DD|<series>`), regrouped by day, plus the provider names. */
export async function readGeoDays(
  net: string, fromMs: number, toMs: number, store: HashReader = readStore(),
): Promise<GeoDaysRead> {
  const firstDay = Math.floor(fromMs / D) * D;
  const years: number[] = [];
  for (let y = new Date(firstDay).getUTCFullYear(); y <= new Date(toMs).getUTCFullYear(); y++) years.push(y);
  const [names, ...hashes] = await Promise.all([
    store.hgetall(ispNamesKeyOf(net)),
    ...years.map((y) => store.hgetall(geoSlotOf(net, Date.UTC(y, 0, 1)).key)),
  ]);
  const geoDays: Record<string, Record<string, number>> = {};
  hashes.forEach((h, i) => {
    for (const [field, raw] of Object.entries(h ?? {})) {
      const bar = field.indexOf("|");
      if (bar < 0) continue;
      const date = `${years[i]}-${field.slice(0, bar)}`;
      const ms = Date.parse(`${date}T00:00:00Z`);
      const n = Number(raw);
      if (!(ms >= firstDay && ms <= toMs) || !Number.isFinite(n)) continue;
      (geoDays[date] ??= {})[field.slice(bar + 1)] = n;
    }
  });
  const providerNames: Record<string, string> = {};
  for (const [k, v] of Object.entries(names ?? {})) if (v != null) providerNames[k] = String(v);
  return { geoDays, providerNames };
}

/** GEOGRAPHY'S READ — the geo family's days and the tiers' daily fleet `f.cc` (`ccDays`, pivoted by
 *  day) over `GEO_READ_MS`. The geo note's facts and the warm pass's country plan both read through
 *  it, so the countries warmed are the countries a note states (M5). */
export async function geoInputs(net: string, nowMs: number, reads: NoteReads): Promise<GeoDaysRead & { ccDays: Record<string, Record<string, number>>; daily: TrendsWindowData }> {
  const from = nowMs - GEO_READ_MS;
  const [{ geoDays, providerNames }, tiers] = await Promise.all([
    reads.geoDays(net, from, nowMs),
    reads.span(net, "1d", from, nowMs),
  ]);
  const ccDays: Record<string, Record<string, number>> = {};
  tiers.buckets.forEach((b, i) => {
    for (const [k, pts] of Object.entries(tiers.series)) {
      const v = pts[i];
      if (k.startsWith("f.cc.") && v != null) (ccDays[iso(b)] ??= {})[k] = v;
    }
  });
  // The same daily read is the common activity reading's (R74), unfolded, as the builder wants it.
  return { geoDays, providerNames, ccDays, daily: tiers };
}

/** The default reads for ONE note: the trends store's read client, each hash read at most once (a
 *  History note reads the same daily year-hash for its span, the span before and its days). */
export function storeReads(nowMs: number, store: HashReader = readStore()): NoteReads {
  const seen = new Map<string, Promise<Record<string, string> | null>>();
  const once: HashReader = {
    hgetall(key) {
      let p = seen.get(key);
      if (!p) seen.set(key, (p = store.hgetall(key)));
      return p;
    },
  };
  return {
    span: (net, tier, fromMs, toMs) => readSpan(net, tier, fromMs, toMs, once, nowMs),
    geoDays: (net, fromMs, toMs) => readGeoDays(net, fromMs, toMs, once),
  };
}

// ── The catalog the builders and the gate name networks by ─────────────────────────────────────

/** The DAG core's display name as the app shows it (`DAG_CFG` in `src/data/network.ts`, which is
 *  a client module: it imports the store). */
const DAG_NAME = "DAG";

const catalogOf = (net: string) => CATALOG[net as NetworkId] ?? [];

/** catalog id → display name, the DAG core included. Current ids only: a former address is folded
 *  into its network on the read path (`assembleSpan`), so it never needs a name of its own. */
function namesOf(net: string): Record<string, string> {
  return { dag: DAG_NAME, ...Object.fromEntries(catalogOf(net).map((m) => [m.id, m.name])) };
}
/** A catalog blurb as the model may see it. Blurbs are the networks' own copy (the live
 *  directory's descriptions) and do not follow the house voice: a dash clause becomes a comma and a
 *  sentence holding a word the gate bans ("feeless", "decentralized") is dropped, so the model is
 *  never handed a word it would echo into a rejected note. Empty when nothing is left. */
export function cleanBlurb(blurb: string): string {
  return undash(blurb)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim() && bannedWords(sentence).length === 0)
    .join(" ")
    .trim();
}

function blurbsOf(net: string): Record<string, string> {
  return Object.fromEntries(catalogOf(net).map((m) => [m.id, cleanBlurb(m.blurb)]).filter(([, b]) => b));
}

const isNetwork = (net: string, id: string) => id === "dag" || catalogOf(net).some((m) => m.id === id);
const CC_RE = /^cc:([A-Z]{2})$/;
const ISP_RE = /^isp:([a-z0-9-]{1,48})$/;
const TYPE_RE = /^type:((?:l0|cl1|dl1)(?:\+(?:l0|cl1|dl1)){0,2}|none)$/;
const RANGE_RE = /^r(\d+)-(\d+)$/;

function rangeOf(span: string): { fromMs: number; toMs: number } | null {
  const m = RANGE_RE.exec(span);
  if (!m) return null;
  const fromMs = Number(m[1]);
  const toMs = Number(m[2]);
  return fromMs < toMs ? { fromMs, toMs } : null;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(cc: string): string {
  try {
    return regionNames.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

type GeoSelection = { cc: string; net?: string } | { isp: string; net?: string };

/** A GEOGRAPHY SELECTION as the builder takes it: a fleet country `cc:XX`, and the subject notes
 *  `<net>/cc:XX`, `isp:<key>`, `<net>/isp:<key>`, whose scope is `dag` or a network this catalog
 *  tracks (`params.ts` validates the request; this says whether the view writes it). Null for
 *  anything else, a network's own note included. */
function geoSelectionOf(net: string, subject: string): GeoSelection | null {
  const scoped = isSubjectNote(subject) && subject.includes("/");
  const scope = scoped ? subject.slice(0, subject.indexOf("/")) : undefined;
  if (scope != null && !isNetwork(net, scope)) return null;
  const tail = scope != null ? subject.slice(scope.length + 1) : subject;
  const cc = CC_RE.exec(tail)?.[1];
  const isp = ISP_RE.exec(tail)?.[1];
  const at = scope != null ? { net: scope } : {};
  return cc ? { cc, ...at } : isp ? { isp, ...at } : null;
}

/** A Geography subject note's prompt label and display name, SCOPE FIRST (the gate attributes a
 *  sentence's ratios to the names in it): a network's nodes in a country or with a provider, else
 *  the provider itself. The provider is called as its facts call it (`provider`, the builder's
 *  merged stem: "Hetzner Online", never the stored "Hetzner Online GmbH", or the gate finds no fact
 *  label holding the subject and rejects a nameless sentence about it). */
function geoSubjectLabel(sel: GeoSelection, names: Record<string, string>, provider: string | undefined): { label: string; subjectName: string } {
  const what = "cc" in sel ? countryName(sel.cc) : (provider ?? sel.isp);
  if (sel.net == null) return { label: what, subjectName: what };
  const netName = names[sel.net] ?? sel.net;
  return { label: `${netName}'s nodes ${"cc" in sel ? "in" : "with"} ${what}`, subjectName: netName };
}

type HyperSelection = { net: string; type: string };

/** A HYPERGRAPH SELECTION as the builder takes it: the subject note `<net>/type:<roleKey>`, a
 *  network's make-up, scoped to `dag` or a network this catalog tracks and spelled as `roleKey`
 *  spells it (one make-up, one key). Null for anything else, a network's own note included. */
function hyperSelectionOf(net: string, subject: string): HyperSelection | null {
  if (!isSubjectNote(subject) || subjectKindOf(subject) !== "type") return null;
  const scope = subject.slice(0, subject.indexOf("/"));
  const type = TYPE_RE.exec(subject.slice(scope.length + 1))?.[1];
  if (!type || !isNetwork(net, scope) || roleKey({ roles: type.split("+") }) !== type) return null;
  return { net: scope, type };
}

// ── The per-view table ─────────────────────────────────────────────────────────────────────────

/** What one view's builder produced, before the span-length facts are appended. */
interface Built {
  facts: Fact[];
  names: string[];
  blurbs?: string[];
  days?: NotableDay[];
  setKey?: string;
  /** Snapshots only (R71): which question the prompt asks. */
  lead?: NoteLead;
  /** Geography's provider notes: the provider as the facts spell it, the label's to name it by. */
  subjectName?: string;
}

interface Read {
  built: Built | null;
  spanFrom: number;
  spanTo: number;
  /** The windows the note may name (R20): label → seconds, appended as `duration` facts. */
  windows: [string, number][];
  /** The prompt's label and the subject's display name when the read knows them better than the
   *  row's `label` (a Geography subject note names its provider as its built facts spell it). */
  label?: string;
  subjectName?: string;
}

interface Ctx {
  net: string;
  subject: string;
  span: NoteSpan;
  nowMs: number;
  reads: NoteReads;
  names: Record<string, string>;
  blurbs: Record<string, string>;
}

interface ViewSource {
  /** Whether this view writes a note for this subject over this span. */
  accepts(net: string, subject: string, span: NoteSpan): boolean;
  /** The prompt's subject label. */
  label(subject: string, names: Record<string, string>): string;
  /** Is this subject the whole network? Its own ratios are then the unattributed ones; any other
   *  subject's carry its name (R39). Hyper and Geography read `dag` as the DAG core, a network;
   *  the ledger and History read it as the whole. */
  whole(subject: string): boolean;
  read(c: Ctx): Promise<Read | null>;
}

const WHOLE = "the whole network";
/** Geography's read: the week its changes are read over, its one-day slack, and the 6 days the
 *  earliest candidate's own week needs before it (R29) — and, longer, the four weeks the common
 *  activity reading compares (R74: last week against the three before; `noteFactsActivity.ts`). */
const GEO_READ_MS = Math.max((7 + 1 + 6) * D, 28 * D);
const secondsOf = (fromMs: number, toMs: number) => (toMs - fromMs) / 1000;

type TrendPill = "1h" | "24h" | "7d" | "30d" | "1y";
/** History's pills: the tier each is read at, its length, and whether it gets notable days (whose
 *  daily read carries a 30-day lead-in before the span, R13). `all` and a brushed range are
 *  their own cases below. */
const TREND_PILLS: Record<TrendPill, { tier: Tier; ms: number; daily: boolean }> = {
  "1h": { tier: "5m", ms: H, daily: false },
  "24h": { tier: "1h", ms: WINDOWS["24h"].ms, daily: false },
  "7d": { tier: "1h", ms: WINDOWS["7d"].ms, daily: true },
  "30d": { tier: "1d", ms: WINDOWS["30d"].ms, daily: true },
  "1y": { tier: "1d", ms: WINDOWS["1y"].ms, daily: true },
};
const LEAD_IN_MS = 30 * D;
const isPill = (span: string): span is TrendPill => span in TREND_PILLS;

async function readTrend(c: Ctx): Promise<Read | null> {
  const { net, subject, span, nowMs, reads } = c;
  let zoom: TrendFactsInput["zoom"];
  let cur: TrendsWindowData;
  let prev: TrendsWindowData | null;
  let daily: TrendsWindowData | null;
  let fromMs: number;
  let toMs: number;

  if (span === "all") {
    // EVERYTHING THE STORE HOLDS, from where measuring began (the History page's leading trim):
    // the window opens years before the first measured day, and those years are not the span.
    zoom = "all";
    const raw = await reads.span(net, "1d", nowMs - WINDOWS.all.ms, nowMs);
    cur = leadingTrim(raw);
    if (!cur.buckets.length) return null;
    fromMs = cur.buckets[0]!;
    toMs = nowMs;
    prev = null;
    daily = raw; // its unmeasured years are the (empty) lead-in
  } else {
    const range = isPill(span) ? null : rangeOf(span);
    const pill = isPill(span) ? TREND_PILLS[span] : null;
    if (!pill && !range) return null;
    zoom = pill ? (span as TrendPill) : "range";
    fromMs = range ? range.fromMs : nowMs - pill!.ms;
    toMs = range ? range.toMs : nowMs;
    const tier = pill ? pill.tier : pickRangeTier(fromMs, toMs);
    const len = toMs - fromMs;
    [cur, prev, daily] = await Promise.all([
      reads.span(net, tier, fromMs, toMs),
      reads.span(net, tier, fromMs - len, fromMs),
      pill?.daily ? reads.span(net, "1d", fromMs - LEAD_IN_MS, toMs) : Promise.resolve(null),
    ]);
  }
  const built = trendFacts({ subject, zoom, span: { fromMs, toMs }, cur, prev, daily, names: c.names, blurbs: c.blurbs });
  return { built, spanFrom: fromMs, spanTo: toMs, windows: [["Span length", secondsOf(fromMs, toMs)]] };
}

const VIEW_SOURCES: Record<NoteView, ViewSource> = {
  // WHO / WHAT: the fleet's hourly gauges over the last WEEK (user, 2026-10-29: one change range for
  // Hypergraph and Geography); the daily tier over 37 days (a 30-day lead-in, so a start is a start).
  hyper: {
    accepts: (net, subject, span) => span === "day" && (subject === "all" || isNetwork(net, subject) || hyperSelectionOf(net, subject) != null),
    label: (subject, names) => (subject === "all" ? WHOLE : (names[subject] ?? subject)),
    whole: (subject) => subject === "all",
    async read({ net, subject, nowMs, reads, names, blurbs }) {
      const sel = hyperSelectionOf(net, subject);
      const span = { fromMs: nowMs - 7 * D, toMs: nowMs };
      const [fleet, daily] = await Promise.all([
        reads.span(net, "1h", span.fromMs, nowMs),
        reads.span(net, "1d", span.fromMs - LEAD_IN_MS, nowMs),
      ]);
      const built = hyperFacts({ subject: sel ?? subject, fleet, daily, span, names, blurbs });
      // The facts speak of the last day and the last week (the span, activity, started / stopped),
      // so each window the note may name is stated.
      const windows: [string, number][] = [["Span length", secondsOf(span.fromMs, nowMs)], ["Day", D / 1000], ["Week", (7 * D) / 1000]];
      // A make-up's note is labelled as its facts name it, and attributed to its network (the gate
      // scopes a sentence's ratios by the network's name in it).
      const netName = sel ? (names[sel.net] ?? sel.net) : "";
      return { built, spanFrom: span.fromMs, spanTo: nowMs, windows, ...(sel ? { label: `${netName} nodes ${comboWords(sel.type)}`, subjectName: netName } : {}) };
    },
  },
  // WHERE: the geo family's days and the tiers' daily country counts. The note's span is the WEEK
  // its changes are read over (now against the measured day nearest 7 days back, within a day),
  // but the READ reaches further (R29): the builder judges each day against the week ending on it
  // (R22), so the earliest day the comparison may use, 8 days back, needs the 6 days before it,
  // or a partial outage at the read's head is judged against itself and becomes the week-ago anchor.
  geo: {
    accepts: (net, subject, span) => span === "day" && (subject === "all" || isNetwork(net, subject) || geoSelectionOf(net, subject) != null),
    label: (subject, names) => {
      const cc = CC_RE.exec(subject)?.[1];
      return subject === "all" ? WHOLE : cc ? countryName(cc) : (names[subject] ?? subject);
    },
    whole: (subject) => subject === "all",
    async read({ net, subject, nowMs, reads, names }) {
      const { geoDays, providerNames, ccDays, daily } = await geoInputs(net, nowMs, reads);
      const ccs = new Set<string>();
      for (const day of [...Object.values(geoDays), ...Object.values(ccDays)])
        for (const k of Object.keys(day)) if (k.startsWith("f.cc.")) ccs.add(k.slice(k.lastIndexOf(".") + 1));
      const sel = geoSelectionOf(net, subject);
      if (sel && "cc" in sel) ccs.add(sel.cc);
      const countryNames = Object.fromEntries([...ccs].map((c) => [c, countryName(c)]));
      // A subject note is handed no daily read: the common reading is a network's or the whole
      // network's, never one card's.
      const subjectNote = isSubjectNote(subject);
      const built = geoFacts({ subject: sel ?? subject, geoDays, ccDays, providerNames, countryNames, names, ...(subjectNote ? {} : { daily }) });
      const spanFrom = nowMs - 7 * D;
      // The common reading speaks of the last week (R74), so that window is stated beside the span.
      const windows: [string, number][] = [["Span length", secondsOf(spanFrom, nowMs)], ["Week", (7 * D) / 1000]];
      return { built, spanFrom, spanTo: nowMs, windows, ...(subjectNote && sel ? geoSubjectLabel(sel, names, built?.subjectName) : {}) };
    },
  },
  // WHEN (live): the last 24 HOURS of the 5-minute tier against the last week of the hourly one
  // (user, 2026-10-29: "last 24h instead of last 6h" — the same day the vitals band reads).
  ledger: {
    // Its whole network is `all` alone: `dag` here would be the same facts under a second key, so a
    // second identical note an hour (the routes and the client fold `dag` into `all`).
    accepts: (net, subject, span) => span === "hours" && (subject === "all" || (subject !== "dag" && isNetwork(net, subject))),
    label: (subject, names) => (subject === "all" ? WHOLE : (names[subject] ?? subject)),
    whole: (subject) => subject === "all",
    async read({ net, subject, nowMs, reads, names }) {
      const recentFrom = nowMs - 24 * H;
      const weekFrom = nowMs - 7 * D;
      const [recent, week] = await Promise.all([
        reads.span(net, "5m", recentFrom, nowMs),
        reads.span(net, "1h", weekFrom, nowMs),
      ]);
      const built = ledgerFacts({ subject, recent, week, names });
      return {
        built,
        spanFrom: recentFrom,
        spanTo: nowMs,
        windows: [["Recent window", secondsOf(recentFrom, nowMs)], ["Usual window", secondsOf(weekFrom, nowMs)]],
      };
    },
  },
  // HOW IT CHANGED: the pill's (or the brushed range's) span, the equal span before it, and for the
  // long pills the daily tier the notable days are picked from.
  trend: {
    accepts: (net, subject, span) => (isPill(span) || span === "all" || rangeOf(span) != null) && isNetwork(net, subject),
    label: (subject, names) => (subject === "dag" ? "the hypergraph" : (names[subject] ?? subject)),
    whole: (subject) => subject === "dag",
    read: readTrend,
  },
};

/** Whether a note exists for this request at all: the view's own subjects and spans, never an
 *  unlisted network (its identity is unknown; the model would invent one). */
export function noteSupported(view: NoteView, subject: string, span: NoteSpan, net = "mainnet"): boolean {
  return VIEW_SOURCES[view]?.accepts(net, subject, span) ?? false;
}

export interface NoteFacts {
  facts: Fact[];
  /** Every name the gate strips and scopes by. */
  names: string[];
  /** "<name> is: <blurb>" lines, shown to the model beside the facts (never as facts). */
  blurbs: string[];
  days: NotableDay[];
  spanFrom: number;
  spanTo: number;
  /** The prompt's subject label ("the whole network", "the hypergraph", a network, a country, or a
   *  subject note's scope-first label: "USDC.dag's nodes in Germany", "USDC.dag nodes running L0
   *  and cL1"). */
  label: string;
  /** The subject's display name when it is one network, one country or one provider (a scoped
   *  subject note's is its network's), absent for the whole network: the gate reads a sentence
   *  naming no one as speaking of it (R39). */
  subjectName?: string;
  /** Which QUESTION the prompt asks, not the subject's shape: a subject note's kind
   *  (`subjectKindOf`) asks a country, a provider or a make-up its own question; every other note,
   *  the warmed fleet country `cc:XX` included, is "view" and asks its view's question. */
  kind: SubjectKind;
  /** Hyper `all` only: the networks with nodes (the warmer rewrites the digest when it changes). */
  setKey?: string;
  /** Snapshots only (R71): "change" when a pair moved, else "now" — the prompt's question follows. */
  lead?: NoteLead;
  /** Whether the facts hold the COMMON reading (R74, `noteFactsActivity.ts`): the prompt asks for
   *  its last sentence only then. */
  common: boolean;
}

/** THE FACTS FOR ONE NOTE: that view's reads, its builder, and the span's length. Null when the
 *  request is not one a note exists for, or the builder has nothing to describe. */
export async function factsFor(
  net: string, view: NoteView, subject: string, span: NoteSpan, nowMs: number,
  reads?: NoteReads,
): Promise<NoteFacts | null> {
  const row = VIEW_SOURCES[view];
  if (!row?.accepts(net, subject, span)) return null;
  const names = namesOf(net);
  const r = await row.read({ net, subject, span, nowMs, reads: reads ?? storeReads(nowMs), names, blurbs: blurbsOf(net) });
  if (!r?.built) return null;
  const { built } = r;
  const subjectName = r.subjectName ?? (row.whole(subject) ? undefined : row.label(subject, names));
  return {
    facts: [...built.facts, ...r.windows.map(([label, s]) => fact(label, s, "duration"))],
    names: built.names,
    blurbs: built.blurbs ?? [],
    days: built.days ?? [],
    spanFrom: r.spanFrom,
    spanTo: r.spanTo,
    label: r.label ?? row.label(subject, names),
    // The warmed fleet country (`cc:XX`) keeps Geography's own question: its facts are the country's
    // place in the whole network, not a network's nodes there. Only on-request subject notes ask a kind's.
    kind: isSubjectNote(subject) ? subjectKindOf(subject) : "view",
    common: hasCommonReading(built.facts),
    ...(subjectName != null ? { subjectName } : {}),
    ...(built.setKey != null ? { setKey: built.setKey } : {}),
    ...(built.lead != null ? { lead: built.lead } : {}),
  };
}
