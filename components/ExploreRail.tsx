"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useStore, type Mode } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";
import GeoExplore from "@/components/GeoExplore";
import HyperExplore from "@/components/HyperExplore";
import LedgerPanel from "@/components/LedgerPanel";
import AboutView from "@/components/AboutView";
import RailThread from "@/components/RailThread";
import { RailShade } from "@/components/RailShade";
import RailDock, { type TabSignal } from "@/components/RailDock";
import { exploreCards } from "@/components/railCards";
import { useBreakpoint } from "@/components/useBreakpoint";

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
// The WHY is chain-vs-graph and it is the honest scale argument the "not feeless" note demands:
// a chain confirms in a single line, a graph lets many things advance at once. The app's own data
// proves it — a snapshot can carry blocks WITHOUT raising `height`, because the block DAG has
// parallel siblings (see CLAUDE.md's snapshot-stream section). Deliberately NOT spelled out as
// "directed acyclic graph": "DAG" already means the token and the core network everywhere in this
// UI (the filter chip, DAG_CFG), so expanding it here would collide with the reader's one meaning.
// Length: 108 words against the ~100 ceiling below, and it buys the whole explanation because the
// new first paragraph REPLACES the old one's structure sentence rather than adding to it.
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
const ABOUT: Record<Mode, { title: string; eyebrow: string; lines: string[]; caption?: string }> = {
  hyper: {
    title: "How the network is built",
    eyebrow: "About",
    lines: [
      "A chain confirms in one line, everything waiting its turn. A graph doesn't — many things advance at once. That is the scale argument, and the shape it takes is a hypergraph: many independent ledgers, interlinked through one base ledger.",
      "Each of those independent ledgers is a metagraph — meta because the base keeps a record about its data, never the data itself. So each validates whatever its business runs on.",
      "Work splits across layers, and a network runs only the ones it needs: L0 seals its own state, data L1 takes in what applications write, currency L1 moves a token — if it has one. One node can run several.",
    ],
  },
  geo: {
    title: "Where the network runs",
    eyebrow: "About",
    lines: [
      "Every node here is geolocated to where it actually runs, and the provider hosting it identified.",
      "Nothing prescribes either one. The hosts range from the big clouds down to single regional ISPs, and the countries from one nation to a scattering — so where a network sits is a choice it made, not a rule it followed.",
    ],
  },
  ledger: {
    title: "When the network anchors",
    eyebrow: "About",
    lines: [
      "Every few seconds the base ledger takes one global snapshot, anchoring what each network has produced — not just transactions, but whatever that network validates: sensor readings, file fingerprints, a token's balances. Each arrives already sealed, and leaves provable without anyone having to trust who wrote it.",
      "Which is why what lands here comes in such different sizes and shapes. Busy networks anchor many times a minute and quiet ones leave visible gaps, but the size of each anchor, and the shape of the data inside it, say just as much about the problem that network solves.",
    ],
  },
  status: {
    title: "Is the network healthy?",
    eyebrow: "About",
    caption: "SOON",
    lines: [
      "Whether the network is healthy right now, and where any trouble is — node uptime, what state each node is in, and how far the software versions have drifted apart.",
      "Version spread is the quiet one to watch: a network running several releases at once is mid-upgrade, or stuck.",
    ],
  },
  transactions: {
    title: "How value moves",
    eyebrow: "About",
    caption: "SOON",
    lines: [
      "Value moving across the network as it happens — $DAG and the metagraphs' own currencies, between addresses.",
      "Trace a single transaction end to end, or read the totals: how much moved, and how many addresses were active doing it.",
    ],
  },
  staking: {
    title: "Who backs the nodes",
    eyebrow: "About",
    caption: "SOON",
    lines: [
      "Who is backing which nodes — delegated $DAG, the nodes it is staked to, and the rewards flowing back.",
      "Stake is consensus weight, so how it concentrates is the thing to watch, and whether that is shifting.",
    ],
  },
};

