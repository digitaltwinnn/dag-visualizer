import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { paperDimTarget, type SceneColors } from "./sceneColors";

const channels = (hex: number) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
const paper = { bg: 0xeef2f8, muted: 0x4d5a70 } as SceneColors;

// user, 2026-11-02: "the others dimmed are also quite faint, probably has to do with the light mode
// and direction of the dim". A dim that heads for the page itself ends as the page.
describe("paperDimTarget", () => {
  it("stops short of the page, so a mute stays a mark", () => {
    expect(paperDimTarget(paper)).not.toBe(paper.bg);
  });
  it("stays lighter than the muted ink, so it still reads as receding", () => {
    const target = channels(paperDimTarget(paper));
    channels(paper.bg).forEach((ground, i) => {
      expect(target[i]).toBeLessThan(ground);
      expect(target[i]).toBeGreaterThan(channels(paper.muted)[i]);
    });
  });
  it("is what the node fabric dims toward on paper", () => {
    const fabric = readFileSync("src/engine/scene/objects/NodeFabric.ts", "utf8");
    expect(fabric).toMatch(/DIM\.setHex\(isLightGround\(colors\) \? paperDimTarget\(colors\) : DIM_DARK\);/);
  });
});
