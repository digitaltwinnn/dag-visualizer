# Subject Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Gate AI card stays on the view's note; the Country, Provider, Composition and Range cards each carry their own subject's Gate AI note, scoped as their lead is, written on first view and cached.

**Architecture:**
- **Pure vocabulary** (`src/data/`, rule 4: every value export referenced by the sibling test): `providerKey` moves to `src/data/providerKey.ts`; `roleKeyOfCodes` joins `composition.ts`; the geo and hyper facts builders gain subject branches.
- **Server** (`app/api/notes/`): three new subject forms in `params.ts`, one new timing kind in `keys.ts`, the request route accepting them, per-kind questions in `prompts.ts`, the sources table's `accepts`/`label`/`read` for them. No new warm load, `NOTES_VERSION` stays 10.
- **HUD** (`components/notes/`, `components/inspector/`): `noteSubjectOf` loses the country branch, History's top card stands on the window pill, a pure `subjectNote.ts` derives each card's request, and one `SubjectNote` block mounts in four cards.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Vitest (`node` env), React + Zustand, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-29-subject-notes-design.md`. Read it first; it extends `2026-10-27-ai-notes-design.md`.

## Global Constraints

- Copy says "nodes", never "machines"; "the network"/metagraph, never "the fleet" (`noteHonesty.ts` bans both).
- No `title=` attributes, no emoji, Tailwind utilities in JSX; new `text-*`/`rounded-*`/`tracking-*` tokens are registered in `lib/utils.ts` (none expected).
- Model text renders as React text only: no `dangerouslySetInnerHTML`, no markdown.
- Never print or log `GATE_API_KEY`; the dev server runs with `NOTES_STORE=memory` (no Upstash writes from local runs).
- Each task ends green: `npx vitest run <its files>` then `npm run typecheck`; commit per task with trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Worktree: `/home/alexander/Projects/dag-visualizer-ai-notes`, branch `feat/ai-notes`.
- Imports from `app/api/*` into `components/` or `src/data/` are not allowed (hence Task 1's move).

## Review Focus

1. A provider cohort whose `isp` is null (no provider known) → no request, no block (Task 6 test).
2. A network-scoped country or provider note before a week of the geo family exists → facts state no "a week ago" and no ratio, the note still exists (Tasks 3 tests "no week ago").
3. The automatic request answering `unavailable` (429 or Gate down) → the block disappears, no "couldn't write" copy (Task 6 wiring test).
4. A composition key whose codes are empty ("Unknown") → `roleKeyOfCodes` answers `none` and the stored series `f.type.<net>.none` is read (Task 1 and 4 tests).
5. The History top card while a range is brushed → still the window pill's note and chip; the Range card carries the range's (Task 6 tests).

---

### Task 1: The vocabulary the subjects are spelled in

**Files:**
- Create: `src/data/providerKey.ts`, `src/data/providerKey.test.ts`
- Modify: `app/api/trends/fleetGeo.ts` (import `providerKey` from the new home, delete the local one and `KEY_MAX`), `src/data/composition.ts`, `src/data/composition.test.ts`

**Interfaces:**
- Produces: `providerKey(isp: string | undefined | null): string | null` (same body as today's `fleetGeo.ts` one; `KEY_MAX = 48` moves with it). `roleKeyOfCodes(codes: readonly string[]): string` in `composition.ts`: the inverse of `roleKeyLabel` for the codes (`["L0","cL1"]` → `"l0+cl1"`, `[]` → `"none"`; unknown codes ignored; order is `ROLE_ORDER`'s regardless of input order).

- [ ] **Step 1: Write the failing tests**

`src/data/providerKey.test.ts`:
```ts
it("slugs a provider name: lowercase, runs of non-alphanumerics one dash, trimmed, 48 chars", () => {
  expect(providerKey("Hetzner Online GmbH")).toBe("hetzner-online-gmbh");
  expect(providerKey("  Amazon.com, Inc. ")).toBe("amazon-com-inc");
  expect(providerKey("x".repeat(60))!.length).toBe(48);
});
it("an unknown host is null, never an invented bucket", () => {
  expect(providerKey(undefined)).toBeNull(); expect(providerKey(null)).toBeNull(); expect(providerKey("---")).toBeNull();
});
```
`src/data/composition.test.ts`, appended:
```ts
describe("roleKeyOfCodes", () => {
  it("is roleKeyLabel's inverse on the codes", () => {
    for (const key of ["l0", "cl1", "dl1", "l0+cl1", "l0+dl1", "cl1+dl1", "l0+cl1+dl1", "none"])
      expect(roleKeyOfCodes(roleKeyLabel(key).codes)).toBe(key);
  });
  it("orders by the vocabulary and ignores a code it does not know", () => {
    expect(roleKeyOfCodes(["dL1", "L0"])).toBe("l0+dl1");
    expect(roleKeyOfCodes(["L9", "cL1"])).toBe("cl1");
  });
});
```

- [ ] **Step 2: Run them to verify they fail** — `npx vitest run src/data/providerKey.test.ts src/data/composition.test.ts` (import errors).
- [ ] **Step 3: Implement** `src/data/providerKey.ts` (move the function and its comment verbatim; `fleetGeo.ts` imports it from `@/src/data/providerKey`), and `roleKeyOfCodes` beside `roleKeyLabel` in `composition.ts` (invert `ROLE_SHORT`).
- [ ] **Step 4: Run** the two tests, `app/api/trends/*.test.ts`, `src/data/dataExportCoverage.test.ts`; then `npm run typecheck`. All pass.
- [ ] **Step 5: Commit** `refactor(data): providerKey and roleKeyOfCodes, the vocabulary subject notes are spelled in`

### Task 2: The subject grammar, its timing and the request route

**Files:**
- Modify: `app/api/notes/keys.ts`, `app/api/notes/keys.test.ts`, `app/api/notes/params.ts`, `app/api/notes/params.test.ts`, `app/api/notes/handlers.ts`, `app/api/notes/handlers.test.ts`, `app/api/notes/generate.ts` (the `timingOf` call), `app/api/notes/warm.ts` (the `timingOf` call)

**Interfaces:**
- Produces (`keys.ts`): `export type SubjectKind = "view" | "country" | "provider" | "type"`; `export function subjectKindOf(subject: string): SubjectKind` (`cc:XX` and `<net>/cc:XX` → country; `isp:` forms → provider; `/type:` → type; else view); `export function isSubjectNote(subject: string): boolean` (true for every form with a `/` and for `isp:<key>`; **false** for `cc:XX`, the warmed kind); `KIND_TIMING.subject = { refreshMs: null, ttlS: 24 * 3600 }`; `timingOf(view, span, subject = "")` answers `KIND_TIMING.subject` first when `isSubjectNote(subject)`.
- Produces (`params.ts`): the subject forms of the spec's table accepted per view (`<net>` is `dag` or a tracked id, former ids resolved to current; `<key>` matches `/^[a-z0-9-]{1,48}$/`; `<roleKey>` matches `/^(l0|cl1|dl1)(\+(l0|cl1|dl1)){0,2}$|^none$/` and equals `roleKey` of its own parts, i.e. in vocabulary order with no repeat); `parseNoteRequest` accepts `{ view: "hyper" | "geo", subject }` when `isSubjectNote(subject)` (span omitted; the fixed one applies) besides History's two kinds; `export function isLimitedNote(view: NoteView, subject: string, span: NoteSpan): boolean` replaces `isLimitedSpan` (true for a brushed range OR a subject note).
- `handlers.ts` calls `isLimitedNote(parsed.view, parsed.subject, parsed.span)`; its header comment's LIMITS paragraph names subject notes as the second limited kind and why (the Gate's burst limit).

- [ ] **Step 1: Write the failing tests**

`keys.test.ts`:
```ts
it("a subject note is never warmed and lives a day; the warmed country kind is not one", () => {
  expect(isSubjectNote("dor/cc:FI")).toBe(true); expect(isSubjectNote("isp:hetzner-online")).toBe(true);
  expect(isSubjectNote("dor/isp:hetzner-online")).toBe(true); expect(isSubjectNote("dor/type:l0+cl1")).toBe(true);
  expect(isSubjectNote("cc:FI")).toBe(false); expect(isSubjectNote("dor")).toBe(false); expect(isSubjectNote("all")).toBe(false);
  expect(timingOf("geo", "day", "dor/cc:FI")).toEqual({ refreshMs: null, ttlS: 86_400 });
  expect(timingOf("geo", "day", "cc:FI")).toEqual(KIND_TIMING.geo);
  expect(timingOf("hyper", "day", "dor/type:l0")).toEqual(KIND_TIMING.subject);
});
it("names a subject's kind", () => {
  expect(subjectKindOf("cc:FI")).toBe("country"); expect(subjectKindOf("dor/cc:FI")).toBe("country");
  expect(subjectKindOf("isp:x")).toBe("provider"); expect(subjectKindOf("dor/isp:x")).toBe("provider");
  expect(subjectKindOf("dor/type:none")).toBe("type"); expect(subjectKindOf("dor")).toBe("view"); expect(subjectKindOf("all")).toBe("view");
});
```
`params.test.ts` (use `anId`, `relisted` as the file does):
```ts
it("Geography takes a network's country and a provider, fleet or network scoped; Hypergraph a network's make-up", () => {
  expect(parseNoteParams(sp(`view=geo&subject=${anId}/cc:FI`), NOW)).toEqual({ view: "geo", subject: `${anId}/cc:FI`, span: "day" });
  expect(parseNoteParams(sp("view=geo&subject=dag/cc:FI"), NOW)).toEqual({ view: "geo", subject: "dag/cc:FI", span: "day" });
  expect(parseNoteParams(sp("view=geo&subject=isp:hetzner-online"), NOW)).toEqual({ view: "geo", subject: "isp:hetzner-online", span: "day" });
  expect(parseNoteParams(sp(`view=geo&subject=${anId}/isp:hetzner-online`), NOW)).toEqual({ view: "geo", subject: `${anId}/isp:hetzner-online`, span: "day" });
  expect(parseNoteParams(sp(`view=hyper&subject=${anId}/type:l0+cl1`), NOW)).toEqual({ view: "hyper", subject: `${anId}/type:l0+cl1`, span: "day" });
  expect(parseNoteParams(sp(`view=hyper&subject=${anId}/type:none`), NOW)).toEqual({ view: "hyper", subject: `${anId}/type:none`, span: "day" });
});
it("a former address inside a subject note answers as its current id", () => {
  expect(parseNoteParams(sp(`view=geo&subject=${relisted.formerIds![0]}/cc:FI`), NOW)).toEqual({ view: "geo", subject: `${relisted.id}/cc:FI`, span: "day" });
});
it("refuses a subject note in the wrong view, an untracked network, a bad key or a make-up out of order", () => {
  for (const q of [`view=hyper&subject=${anId}/cc:FI`, `view=geo&subject=${anId}/type:l0`, `view=ledger&subject=${anId}/type:l0`, `view=trend&subject=${anId}/cc:FI&span=7d`,
    "view=geo&subject=nope/cc:FI", "view=geo&subject=isp:Hetzner", "view=geo&subject=isp:", `view=hyper&subject=${anId}/type:cl1+l0`, `view=hyper&subject=${anId}/type:l0+l0`, `view=hyper&subject=${anId}/type:l2`,
    `view=geo&subject=${anId}/cc:fi`, `view=geo&subject=${anId}/`])
    expect(parseNoteParams(sp(q), NOW), q).toHaveProperty("error");
});
describe("parseNoteRequest", () => {
  it("takes a subject note for Hypergraph or Geography with no span", () => {
    expect(parseNoteRequest({ view: "geo", subject: `${anId}/cc:FI` }, NOW)).toEqual({ view: "geo", subject: `${anId}/cc:FI`, span: "day" });
    expect(parseNoteRequest({ view: "hyper", subject: `${anId}/type:l0` }, NOW)).toEqual({ view: "hyper", subject: `${anId}/type:l0`, span: "day" });
  });
  it("refuses a view note, the warmed country, or a span beside a subject note", () => {
    for (const b of [{ view: "geo", subject: anId }, { view: "geo", subject: "cc:FI" }, { view: "geo", subject: `${anId}/cc:FI`, span: "day" }, { view: "ledger", subject: `${anId}/cc:FI` }])
      expect(parseNoteRequest(b, NOW)).toHaveProperty("error");
  });
});
describe("isLimitedNote", () => {
  it("is true for a brushed range and for every subject note", () => {
    expect(isLimitedNote("trend", anId, `r${NOW - 2 * D}-${NOW - D}`)).toBe(true);
    expect(isLimitedNote("geo", `${anId}/cc:FI`, "day")).toBe(true); expect(isLimitedNote("geo", "isp:x", "day")).toBe(true);
    expect(isLimitedNote("geo", "cc:FI", "day")).toBe(false); expect(isLimitedNote("hyper", anId, "day")).toBe(false);
    for (const s of ["1h", "24h", "7d", "30d", "1y", "all"] as const) expect(isLimitedNote("trend", anId, s)).toBe(false);
  });
});
```
Replace the existing `isLimitedSpan` describe with the above. `handlers.test.ts`, in "POST /api/notes/request", modelled on the brushed-range cases (same harness):
```ts
it("writes a subject note on request, counting the visitor like a brushed range; a read of it answers `request`", async () => { /* GET geo `${anId}/cc:FI` → state "request"; POST same → ok, rate key incremented once, model called once; second POST served from cache, counts nothing */ });
it("a visitor's 21st subject note in an hour is a 429", async () => { /* 20 distinct `${anId}/cc:XX` POSTs ok, the 21st 429 */ });
```

- [ ] **Step 2: Run them to verify they fail** — `npx vitest run app/api/notes/keys.test.ts app/api/notes/params.test.ts app/api/notes/handlers.test.ts`.
- [ ] **Step 3: Implement** `keys.ts` (`SubjectKind`, `subjectKindOf`, `isSubjectNote`, `KIND_TIMING.subject`, `timingOf`'s third parameter; `NoteKind` gains `"subject"`), `params.ts` (a `subjectOf(view, raw)` that splits on the first `/`, resolves the `<net>` part through `currentIdOf`/`isTracked` or `dag`, and validates the tail per view; `parseNoteRequest`; `isLimitedNote`), `handlers.ts`, and pass the subject in `generate.ts` (`timingOf(view, span, subject)`) and `warm.ts` (`timingOf(item.view, item.span, item.subject)`). Keep the error strings fixed ("bad subject", "bad span", "bad body").
- [ ] **Step 4: Run** `npx vitest run app/api/notes` and `npm run typecheck`. All pass.
- [ ] **Step 5: Commit** `feat(notes): subject notes have a key grammar, a day's timing and the request route`

