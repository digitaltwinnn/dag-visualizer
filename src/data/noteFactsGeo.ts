import { fact } from "@/src/data/noteFacts";
import type { Fact, FactPair } from "@/src/data/noteTypes";

// GEOGRAPHY'S FACTS BUILDER — what the Geography note's model is shown. Geography answers WHERE:
// the default note (subject `all`) says how many countries and providers host the fleet and which
// carry the most nodes; a network's note gives its footprint against the fleet and where it stood
// a month ago; a country's says what that country hosts. SHARES AND COUNTS ONLY: no label grades the spread (the gate also bans
// "decentrali-"), so the model has nothing to editorialise from.
//
// It reads the STORED geo family (`app/api/trends/bucketing.ts` `bucketFleetGeo`), one day bucket
// per day holding ONE hourly reading (the day's last): `f.cc.<cc>` / `f.isp.<key>` for the whole
// fleet and `f.cc.<id>.<cc>` / `f.isp.<id>.<key>` per network. The two are told apart by SEGMENT
// COUNT after the prefix (`DE` against `usdc.DE`); a network id may itself hold dots, so the
// country / provider is the LAST segment. `ccDays` is the tiers' fleet `f.cc.<cc>` per day, which
// goes back much further than the geo family and is the only source of a country's change.
//
// HONESTY (rule 10):
//   · AN OUTAGE HOUR (R22). A day is ONE hourly reading, and the sampler writes a failed cluster
//     fetch as no nodes, so a whole day's value can be an outage. A day is MEASURED only if its
//     total (the fleet's Σ `f.cc.<cc>`; for a network its own Σ `f.cc.<id>.<cc>`) is within 10% of
//     the median over the 7 calendar days ending on it (a day alone is measured; a total of 0 never
//     is). The current reading is the newest measured day. A change compares it with the measured
//     day nearest to 30 days earlier, and only if that day is within 5 days of the mark: a
//     neighbour from yesterday is not "a month ago". No such day, no change fact;
//   · present tense before history: a country's change reads `ccDays`; a provider's reads
//     `geoDays` and only when BOTH ends are measured; a network's reads its OWN measured days in
//     `geoDays` (its located nodes and countries a month ago, and the located ratio when both are
//     above 0 and differ). The geo family began 2026-10-27, so a network states no change until a
//     month of it exists — honest absence, never a substitute series;
//   · a share's denominator is what was located: countries against the fleet's LOCATED nodes,
//     providers against the nodes with a KNOWN provider (a node can have a country and no
//     provider), each labelled so;
//   · providers merge by display name only: two keys whose names are equal after lower-casing and
//     stripping `gmbh|ag|inc|llc|ltd|sas|se` (Hetzner Online GmbH + AG) are one provider, summed.
//     The merged provider is called by the stem both share ("Hetzner Online");
//   · the store holds no country × provider breakdown, so a country's note carries no providers;
//   · A CHANGE IS A PAIR, FROM ONE READING (R54). A month ago and now are the `from` and `to` of
//     one key per quantity (the fleet's located total, each country, each provider, a network's
//     located nodes and countries), and the ratio is `to / from` of that pair. The fleet's and a
//     country's month-ago figure comes from the tiers (`ccDays`), whose count NOW can differ from
//     the geo family's (80 located against the tiers' 86, live 2026-10-27). So the geo-family fact
//     ("Located nodes in the fleet", "Germany, nodes (biggest country)") is the `to` end only when
//     it states the tiers' own count; else the tiers' count now is stated beside it, labelled
//     "now, counted as a month ago was", and is the `to` end. Never a 173 against an 80.
//
// THE GATE'S INTERFACE (`noteHonesty.ts`): a ratio belongs to a network (or country, or provider)
// only by that name in the fact's LABEL; the fleet's own ratio names none. A share is matched by
// value alone. `names` is the FULL catalog list, plus the countries and providers the facts name,
// plus each provider's stem and first word, so a sentence saying "Hetzner" is recognised.
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

export interface GeoFactsInput {
  subject: "all" | string | { cc: string }; // "all" = the fleet; a string = a network id; { cc } = a country
  /** "YYYY-MM-DD" → that day's geo fields (`f.cc.*`, `f.isp.*`, `f.cc.<id>.*`, `f.isp.<id>.*`). */
  geoDays: Record<string, Record<string, number>>;
  /** "YYYY-MM-DD" → the tiers' fleet `f.cc.<cc>` (since 2026-09-07). */
  ccDays: Record<string, Record<string, number>>;
  providerNames: Record<string, string>; // provider key → display name (`geo:{net}:isp`)
  countryNames: Record<string, string>; // cc → English name
  names: Record<string, string>; // catalog id → display name
}

