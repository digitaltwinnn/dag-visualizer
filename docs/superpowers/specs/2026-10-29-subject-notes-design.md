# Subject notes: a Gate AI note on the card it belongs to

Design, 2026-10-29, agreed with the user in chat on the live app. Decisions marked **(user)** are
theirs; **(my call)** are mine and open to correction. Extends `2026-10-27-ai-notes-design.md`,
whose terms (the generator, the honesty gate, the key family, the warm pass) this document assumes.

## Intent

With DOR filtered in Geography, clicking Finland swapped the Gate AI card's note from DOR's to
Finland's. The two notes are complementary, not alternatives, and the Finland note landed above a
Country card whose own lead already says, from live data, what Finland is to the selection. The
user's reading **(user)**: keep the Gate AI card on the VIEW's note, and where a selected subject
has a note of its own, put it in that subject's own card, beside the measured sentence it
complements. "I like consistency": every card that can carry one does, by one rule.

## The rule

**Every subject card whose subject has a stored series over the note's span carries its own Gate
AI note, scoped the way the card's own lead is scoped. The Gate AI card at the top of the lane is
the view's note at the filter's scope.** The finest rungs are live records with no stored history,
so they carry none, and show nothing extra.

| View | Card | Note | Scope | Backing series |
|---|---|---|---|---|
| all four | Gate AI (top) | the view's reading | the filter: everything, or the network | as today |
| all four | Metagraph (`context`) | none | same subject as the top card when filtered: one note, not two **(my call)** | |
| Geography | Country | the country's nodes | filter × country | fleet `f.cc.<cc>` (tiers, since 2026-09-07); per network `f.cc.<net>.<cc>` (geo family, since 2026-10-27) |
| Geography | Provider (`cohort`) | the PROVIDER's nodes, named as network-wide | filter × provider | `f.isp.<key>`, `f.isp.<net>.<key>` (geo family) |
| Hypergraph | Composition | the make-up's nodes in its network | network × type | `f.type.<net>.<roleKey>` (hourly, since 2026-09-29) |
| History | Range | the brushed span | plane's network × range | as today (the `r<from>-<to>` kind), moved into the card |
| all | Node, Tick, Metagraph snapshot, Moment | none | | no per-subject series; unbounded keys |

**The cohort's frame (user, 2026-10-29: "the card emphasis is on provider (= card title) so you
can talk about providers").** The store has no city and no country × provider cut, so a provider
note is the provider across the filter's scope, and its first sentence says so; the card's own
lead ("41% of Finland's nodes") keeps its frame. Two cohorts of one provider read one note.

**The country's frame.** A fleet-scoped country note under a network filter was the mismatch the
user hit (Finland's 8% of the whole network above a lead reading DOR's 30%). With a network
filtered, the country note is that network's nodes in the country; with none, the fleet's, as
today. The per-network geo series began 2026-10-27, so a network-scoped country or provider note
states no change until a week of it exists (about 2026-11-03) and reads as "right now" until
then: honest absence, the geo builder's existing rule for a network's own note.

## Behaviour

- **The top card no longer follows a drill.** `noteSubjectOf` stands Geography on the network,
  else everything (the country branch goes); History's top card is the WINDOW pill's note always
  (a brushed range no longer takes it). R78 (a view is entered on its note) is unchanged.
- **A subject note is written on first view, once per key, and cached for everyone.** Server side
  it is an ON-REQUEST kind (`refreshMs: null`, TTL 24 h **(my call)**: never warmed, rewritten at
  most once a day when someone looks); the client asks for it automatically when the read answers
  `request` (no door: the gesture is the selection itself) **(my call)**. It counts against the
  request route's per-visitor and daily limits like a brushed range: the key space is bounded
  (countries × networks, providers × networks, types × networks) but the Gate's burst limit is
  not, and one visitor drilling through twenty countries should pace themselves, not the cron.