### Task 3: Geography's country × network and provider facts

**Files:**
- Modify: `src/data/noteFactsGeo.ts`, `src/data/noteFactsGeo.test.ts`, `app/api/notes/sources.ts`, `app/api/notes/sources.test.ts`

**Interfaces:**
- Consumes: `subjectKindOf`, `isSubjectNote` (Task 2).
- Produces (`noteFactsGeo.ts`): `GeoFactsInput.subject` becomes `"all" | string | { cc: string; net?: string } | { isp: string; net?: string }` (`isp` is the provider KEY; `net` a network id, `dag` included; absent = fleet scope). `geoFacts` returns `{ facts, names }` or null for the new forms as the spec's *Facts and prompts* states, labels scope-first:
  - country × net: `${netName}, nodes in ${country}` (count, pair `to` key `${net}:cc:${cc}` when a week ago exists), `${netName}, share of its located nodes in ${country}` (share), `${country}, rank among ${netName}'s countries by nodes` (count), `${netName}, located nodes` (count), `${netName}, countries with nodes` (count), and when `weekBefore(ownMeasured(net), now)` exists: `${netName}, nodes in ${country} a week ago` (pair `from`) and `${netName}, nodes in ${country} now against a week ago` (ratio, only when both ends > 0 and differ). Null when the network's `now` is absent or its count there is 0.
  - provider, fleet: `${provider}, nodes` (count, pair `to` key `provider:${group}` when `geoThen` holds it), `${provider}, share of the network's nodes with a known provider` (share), `${provider}, rank by nodes among providers` (count), `Providers hosting nodes` (count), week-ago pair + ratio from `geoThen` as the `all` branch does. Null when the provider hosts no fleet node now.
  - provider × net: `${netName}, nodes with ${provider}` (count, pair `to`), `${netName}, share of its nodes with a known provider with ${provider}` (share), `${provider}, rank among ${netName}'s providers by nodes` (count), `${netName}, providers with nodes` (count), week-ago pair + ratio from `weekBefore(ownMeasured(net), now)`'s `netIsp`. Null when none now.
  - Provider lookup: the subject's `isp` KEY against `providersOf(...)`'s groups, where a group's `keys`/`names` hold it (read `Provider` at `noteFactsGeo.ts:~182` to see which field holds the raw keys; match on it). `names` collects the provider's forms through `pn()` and the country through `cn()` as today. No common reading for any subject note (`input.daily` ignored when `subject` is an object).