const TOP = 3;
const NETWORK_TOP = 5;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;
/** A day agrees with its week's median within this fraction. */
const MEASURED_TOLERANCE = 0.1;
const MONTH_MS = 30 * DAY_MS;
/** The comparison day may sit this far either side of a month back. */
const MONTH_SLACK_MS = 5 * DAY_MS;
const RANK_WORD = ["", "second ", "third "] as const;
const LEGAL = /\b(?:gmbh|ag|inc|llc|ltd|sas|se)\b/gi;

type Counts = Map<string, number>;

/** One stored day, split into the fleet's and each network's countries and providers. */
interface Day {
  ms: number;
  cc: Counts;
  isp: Counts;
  netCc: Map<string, Counts>;
  netIsp: Map<string, Counts>;
}

function bump(m: Counts, k: string, n: number): void {
  m.set(k, (m.get(k) ?? 0) + n);
}

/** `rest` is a field after its `f.cc.` / `f.isp.` prefix: `DE` is the fleet's, `usdc.DE` a network's
 *  (its id may hold dots, so the key is the last segment). */
function place(rest: string, fleet: Counts, nets: Map<string, Counts>, n: number): void {
  const dot = rest.lastIndexOf(".");
  if (dot < 0) return bump(fleet, rest, n);
  const id = rest.slice(0, dot);
  let m = nets.get(id);
  if (!m) nets.set(id, (m = new Map()));
  bump(m, rest.slice(dot + 1), n);
}

function parseDay(date: string, fields: Record<string, number>): Day {
  const d: Day = { ms: Date.parse(`${date}T00:00:00Z`), cc: new Map(), isp: new Map(), netCc: new Map(), netIsp: new Map() };
  for (const [key, n] of Object.entries(fields)) {
    if (!Number.isFinite(n) || n <= 0) continue;
    if (key.startsWith("f.cc.")) place(key.slice(5), d.cc, d.netCc, n);
    else if (key.startsWith("f.isp.")) place(key.slice(6), d.isp, d.netIsp, n);
  }
  return d;
}

const sum = (m: Counts | undefined): number => {
  let t = 0;
  for (const n of m?.values() ?? []) t += n;
  return t;
};