- **The block inside a card** sits directly under the card's lead, above its breakdown: a section
  header in the card's own section grammar (`SectionLabel`): the sparkles mark in `--ai-mark` and
  "Constellation Gate AI" as the label, the span words as the unit ("last 7 days" for Geography
  and Hypergraph; History's range in `spanPhrase`), then the note text in the body type. States:
  `reading…` / `writing…` with the stars as on the top card; `none`, and `unavailable` from the
  automatic ask, show nothing (the card never says "couldn't write" for a gesture the reader did
  not make) **(my call)**.
- **The fleet-scoped country notes stay warmed** (`cc:XX`, the kind that exists today); nothing
  else new is planned by the warm pass.
- **The Range card** carries the brushed range's note in the same block; the top card keeps the
  window note and its notable days (the timeline diamonds read the top card's days, unchanged).
  The "Write notes for this range" door goes with it: the range's note is asked automatically like
  every subject note. The 1h pill's door stays on the top card.

## Subject grammar (server)

Subjects are flat strings, validated in `params.ts`; `<net>` is a tracked network id or `dag`:

| Subject | View | Kind | Timing |
|---|---|---|---|
| `all`, `dag`, `<net>` | all | the view's | as today |
| `cc:XX` | geo | country, fleet scope | as today (warmed daily) |
| `<net>/cc:XX` | geo | country × network | subject (on request, 24 h) |
| `isp:<key>` | geo | provider, fleet scope | subject |
| `<net>/isp:<key>` | geo | provider × network | subject |
| `<net>/type:<roleKey>` | hyper | make-up × network | subject |

`<key>` is `providerKey(isp)` (`[a-z0-9-]{1,48}`, the sampler's slug of the provider's display
name — one home, moved to `src/data/providerKey.ts`); `<roleKey>` is `roleKey`'s vocabulary
(`l0`, `cl1`, `dl1` joined by `+` in order, or `none`), derived on the client from the composition
key's codes (`roleKeyOfCodes`). The span is the view's fixed one (`day`).

## Facts and prompts

Each new kind has its own facts and its own question; none carries the common activity reading
(R74 is a network's or the whole network's).

- **Country × network** (geo builder, geo family only): the network's nodes in the country now
  (pair `to`), its share of the network's located nodes there, the country's rank among the
  network's countries, the network's located nodes and countries with nodes, and the week-ago pair
  and ratio when the network's own measured day a week back exists. Null (→ `none`) when the
  network has no nodes there now. Question: how many of the network's nodes run in the country and
  how that moved; if nothing moved, the level and the country's place among the network's
  countries.
- **Provider** (fleet or network scope): the provider's nodes now (pair `to`), its share of the
  scope's nodes with a known provider, its rank among the scope's providers, how many providers the
  scope has, the week-ago pair and ratio (geo family, both ends measured). Null when the provider
  hosts none of the scope's nodes now. Question: how many nodes the provider hosts across the
  network (or the whole network), stated as network-wide, and how that moved; else the level and
  its place among providers.
- **Make-up × network** (hyper builder): the type's node count over the span (`gaugeFacts` on
  `f.type.<net>.<roleKey>`), the network's node count at the end, the type's share of it, and how
  many make-ups the network runs. Null when the type has no measured sample or ends at 0.
  Question: how many of the network's nodes run this make-up and how that changed over the span;
  if nothing changed, the level and its share.

Labels carry the scope's name first (`DOR Technologies, nodes in Finland`; `Hetzner Online,
nodes`; `DOR Technologies nodes running L0 and cL1`) so the gate's attribution by name keeps
working; `subjectName` is the network's name for a network scope and the provider's for a fleet
provider; `whole` is false for every subject note.

## Non-goals

- No note for nodes, ticks, metagraph snapshots or moments (above).
- No city or country × provider facts: the store does not hold them.
- No change to the existing kinds' prompts, keys or version: the new kinds are new keys, so
  `NOTES_VERSION` stays 10.
- No new warm-pass load.

## Left to the builder

File names and the exact test cases are the plan's. The block's exact spacing inside each card is
checked live on both tiers after the plan lands; the phone sheet grows by the block's height.