- Produces (`sources.ts`): the geo row's `accepts` also takes `isSubjectNote(subject)` forms whose network part is `dag` or `isNetwork`, and the `cc:`/`isp:`/key shapes Task 2 validates; `label`: country × net → `${names[net]}'s nodes in ${countryName(cc)}`, provider fleet → the provider's display name from `providerNames` (fallback the key), provider × net → `${names[net]}'s nodes with ${providerName}`; `whole` false for subject notes; `read` passes the parsed object subject to `geoFacts`, with `daily` omitted. `NoteFacts` gains `kind: SubjectKind` (from `subjectKindOf(subject)`), set in `factsFor` for every view. Since `label` needs `providerNames`, let the geo row's `label` be computed inside `read` and returned on `Read` as `label?: string` overriding the row's (the row's `label` stays for view notes); `factsFor` uses `r.label ?? row.label(subject, names)` and the same for `subjectName`.

- [ ] **Step 1: Write the failing tests** in `noteFactsGeo.test.ts`, using the file's existing day builders (read its helpers first; they build `geoDays`/`ccDays` with `f.cc.*`, `f.cc.<id>.*`, `f.isp.*`, `f.isp.<id>.*`). Cases:
  - "a network's nodes in a country: count, share of its located nodes, rank, with the week-ago pair and ratio from its own measured day" (8 days of geo family with the network present: assert labels and values; pair keys on both ends).
  - "a network's country note states no week ago while the family is younger than a week" (3 days: no `a week ago`, no ratio fact; the count has no `pair`).
  - "a network with no nodes in the country now is nothing to describe" (null).
  - "a fleet provider: nodes, share of nodes with a known provider, rank, how many providers, and its week-ago pair" + "a provider hosting no node now is null".
  - "a network's provider: the network's nodes with it, share of its known-provider nodes, rank among its providers".
  - "a subject note appends no common reading even when daily is given".
  - "names include the provider's forms and the country" (so the gate strips them).
  In `sources.test.ts`, with the file's stub reads: "factsFor accepts the geo subject notes, labels them scope-first, names the subject and the kind, with no common reading" (assert `label`, `subjectName`, `kind`, `common === false`) and "noteSupported refuses a subject note in another view".

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/data/noteFactsGeo.test.ts app/api/notes/sources.test.ts`.
- [ ] **Step 3: Implement** in `noteFactsGeo.ts`: widen the subject type, add `subjectIsp`/`subjectScopeNet` locals beside `subjectNet`/`subjectCc`, a branch per form after the existing `else if (subjectCc)` (fleet country), reusing `ranked`, `providersOf`, `weekBefore`, `ownMeasured`, `cn`, `pn`. Update the header comment's honesty list with one bullet: "A SUBJECT NOTE is scoped as its card is (country × network, provider × scope): network-scoped figures read the geo family alone, a week ago only from the network's own measured day, no common reading". Then `sources.ts` as above.
- [ ] **Step 4: Run** `npx vitest run src/data app/api/notes` and `npm run typecheck`. All pass.
- [ ] **Step 5: Commit** `feat(notes): Geography's country and provider notes, scoped as their cards are`

