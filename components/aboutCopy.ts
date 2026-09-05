// The per-view "About this view" copy — ONE home (user, 2026-08-13: "can't we re-use the about
// card?"). Two consumers: the left rail's AboutView card (every view, collapsed by default) and
// the /about page's "What you can explore" section, which used to carry its own parallel blurbs.
// The page's old constraint — plain words a reader who has never seen the app can parse — is
// carried by the copy rules below, which scrubbed the internal vocabulary out of these lines on
// 2026-08-12; that is what made the sharing possible.
import type { Mode } from "@/src/store/store";

// Per-view "About this view" copy — one orientation card at the top of the left rail in every
// view (collapsed by default). Built views carry no caption; the scaffolded (SOON) views do.
//
// COPY RULE (user, 2026-08-12): About says what you can FIND OUT here and why it is worth
// knowing — never what the view LOOKS like. The user is already looking at it, so a sentence
// spent on honeycomb towers, a "3D chamber" or a trail receding to the left buys nothing (and
// two of those three were factually wrong). It also names no medium: that the scene is 3D is
// visible, not information. The GESTURE belongs to the right rail's ghost hints and the
// explorer's own hint — About must not restate it, which is what had geo telling you to drill
// a country three times on one screen. Paragraph 1 = the network fact this view exists to show;
// paragraph 2 = what to look FOR in it.
//
// ⚠️ HYPER'S FACTS, corrected by the user (2026-08-12) — three claims that read plausibly and are
// wrong: the network is NOT feeless (scalability is the real headline); work is NOT "spread across"
// networks as if sharded — metagraphs are INDEPENDENT and interlinked; and the unit here is a NODE,
// never a "machine" (that word belongs to the ledger's trays). The card must also say what is META
// about a metagraph in plain words — the core keeps a record ABOUT a metagraph's ledger, never its
// contents — because that is the same fact that explains the scaling, so the two belong in one
// breath rather than as a claim and an unrelated boast.
//
// ⚠️ AND IT MUST ANSWER ITS OWN TITLE (user, 2026-08-12). "How the network is built" was answered
// with what the network IS and how big each one gets, which is a different question: what this view
// actually shows is the LAYERS — L0, dL1, cL1 — each with a job inside its own network, and the
// fact that a network runs only the ones it needs (no token → no cL1). The layers are the FACT and
// belong here; the rings they are drawn as are the LOOK and stay out, per the rule above.
//
// ⚠️ GEO STAYS OFF THE DECENTRALIZATION QUESTION ENTIRELY (user, 2026-08-12). "Decentralization is
// a claim, and this is where you can check it" was too bold — location is only ONE input to it (who
// owns the nodes, what they cost, who operates them all matter and none of it is on this globe), so
// the card was answering a broad, contested question with a partial view. The correction is NOT a
// hedged version of the same claim: the word doesn't belong on the card at all, because naming it —
// even to qualify it — is still the card taking up the topic.
//
// ⚠️ …BUT IT MUST STILL SAY WHY ANY OF IT MATTERS (user, 2026-08-12 — "what does this have to do
// with 'where the network runs'?? why is that relevant?"). Avoiding the contested claim had left the
// card observing that place and provider are "two separate facts", then inviting a comparison of
// networks along both — a framing that answers a question nobody asked and never says what the
// answer would mean. So the "grades nothing" rule is NARROWED to what it was actually about: the
// decentralization question. The point the view really carries is that neither place nor host is
// PRESCRIBED, and the payoff line says exactly that and stops.
//
// ⚠️ AND THE EVIDENCE MUST CARRY THE WEIGHT THE SENTENCE PUTS ON IT (user, 2026-08-12 — "why did you
// suddenly come up with consumer fibre lines? is there any factual data that makes you say this?").
// There was, and it still didn't support the sentence. Live /api/geo, 2026-08-12: 162 validators over
// 21 providers, and four of those IPs really are allocated to consumer ISPs (DELTA Fiber Nederland,
// Ezee Fiber, LIWEST Kabelmedien, B FIBER). But four is 2.5% of the fleet against Hetzner's 97 and
// IONOS's 33 — 130 of 162 on two German hosts — and an ISP name in a geo lookup identifies the AS an
// IP is allocated to, not that the machine sits on a domestic line (LIWEST and DELTA sell business
// connectivity too). "Hosting takes every shape, even consumer fibre lines" therefore made outliers
// the headline: TRUE ROWS, FALSE PICTURE, which is the same failure as the decentralization claim
// pointed the other way. What the tail honestly shows is RANGE — big clouds, budget/bare-metal hosts
// (netcup, Contabo, Hostinger), managed enterprise (SunGard), down to one-off regional ISPs — so the
// copy says range and nothing more. No COUNT goes in it either: a hardcoded "9 countries" or
// "21 providers" is exactly the fabricated-once-true number rule 10 forbids, and both move.
// And paragraph 1 just says what was DONE — geolocated, provider identified — because the previous
// "sits at the real location it runs from, with the provider named beside it" described a rendering
// instead of stating a fact (user: "not very clear").
// ⚠️ ONE NAME FOR THE CORE: "the base ledger" (user, 2026-08-12). Hyper opened on "Constellation
// is a Hypergraph" and called the core "a shared core", while the ledger card called the same thing
// "the base ledger" — two names for one thing across two cards, and the brand word carrying the
// explanation in the one place a plain phrase would do the work. Same instinct as the "what is meta"
// correction below: describe the thing, don't name-drop it. The vocabulary rule in CLAUDE.md already
// prescribes "the base ledger" for the Snapshots stack; this makes hyper agree with it.
//
// ⚠️ …AND THE LEDGER CARD JOINS IT TO THE WORD THE SCENE WRITES (user, 2026-08-12 — "still refers to
// base ledger; in Constellation terminology they often refer to global snapshots, and that's actually
// written in the scene as well"). Exactly right, and only that one card has the collision: the ledger
// floor is labelled "Global snapshots" (LEDGER_LAYERS.gl0.name → LedgerView's SnapshotPlane label) and
// both rail slots say "Global snapshot", so the reader met Constellation's own term everywhere in the
// view and a second, unexplained phrase in the card meant to orient them. The gloss that once joined
// the two — gl0's `desc`, which opens "The base ledger." — has had NO renderer since the
// layer-navigation retirement (2026-08-06), so it reaches nobody.
// The fix is an EQUIVALENCE, not a replacement, because the two words are not synonyms and the card is
// the only place both are in scope: the base ledger is the thing, a global snapshot is what it takes.
// So "takes one global snapshot, anchoring what each network has produced" — Constellation's noun in
// the reader's sentence, `anchoring` being the vocabulary rule's own verb, and the plain phrase kept
// for the reader who has never met either. HYPER is deliberately left on the bare "one base ledger":
// nothing in that view is labelled, so there is no second term to reconcile, and the sentence there is
// defining the STRUCTURE, not naming the artifact.
//
// ⚠️ BUT THE GRAPH ITSELF MUST BE EXPLAINED (user, 2026-08-12 — "now you don't even mention
// hypergraph and go straight to metagraphs; nothing is explained about what these types of graphs
// actually are, why Constellation uses it"). Removing the word as a NAME FOR THE CORE took the whole
// concept with it, in the one view that is named after it: the card asserted "not one chain" and then
// never said what it is instead. The two corrections are compatible because they have different
// referents — "the base ledger" is the CORE, "a hypergraph" is the WHOLE STRUCTURE — so the word is
// earned here by being defined in the same breath (many independent ledgers interlinked through one
// base ledger), never used as a second name for the middle.
// The definition IS the explanation, and it opens the card (user, 2026-08-12 — *"start with 'Its
// shape is a hypergraph: many independent ledgers, interlinked through one base ledger.' I think you
// can skip the part before that"*). The chain-vs-graph preamble that used to lead ("a chain confirms
// in one line… a graph lets many things advance at once, which is how this network scales") was two
// sentences of GENERAL computer science spent before the card said anything about this network, and
// the reader who needs them is not the reader who opens a hypergraph view. The sentence that survived
// carries the same load in one line, because "many independent ledgers, interlinked" IS the
// parallelism the preamble was arguing for. Deliberately NOT spelled out as "directed acyclic graph":
// "DAG" already means the token and the core network everywhere in this UI (the filter chip,
// DAG_CFG), so expanding it here would collide with the reader's one meaning.
//
// ⚠️ NAME A THING BEFORE SPLITTING IT (user, 2026-08-12 — *"Define 'work'"*). The layers paragraph
// opened "Work splits across layers", using an abstract noun the card had never introduced and then
// immediately dividing it; the reader met the split before the thing. It now states what the work IS
// first — validating what comes in and sealing the result — which also gives the list its shape,
// since L0 is the layer that performs the seal just named. The definition is free against the length
// ceiling: cutting the preamble above bought ~25 words and this spends ~11 of them (~87 total).
//
// ⚠️ WHAT IS ANCHORED IS DATA, NOT JUST TRANSACTIONS (user, 2026-08-12) — and that is Constellation's
// actual differentiator, not a detail: a metagraph defines its own data types and validation rules,
// so the unit anchored into the base ledger is arbitrary application data (sensor readings, file
// fingerprints, balances), not only token transfers. "Seals a moment" said none of this and was vague
// on top. The business angle belongs in HYPER — the flexibility to serve any use case follows from
// that data proposition — and its payoff belongs in the LEDGER, which is where the different shapes
// are actually visible. So the ledger's busy/quiet observation is kept but COMPLETED: cadence is only
// one axis; size and structure are the others, and together they read out the business problem the
// network was built for.
// ⚠️ NOT "feeless". Constellation's own marketing says it, meaning $DAG transactions — but every
// metagraph snapshot demonstrably pays a fee (verified live; data metagraphs with no token pay too),
// and the user has already corrected this once. It must not come back in through online sources.
// ⚠️ LENGTH IS PART OF THE RULE (user, 2026-08-12 — "suddenly way too much text in hyper view").
// This card sits in a ~220px rail above the view's tool card; a fourth paragraph turns orientation
// into a wall nobody reads, and adding a fact is not a reason to grow one — something else gives way.
// Hyper is the ceiling at ~100 words in three paragraphs (it had drifted to 167 before this pass, and
// the first rewrite of it went UP to 174 while "adding the business angle"). The TITLE carries the
// opening move (user, 2026-08-12), so no card spends a clause restating its own headline.
// ⚠️ NO META-COMMENTARY — a card STATES the thing, it never narrates its own rhetoric (user,
// 2026-08-12, on hyper's "That is the scale argument": *"why are you referring to argument; makes no
// sense for an about section to say it in that way"*). The reader wants to know how the network works,
// not to be walked through the case being made for it, so a sentence about the explanation is a
// sentence not spent explaining — expensive against the length ceiling above. Swept from all six on
// the same pass: geo's "a choice it made, not a rule it followed" (rhetorical antithesis arguing a
// point instead of stating one) and the ledger's "say just as much about" (comparative flourish) went
// with it. The line the sweep deliberately SPARED was "the thing to watch" in status and staking:
// telling the reader what to look at is orientation, which is the card's actual job — the test is
// whether a sentence points at the VIEW or at the writing. (Both are gone now for a different
// reason, under the placeholder rule below: there is no view yet to point at.)
// ⚠️ PLAIN SENTENCES, NO DASH CLAUSE (user, 2026-08-12 — "remove the - text that ai often uses and
// more common human writing style"). Five of the six cards hung a second clause off an em dash, which
// is the tell people read as machine-written; it is also the lazy join, because the dash lets a
// sentence keep going instead of deciding what the next one is. Every one is now either two sentences
// ("A graph lets many things advance at once…") or a colon where a list genuinely follows ("where any
// trouble is: node uptime, …"). App-wide, not local to this file — the ghost hints (components/
// railCards.ts) and the explorer hints below carry the same rule. Comments like this one are
// dev-facing and keep theirs.
// ⚠️ AND THE SWEEP IS A CUT, NOT A SUBSTITUTION (user, 2026-08-12 — "no need to say 'if it has one'
// as you already said 'runs only the ones it needs'"). Rewriting a clause is the moment to notice it
// was redundant: hyper's "currency L1 moves a token — if it has one" restated the qualifier its own
// sentence opened with, and staking's "which nodes … the nodes it is staked to" named the same nodes
// twice. Both gone.
//
// ⚠️ A PRONOUN NEEDS A NOUN IT CAN POINT AT (user, 2026-08-12 — on geo's *"Nothing prescribes either
// one."*: "that is the start of the new section, what is it talking about?"). "Either one" reached
// back for two nouns the previous paragraph never actually put on the page: it said nodes are
// "geolocated to where it actually runs, and the provider hosting it is identified" — a claim about
// the DATA PIPELINE (we resolved these), not about the two facts themselves, and its active head
// glued to a passive tail is why it read badly. So the opening line names ITS OWN SUBJECT before
// anything reaches back for it, which makes the whole second paragraph resolvable. A paragraph that
// opens on a back-reference is only as clear as the sentence it points at — and the cheapest fix for
// one is to DELETE it: the bridging "Neither is prescribed." was cut outright on 2026-08-12 (user,
// "skip this line"). It only ever announced what the sentence behind it already demonstrates, since
// a range from the big clouds down to single regional ISPs IS the absence of a rule. Naming the
// absence first made the reader hold an abstraction until the evidence arrived.
// ⚠️ AND THE OPENER STATES THE LOOKUP, NOT A COUNT (user, 2026-08-12 — "it does not show two things,
// it geolocates the node and looks up additional information (two, three, does not matter)"). The
// enumerated "two things: where it runs, and which provider hosts it" fixed the referent but paid
// for it with a number the pipeline does not promise: ONE lookup runs per IP and the card renders
// whatever it returns — city, country, provider, ASN — so a card that counts to two is wrong the
// moment a field is added or missing. It names the act and lets the list trail open-ended, which is
// also the honest version: geolocation is a lookup, not a property a node carries.
//
// ⚠️ …AND "EACH NETWORK PLACES ITSELF" NEEDED THE FORCES (user, 2026-08-12 — "extend a little bit on
// that; so based on their geographic needs (data gravity?), costs (cheap vs preferred or even
// mandated providers), resilience / decentralization"). It was a closing assertion with nothing
// behind it: the reader is looking at a map of choices and the card named the choosing without ever
// saying what is being weighed. The three forces are real and they PULL AGAINST each other, which is
// why the map looks different per network — data gravity wants concentration, resilience wants
// spread, and cost/mandate can override both. It takes its own paragraph (geo's third, hyper's
// ceiling) rather than growing the second, because it answers a different question: paragraph two
// says what varies, this says why. ~80 words, still well under the ~100 ceiling.
// ⚠️ But NAME THE DECIDER, NOT THE PHYSICS (user, 2026-08-12 — "just say they decided themselves
// based on factors that matter to their business / use case"). "Places itself against several
// pressures" made the placement sound like a force balance the network is subject to; it is a
// DECISION somebody made for a reason. "Chooses its own placement, on whatever matters to the
// business it runs" says the same three factors are inputs to a choice, which is also what makes the
// map worth reading: every position on it is somebody's answer. Sibling of the no-meta-commentary
// rule above — both are about naming the subject plainly instead of dressing it.
//
// ⚠️ THE LEDGER CARD STATES THE TWO LEVELS, AND "LAYER" IS NOT THE WORD FOR THEM (user, 2026-08-12 —
// *"mention that there are two layers, they do their own thing in snapshotting"*). The chamber is
// built as two storeys and the card never said why: it opened on the global snapshot "anchoring what
// each network has produced", which makes a metagraph snapshot sound like an output the base ledger
// collects rather than a record the network took on its own clock. It now leads on the two levels,
// then says what the second one is FOR — a network anchors into the global what it wants kept on the
// shared record, in a schema it defines. That also earns the closing paragraph below, which is the
// consequence of every network choosing its own.
// The word is "levels", never "layers": app-wide a LAYER is an L0 / cL1 / dL1 process on a node (see
// CLAUDE.md's vocabulary rule), so calling the two storeys layers would collide with the three codes
// the composition chips, the signer copy and hyper's own About card all use.
// The bridging "So what lands here comes in very different sizes and shapes." was CUT to pay for it,
// under the delete-the-back-reference rule above: the sentence behind it carries the claim, so
// stating it first only made the reader hold an abstraction. ~95 words in three paragraphs, under
// hyper's ceiling. And it stays on "the base ledger" / "the shared record" — "hypergraph" is the
// WHOLE STRUCTURE and is only earned where it is defined in the same breath, which is hyper's card.
// ⚠️ AND THE CLOSING PARAGRAPH NAMES THE AXES, IT DOES NOT DESCRIBE THE PICTURE (user, 2026-08-12 —
// on *"quiet ones leave visible gaps"*: "this about what you seen; just mention instead that
// frequency can differ"). An About card orients the reader toward the view; narrating what the view
// looks like does the looking FOR them, and it also dates badly, since a gap is only visible at the
// window and scale the chamber happens to be showing. Three axes stated plainly — frequency, size,
// kind of information ("shape" was the first word; too abstract, user 2026-08-13) — and the reader
// finds them on screen. Sibling of the no-meta-commentary rule above.
// ⚠️ AND THE AXES ARE THE POINT, NOT A READOUT OF PURPOSE (user, 2026-08-12 — on *"Together they
// show what that network is built to do"*: "it does not really show that"). They do not: cadence,
// size and shape are three numbers, and no reading of them tells you a network validates sensor
// data rather than fingerprints. The sentence promised an inference the view cannot support, which
// is the same overreach the rule above catches one step earlier — there it narrated a picture, here
// it narrated a conclusion drawn FROM the picture. What the differences honestly say is that each
// network was built for itself: "what make each network unique" — the trailing "tailored to its own
// needs" was cut (user, 2026-08-13), since it restated "unique" and the sentence lands harder short.
//
// ⚠️ A PLACEHOLDER VIEW'S CARD SAYS "STAY TUNED." AND NOTHING ELSE (user, 2026-08-12 — "for the
// descriptive text just say 'stay tuned'"). status, transactions and staking each carried two
// paragraphs describing a view that does not exist: node states and version spread, tracing a
// transaction end to end, rewards flowing back. Every one of them was a promise, and an About card
// is supposed to ORIENT the reader in what is on screen — behind a `preview · in development`
// wireframe there is nothing to orient in, so the words were describing a design instead. It is the
// same honesty rule that keeps the Blueprint free of numbers: absent is an instrument state, not
// something to fill in. The TITLE still names the subject, so the slot reads as a plan rather than a
// blank, and the `SOON` caption already carries the status.
// ⚠️ AND A TITLE IS A STATEMENT, NEVER A QUESTION (user, 2026-08-12 — "no questionmark in the
// header"). status asked "Is the network healthy?" while its five siblings named their subject flat,
// so one card in six interviewed the reader. The set is now one wh-series — How / Where / When / How
// / What / Who — which is also what makes a title carry the opening move (the rule above): a
// question defers the subject to the answer, and the card's first paragraph then has to spend a
// clause supplying it.
// ⚠️ AND THE TWO REMAINING TITLES NAME THE THING, NOT THE ABSTRACTION (user, 2026-08-12 — *"'How
// value moves' is a bit unclear"*). It was a paraphrase of a concrete noun the view will be full of:
// transactions. "What transactions happen" costs three words and needs no unpacking. staking takes
// the same treatment through its own concrete verb — DELEGATION is the act $DAG holders perform and
// the word the protocol uses, so "Who delegates to nodes" says what "Who backs the nodes" was
// gesturing at, and names both sides of the relation the view will draw.
// ⚠️ AND A TITLE IS ONE LINE — 202px, MEASURED (user, 2026-08-12 — "the todo views text is a bit too
// long sometimes"). The three built views' titles run 173–192px in the desktop rail's 202px title
// lane, so all three set on one line; the first drafts here were "What transactions are happening"
// (236px) and "Who delegates to which nodes" (217px), which wrapped to two and made the placeholder
// cards look like a different species in the same rail. Both were cut back INTO that band (187px,
// 172px) rather than to a word count, because the lane is what decides. "How healthy the network is"
// (196px) is the widest of the six and stays: it already sets on one line, and the precision is
// worth the 6px. Anything new here gets measured against the same lane, not eyeballed.
export const ABOUT: Record<Mode, { title: string; eyebrow: string; lines: string[]; caption?: string }> = {
  hyper: {
    title: "How the network is built",
    eyebrow: "About",
    lines: [
      "Its shape is a hypergraph: many independent ledgers, interlinked through one base ledger.",
      "Each of those ledgers is a metagraph, meta because the base keeps a record about its data, never the data itself. Each validates whatever its business runs on.",
      "The work is validating what comes in and sealing the result. It splits across layers, and a network runs only the ones it needs: L0 seals its own state, data L1 takes in what applications write, currency L1 moves a token. One node can run several.",
    ],
  },
  geo: {
    title: "Where the network runs",
    eyebrow: "About",
    lines: [
      "Every node here is geolocated from its IP address, and whatever else that lookup knows comes with it: the city, the country, the provider hosting it.",
      "Hosts run from the big clouds down to single regional ISPs, and a network's nodes may sit in one country or spread across many.",
      "Each network chooses its own placement, on whatever matters to the business it runs: it may want to sit close to the data it serves, some providers are cheaper and some are required, and some networks want to be spread across the globe.",
    ],
  },
  ledger: {
    title: "When the network anchors",
    eyebrow: "About",
    lines: [
      "Snapshots happen at two levels. Each network snapshots on its own, at its own pace and to its own schema, holding whatever it validates: sensor readings, file fingerprints, a token's balances.",
      "Every few seconds the base ledger takes one global snapshot, and a network anchors into it what it wants kept on the shared record. Each arrives already sealed, and stays provable without anyone having to trust who wrote it.",
      "How often a network anchors differs, and so do the size and the kind of information it anchors. Those differences are what make each network unique.",
    ],
  },
  soon: {
    title: "What is coming next",
    eyebrow: "About",
    caption: "SOON",
    lines: [
      "Three more views are on the way: network health, transactions between addresses, and delegated staking.",
    ],
  },
};
