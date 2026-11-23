import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// THE HINT HAS TO BE READ OVER A MOVING SCENE (user, 2026-11-02: "a bit too bleak / hard to read").
// Its fade already takes it down, so it starts from full ink on a plate that holds back the scene.
const hint = readFileSync("components/MotionHint.tsx", "utf8");

describe("the motion hint", () => {
  it("is set in full ink", () => {
    expect(hint).toMatch(/font-normal text-foreground"/);
    expect(hint).not.toMatch(/font-normal text-foreground-dim/);
  });
  // user, 2026-11-23: the ground-coloured plate was "hardly visible" on paper — it wears the
  // command bar's own plate and hairline now.
  it("stands on the command bar's plate, edged, so it reads on both grounds", () => {
    expect(hint).toMatch(/border border-border backdrop-blur-md \[background:var\(--topbar-glass\)\]/);
  });
});