### Task 4: Hypergraph's make-up × network facts

**Files:**
- Modify: `src/data/noteFactsHyper.ts`, `src/data/noteFactsHyper.test.ts`, `app/api/notes/sources.ts`, `app/api/notes/sources.test.ts`

**Interfaces:**
- Produces (`noteFactsHyper.ts`): `HyperFactsInput.subject` becomes `"all" | "dag" | string | { net: string; type: string }` (`type` a `roleKey`). For the object form: `gaugeFacts(`${netName} nodes ${comboWords(type)}`, fleet.series[`f.type.${net}.${type}`] ?? [])`; `${netName} nodes at the end of the span` (count, the network's `heldLevel`); `${netName}, share of its nodes ${comboWords(type)}` (share = type's `gaugeChange(...).to` / network level, when the level > 0); `Node make-ups in ${netName}` (count of `typeBands(net, fleet.series)` whose `heldLevel` > 0). Null when the type series has no measured sample or its `gaugeChange` is null or its `to` is 0. No activity facts, no rank, `blurbs` for the network as the network branch does, `names` as today.
- Produces (`sources.ts`): the hyper row accepts `<net>/type:<roleKey>` with `net` `dag` or `isNetwork`; `label` → `${names[net]} nodes ${comboWords(type)}` — export `comboWords` from `noteFactsHyper.ts` (and reference it in its test) — ; `whole` false; `read` parses the subject and passes the object.

