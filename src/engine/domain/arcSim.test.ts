import * as THREE from "three";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ArcSim, arcCurve, ARC_SAMPLES, ARC_TAIL, ARC_TAIL_FRAC, type ArcAgent, type ArcEndpoint } from "./arcSim";
import { R, LAND_H } from "./geoLayout";

function endpoint(x: number, y: number, z: number, index: number): ArcEndpoint {
  return { dir: new THREE.Vector3(x, y, z).normalize(), node: { index } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ARC_TAIL_FRAC (comet length as a fraction of its current hop; consumed by scene/objects/Arcs.ts's per-vertex step = ARC_TAIL_FRAC / (ARC_TAIL - 1))", () => {
  it("is a fraction in (0, 1] — the comet trails part of its hop, never more than the whole thing", () => {
    expect(ARC_TAIL_FRAC).toBeGreaterThan(0);
    expect(ARC_TAIL_FRAC).toBeLessThanOrEqual(1);
  });

  it("keeps the sampling step (ARC_TAIL_FRAC / (ARC_TAIL - 1)) small enough that ARC_TAIL points resolve the tail smoothly", () => {
    const step = ARC_TAIL_FRAC / (ARC_TAIL - 1);
    expect(step * (ARC_TAIL - 1)).toBeCloseTo(ARC_TAIL_FRAC, 12);
    expect(step).toBeLessThan(ARC_TAIL_FRAC); // more than one sample point across the tail
  });
});

describe("arcCurve (js/globe.js:432-437, _arcCurve verbatim)", () => {
  it("fills a pre-allocated out array without reallocating it", () => {
    const out = Array.from({ length: ARC_SAMPLES }, () => new THREE.Vector3());
    const outRef = out; // same array reference must come back untouched (no reassignment)
    arcCurve(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), out);
    expect(out).toBe(outRef);
    expect(out.length).toBe(ARC_SAMPLES);
  });

  it("t=0 endpoint is dirA scaled by (R + LAND_H + 0.02)", () => {
    const out = Array.from({ length: ARC_SAMPLES }, () => new THREE.Vector3());
    const dirA = new THREE.Vector3(1, 0, 0);
    const dirB = new THREE.Vector3(0, 1, 0);
    arcCurve(dirA, dirB, out);
    const expected = dirA.clone().multiplyScalar(R + LAND_H + 0.02);
    expect(out[0].x).toBeCloseTo(expected.x, 10);
    expect(out[0].y).toBeCloseTo(expected.y, 10);
    expect(out[0].z).toBeCloseTo(expected.z, 10);
  });

  it("t=1 endpoint is dirB scaled by (R + LAND_H + 0.02)", () => {
    const out = Array.from({ length: ARC_SAMPLES }, () => new THREE.Vector3());
    const dirA = new THREE.Vector3(1, 0, 0);
    const dirB = new THREE.Vector3(0, 1, 0);
    arcCurve(dirA, dirB, out);
    const expected = dirB.clone().multiplyScalar(R + LAND_H + 0.02);
    const last = out[out.length - 1];
    expect(last.x).toBeCloseTo(expected.x, 10);
    expect(last.y).toBeCloseTo(expected.y, 10);
    expect(last.z).toBeCloseTo(expected.z, 10);
  });

  it("does not mutate the input direction vectors", () => {
    const out = Array.from({ length: ARC_SAMPLES }, () => new THREE.Vector3());
    const dirA = new THREE.Vector3(1, 0, 0);
    const dirB = new THREE.Vector3(0, 1, 0);
    arcCurve(dirA, dirB, out);
    expect(dirA.x).toBe(1);
    expect(dirA.y).toBe(0);
    expect(dirB.x).toBe(0);
    expect(dirB.y).toBe(1);
  });
});

