"use client";
// The METAGRAPH SNAPSHOT card (spec §7) — the tile on the ledger's upper floor as a subject.
// Three TIERS of fact, each honest about where it came from: tier 1 is free from the 4-second
// poll (it named the tile in the first place), tier 2 arrives with the tick's exact read, tier 3
// is the application state — disclosed as a SHAPE here and as a payload in the raw layer.
// Like the global snapshot card this is a card SLOT, not a focus-ladder rung: it has its own
// store channel (`store.metaSnap`) and a fixed rail slot, and appears in no ladder.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import CardHead, { RailPane } from "@/components/CardHead";
import { subjectPairing } from "@/components/useSubjectPairing";
import { Fact, FactGroup, Foot, FootRow, LayerWho } from "@/components/inspector/parts";
import { useSnapRecord } from "@/components/useArchive";
import { Separator } from "@/components/ui/separator";
import { useStore } from "@/src/store/store";
import { metaSnapDeepKey, metaSnapHoverKey } from "@/src/data/types";
import type { ChannelSnapDeep, ChannelSnapRow } from "@/src/data/types";
import { getNetwork, SIGNER_GROUPS, metagraphById } from "@/src/data/network";
import { UNLISTED_HUE } from "@/src/data/unlisted";
import { snapsAtTick } from "@/src/data/anchorLog";
import { PAYLOAD_LANES } from "@/src/data/payloadKinds";
import { fmtDag, fmtKB, midHash } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { useMinHold } from "@/components/useMinHold";
import { useNowTick } from "@/components/useNowTick";
import { identityHudHex } from "@/src/palette/identity";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { METASNAP_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { followToggleActions, metaSnapSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { cn } from "@/lib/utils";

// The body's row grammar and its three weights live in ./parts (`Fact` / `FactGroup` / `Foot`)
// — shared with every other rail card, so this one can't drift into a dialect of its own. The
// LEAD is composed here rather than imported: it merges facts and drops labels their units
// already carry, which is card-specific by nature.

export default function MetaSnapPane({
  onClose,
  collapsed,
  onToggle,
}: {
  onClose: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const sel = useStore((s) => s.metaSnap);
  const exact = useStore((s) => (sel ? s.snapshotExact[sel.globalOrdinal] : undefined));
  // The tick's exact read FAILED (RawSnapshotBridge records the miss) — the give-up signal the
  // "reading…" state below terminates on. Without it that state could never end: `useMinHold`
  // only falls when its `active` goes false, and with no failure signal `active` stayed true for
  // as long as the row was absent, so the old "tick pruned" fallback was unreachable and a failed
  // read said "reading…" forever with nothing in flight (rule 10).
  const missedExact = useStore((s) => (sel ? s.exactMiss[sel.globalOrdinal] != null : false));
  const deepKey = sel ? metaSnapDeepKey(sel.globalOrdinal, sel.metaId, sel.ordinal) : null;
  const deep = useStore((s) => (deepKey ? s.metaSnapDeep[deepKey] : undefined));
  const following = useStore((s) => s.following);
  const filter = useStore((s) => s.filter);
  // Rule 9's missing consumer (user, 2026-08-15 — "a gray edge effect even though it's filtered
  // on DOR; happens when I swipe"): this card never paired, so its edge could only ever show
  // the grey whisper — hovering now rides `hoverMetaSnap`, the SAME channel the anchor-log row,
  // the explorer leaf and the scene's tile use (a row is a snapshot, not its tick), which
  // supplies `.subject-paired` + the hued `--row-hue` the edge recipes read, and glows the tile
  // bidirectionally. The pairing's onMouseMove healer covers the swipe's swap-under-pointer.
  const hoverMetaSnap = useStore((s) => s.hoverMetaSnap);
  const setHoverMetaSnap = useStore((s) => s.setHoverMetaSnap);
  const snap = useStore((s) => s.snap);
  const setSection = useStore((s) => s.setSection);
  const setDeepWanted = useStore((s) => s.setDeepWanted);
  const deepWanted = useStore((s) => s.deepWanted);
  // Has a deep read been ASKED FOR for this exact snapshot? Selecting one is not asking — the card
  // states the SHAPE and only reads on its button, so a pager skim costs nothing (user, 2026-08-10;
  // the reasoning lives on `deepWanted` in the store and on the bridge's own gate). Everything in
  // the block below that used to branch on `following` branches on this instead: `following` was
  // only ever a proxy for "no read is coming", and it stopped being an accurate one.
  const deepAsked = !following && deepKey != null && deepKey === deepWanted;



  // Tier 1 — the polled record this tile was named from (free: the metagraph snapshot buffers
  // are already in memory, keyed by the anchoring tick's timestamp).
  const polled = useMemo(() => {
    if (!sel) return null;
    const net = getNetwork();
    if (!net) return null;
    return snapsAtTick(net.metaSnaps, sel.metaId, sel.ts).find((r) => r.ordinal === sel.ordinal) ?? null;
  }, [sel]);

  // Tier 2 — this snapshot's own row inside the tick's exact read.
  const row = useMemo(() => {
    if (!sel || !exact) return null;
    // A row the quick decoder couldn't read carries ordinal 0 — fall back to the address match
    // so the card still finds it (2026-08-07: the miss hid the whole exact tier and the state
    // invitation for snapshots whose deep decode worked fine).
    return (
      exact.rows.find((r) => r.metaId === sel.metaId && r.ordinal === sel.ordinal) ??
      exact.rows.find((r) => r.metaId === sel.metaId && r.ordinal === 0) ??
      null
    );
  }, [sel, exact]);
  const reading = useMinHold(!!sel && !row && !exact && !missedExact);
  // The pinned decode's give-up timer (2026-08-08, review fix): a failed deep read left
  // "decoding…" forever — after a patient window the instrument states the honest terminal. It
  // runs off `deepAsked`, not `following`: a snapshot nobody asked to read has no read to give up
  // on, and starting the clock anyway would ripen `unread` into a false "unavailable".
  const [decodeGaveUp, setDecodeGaveUp] = useState(false);
  useEffect(() => {
    setDecodeGaveUp(false);
    if (!sel || !deepAsked || deep) return;
    const t = setTimeout(() => setDecodeGaveUp(true), 12000);
    return () => clearTimeout(t);
  }, [sel, deepAsked, deep]);

  const pulseKey = useEdgePulse(sel ? `${sel.metaId}:${sel.ordinal}` : null);
  // The metagraph snapshot is exactly as LIVE as the global while following (advanceMetaSnap rides
  // the same heartbeat), so its aside is the same tap-to-follow toggle as SnapshotAside — but it
  // does NOT repeat the clock. The anchor join is exact (a metagraph snapshot is stamped with the
  // timestamp of the global it anchored into), so whenever the card above shows that same tick the
  // two counters were literally the same number twice (user, 2026-08-09: "both say live · x
  // seconds ago; looks redundant"). The GLOBAL card owns the clock; this one states the relation
  // instead — `anchored`, the house word for what the Snapshots stack does. The counter comes back
  // the moment it carries real information: while following a metagraph lane through anchor-less
  // global ticks this card holds an OLDER tick, and then its age is not a repeat. The anchoring
  // ordinal rides ALL THREE states, because the two counter states are precisely the ones where the
  // card above shows a different tick (or is a ghost) — there the number is the only thing saying
  // which global this snapshot actually landed in.
  const now = useNowTick(1000);

  if (!sel) return null;
  const cfg = metagraphById(sel.metaId);
  // An UNLISTED metagraph has no config row, so its hue is the unlisted set's NEUTRAL gray
  // (2026-08-08: hashing the address through the identity palette minted a random hue per channel —
  // pink icons for a set that deliberately has no identity of its own).
  const hue = cfg ? identityHudHex(sel.metaId) : UNLISTED_HUE;
  const pair = subjectPairing<string>(hoverMetaSnap, metaSnapHoverKey(sel.metaId, sel.ordinal), setHoverMetaSnap, hue);
  // Hoisted out of the state tier so the FOOT can reach it — it is a hash, and hashes are looked
  // up, not read. The deep read wins where it exists; the exact row carries it otherwise.
  const stateProof = deep?.stateProof ?? row?.stateProof;
  const polledHash = sel.hash || polled?.hash || "";
  // The polled buffers track only the catalog, so an UNLISTED snapshot arrived hash-less — a
  // hash is not a field of the thing it hashes; the indexer computes it. The explorer indexes
  // every anchoring chain, so one immutable ~330 B record read fills hash AND parent exactly
  // where the polls can't (user, 2026-08-14). Skipped whenever the polls already answered.
  const record = useSnapRecord(sel.metaId, sel.ordinal, !!polledHash);
  const hash = polledHash || record?.hash || "";
  const parent = polled?.parent || record?.parent || "";
  const rel = relativeAge(now - Date.parse(sel.ts));
  // ⚠️ The `!!snap` half is load-bearing: the ledger contributes no ancestry, so the global card
  // can be a GHOST while this one is populated — there the clock has to stay here.
  const sameTick = !!snap && snap.data.ordinal === sel.globalOrdinal;
  // The tick this snapshot anchored INTO. It used to open the body as a row of its own, paired with
  // the metagraph's ticker; both are gone (user, 2026-08-10). The ticker was the pile rule broken at
  // the head — the METAGRAPH card sits directly above and states it as its own title — and the
  // ordinal is not a fact ABOUT the snapshot so much as the relation the aside is already naming,
  // so it belongs to the relation word rather than to a body row under it.
  // No `#`: an ordinal is a VALUE and every surface that renders it as one — this card's own title,
  // the explorer rows, the anchor-log cells — writes it bare. The sigil only ever survived where a
  // number got glued into a sentence (user, 2026-08-10).
  const anchor = sel.globalOrdinal.toLocaleString();
  const asideCls = "inline-flex items-center gap-1.5 text-label text-muted-foreground whitespace-nowrap";
  const aside = (
    <button
      type="button"
      aria-pressed={following}
      title={following ? "Stop following the live snapshot" : "Follow the live snapshot"}
      className={cn(asideCls, "rounded-xs hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60")}
      onClick={() => snap && applyClickActions(followToggleActions(snap, following))}
    >
      {/* The beating dot rides `following` on its own, so the card still FEELS live in the
          `anchored` state — the heartbeat-on-closed-cards rule doesn't depend on the number. */}
      {following && (
        <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-dot-beat motion-reduce:animate-none" />
      )}
      {sameTick ? `anchored to ${anchor}` : following ? <>{rel ? `live · ${rel}` : "live"} → {anchor}</> : <>◷ {rel} → {anchor}</>}
    </button>
  );

  return (
    <RailPane
      entry={collapsed}
      className={pair.className}
      style={pair.style}
      onMouseEnter={pair.onMouseEnter}
      onMouseMove={pair.onMouseMove}
      onMouseLeave={pair.onMouseLeave}
      onFocus={pair.onFocus}
      onBlur={pair.onBlur}
    >
      <CardHead
          eyebrow="Metagraph snapshot"
          title={
            <span className="inline-flex items-center gap-2 min-w-0">
              {/* A subject-specific mark carries its OWN subject's hue (the node-mark idiom) —
                  this card is about one metagraph even when the filter is "all". */}
              <METASNAP_ICON aria-hidden className={KIND_MARK_CLASS} style={{ color: hue } as CSSProperties} />
              <span className="truncate">{sel.ordinal.toLocaleString()}</span>
            </span>
          }
          titleKey={`${sel.metaId}:${sel.ordinal}`}
          aside={aside}
          onClose={onClose}
          collapsed={collapsed}
          onToggle={onToggle}
        />
        {!collapsed && (
          <div>
            {/* ── THE CENTRE: what this metagraph actually anchored ────────────────────────
                Two labelled sections, State and Data — the same two payload lanes the raw layer
                opens one tier down, so the card states their SHAPE and the pane renders them.
                Both always render, each honest about its own tier. */}
            <PayloadBlock row={row} deep={deep ?? null} asked={deepAsked} decodeGaveUp={decodeGaveUp} />

            {/* ── DETAIL: the measured facts ─────────────────────────────────────────────── */}
            <Separator className="my-2" />
            <FactGroup>
              {row ? (
                <>
                  {/* Fee leads, size rides under it — the global card's own two-line value, so
                      the pair reads identically on both storeys of the chain. */}
                  <Fact label="Fees paid">
                    <span className="flex flex-col items-end">
                      <span className="whitespace-nowrap"><b className="font-bold">{fmtDag(row.fee)}</b> DAG</span>
                      {/* "· compressed" names the BASIS (user, 2026-08-13 — "the state size plus
                          data size does not match… I think user will expect these to add up"):
                          this number is the snapshot's brotli-compressed wire footprint as
                          carried in the global, while the two section sizes above are DECODED
                          content — the three can never sum, and without the word the mismatch
                          reads as a bug. Verified in the decoder: `bytes` is the content
                          byte-array length pre-inflate; stateBytes/dataBytes are post-inflate. */}
                      {/* "N KB compressed" (user, 2026-08-14): the head's aside already says "anchored
                          to N", so the word was doing the same work twice — the subline states the
                          wire weight alone, basis included. */}
                      <span className="text-label text-muted-foreground">{fmtKB(row.bytes / 1024)} compressed</span>
                    </span>
                  </Fact>
                  {/* The L0 seal is a BODY fact again (user's post-read rework, 2026-08-13): it
                      vouches for the WHOLE snapshot, so it must survive a snapshot with no State
                      section at all — NDT's envelope-only heartbeat is sealed like any other.
                      Free tier (the exact row carries the proofs), so it never waits on the
                      deep read; the dL1 signers stay inside the Data section they produce. */}
                  <Fact label="Signed by" title={SIGNER_GROUPS.proof.title}>
                    <span className="inline-flex items-center gap-1">
                      {(deep?.signers ?? row.signers)?.length ?? 0} <LayerWho who={SIGNER_GROUPS.proof.who} />
                    </span>
                  </Fact>
                </>
              ) : !row && exact ? (
                // The tick's exact read landed and is immutable, and this snapshot's row is not
                // in it (aged past the buffer's join, or never anchored here) — a terminal fact,
                // stated as one. "reading…" here would claim a read that already finished.
                <Fact label="Exact read">not in this tick’s read</Fact>
              ) : missedExact && !reading.show ? (
                // The read failed (transient blip, or outside the served window) — the honest
                // terminal. Reselecting or the next live tick retries; the miss clears on landing.
                <Fact label="Exact read">unavailable — read failed</Fact>
              ) : (
                <Fact label="Exact read">
                  <span className={cn(reading.fading && "animate-hold-fade-out motion-reduce:animate-none")}>reading…</span>
                </Fact>
              )}
            </FactGroup>

            {/* ── THE ONE CONTROL, TWO TIERS ───────────────────────────────────────────────
                One button position, two states, because there are two different costs and the
                card should only charge the second one when the first has been paid.

                TIER 1 — `Read this snapshot`. The deep read (~2.5 MB, one channel entry out of a
                whole global) fills BOTH payload sections' shape rows in place, so the card can
                state the SHAPE without a depth change — which is what this card's whole contract
                claims it does. It was previously reachable ONLY as the words `pin to read` in the
                Data value slot, an instruction whose control lived elsewhere (the head aside,
                labelled with a time) and whose verb appeared on nothing clickable.

                It pins WHEN FOLLOWING, because a following card advances every ~4s and a read that
                left it following would answer about a snapshot already gone. Pinned already, it
                pins nothing — it only records the request. The pin does not need naming here; it
                announces itself one line up, where the aside flips from `live · Xs → N` to
                `◷ Xs ago → N` and the dot stops beating.

                ⚠️ It pins through `metaSnapSelectActions`, NOT the aside's `followToggleActions`.
                The aside's builder acts on the GLOBAL descriptor, so it commits the tick as the
                subject — correct for a control labelled with the tick's own age, but here it moved
                the box to the Global snapshot card and COLLAPSED the card you were reading, on a
                button that says `this snapshot`. The row builder commits the tick with
                `follow: false` AND re-commits this metagraph snapshot, so the subject never moves.
                It is the same builder the anchor-log row and the ledger explorer use, which is the
                point: a read and the equivalent row click cannot drift. ⚠️ Its deselect
                early-return needs `!current.following`, which is exactly why the call is inside
                the `if (following)` — re-committing an already-pinned snapshot would CLEAR it.

                ⚠️ The button renders on `!deepAsked`, NOT on `following` (user, 2026-08-10 — "when
                I read the 1st metagraph snapshot and I use the swipe to go to 2nd, 3rd etc it
                starts doing it automatically"). Gating on `following` left every OTHER pinned
                selection reading by itself, so the pager — a BROWSE control, whose whole point is
                skimming a set — fetched per step: measured live, one tick anchors 20 DOR
                snapshots at ~1.8s and ~2.5 MB of server↔L0 traffic each. So the read follows the
                REQUEST, and this button is the only place the card makes one.

                TIER 2 — `Show the raw data`. The raw layer, for the payload itself — named for
                the MODE it opens (RAW is the presentation toggle's own word), because the pane
                shows state AND data AND signers, so naming one lane undersold the destination
                (user, 2026-08-13; was "Show the application state"). It
                gates on `deep`, not on `decoded`: it used to render over an unread snapshot and
                land on a pane whose own copy said to pin — with the pin control back in the HUD
                the raw layer has just marked `inert`. A button that leaves the view and then tells
                you to come back is worse than no button. (The raw layer reads on ARRIVAL, because
                unlike this card it is the payload surface and nothing else is down there.)

                The cost rides the BUTTON's title, not the Data row's: `PAYLOAD_LANES` is one home
                shared with the raw layer's tabs, and "only when you ask" is stale the moment the
                read has landed. The cost belongs to the action — and it is stated as the SERVER's
                fetch, because the decoded row that reaches the browser is ~0.6–4.4 KB (measured):
                what is being rationed is the whole-global pull and the ~1.8s wait, not local
                bytes.

                ONE VERB FAMILY: compressed → Decompress → decompressing (user, 2026-08-13).
                "uncompress" was REJECTED on 2026-08-10 for putting the cost on local bytes —
                but that was before the lead printed "anchored · compressed" directly above this
                button. With the basis named, the verb closes the loop the old copy left open
                (WHY a read is needed at all), and the cost still rides this button's title.
                "Read"/"decoding" made three word families for one action. */}
            {deep != null ? (
              <Button variant="link" size="xs" className="mt-1 px-0" onClick={() => setSection("data")}>
                Show the raw data
              </Button>
            ) : !deepAsked && row?.decoded === true && snap && sel ? (
              <Button
                variant="link"
                size="xs"
                className="mt-1 px-0"
                title="Decompresses this snapshot's payload — the server pulls the whole ~2.5 MB global to reach this one channel, so it runs only when you ask. Holds the card on this snapshot instead of following the live one."
                onClick={() => {
                  // Pin FIRST, and only while following — the read must not answer about a
                  // snapshot the next heartbeat has already replaced. Pinned already, the pin is
                  // not just unnecessary but wrong: `metaSnapSelectActions`' deselect early-return
                  // needs `!current.following`, so re-committing the selected snapshot would CLEAR
                  // it, on a button that says `read this`.
                  if (following) applyClickActions(metaSnapSelectActions(sel, snap, { filter, metaSnap: sel, following }));
                  setDeepWanted(metaSnapDeepKey(sel.globalOrdinal, sel.metaId, sel.ordinal));
                }}
              >
                Decompress this snapshot
              </Button>
            ) : null}

            {/* ── FOOT: the artifact's CHAIN IDENTITY ─────────────────────────────────────
                What it is, what it links to, what it proves — and nothing else. The three
                hashes used to cost 114px as stacked label-above blocks; same values, same
                full-hash-on-hover, one small muted column (user, 2026-08-10).
                HEIGHT and BLOCKS were culled the same day: the global snapshot card's foot
                carries hash + parent only, and the two cards are the SAME Signed[] artifact, so
                the asymmetry was an accident of history rather than a difference in the data
                (GlobalSnapshot carries height/blocks too). Reconciled DOWN, not up — CLAUDE.md
                already rules that a tick's block count is the wrong activity signal, and the
                facts that answer a question about this snapshot are all above. `State hash` is
                the one asymmetry that STAYS: only a metagraph snapshot proves an application
                state, so it's a real difference in the artifact, not an inconsistency. */}
            <Foot>
              {/* The descriptor's hash is not the only source, and for a PAGER step it isn't a
                  source at all: `railSiblings` builds its siblings from the tick's exact read,
                  which carries no hash field (`hash: ""`), so stepping to a sibling left HASH as
                  an em-dash — while PARENT, one row below, populated fine from the polled record.
                  Both come off the same record; this row was simply not reading it. So it tiers
                  like `stateProof` does: descriptor first, polled buffer behind it. The em-dash
                  survives for the one case that is genuinely unknown — a snapshot stepped to
                  after it aged out of the retained buffer — where stating the gap is the point. */}
              {hash && <FootRow label="Hash" value={midHash(hash, 34)} title={hash} copy={hash} />}
              {parent && (
                <FootRow label="Parent hash" value={midHash(parent, 27)} title={parent} copy={parent} />
              )}
              {stateProof && (
                // "State HASH" (user, 2026-08-14 — "state proof" collided with the signers tab's
                // "snapshot proof", a signature set; this is a DIGEST, kin to Hash/Parent above).
                <FootRow label="State hash" value={midHash(stateProof, 29)} title={"The hash of the application state this snapshot results in, covered by the snapshot's own L0 seal — the state's provability. Distinct from the SIGNERS tab's 'snapshot proof', which is the L0 signature set; this is a digest, and the signatures sign over it." + stateProof} copy={stateProof} />
              )}
            </Foot>
          </div>
        )}
        <PulseEdge pulseKey={pulseKey} rail="right" />
    </RailPane>
  );
}

// ── The payload block: this card's centre of gravity ─────────────────────────────────────────
// TWO SECTIONS, State and Data, both always present (user, 2026-08-10: "I feel two sections
// (state & data) with a separator is the clearest way to present it, no?" and "can we make it
// always show both and be honest if data / state is not applicable or just not present in that
// particular snapshot"). They are genuinely different reads that were merged into one composed
// line: STATE is the metagraph's accumulated on-chain state, DATA is what THIS snapshot's blocks
// carried. Merged, DOR read `1.8 KB of state · 4 data updates` above a bar labelled `updates 4` —
// a state key that happens to be NAMED `updates` sitting beside an unrelated count of the same
// number. The section labels are what disambiguate them, and they are the raw layer's own lane
// words (PAYLOAD_LANES), so the card and the pane can't name one subject two ways.
//
// THE SHARE-OF-TOTAL BAR IS GONE and can't come back (user: "if it is filled, how do we measure
// the length of the bar — I think a bar might not be the right element here"). Correct, and
// structurally so: `shapeOf` sets each state key's count in whatever unit that branch happens to
// be — array → length, object → field count, scalar → 1 — so summing them and taking a share is a
// percentage of a quantity nobody can name (rule 10). It degenerated in both live cases anyway:
// one key is always 100% (DOR), all-zero keys always 0% (SWAP, which declares three record kinds
// and carried none of them), so the length encoded nothing either way. The global card's
// `AnchoredTags` bars STAY, because every one of their rows is the same unit — snapshots
// anchored — against a real total; the instrument was honest there and borrowed to here. Dropping
// the track also returns the full width to the key NAMES, which is what actually needed it
// (`processedRewardWithdrawal` had 68px), and retires the header's "no application state", which
// contradicted the very keys listed under it.
//
// ONE RULE for whether the tier shows at all (user, 2026-08-07: DED's empty state hid the
// invitation while the raw layer rendered the decoded shape — the two surfaces apply one
// standard): if the payload DECODED, the block shows; an empty payload says so honestly instead
// of hiding. Both routes share one decoder, so decoded-ness can't disagree between them.
//
// THE SECTIONS ARE HEADERS — ALWAYS BOTH, NEVER A VALUE COLUMN (user, 2026-08-13, twice in one
// day): the morning's "size on both" headline retired the same evening, and the first cut of the
// retirement over-rotated into hiding the sections pre-read, which the user pulled straight back
// ("I did not ask for that; only to treat them as headers and skip the right column"). So the
// two headers render in every state — 2026-08-10's always-both decision stands — bare before the
// deep read, their rows appearing underneath once it lands, a quiet `none` where the read found
// nothing. Two live findings killed the size headlines:
//   · THE SIZES CAN NEVER SUM and readers expect them to: the anchored KB is the compressed
//     wire footprint, the section sizes were decoded fragments, and "· compressed" only
//     explained the mismatch without removing it.
//   · A SNAPSHOT'S BYTES MAY BELONG TO NEITHER SECTION. Probed live: NDT anchors ~3.1 KB per
//     tick with stateBytes 0, dataBytes 0, blocks 0 — the whole payload is the snapshot's own
//     ENVELOPE (chain header + its three L0 signatures), the heartbeat of an idle currency
//     metagraph. "State none / Data none" under "3.1 KB anchored" was true and still read as a
//     contradiction, because the sections claimed to account for bytes they never could.
// So the card keeps exactly ONE size — the wire truth under Fees paid — and the sections carry
// SHAPE (keys, record counts, the dL1 signers), never bytes. The decoded weights live in the raw
// pane's lane notes, where the payload actually renders.
// The proof signers moved to the BODY: the L0 cluster seals the whole snapshot — NDT's
// envelope-only heartbeat included — so its line must not depend on any section's contents.
function PayloadBlock({
  row,
  deep,
  asked,
  decodeGaveUp,
}: {
  row: ChannelSnapRow | null;
  deep: ChannelSnapDeep | null;
  /** A deep read for THIS snapshot has been requested and is in flight. Not the same as "pinned":
   *  the card reads only on its own button, so a browsed snapshot is `asked: false` and says so. */
  asked: boolean;
  decodeGaveUp: boolean;
}) {
  // State's shape is computed server-side (`stateKeys`); Data's is the same mechanical read the
  // raw layer's data lane uses, so the two sections' rows mean the same thing.
  const stateRows = useMemo(
    () =>
      deep
        ? [...deep.stateKeys].sort((a, b) => b.count - a.count).map((k) => ({ name: k.key, count: k.count }))
        : [],
    [deep],
  );
  // Data's one shape row is the RECORD COUNT (user, 2026-08-13 — "instead of showing the data
  // attributes just say 'records'"): the attribute kinds are the raw layer's reading, where the
  // payload actually renders; on the card they were a truncated field list nobody could finish.
  const dataRows = useMemo(
    () => (deep && deep.dataTxCount > 0 ? [{ name: "records", count: deep.dataTxCount }] : []),
    [deep],
  );

  if (row && !row.decoded && !deep) {
    // An undecodable exact row is a terminal for the whole block (both surfaces apply one
    // standard, 2026-08-07); an asked read shows its own state in the same slot.
    return (
      <div className="mt-1.5 text-body text-muted-foreground italic">
        {!asked ? "undecodable payload" : decodeGaveUp ? "decompression unavailable. The read failed: old snapshots are served by only some of the chain\u2019s nodes, so asking again can land." : "decompressing…"}
      </div>
    );
  }

  // The in-flight word renders PER SECTION (user, 2026-08-13 — a single line under both read as
  // DATA's alone while STATE sat bare): both sections are being decompressed by the one read, so
  // both say so, exactly as each states its own verified `none` after it.
  const pending = asked && !deep ? (decodeGaveUp ? "decompression unavailable. The read failed: old snapshots are served by only some of the chain\u2019s nodes, so asking again can land." : "decompressing…") : null;

  return (
    <div className="mt-1.5">
      {deep && stateRows.length === 0 && dataRows.length === 0 && deep.dataBlockSigners.length === 0 && deep.stateBytes === 0 && (
        // THE IDLE SNAPSHOT, NAMED — and FIRST (user, 2026-08-13: "it should be the 1st thing
        // to read so that the rest of the card is easy to ignore"). Post-read only: idleness is
        // a verified whole-snapshot reading — the anchored bytes are the envelope (chain header
        // + proofs), the heartbeat of a quiet network. It leads the payload block so the two
        // `none` sections below become confirmation rather than a puzzle; "idle" is the app's
        // existing word for a tick that moves nothing (CLAUDE.md, the height counter).
        <p className="mb-2 text-label text-muted-foreground">
          An idle snapshot: it anchored only its envelope and proofs.
        </p>
      )}
      <PayloadSection
        name={PAYLOAD_LANES.state.name}
        title={PAYLOAD_LANES.state.title}
        rows={stateRows}
        read={!!deep}
        pending={pending}
      />
      <Separator className="my-2" />
      <PayloadSection
        name={PAYLOAD_LANES.data.name}
        title={PAYLOAD_LANES.data.title}
        rows={dataRows}
        read={!!deep}
        pending={pending}
        // "Signed by" here as in the body (user, 2026-08-13): the layer word carries the
        // difference (dL1 vs the body's L0), SIGNER_GROUPS owns the words.
        signers={
          deep && deep.dataBlockSigners.length > 0
            ? { label: "Signed by", title: SIGNER_GROUPS.dataBlocks.title, count: deep.dataBlockSigners.length, who: SIGNER_GROUPS.dataBlocks.who }
            : null
        }
      />
    </div>
  );
}

/** One payload section — a SECTION HEAD (the caps-micro register every section label in the app
 *  wears — the raw pane's lane tabs, the shape table's own column heads) and nothing else on its
 *  line (user, 2026-08-13: "just treat it as a header" — the size headline retired with the
 *  post-read rework above), then the shape rows one weight down. The optional `signers` line
 *  closes the section at the row weight: the cluster that vouches for this section's contents,
 *  its words from SIGNER_GROUPS (the one home). */
function PayloadSection({
  name,
  title,
  rows,
  read,
  pending,
  signers,
}: {
  name: string;
  title: string;
  rows: { name: string; count: number }[];
  /** The deep read has landed — an empty section may now say `none` as a verified fact; before
   *  it, the bare header claims nothing (a `none` pre-read would be a fabricated reading). */
  read: boolean;
  /** The one read's in-flight/give-up word, rendered under EVERY section it is decompressing. */
  pending?: string | null;
  signers?: { label: string; title: string; count: number; who: string } | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start" title={title}>
        <span className="text-micro tracking-caps uppercase text-muted-foreground pt-px">{name}</span>
      </div>
      {pending && <p className="pl-2 text-label text-muted-foreground italic">{pending}</p>}
      {read && rows.length === 0 && !signers && (
        // MEASURED empty — the deep read landed and this section carries nothing. A reading,
        // not a state, so it takes the section rows' own register; the italic-muted treatment
        // is `pending`'s (unread / reading…), and "unread and none are different facts".
        <p className="pl-2 text-label text-foreground-dim">none</p>
      )}
      {rows.map((r) => (
        <div key={r.name} className="flex items-start justify-between gap-2.5 pl-2" title={r.name}>
          <span className="min-w-0 truncate text-label text-foreground-dim">{r.name}</span>
          <span className="shrink-0 text-label text-foreground-dim tabular-nums">{r.count.toLocaleString()}</span>
        </div>
      ))}
      {signers && (
        <div className="flex items-start justify-between gap-2.5 pl-2" title={signers.title}>
          <span className="min-w-0 truncate text-label text-muted-foreground">{signers.label}</span>
          <span className="shrink-0 text-label text-foreground-dim tabular-nums">
            <span className="inline-flex items-center gap-1">{signers.count} <LayerWho who={signers.who} /></span>
          </span>
        </div>
      )}
    </div>
  );
}