- [ ] **Step 1: Write the failing tests** in `noteFactsHyper.test.ts` with the file's series builders: "a make-up's note: its count over the span as a pair, the network's level, its share and how many make-ups" (a changing `f.type.<net>.l0+cl1` series: start/end/ratio facts with pair keys), "a make-up that held states only its end level", "a make-up with no sample, or ending at 0, is null", "the none make-up reads `f.type.<net>.none`" (`comboWords("none")` → "with no stated layer"). In `sources.test.ts`: "factsFor accepts a network's make-up, labels it, kind `type`, no common reading"; "refuses a make-up in Geography".
- [ ] **Step 2: Run to verify they fail**.
- [ ] **Step 3: Implement** as above; header comment gains one bullet for the subject note.
- [ ] **Step 4: Run** `npx vitest run src/data app/api/notes` and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(notes): a make-up's note in Hypergraph`

### Task 5: The questions for the three kinds

**Files:**
- Modify: `app/api/notes/prompts.ts`, `app/api/notes/prompts.test.ts`, `app/api/notes/generate.ts`, `app/api/notes/generate.test.ts`

**Interfaces:**
- Consumes: `SubjectKind` (Task 2), `NoteFacts.kind` (Task 3).
- Produces: `PROMPTS[view].questions?: Partial<Record<Exclude<SubjectKind, "view">, string>>` with: geo `country`: "First, how many of the network's nodes run in the country and how that moved over the span; if nothing moved, say it held, with the level and the country's place among the network's countries. Say nothing about speed."; geo `provider`: "First, how many nodes the provider hosts across the network and how that moved over the span, stated as network-wide, not for one place; if nothing moved, say it held, with the level and its place among the providers. Say nothing about speed."; hyper `type`: "First, how many of the network's nodes run this make-up and how that changed over the span; if nothing changed, say it held, with the level and its share of the network's nodes.". `system(subjectLabel, lead?, common?, kind?: SubjectKind)` uses `questions[kind]` when given and not `"view"`, else the view's `question`; the common part is appended only when `common` (false for every subject note). `buildMessages(view, label, block, days, retryReasons?, lead?, common?, kind?)`; `generate.ts`'s `write` passes `input.kind`.

