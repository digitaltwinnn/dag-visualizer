import { describe, it, expect } from "vitest";
import { auditInstances, findingKey, POS_LIMIT, type InstanceFinding } from "./instanceAudit";

// A 4x4 identity with a translation, column-major as three writes it.
const at = (x: number, y: number, z: number): number[] =>
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const buf = (...mats: number[][]): number[] => mats.flat();

describe("auditInstances", () => {
  it("passes a healthy buffer", () => {
    expect(auditInstances("nodes", buf(at(0, 0, 0), at(12, -3, 40)), 2)).toEqual([]);
  });

  it("catches a NaN before it can be mistaken for a node that left the set", () => {
    // The failure this exists for: one bad divide upstream, and three renders the slot as simply
    // absent — indistinguishable from a node legitimately leaving.
    const m = buf(at(0, 0, 0), at(NaN, 0, 0));
    const f = auditInstances("nodes", m, 2);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ mesh: "nodes", slot: 1, kind: "non-finite" });
    expect(f[0]!.detail).toContain("matrix[12]");
  });

  it("catches Infinity too — same class, same silence", () => {
    expect(auditInstances("nodes", buf(at(Infinity, 0, 0)), 1)[0]).toMatchObject({ kind: "non-finite" });
  });

  it("reports ONE finding per slot — a NaN translation is not also out-of-bounds", () => {
    // Without the `continue`, a non-finite slot would report twice and drown the cap.
    const f = auditInstances("nodes", buf(at(NaN, NaN, NaN)), 1);
    expect(f).toHaveLength(1);
  });

  it("catches a finite but absurd coordinate — drawn, but nowhere the camera goes", () => {
    const f = auditInstances("nodes", buf(at(POS_LIMIT + 1, 0, 0)), 1);
    expect(f[0]).toMatchObject({ kind: "out-of-bounds" });
    expect(f[0]!.detail).toMatch(/^x = /);
  });

  it("leaves real scene coordinates alone — the limit is a trip-wire, not a layout bound", () => {
    // The chamber's trail reaches ~±40 and the globe ~±120; the limit must stay orders clear of
    // both, or it becomes a constraint on layout instead of a corruption check.
    expect(auditInstances("nodes", buf(at(0, 0, -40), at(120, 0, 0)), 2)).toEqual([]);
    expect(POS_LIMIT).toBeGreaterThan(10_000);
  });

  it("scans the colour buffer when there is one", () => {
    const f = auditInstances("nodes", buf(at(0, 0, 0)), 1, [0.5, NaN, 0.2]);
    expect(f[0]).toMatchObject({ kind: "non-finite" });
    expect(f[0]!.detail).toContain("colour[g]");
  });

  it("caps its output — a corrupt buffer is corrupt in thousands of slots", () => {
    const many = buf(...Array.from({ length: 50 }, () => at(NaN, 0, 0)));
    expect(auditInstances("nodes", many, 50, null, 4)).toHaveLength(4);
  });

  it("only scans `count` slots, not the buffer's capacity", () => {
    // Instanced meshes are allocated at max size and used partially; the tail is legitimately
    // whatever it was last, so scanning past `count` would report the pool as broken.
    const m = buf(at(0, 0, 0), at(NaN, 0, 0));
    expect(auditInstances("nodes", m, 1)).toEqual([]);
  });

  it("dedupes by mesh and kind, so one bad buffer reports once and not per frame", () => {
    const a: InstanceFinding = { mesh: "nodes", slot: 1, kind: "non-finite", detail: "x" };
    const b: InstanceFinding = { mesh: "nodes", slot: 9, kind: "non-finite", detail: "y" };
    const c: InstanceFinding = { mesh: "trail", slot: 1, kind: "non-finite", detail: "x" };
    expect(findingKey(a)).toBe(findingKey(b));
    expect(findingKey(a)).not.toBe(findingKey(c));
  });
});
