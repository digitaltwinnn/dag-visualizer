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

describe("the tour's end", () => {
  const engine = readFileSync("src/engine/Engine.ts", "utf8");

  it("lets the lift go only once the HUD's edges are final, read fresh that frame", () => {
    expect(engine).toMatch(/const lifting = st\.briefing != null \|\| performance\.now\(\) < this\._liftHeldUntil/);
    expect(engine).toMatch(/const chromeShift = lifting \? 0 : this\._chromeShift\(\)/);
    expect(engine).toMatch(/if \(lifting !== this\._lifting\) \{\s*this\._lifting = lifting;\s*if \(!lifting\) this\._chrome\.refresh\(\);/);
  });
});

describe("the tour's chrome", () => {
  it("names the site itself, since the top bar that does so is stood down", () => {
    expect(briefing).toMatch(/<EcgMark \/>/);
    expect(briefing).toMatch(/new URL\(SITE_ORIGIN\)\.host/);
  });

  it("names it on every screen, the phone's header and the progress bar elsewhere", () => {
    expect(briefing.match(/\{site\}/g)).toHaveLength(2);
    expect(briefing).toMatch(/\{site\}\s*\{bars\}\s*\{skip\}/);
  });

  it("credits the AI with the words it wrote, over them and never on the bar", () => {
    expect(briefing).toMatch(/\{name\}<\/p>\s*\{who\}\s*<\/div>/);
    expect(briefing).not.toMatch(/\{who\}\s*\{bars\}/);
  });

  it("says the AI powers the words, and only when they are the AI's", () => {
    expect(briefing).toMatch(/const who = words\.ai && \(/);
    expect(briefing).toMatch(/Powered by \{AI_TITLE\}/);
  });
});

describe("the tour's words", () => {
  it("type in at every stop, whatever has been written before", () => {
    expect(briefing).toMatch(/<TypedNote [^>]*\balways\b/);
    expect(readFileSync("components/notes/TypedNote.tsx", "utf8")).toMatch(/\(always \|\| \(waited && !TYPED\.has\(text\)\)\)/);
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