- [ ] **Step 1: Write the failing tests** (`prompts.test.ts`): "asks a country, a provider and a make-up their own question, with no common part" (system prompt contains the kind's question, not the view's, and not `questionCommon` even with `common: true`), "a view kind asks the view's question" (unchanged behaviour), "the kind questions keep the house copy: no digits, no dashes, no 'fleet'". `generate.test.ts`: "a subject note's facts kind reaches the prompt" (stub `facts` returns `kind: "country"`, assert the chat's system message contains the country question).
- [ ] **Step 2: Run to verify they fail**.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npx vitest run app/api/notes` and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(notes): each subject kind asks its own question`

### Task 6: The HUD: the top card holds, the subject cards carry their own

**Files:**
- Create: `components/notes/subjectNote.ts`, `components/notes/subjectNote.test.ts`, `components/notes/SubjectNote.tsx`
- Modify: `components/notes/noteSubject.ts`, `components/notes/noteSubject.test.ts`, `components/notes/useAiNote.ts`, `components/notes/NotesCard.tsx`, `components/notes/notesCardWiring.test.ts`, `components/inspector/cards.tsx` (`CountryCard`, `ProviderCard`, `CompositionCard`), `components/inspector/TrendRangePane.tsx`

**Interfaces:**
- Consumes: `providerKey`, `roleKeyOfCodes`, `parseCompositionKey` (Task 1), `NoteReq` (`noteLoader.ts`), `useNote`, `useNet`, `NET`, `UNLISTED_ID`, `SectionLabel`, `QualifierChip`, `NodeStars`, `AI_NOTES_ICON`, `spanPhrase`, `noteSpanWords`.
- Produces (`subjectNote.ts`, pure, no store/react):
  ```ts
  /** The network a subject note is scoped to: null for the fleet ("all" or no filter); an unlisted network has no note (undefined = none). */
  export function noteScopeOf(network: string | null, unlisted: (id: string) => boolean): string | null | undefined;
  export function countryNoteReq(cc: string, network: string | null, unlisted): NoteReq | null;   // geo: `cc:XX` fleet, `<net>/cc:XX` scoped
  export function providerNoteReq(isp: string | null, network: string | null, unlisted): NoteReq | null; // geo: `isp:<key>` / `<net>/isp:<key>`; null when providerKey is null
  export function typeNoteReq(sel: { netId: string; key: string }, unlisted): NoteReq | null;      // hyper: `<net>/type:<roleKey>`
  export function rangeNoteReq(trendCard: string | null, range: { fromMs: number; toMs: number } | null, unlisted): NoteReq | null; // trend: `r<from>-<to>` on the plane's network (all/dag/null → "dag")
  ```
  `network` for the geo forms is `metagraphCardNetwork(...)`'s answer (the filter's network, "all" when none); `"dag"` is a network here.
