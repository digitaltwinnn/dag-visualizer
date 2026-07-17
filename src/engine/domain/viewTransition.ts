// The ONE view-transition state machine (spec: docs/superpowers/specs/
// 2026-07-17-view-transitions-design.md). Every 3D-view switch runs the staged choreography:
//   OUT  (t: 0→DUR_OUT)  — the from-view's furniture fades out while nodes fly, staggered,
//                          to the gathering grids (gatherWeight 0→1).
//   BOUNDARY (one frame)  — tick() returns true exactly once; the Engine applies the
//                          destination layout (morph snap, ledger placement, spin) while the
//                          nodes are fully gathered and both furnitures are dark.
//   IN   (t: 0→DUR_IN)   — the to-view's furniture builds while nodes fly, staggered, to
//                          their destination poses (gatherWeight 1→0); the camera flies.
// Pure and allocation-free; the scene calls gatherWeight per node per frame.
import { smooth } from "./nodeLayout";

export type View3D = "hyper" | "geo" | "ledger";

// Live-reviewed at 4x/20x/40x-stretched slow motion (Task 8, chrome-devtools MCP screenshots)
// across all six 3D transition directions: the per-network squares read as tidy distinct
// blocks (DAG's clearly biggest), the stagger reads as an assembling wave rather than a swarm,
// nothing overlaps the furniture mid-flight, and the 1.9s total holds up as balanced rather
// than waited-for. No change from the Task 1-7 values — kept as-is.
export const DUR_OUT = 0.9; //         teardown + gather, incl. the stagger spread
export const DUR_IN = 1.0; //          build + placement + camera flight
export const STAGGER_SPREAD = 0.25; // window over which node flights START (rank-ordered)

// A node's flight lasts the phase minus the spread, so the LAST starter still lands in-phase.
const FLIGHT_OUT = DUR_OUT - STAGGER_SPREAD;
const FLIGHT_IN = DUR_IN - STAGGER_SPREAD;

export class ViewTransition {
  phase: "idle" | "out" | "in" = "idle";
  from: View3D | null = null;
  to: View3D | null = null; // while idle: the SETTLED view
  private t = 0;

  // Adopt `view` as the settled state with no animation (boot, or a non-3D interlude).
  settle(view: View3D): void {
    this.phase = "idle";
    this.from = null;
    this.to = view;
    this.t = 0;
  }

  active(): boolean {
    return this.phase !== "idle";
  }

  // Begin or RETARGET a transition (spec: no teleports — weights stay continuous).
  start(from: View3D, to: View3D): void {
    if (this.phase === "idle") {
      this.from = from;
      this.to = to;
      this.phase = "out";
      this.t = 0;
      return;
    }
    if (this.phase === "out") {
      if (to === this.from) {
        // Flipped back to the origin mid-gather → reverse into IN, seeding t so the
        // UN-staggered base weight is continuous (per-node stagger reorders slightly).
        this.to = this.from;
        this.from = from;
        // Continuity inverts against FLIGHT_* — the gatherWeight denominators — NOT the raw DUR_* phase lengths; inverting against DUR_* breaks the no-teleport contract (the retarget tests below prove it).
        this.t = (1 - this.t / FLIGHT_OUT) * FLIGHT_IN;
        this.phase = "in";
      } else {
        this.to = to; // gather continues; only the destination changes
      }
      return;
    }
    // phase === "in": nodes are dispersing toward this.to — gather them again toward `to`.
    if (to === this.to) return; // already heading there
    this.from = this.to;
    this.to = to;
    // Continuity inverts against FLIGHT_* — the gatherWeight denominators — NOT the raw DUR_* phase lengths; inverting against DUR_* breaks the no-teleport contract (the retarget tests below prove it).
    this.t = (1 - this.t / FLIGHT_IN) * FLIGHT_OUT; // base-weight continuity (see test)
    this.phase = "out";
  }

  // Advance the clock. Returns TRUE exactly once — on the frame the OUT phase completes
  // (the boundary): the caller applies the destination layout then.
  tick(dt: number): boolean {
    if (this.phase === "idle") return false;
    this.t += dt;
    if (this.phase === "out" && this.t >= DUR_OUT) {
      this.t -= DUR_OUT;
      this.phase = "in";
      return true;
    }
    if (this.phase === "in" && this.t >= DUR_IN) {
      this.settle(this.to!);
    }
    return false;
  }

  // This frame's gather weight for the node ranked `rank` of `count` in its staging grid
  // (row-major within its network square): 0 = at its view pose, 1 = at its grid slot.
  gatherWeight(rank: number, count: number): number {
    if (this.phase === "idle") return 0;
    const delay = (rank / Math.max(1, count - 1)) * STAGGER_SPREAD;
    if (this.phase === "out") {
      return smooth(Math.min(1, Math.max(0, (this.t - delay) / FLIGHT_OUT)));
    }
    return 1 - smooth(Math.min(1, Math.max(0, (this.t - delay) / FLIGHT_IN)));
  }

  // Furniture multiplier for `view` this frame. At most one view is ever lit (spec:
  // furniture never overlaps the flight); idle lights only the settled view.
  furnitureAlpha(view: View3D): number {
    if (this.phase === "idle") return view === this.to ? 1 : 0;
    if (this.phase === "out") return view === this.from ? 1 - smooth(Math.min(1, this.t / DUR_OUT)) : 0;
    return view === this.to ? smooth(Math.min(1, this.t / DUR_IN)) : 0;
  }
}