describe("ArcSim.sampleCurve (js/globe.js:448-452, _sampleCurve verbatim)", () => {
  it("interpolates along the curve at a fractional param", () => {
    const sim = new ArcSim();
    const curve = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0), new THREE.Vector3(4, 0, 0)];
    const out = new THREE.Vector3();
    sim.sampleCurve(curve, 0.25, out); // f = 0.25*2 = 0.5 -> between i0=0,i1=1 at 0.5
    expect(out.x).toBeCloseTo(1, 10);
  });

  it("clamps param below 0 to the first point", () => {
    const sim = new ArcSim();
    const curve = [new THREE.Vector3(5, 1, 2), new THREE.Vector3(9, 1, 2)];
    const out = new THREE.Vector3();
    sim.sampleCurve(curve, -3, out);
    expect(out.x).toBeCloseTo(5, 10);
  });

  it("clamps param above 1 to the last point", () => {
    const sim = new ArcSim();
    const curve = [new THREE.Vector3(5, 1, 2), new THREE.Vector3(9, 1, 2)];
    const out = new THREE.Vector3();
    sim.sampleCurve(curve, 4, out);
    expect(out.x).toBeCloseTo(9, 10);
  });

  it("returns the same `out` reference it was given", () => {
    const sim = new ArcSim();
    const curve = [new THREE.Vector3(), new THREE.Vector3(1, 1, 1)];
    const out = new THREE.Vector3();
    const ret = sim.sampleCurve(curve, 0.5, out);
    expect(ret).toBe(out);
  });
});

describe("ArcSim.rebuild (js/globe.js:359-397, agent seeding verbatim)", () => {
  it("produces no agents when fewer than 2 points are given", () => {
    const sim = new ArcSim();
    sim.rebuild([]);
    expect(sim.agents.length).toBe(0);
    sim.rebuild([endpoint(1, 0, 0, 0)]);
    expect(sim.agents.length).toBe(0);
  });

  it("still records the pool even with fewer than 2 points", () => {
    const sim = new ArcSim();
    const pts = [endpoint(1, 0, 0, 0)];
    sim.rebuild(pts);
    expect(sim.pool).toBe(pts);
  });

  it("seeds N = min(40, max(6, round(pts.length*0.8))) agents", () => {
    const sim = new ArcSim();
    // 10 pts -> round(10*0.8)=8 -> max(6,8)=8 -> min(40,8)=8
    const pts = Array.from({ length: 10 }, (_, i) => endpoint(Math.cos(i), Math.sin(i), 0, i));
    sim.rebuild(pts);
    expect(sim.agents.length).toBe(8);
  });

  it("caps agent count at 40 even with many points", () => {
    const sim = new ArcSim();
    const pts = Array.from({ length: 100 }, (_, i) => endpoint(Math.cos(i), Math.sin(i), 0, i));
    sim.rebuild(pts);
    expect(sim.agents.length).toBe(40);
  });

  it("floors agent count at 6 even with very few points", () => {
    const sim = new ArcSim();
    const pts = Array.from({ length: 2 }, (_, i) => endpoint(Math.cos(i), Math.sin(i), 0, i));
    sim.rebuild(pts);
    expect(sim.agents.length).toBe(6);
  });

  it("respects an explicit maxAgents override", () => {
    const sim = new ArcSim();
    const pts = Array.from({ length: 100 }, (_, i) => endpoint(Math.cos(i), Math.sin(i), 0, i));
    sim.rebuild(pts, 5);
    // max(6, round(100*0.8)=80) = 80, min(5, 80) = 5
    expect(sim.agents.length).toBe(5);
  });

  it("gives each agent a curve of length ARC_SAMPLES whose endpoints match its from/to dirs", () => {
    const sim = new ArcSim();
    const pts = Array.from({ length: 10 }, (_, i) => endpoint(Math.cos(i), Math.sin(i), i * 0.1, i));
    sim.rebuild(pts);
    for (const ag of sim.agents) {
      expect(ag.curve.length).toBe(ARC_SAMPLES);
      const expectedStart = ag.from.dir.clone().multiplyScalar(R + LAND_H + 0.02);
      const expectedEnd = ag.to.dir.clone().multiplyScalar(R + LAND_H + 0.02);
      expect(ag.curve[0].x).toBeCloseTo(expectedStart.x, 8);
      expect(ag.curve[ARC_SAMPLES - 1].x).toBeCloseTo(expectedEnd.x, 8);
    }
  });

  it("gives each agent a distinct vstart spaced by (ARC_TAIL-1)*2", () => {
    const sim = new ArcSim();
    const pts = Array.from({ length: 10 }, (_, i) => endpoint(Math.cos(i), Math.sin(i), 0, i));
    sim.rebuild(pts);
    const vertsPer = (ARC_TAIL - 1) * 2;
    sim.agents.forEach((ag, i) => expect(ag.vstart).toBe(i * vertsPer));
  });

  it("starts every agent in the travel state with zero pause", () => {
    const sim = new ArcSim();
    const pts = Array.from({ length: 10 }, (_, i) => endpoint(Math.cos(i), Math.sin(i), 0, i));
    sim.rebuild(pts);
    for (const ag of sim.agents) {
      expect(ag.state).toBe("travel");
      expect(ag.pause).toBe(0);
      expect(ag.speed).toBeGreaterThanOrEqual(0.15);
      expect(ag.speed).toBeLessThanOrEqual(0.35);
      expect(ag.t).toBeGreaterThanOrEqual(0);
      expect(ag.t).toBeLessThan(1);
    }
  });
});