- Produces (`noteSubject.ts`): `noteSubjectOf` for `geo` stands on the network else `all` (the `country` field and branch removed from `NoteSubjectState`).
- Produces (`useAiNote.ts`): History's `span` is `trendWindow` always; export `useMainnetNote(req: NoteReq | null): NoteState` (the mainnet gate factored out of `useAiNote` and used by it: `useNet()` for presence, `NET === net` for the fetch, exactly as today's comment explains).
- Produces (`SubjectNote.tsx`): `export default function SubjectNote({ req, span }: { req: NoteReq | null; span: string | null })` where `span` is the chip's words (`noteSpanWords(view)` for geo/hyper, `spanPhrase(trendWindow, range)` for the range). Renders null when `!req`, when `res?.state` is `none` or `unavailable`, else a block: `<Separator className="my-2" />`, `<SectionLabel label={<span className="inline-flex items-center gap-1.5"><AI_NOTES_ICON aria-hidden className="size-3.5 text-[var(--ai-mark)]" />Constellation Gate AI</span>} unit={span} className="mb-1.5" />`, then for `res == null` → `reading…`, `pending` → `writing…` (both `<p className="m-0 flex items-center gap-2 text-body text-muted-foreground"><NodeStars />…</p>` as the top card), `ok` → `<p className="m-0 text-body leading-snug text-foreground">{res.text}</p>`, `request` → the same `writing…` line, and an effect that calls `note.request()` once per `queryOf(req)` when `res?.state === "request"`. No door, no "couldn't write". Keep the header comment short and name the spec and the rule (one note per card, scoped as the lead).
- `NotesCard.tsx`: `RequestDoor` keeps only the 1h copy ("Write notes for this hour"); the range branch of its label goes; the chip for History is `spanPhrase(trendWindow, null)`. Update the header comment: the card is the view's note at the filter's scope; subject notes live on their cards (`SubjectNote`).
- Cards: `CountryCard` → `<SubjectNote req={countryNoteReq(cc, network, isUnlisted)} span={noteSpanWords("geo")} />` directly after the `Lead` and before the `Separator`, where `network` is `metagraphCardNetwork({...})` (the hook-free call Inspector/useAiNote make; read `useAiNote.ts` for the argument set, select the same store fields) — put that derivation in one small hook `useNoteScopeNetwork()` in `useAiNote.ts` and reuse it in the three geo/hyper cards. `ProviderCard` → `providerNoteReq(sel.isp, network, …)`. `CompositionCard` → `typeNoteReq(sel, …)` (the composition is network-scoped by `sel.netId`; no filter read). `TrendRangePane` → inside the open block after the `Lead`, `range ? <SubjectNote req={rangeNoteReq(cardNetwork(filter, focus, front), range, …)} span={spanPhrase(windowId, range)} /> : null`.

- [ ] **Step 1: Write the failing tests**

