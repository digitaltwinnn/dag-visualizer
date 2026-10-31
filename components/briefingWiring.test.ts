import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// What the Briefing's wiring must keep, read from source: the components hold it, and the Vitest
// env has no DOM.
const briefing = readFileSync("components/Briefing.tsx", "utf8");
const route = readFileSync("components/RouteSync.tsx", "utf8");
const stack = readFileSync("components/TrendStack.tsx", "utf8");

describe("the tour and the address bar", () => {
  it("retitles nothing while it runs, and leaves `/` its own title", () => {
    const guard = route.indexOf("state.briefing != null) return");
    const title = route.indexOf("document.title =");
    expect(guard).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(guard);
    expect(route).toMatch(/if \(!landed \|\| fromPop\) document\.title =/);
  });
});

describe("the tour before the scene is up", () => {
  it("takes no tap on the loading screen", () => {
    expect(briefing).toMatch(/onClick=\{ready \? /);
  });

  it("counts a stop only once it can be seen", () => {
    expect(briefing).toMatch(/if \(ready\) track\("briefing-stop"/);
  });
});

describe("the tour for a screen reader or a keyboard", () => {
  it("speaks each stop once, from a region that stands from the start", () => {
    expect(briefing).toMatch(/<p className="sr-only" aria-live="polite">/);
    expect(briefing).not.toMatch(/<div aria-live/);
  });

  it("leaves Skip as the first stop for Tab, with no ring forced on a mouse user", () => {
    expect(briefing).not.toMatch(/\.focus\(/);
  });

  it("keeps History's chart heads out of the tab order behind it", () => {
    expect(stack).toMatch(/inert=\{briefing \|\| undefined\}/);
  });
});