function median(xs: readonly number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The days (oldest first) whose total is within 10% of the median over the up-to-7 CALENDAR days
 *  ending on them (a sparse store's neighbour a month back is not in the week). A day with a total of 0 is never measured; the median is over the window's non-zero days. */
function measuredDays(days: readonly Day[], totalOf: (d: Day) => number): Day[] {
  const totals = days.map(totalOf);
  return days.filter((_, i) => {
    if (totals[i]! <= 0) return false;
    const near = totals.filter((t, j) => j <= i && days[j]!.ms > days[i]!.ms - WINDOW_DAYS * DAY_MS && t > 0);
    const mid = median(near);
    return Math.abs(totals[i]! - mid) <= MEASURED_TOLERANCE * mid;
  });
}

const parseAll = (days: Record<string, Record<string, number>>): Day[] =>
  Object.entries(days)
    .map(([date, fields]) => parseDay(date, fields))
    .filter((d) => Number.isFinite(d.ms))
    .sort((a, b) => a.ms - b.ms);

/** The measured day nearest to a month before `current`, within the slack; null when there is none. */
function monthBefore(measured: readonly Day[], current: Day): Day | null {
  const mark = current.ms - MONTH_MS;
  let best: Day | null = null;
  for (const d of measured) {
    if (d.ms >= current.ms || Math.abs(d.ms - mark) > MONTH_SLACK_MS) continue;
    if (!best || Math.abs(d.ms - mark) < Math.abs(best.ms - mark)) best = d;
  }
  return best;
}

/** The stem of a provider's display name: its legal suffixes taken off ("Hetzner Online GmbH" is
 *  "Hetzner Online", "Amazon.com, Inc." is "Amazon.com"). */
function stemOf(name: string): string {
  const stem = name.replace(LEGAL, " ").replace(/\s+/g, " ").replace(/^[\s,.\-]+|[\s,.\-]+$/g, "");
  return stem || name;
}

interface Provider {
  group: string; // the merge key
  name: string; // what the facts call it
  names: Set<string>; // every display name merged into it
  count: number;
}

/** The providers of one day's `f.isp.*`, merged by display name. */
function providersOf(isp: Counts, providerNames: Record<string, string>): Map<string, Provider> {
  const out = new Map<string, Provider>();
  for (const [key, n] of isp) {
    const display = providerNames[key] ?? key;
    const group = display.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(LEGAL, " ").replace(/\s+/g, " ").trim() || display.toLowerCase();
    let p = out.get(group);
    if (!p) out.set(group, (p = { group, name: stemOf(display), names: new Set(), count: 0 }));
    p.names.add(display);
    p.count += n;
    p.name = stemOf([...p.names].sort()[0]!); // the same pick whichever key came first
  }
  return out;
}

const ranked = <T extends { count: number }>(xs: Iterable<T>, tie: (x: T) => string): T[] =>
  [...xs].sort((a, b) => b.count - a.count || tie(a).localeCompare(tie(b)));

export function geoFacts(input: GeoFactsInput): { facts: Fact[]; names: string[] } | null {
  const { subject, providerNames, countryNames, names: catalog } = input;
  const nameOf = (id: string) => catalog[id] ?? id;
  const countryOf = (cc: string) => countryNames[cc] ?? cc;

  const geo = parseAll(input.geoDays);
  const fleetDays = measuredDays(geo, (d) => sum(d.cc));
  const subjectNet = typeof subject === "string" && subject !== "all" ? subject : null;
  const subjectCc = typeof subject === "object" ? subject.cc : null;

  // THE CURRENT READING. The fleet's is the newest measured fleet day. A network must have a node
  // list ON that day (one that stopped publishing is silent, never described by an old footprint);
  // its reading is then the newest day its OWN total holds, among the days it is present. No such
  // day, nothing to say about place.
  const newestFleet = fleetDays[fleetDays.length - 1];
  const listed = (d: Day, id: string) => d.netCc.has(id); // a node list means country fields, providers alone are not one
  let now: Day | undefined = newestFleet;
  if (subjectNet) {
    now = newestFleet && listed(newestFleet, subjectNet) ? measuredDays(geo, (d) => sum(d.netCc.get(subjectNet))).pop() : undefined;
  }
  if (!now) return null;
  /** The fleet's figures on `now` are usable as a denominator only if `now` is a measured fleet day. */
  const fleetMeasured = fleetDays.includes(now);
  const geoMeasuredFor = new Map<string, Day[]>();
  const ownMeasured = (id: string): Day[] => {
    let m = geoMeasuredFor.get(id);
    if (!m) geoMeasuredFor.set(id, (m = measuredDays(geo, (d) => sum(d.netCc.get(id)))));
    return m;
  };

  const mentionedCountries = new Set<string>();
  const mentionedProviders = new Map<string, Provider>();
  const cn = (cc: string): string => {
    mentionedCountries.add(countryOf(cc));
    return countryOf(cc);
  };
  const pn = (p: Provider): string => {
    mentionedProviders.set(p.group, p);
    return p.name;
  };

  const facts: Fact[] = [];
  const locatedFleet = sum(now.cc);
  const countries = ranked([...now.cc].map(([cc, count]) => ({ cc, count })), (c) => c.cc);
  const providers = ranked(providersOf(now.isp, providerNames).values(), (p) => p.name);
  const knownFleet = providers.reduce((a, p) => a + p.count, 0);

  // A month ago, per country (ccDays) and per provider (geoDays, both ends measured).
  const ccMeasured = measuredDays(parseAll(input.ccDays), (d) => sum(d.cc));
  const ccNow = ccMeasured[ccMeasured.length - 1];
  const ccThen = ccNow ? monthBefore(ccMeasured, ccNow) : null;
  const geoThen = monthBefore(fleetDays, now);

  /** A country's month-ago change from the tiers' history: both ends of ONE reading, or null. */
  const ccChange = (cc: string): { was: number; is: number } | null => {
    const was = ccThen?.cc.get(cc);
    const is = ccNow?.cc.get(cc);
    return was && is ? { was, is } : null;
  };
  /** THE NOW END (R54): a fact stating `shown` now is the `to` end of `key` only when the reading
   *  the earlier figure came from counts the same now (`is`). */
  const nowEnd = (key: string, shown: number, is: number | undefined): FactPair | undefined =>
    is === shown ? { key, end: "to" } : undefined;
  const ccKey = (cc: string) => `country:${cc}`;
  const ccNowEnd = (cc: string, shown: number) => nowEnd(ccKey(cc), shown, ccChange(cc)?.is);
  /** "now against a month ago" for a country whose geo-family count now is `shown`: the earlier
   *  count, the tiers' count now where it differs from `shown`, and the ratio of the two. */
  const countryChange = (cc: string, shown: number): void => {
    const ch = ccChange(cc);
    if (!ch) return;
    const key = ccKey(cc);
    facts.push(fact(`${cn(cc)}, nodes a month ago`, ch.was, "count", undefined, { key, end: "from" }));
    if (ch.is !== shown) facts.push(fact(`${cn(cc)}, nodes now, counted as a month ago was`, ch.is, "count", undefined, { key, end: "to" }));
    facts.push(fact(`${cn(cc)}, nodes now against a month ago`, ch.is / ch.was, "ratio"));
  };

  if (subjectNet) {
    const name = nameOf(subjectNet);
    const own = ranked([...(now.netCc.get(subjectNet) ?? [])].map(([cc, count]) => ({ cc, count })), (c) => c.cc);
    const ownProv = ranked(providersOf(now.netIsp.get(subjectNet) ?? new Map(), providerNames).values(), (p) => p.name);
    const located = own.reduce((a, c) => a + c.count, 0);
    const known = ownProv.reduce((a, p) => a + p.count, 0);
    // A MONTH AGO, from its own measured day nearest a month back in the geo family (no such day,
    // no fact — the family is young, and no other series holds a network's place). Read first: its
    // ends key the facts below (R54), both from the geo family, so one reading.
    const then = monthBefore(ownMeasured(subjectNet), now);
    const pairOf = (what: string, end: FactPair["end"]): FactPair | undefined => (then ? { key: `${subjectNet}:${what}`, end } : undefined);

    facts.push(fact(`${name}, located nodes`, located, "count", undefined, pairOf("located", "to")));
    facts.push(fact(`${name}, countries with nodes`, own.length, "count", undefined, pairOf("countries", "to")));
    if (fleetMeasured && locatedFleet > 0 && located <= locatedFleet) facts.push(fact(`${name}, share of the fleet's located nodes`, located / locatedFleet, "share"));
    own.slice(0, TOP).forEach((c, i) => {
      facts.push(fact(`${name}, nodes in ${cn(c.cc)} (${RANK_WORD[i]}biggest country)`, c.count, "count"));
      facts.push(fact(`${name}, share of its nodes in ${cn(c.cc)}`, c.count / located, "share"));
    });
    // ITS SHARE OF THE FLEET in the country it is biggest in.
    const top = own[0];
    const fleetThere = top ? (now.cc.get(top.cc) ?? 0) : 0;
    if (fleetMeasured && top && fleetThere >= top.count) facts.push(fact(`${name}, share of the fleet's nodes in ${cn(top.cc)}`, top.count / fleetThere, "share"));
    if (ownProv.length) {
      facts.push(fact(`${name}, providers with nodes`, ownProv.length, "count"));
      ownProv.slice(0, TOP).forEach((p, i) => {
        facts.push(fact(`${name}, nodes with ${pn(p)} (${RANK_WORD[i]}biggest provider)`, p.count, "count"));
        facts.push(fact(`${name}, share of its nodes with a known provider with ${pn(p)}`, p.count / known, "share"));
      });
    }
    if (then) {
      const was = then.netCc.get(subjectNet)!;
      const locatedThen = sum(was);
      facts.push(fact(`${name}, located nodes a month ago`, locatedThen, "count", undefined, pairOf("located", "from")));
      facts.push(fact(`${name}, countries with nodes a month ago`, was.size, "count", undefined, pairOf("countries", "from")));
      if (located > 0 && locatedThen > 0 && located !== locatedThen)
        facts.push(fact(`${name}, located nodes now against a month ago`, located / locatedThen, "ratio"));
    }
  } else if (subjectCc) {
    const here = now.cc.get(subjectCc);
    if (!here) return null;
    const name = cn(subjectCc);
    facts.push(fact(`${name}, nodes`, here, "count", undefined, ccNowEnd(subjectCc, here)));
    facts.push(fact(`${name}, share of the fleet's located nodes`, here / locatedFleet, "share"));
    facts.push(fact(`${name}, rank by nodes`, 1 + countries.filter((c) => c.count > here).length, "count"));
    facts.push(fact("Countries hosting nodes", countries.length, "count"));
    let dropped = false; // a network there whose own list collapsed: the count below is a floor
    const hosted = ranked(
      [...now.netCc]
        .filter(([id, m]) => {
          const ok = ownMeasured(id).includes(now!); // a network whose own list collapsed that day is not read
          if (!ok && (m.get(subjectCc) ?? 0) > 0) dropped = true;
          return ok;
        })
        .map(([id, m]) => ({ id, count: m.get(subjectCc) ?? 0, of: sum(m) }))
        .filter((h) => h.count > 0),
      (h) => nameOf(h.id),
    );
    facts.push(fact(`Networks with nodes in ${name}${dropped ? ", at least" : ""}`, hosted.length, "count"));
    for (const h of hosted.slice(0, NETWORK_TOP)) {
      facts.push(fact(`${nameOf(h.id)}, nodes in ${name}`, h.count, "count"));
      facts.push(fact(`${nameOf(h.id)}, share of its nodes in ${name}`, h.count / h.of, "share"));
    }
    countryChange(subjectCc, here);
  } else {
    // The tiers' totals the fleet's change is read from (see the header: one reading, R54).
    const nowTotal = ccNow ? sum(ccNow.cc) : 0;
    const thenTotal = ccThen ? sum(ccThen.cc) : 0;
    const fleetChange = nowTotal > 0 && thenTotal > 0;
    const FLEET = "fleet";
    facts.push(fact("Located nodes in the fleet", locatedFleet, "count", undefined, fleetChange ? nowEnd(FLEET, locatedFleet, nowTotal) : undefined));
    facts.push(fact("Countries hosting nodes", countries.length, "count"));
    facts.push(fact("Providers hosting nodes", providers.length, "count"));
    countries.slice(0, TOP).forEach((c, i) => {
      facts.push(fact(`${cn(c.cc)}, nodes (${RANK_WORD[i]}biggest country)`, c.count, "count", undefined, ccNowEnd(c.cc, c.count)));
      facts.push(fact(`${cn(c.cc)}, share of the fleet's located nodes`, c.count / locatedFleet, "share"));
    });
    // A provider's month ago is the geo family's own, so its standing count is the pair's now end.
    const wasProviders = geoThen ? providersOf(geoThen.isp, providerNames) : null;
    const providerKey = (p: Provider) => `provider:${p.group}`;
    providers.slice(0, TOP).forEach((p, i) => {
      const before = wasProviders?.get(p.group)?.count;
      facts.push(fact(`${pn(p)}, nodes (${RANK_WORD[i]}biggest provider)`, p.count, "count", undefined, before ? { key: providerKey(p), end: "to" } : undefined));
      facts.push(fact(`${pn(p)}, share of the fleet's nodes with a known provider`, p.count / knownFleet, "share"));
    });

    // CHANGE. Countries from the tiers' history; providers from the geo family, both ends measured.
    // The earlier count beside the ratio, as every other "a month ago" here: a note says how much
    // it moved (from … to …), never only the direction (user, 2026-10-27).
    if (fleetChange) {
      facts.push(fact("Located nodes in the fleet a month ago", thenTotal, "count", undefined, { key: FLEET, end: "from" }));
      if (nowTotal !== locatedFleet)
        facts.push(fact("Located nodes in the fleet now, counted as a month ago was", nowTotal, "count", undefined, { key: FLEET, end: "to" }));
      facts.push(fact("Located nodes in the fleet, now against a month ago", nowTotal / thenTotal, "ratio"));
    }
    for (const c of countries.slice(0, TOP)) countryChange(c.cc, c.count);
    if (wasProviders) {
      for (const p of providers.slice(0, TOP)) {
        const before = wasProviders.get(p.group)?.count;
        if (!before) continue;
        facts.push(fact(`${pn(p)}, nodes a month ago`, before, "count", undefined, { key: providerKey(p), end: "from" }));
        facts.push(fact(`${pn(p)}, nodes now against a month ago`, p.count / before, "ratio"));
      }
    }
  }

  const providerForms = [...mentionedProviders.values()].flatMap((p) => {
    const stems = [...p.names].map(stemOf);
    const first = stems.map((s) => s.split(" ")[0]!).filter((w) => w.length >= 4 && w.toLowerCase() !== "the");
    return [...p.names, ...stems, ...first];
  });
  return { facts, names: [...new Set([...Object.values(catalog), ...mentionedCountries, ...providerForms])] };
}
