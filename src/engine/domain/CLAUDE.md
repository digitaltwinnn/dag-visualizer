# src/engine/domain — working notes

Pure logic: the view transition choreography and the click/select decision table.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the eleven rules, run & test,
the architecture map and the dev workflow; **its rules govern this file too**.

## The 3D↔3D view transition

Every switch among the three 3D views runs the same staged **gather choreography**
(`domain/viewTransition.ts`) rather than a cut or a live morph flight: the from-view's nodes fly up,
staggered, to per-network staging grids on a camera-anchored plane while its furniture fades; one
invisible boundary frame where the nodes are gathered, the destination layout snaps in and the camera
tween starts; then the to-view's furniture builds back in fast while its nodes disperse over a longer
window into the already-drawn view. ~3.9s in total.

**The slow placement reads as staging rather than loading *because* the destination is complete
first.** `morph` and `ledgerT` are boundary-applied layout parameters, not eased flight blends.
Retargeting mid-flight keeps flight weights continuous. Picking is suppressed throughout (raycasting
mid-flight misleads), and HUD-commit camera reframes are held during the out phase — the state commit
stands and the boundary re-derives the pose from committed state, so nothing is lost. Flat views just
cross-fade the canvas.

**The staging block is WIDTH-FIRST, and the chip size is the same in every presentation**
(`domain/gatherLayout.ts`, 2026-08-13). The pack's **depth** is solved against the band measured in
real chip pitches (`gatherRows`) and the columns fall out of it, so a wider band answers with a
longer, shallower block rather than a bigger one; the leftover goes to the **gutters between blocks**
(`gatherSpread`), never to the pitch inside them. ⚠️ The trap this replaced: `cols = ceil(√count)` is
width-agnostic, so the DAG's 162 nodes hung ten rows down while scene mode's band had hundreds of
unused pixels either side. **Tune the band, not the chip.**

**Slack can never become size, and the search stops at the band's own HEIGHT.** Two structural rules
hold the above in place, because it had been fixed once and come back (user, 2026-08-13 — *"find a
structural fix that does not reappear"*). The pitch is a fixed world constant and **the fit may only
ever shrink below it**: the growth cap that used to let it scale UP meant the two presentations agreed
only while the cap bound in both, so any viewport that moved one off the cap re-opened the bug, and
the cap itself had twice been tuned to whatever made *one* band fill — a free fit in disguise. And the
depth search is capped by `floor(availH / pitch)` rather than by `ceil(√deepest)`: the near-square is
width-agnostic, so it stopped the search at a shape the band had nothing to do with and handed the
rest to shrinking while vertical room went unused. Measured at 1600×897: the same 161 DAG chips stage
23×7 with the rails in and 54×3 with them away, at one pitch (~19.5px) in both.


re-commits the node's country and provider, hyper its composition group — exactly the rungs a click on
that node in the destination view would have committed. So every card up to the selection is on the
rail in every view, and a deselect steps back down the local ladder instead of jumping to the network.

## Selection semantics

`domain/pickActions.ts` is the click/select decision table: what picking a subject means per view ×
pick kind, as pure data-in/actions-out logic. Two kinds of executor consume it — the Engine's scene
raycast clicks and the React components via named builders — so the scene and the panels can't drift
in semantics. Every caller applies actions through the one executor `src/store/applyClickActions.ts`.

**`src/engine/domain/pickActions.test.ts` is the specification.** It pins every ordering contract, the
full-ancestry rule, the deselect stepping, the release rules, and the scene-click-equals-row-select
equivalence; its test names read as the spec. Companions: `src/store/applyClickActions.test.ts` (action
kind → exactly one store effect) and `src/store/followFlow.test.ts` (the follow decision table through
the real builders, executor and store).

The design rules behind the table, which the tests pin but don't explain:

- **Full ancestry.** A node select commits every coarser rung, so deselects step back down predictably.
  The ledger contributes no ancestry.
- **A filter is a story.** Pinning a global tick whose anchors don't include the committed network
  releases the filter back to "all", so a network's dim never shapes a snapshot that has nothing to do
  with it. The membership rule lives in `src/data/ledgerStory.ts`.
- **A committed ancestry rung borrows its members' glow only while it is the FINEST committed rung**
  (user, 2026-08-11). Every other rung has a 3D counterpart you could have clicked — the hub, the
  border, the chip; the **group** rungs (geo's provider cohort, hyper's composition group) have none,
  so lighting their members is the only way they appear in the scene at all. Honest while the group IS
  the subject, a lie once the click lands on a node. `dimModel.ancestryGlow` is the rule and its test
  the spec; hover is untouched. One call site: `Globe._frameCtx`'s glow channel. **The ledger's
  SIGNER set reads the same gate** (user, 2026-08-18): it was exempt on the argument that it is not
  ancestry but a relation from a different subject — true, and beside the point, because a metagraph
  that seals with its whole 3-machine cluster left a committed node reading as one bright chip among
  three. The rule's own reasoning governs it, and nothing true is lost: the snapshot's lane tile still
  carries the relation and the node card still states `signed`.
- **A tick drops the metagraph snapshot it can't contain** (user, 2026-08-10). Stronger than the story
  rule one rung up: that one is about set membership, this is a one-to-one join
  (`metagraph.timestamp === global.timestamp`), so committing a DIFFERENT tick provably means the held
  snapshot didn't anchor here. Left in place it sat directly under the global card in the pile — where
  ADJACENCY IS CONTAINMENT — stating that tick B contains a snapshot that landed in tick A. It lives in
  `snapshotSelectActions`, so all remaining consumers (explorer row, the global card's pager,
  the 3D band click) inherit it.
- **New click/select semantics go in the table with a test**, their effects in the executor, never
  inline. `components/selectionBoundary.test.ts` enforces this — and note the rule is **write**-based,
  so read-only facts cards cost nothing and every future explorer card inherits the table.