// Left control rail: the **explore/interact** zone. The global network filter lives in the
// top command bar; the selected-subject dossier now lives in the right rail (`ContextCard`).
// Every view now leads with a collapsed `AboutView` orientation card, above its ONE tool card
// (if any): Hypergraph → HyperExplore (network → layer shell → node); Geography → GeoExplore
// (footprint + node browser); Snapshots → LedgerPanel; the scaffolded views have no tool
// card, just the About card.
export default function ExploreRail() {
  const bp = useBreakpoint();
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const phoneDock = useStore((s) => s.phoneDock);
  const setPhoneDock = useStore((s) => s.setPhoneDock);
  const phoneSheetPx = useStore((s) => s.phoneSheetPx);
  const setPhoneSheetPx = useStore((s) => s.setPhoneSheetPx);
  // Theme every card's bullet to the current selection (the explore card is always
  // specific to the active filter).
  const accent = { ["--filter-accent"]: filterAccent(filter) } as CSSProperties;

  // ONE source of truth for the hosted card set (railCards.ts): both the rail content AND the dock
  // tray are derived from the same manifest, so they can't disagree about which cards this view
  // hosts. `id` maps to the component to render; the manifest owns presence/order.
  const manifest = exploreCards({ mode });
  const renderCard: Record<string, ReactNode> = {
    about: <AboutView {...ABOUT[mode]} />,
    tool: mode === "hyper" ? <HyperExplore /> : mode === "geo" ? <GeoExplore /> : mode === "ledger" ? <LedgerPanel /> : null,
  };
  const content = (
    <>
      {manifest
        .filter((c) => c.present)
        .map((c) => (
          <Fragment key={c.id}>{renderCard[c.id]}</Fragment>
        ))}
    </>
  );
  // The dock's icon TRAY (tablet edge tab + phone dock half): the legend of what this sheet hosts,
  // straight from the manifest. The left cards are static tools (constant subjectKeys, no live
  // updates), so no `active` highlights / `updateKey` here — the tray stays a quiet legend.
  const tray: TabSignal[] = manifest
    .filter((c) => c.present)
    .map((c) => ({ id: c.id, icon: c.icon }));
  if (bp === "desktop") {
    // The thread is a SIBLING of #leftcol (mirrors the right rail): the rail clips horizontally + can
    // gain an overflow-fade mask, either of which would blank a child thread. It points its ruler
    // ticks OUTWARD into the left margin, toward the screen edge.
    return (
      <>
        <RailThread side="left" />
        {/* `max-[1099px]:!hidden` + arbitrary width tweaks re-home 16/11-responsive.css (Task 9):
            the safety-net hide below the desktop breakpoint (SSR/first-paint assume desktop, so the
            desktop rail can flash on a narrow viewport before useBreakpoint resolves) and the small-
            laptop / tablet rail-width narrowing. `!` beats the `#leftcol` id rule in globals.css. */}
        <div
          id="leftcol"
          className="max-[1100px]:!w-[224px] max-[860px]:!w-[210px] max-[860px]:!max-h-[calc(100vh-320px)] max-[1099px]:!hidden"
          style={accent}
        >
          <RailShade>{content}</RailShade>
        </div>
      </>
    );
  }
  if (bp === "tablet") {
    // Tablet: same content, hosted in the left edge-tab Sheet overlay so the 3D scene keeps
    // full width. The inline #leftcol/.rail-thread path is hidden below 1100px (globals.css).
    return (
      // `signalKey` = the same subject RailThread pulses on (desktop-only) — RailDock replays the
      // view/filter-switch pulse on the sheet edge / tab edge so tablet keeps the signal.
      <RailDock side="left" label="Explore" style={accent} signals={tray} signalKey={`${mode}|${filter}`}>
        {content}
      </RailDock>
    );
  }
  // Phone: the LEFT half of the persistent bottom bar (below the LiveStrip, at the very bottom of
  // the viewport — see 16-responsive-shell.css), instead of the edge tab — a side tab + bottom
  // sheet reads spatially confusing on a narrow phone. `phoneDock` (the store) is the single
  // source of truth for which of the two phone docks (this one, or Inspector's "Details") is
  // open — they can't both be open at once, there's no room to stack two bottom sheets. Tapping
  // this half sets `phoneDock`, which simultaneously closes the Details dock (its own `open`
  // reads the same field); tapping it again while open collapses it (RailDock's own toggle).
  // No `signalKey` here — the view/filter-switch pulse for the phone dock is a single full-width
  // overlay spanning both halves (`PhoneDockSweep`, mounted once in page.tsx), not a per-half prop.
  return (
    <RailDock
      side="left"
      label="Explore"
      style={accent}
      trigger="bottom-bar-half"
      sheetSide="bottom"
      signals={tray}
      open={phoneDock === "explore"}
      sheetPx={phoneSheetPx}
      onSheetPx={setPhoneSheetPx}
      onOpenChange={(next) => setPhoneDock(next ? "explore" : null)}
    >
      {content}
    </RailDock>
  );
}