describe("ArcSim.step — enabled gate (structural fix for the ledger red-dots bug)", () => {
  it("step(dt, false) leaves flashCount at 0 and agents completely untouched", () => {
    const sim = new ArcSim();
    const pts = Array.from({ length: 10 }, (_, i) => endpoint(Math.cos(i), Math.sin(i), 0, i));
    sim.rebuild(pts);
    // force an agent to the brink of arrival so, if the gate were broken, stepping would flip it
    const ag = sim.agents[0];
    ag.state = "travel";
    ag.t = 0.999;
    ag.speed = 10;
    const snapshot = sim.agents.map((a) => ({ ...a }));

    const result = sim.step(1000, false);

    expect(result.retargeted).toBe(false);
    expect(sim.flashCount).toBe(0);
    sim.agents.forEach((a, i) => {
      expect(a.state).toBe(snapshot[i].state);
      expect(a.t).toBe(snapshot[i].t);
      expect(a.pause).toBe(snapshot[i].pause);
      expect(a.from).toBe(snapshot[i].from);
      expect(a.to).toBe(snapshot[i].to);
    });
  });

  it("resets flashCount at the start of every step call, even when enabled", () => {
    const sim = new ArcSim();
    sim.agents = [];
    sim.flashCount = 3; // pretend a previous step left hits unconsumed
    sim.step(0.016, true);
    expect(sim.flashCount).toBe(0);
  });
});

describe("ArcSim.step — travel -> arrival -> pause (js/globe.js:987-999 verbatim)", () => {
  it("advances t by speed*dt while travelling, below arrival", () => {
    const sim = new ArcSim();
    const from = endpoint(1, 0, 0, 0);
    const to = endpoint(0, 1, 0, 1);
    const ag: ArcAgent = { from, to, curve: [], vstart: 0, t: 0.2, speed: 0.5, state: "travel", pause: 0 };
    sim.agents = [ag];
    sim.pool = [from, to];
    sim.step(0.1, true);
    expect(ag.state).toBe("travel");
    expect(ag.t).toBeCloseTo(0.25, 10);
    expect(sim.flashCount).toBe(0);
  });

  it("clamps t to 1, flips to pause, and registers exactly one flash hit for the target index on arrival", () => {
    const sim = new ArcSim();
    const from = endpoint(1, 0, 0, 0);
    const to = endpoint(0, 1, 0, 7);
    const ag: ArcAgent = { from, to, curve: [], vstart: 0, t: 0.98, speed: 1, state: "travel", pause: 0 };
    sim.agents = [ag];
    sim.pool = [from, to];

    vi.spyOn(Math, "random").mockReturnValue(0.5); // pause = 0.8 + 0.5*1.8 = 1.7

    const result = sim.step(0.1, true);

    expect(ag.state).toBe("pause");
    expect(ag.t).toBe(1);
    expect(ag.pause).toBeCloseTo(1.7, 10);
    expect(sim.flashCount).toBe(1);
    expect(sim.flashHits[0]).toBe(7); // to.node.index
    expect(result.retargeted).toBe(false); // arrival itself isn't a retarget
  });

  it("counts down pause without retargeting while pause remains positive", () => {
    const sim = new ArcSim();
    const from = endpoint(1, 0, 0, 0);
    const to = endpoint(0, 1, 0, 1);
    const ag: ArcAgent = { from, to, curve: [], vstart: 0, t: 1, speed: 1, state: "pause", pause: 0.5 };
    sim.agents = [ag];
    sim.pool = [from, to];
    const result = sim.step(0.2, true);
    expect(ag.state).toBe("pause");
    expect(ag.pause).toBeCloseTo(0.3, 10);
    expect(result.retargeted).toBe(false);
    expect(sim.flashCount).toBe(0);
  });
});