`subjectNote.test.ts`:
```ts
const unl = (id: string) => id === "unlisted";
it("a country note is fleet scoped with no filter, network scoped under one, none for the unlisted network", () => {
  expect(countryNoteReq("FI", "all", unl)).toEqual({ view: "geo", subject: "cc:FI" });
  expect(countryNoteReq("FI", null, unl)).toEqual({ view: "geo", subject: "cc:FI" });
  expect(countryNoteReq("FI", "dor", unl)).toEqual({ view: "geo", subject: "dor/cc:FI" });
  expect(countryNoteReq("FI", "dag", unl)).toEqual({ view: "geo", subject: "dag/cc:FI" });
  expect(countryNoteReq("FI", "unlisted", unl)).toBeNull();
});
it("a provider note keys the display name the sampler's way, and has none without a provider", () => {
  expect(providerNoteReq("Hetzner Online GmbH", "all", unl)).toEqual({ view: "geo", subject: "isp:hetzner-online-gmbh" });
  expect(providerNoteReq("Hetzner Online GmbH", "dor", unl)).toEqual({ view: "geo", subject: "dor/isp:hetzner-online-gmbh" });
  expect(providerNoteReq(null, "dor", unl)).toBeNull(); expect(providerNoteReq("---", "dor", unl)).toBeNull();
});
it("a make-up note spells the composition key's codes as a role key", () => {
  expect(typeNoteReq({ netId: "dor", key: "Hybrid|L0·cL1" }, unl)).toEqual({ view: "hyper", subject: "dor/type:l0+cl1" });
  expect(typeNoteReq({ netId: "dor", key: "Unknown|" }, unl)).toEqual({ view: "hyper", subject: "dor/type:none" });
  expect(typeNoteReq({ netId: "unlisted", key: "Data|dL1" }, unl)).toBeNull();
});
it("a range note stands on the plane's network, the hypergraph for all / dag / none, and only while a range is brushed", () => {
  expect(rangeNoteReq("dor", { fromMs: 1, toMs: 2 }, unl)).toEqual({ view: "trend", subject: "dor", span: "r1-2" });
  for (const c of ["all", "dag", null]) expect(rangeNoteReq(c, { fromMs: 1, toMs: 2 }, unl)).toEqual({ view: "trend", subject: "dag", span: "r1-2" });
  expect(rangeNoteReq("dor", null, unl)).toBeNull(); expect(rangeNoteReq("unlisted", { fromMs: 1, toMs: 2 }, unl)).toBeNull();
});
```
`noteSubject.test.ts`: replace the two country cases with "geo stands on the network, else everything, never a country (the Country card carries its own)". `notesCardWiring.test.ts`, a new describe "subject notes live on their cards":
  - `SubjectNote.tsx` has no `RequestDoor`/`Door`, no "Couldn" copy, returns null on `"none"` and `"unavailable"`, and calls `note.request()` inside a `useEffect` guarded by `res?.state === "request"`;
  - `cards.tsx` mounts `<SubjectNote` inside `CountryCard`, `ProviderCard` and `CompositionCard` (use `fnBody`), `TrendRangePane.tsx` mounts it guarded by `range`;
  - `useAiNote.ts` has no `trendRange` in the span derivation (`/span = .*trendRange/` absent) and `NotesCard.tsx` has no "range" door copy;
  - `noteSubject.ts` has no `country` field.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run components/notes`.
- [ ] **Step 3: Implement** as the Interfaces state. In the cards, the `SubjectNote` sits between the `Lead` and the first `Separator` (CountryCard/ProviderCard/CompositionCard); in `TrendRangePane` between the `Lead` and the `FactGroup`.
- [ ] **Step 4: Run** `npx vitest run components src/data` then `npm test` and `npm run typecheck`. All pass (the boundary tests included: `tooltipBoundary`, `feedReadBoundary` — a `SubjectNote` reads no feed).
- [ ] **Step 5: Commit** `feat(rail): the Gate AI card holds the view's note; Country, Provider, Composition and Range carry their own`

### Task 7: Docs

**Files:**
- Modify: `components/CLAUDE.md` (the notes-slot paragraph near line 855 and the R78 paragraph near 876: the top card is the view's note at the filter's scope; subject cards carry their own `SubjectNote`, the table of which do; History's top card is the window's), `app/api/CLAUDE.md` (lines ~96–115: the subject grammar, `KIND_TIMING.subject`, the request route's second limited kind), `components/docs/AboutDoc.tsx` (the Gate AI paragraph: one sentence that a selected country, provider, node make-up or brushed range carries its own note on its card).

- [ ] **Step 1: Edit** the three files; present tense; no history.
- [ ] **Step 2: Run** `npm test` (the About copy is read by no test, but `tooltipBoundary` and the wiring tests re-run) and `npm run typecheck`.
- [ ] **Step 3: Commit** `docs(notes): subject notes, where they live and how they are asked for`
