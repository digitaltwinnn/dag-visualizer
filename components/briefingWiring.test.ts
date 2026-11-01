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

describe("the tour's progress bar", () => {
  it("moves the tour to the stop clicked, without the click ending it", () => {
    expect(briefing).toMatch(/const goTo = \(i: number\) => \{/);
    expect(briefing).toMatch(/s\.setMode\(BRIEFING_STOPS\[i\]!\);\s*s\.setBriefing\(i\);/);
    expect(briefing).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*goTo\(i\);/);
  });

  it("names each stop for a screen reader, and leaves Skip the first stop for Tab", () => {
    expect(briefing).toMatch(/aria-label=\{`Go to \$\{/);
    expect(briefing).toMatch(/tabIndex=\{-1\}/);
  });

  it("gives a keyboard the same two steps", () => {
    expect(briefing).toMatch(/e\.key === "ArrowRight"/);
    expect(briefing).toMatch(/e\.key === "ArrowLeft"/);
  });

  it("never runs a stop's clock backwards: a frame's own time can fall before the stop began", () => {
    expect(briefing).toMatch(/const since = Math\.max\(0, now - last\);/);
  });

  it("repaints a stop stepped back past, whose fill the clock wrote by hand", () => {
    expect(briefing).toMatch(/key=\{stop\}/);
  });
});

describe("the tour's end", () => {
  const engine = readFileSync("src/engine/Engine.ts", "utf8");

  it("lets the lift go only once the HUD's edges are final, read fresh that frame", () => {
    expect(engine).toMatch(/const lifting = \(st\.briefing != null && !st\.briefingLanding\) \|\| performance\.now\(\) < this\._liftHeldUntil/);
    expect(engine).toMatch(/const chromeShift = lifting \? 0 : this\._chromeShift\(\)/);
    expect(engine).toMatch(/if \(lifting !== this\._lifting\) \{\s*this\._lifting = lifting;\s*if \(!lifting\) this\._chrome\.refresh\(\);/);
  });
});

describe("the tour's three-beat ending", () => {
  it("fades the words and the gradient together, on one clock", () => {
    expect(briefing).toMatch(/transitionDuration: `\$\{BRIEFING_WORDS_OUT_MS\}ms`/);
    expect(briefing).toMatch(/fading && "pointer-events-none opacity-0"/);
    expect(briefing).toMatch(/motion-reduce:transition-none/);
  });

  it("starts the scene only once the words are gone, and sends the rails back unseen behind the hidden HUD", () => {
    expect(briefing).toMatch(/if \(!moved && since >= BRIEFING_WORDS_OUT_MS\) \{/);
    expect(briefing).toMatch(/s\.setMode\(BRIEFING_STOPS\[0\]\);\s*s\.setBriefingLanding\(true\);\s*s\.setRailsHidden\(false\);/);
  });

  it("brings the HUD back when the scene has landed", () => {
    expect(briefing).toMatch(/hasLanded\([^)]*\)\) return endBriefing\(stop, "done"\)/);
  });

  it("keeps the words mounted through an early end too, so Skip fades rather than cuts", () => {
    expect(briefing).toMatch(/<Tour stop=\{shown\} leaving=\{stop == null\} \/>/);
  });

  it("finishes the tour on a tap during the ending, rather than stopping short of the globe", () => {
    expect(briefing).toMatch(/endBriefing\(stop, ending \? "done" : "tap"\)/);
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