describe("ArcSim.step — pause -> retarget (js/globe.js:1000-1009 verbatim)", () => {
  it("retargets when pause elapses: from<-to, to<-a new pool pick, t resets to 0, state->travel", () => {
    const sim = new ArcSim();
    const a = endpoint(1, 0, 0, 0);
    const b = endpoint(0, 1, 0, 1);
    const c = endpoint(0, 0, 1, 2);
    const ag: ArcAgent = {
      from: a, to: b,
      curve: Array.from({ length: ARC_SAMPLES }, () => new THREE.Vector3()),
      vstart: 0, t: 1, speed: 0.5, state: "pause", pause: 0.05,
    };
    sim.agents = [ag];
    sim.pool = [a, b, c];

    // _pickTarget loop: c === from check uses `ag.to` as the new "from" (== old `to`, i.e. b).
    // First draw must land on something !== b to exit the retry loop immediately: pick index 2 -> c.
    vi.spyOn(Math, "random").mockReturnValue(2 / 3 + 0.001);

    const result = sim.step(0.1, true);

    expect(ag.from).toBe(b); // old target becomes the new origin
    expect(ag.to).toBe(c);
    expect(ag.t).toBe(0);
    expect(ag.state).toBe("travel");
    expect(result.retargeted).toBe(true);
    expect(sim.flashCount).toBe(0); // retargeting itself is not an arrival
  });

  it("rewrites the agent's curve in place (same array reference) to the new from/to endpoints", () => {
    const sim = new ArcSim();
    const a = endpoint(1, 0, 0, 0);
    const b = endpoint(0, 1, 0, 1);
    const c = endpoint(0, 0, 1, 2);
    const curve = Array.from({ length: ARC_SAMPLES }, () => new THREE.Vector3());
    const ag: ArcAgent = { from: a, to: b, curve, vstart: 0, t: 1, speed: 0.5, state: "pause", pause: 0.05 };
    sim.agents = [ag];
    sim.pool = [a, b, c];

    vi.spyOn(Math, "random").mockReturnValue(2 / 3 + 0.001);
    sim.step(0.1, true);

    expect(ag.curve).toBe(curve); // no reallocation
    const expectedStart = b.dir.clone().multiplyScalar(R + LAND_H + 0.02);
    const expectedEnd = c.dir.clone().multiplyScalar(R + LAND_H + 0.02);
    expect(ag.curve[0].x).toBeCloseTo(expectedStart.x, 8);
    expect(ag.curve[ARC_SAMPLES - 1].x).toBeCloseTo(expectedEnd.x, 8);
  });

  it("avoids retargeting onto the same node when possible (retries up to 8 times)", () => {
    const sim = new ArcSim();
    const a = endpoint(1, 0, 0, 0);
    const b = endpoint(0, 1, 0, 1);
    const ag: ArcAgent = {
      from: a, to: b,
      curve: Array.from({ length: ARC_SAMPLES }, () => new THREE.Vector3()),
      vstart: 0, t: 1, speed: 0.5, state: "pause", pause: 0.05,
    };
    sim.agents = [ag];
    sim.pool = [a, b]; // only 2 nodes: from (b, the old `to`) and a

    // First few draws land back on b (index 1), then finally a (index 0).
    const seq = [0.9, 0.9, 0.1];
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => seq[Math.min(call++, seq.length - 1)]);

    sim.step(0.1, true);
    expect(ag.to).toBe(a);
  });

  it("returns retargeted:true when ANY agent retargets this step, even with other agents mid-travel", () => {
    const sim = new ArcSim();
    const a = endpoint(1, 0, 0, 0);
    const b = endpoint(0, 1, 0, 1);
    const c = endpoint(0, 0, 1, 2);
    const traveling: ArcAgent = { from: a, to: b, curve: [], vstart: 0, t: 0.1, speed: 0.2, state: "travel", pause: 0 };
    const pausing: ArcAgent = {
      from: a, to: c,
      curve: Array.from({ length: ARC_SAMPLES }, () => new THREE.Vector3()),
      vstart: 8, t: 1, speed: 0.5, state: "pause", pause: 0.01,
    };
    sim.agents = [traveling, pausing];
    sim.pool = [a, b, c];

    vi.spyOn(Math, "random").mockReturnValue(0.01); // picks index 0 -> a; retries since c's from is `c` (== to)

    const result = sim.step(0.1, true);
    expect(result.retargeted).toBe(true);
  });
});
