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
  it("counts a stop only once it can be seen", () => {
    expect(briefing).toMatch(/if \(ready\) track\("briefing-stop"/);
  });
});

describe("the tour's progress bar", () => {
  it("moves the tour to the stop clicked, without the click ending it", () => {
    expect(briefing).toMatch(/const goTo = \(i: number\) => \{/);
    expect(briefing).toMatch(/s\.setMode\(BRIEFING_STOPS\[i\]!\);\s*s\.setBriefing\(i\);/);
    expect(briefing).toMatch(/onClick=\{\(\) => goTo\(i\)\}/);
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
    expect(engine).toMatch(/if \(lifting !== this\._lifting\) \{\s*this\._lifting = lifting;\s*this\._settleFrom = null;\s*if \(!lifting\) \{\s*this\._chrome\.refresh\(\);/);
    expect(engine).toMatch(/liftSettling\(this\._settleFrom, target, settling!\)/);
  });
});

describe("the tour's three-beat ending", () => {
  it("fades the words and the gradient together, on one clock", () => {
    expect(briefing).toMatch(/transitionDuration: `\$\{BRIEFING_WORDS_OUT_MS\}ms`/);
    expect(briefing).toMatch(/fading && "opacity-0"/);
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

  it("finishes the tour on Escape during the ending, rather than stopping short of the globe", () => {
    expect(briefing).toMatch(/endBriefing\(stop, ending \? "done" : "key"\)/);
  });
});

// THE SCENE STAYS THE SCENE (user, 2026-11-01: "draggable according to its normal behavior and not
// open the view directly, also when you drag it pauses the intro progress").
describe("the scene behind the tour", () => {
  const engine = readFileSync("src/engine/Engine.ts", "utf8");

  it("lets the pointer through to the canvas: only the tour's own controls take it", () => {
    expect(briefing).toMatch(/"fixed inset-0 z-50 pointer-events-none"/);
    expect(briefing).not.toMatch(/<section[^>]*onClick/);
    expect(briefing).toMatch(/const live = fading \? "pointer-events-none" : "pointer-events-auto";/);
    expect(briefing.match(/, live\)/g)).toHaveLength(2); // the bars and Skip
  });

  it("ends on Skip or Escape alone, so a tap on the scene ends nothing", () => {
    expect(briefing).not.toMatch(/"tap"/);
  });

  it("holds the clock while the scene is pressed, and only then", () => {
    expect(briefing).toMatch(/e\.target instanceof HTMLCanvasElement/);
    expect(briefing).toMatch(/if \(s\.sceneReady && !held\.current\) ran \+= dt;/);
    expect(briefing).toMatch(/"pointercancel"/);
  });

  it("is look, don't touch: nothing behind the hidden HUD is picked or hovered", () => {
    expect(engine).toMatch(/private _pickSuppressed\(\)[^{]*\{\s*(\/\/[^\n]*\n\s*)*if \(useStore\.getState\(\)\.briefing != null\) return true;/);
  });
});

describe("the tour's Skip", () => {
  it("is large and solid enough not to be missed", () => {
    expect(briefing).toMatch(/h-10 rounded-full bg-foreground px-6 text-body font-semibold text-background/);
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
    expect(briefing).toMatch(/<div className="mb-1 min-h-5">\{who\}<\/div>/);
    expect(briefing).not.toMatch(/\{who\}\s*\{bars\}/);
  });

  // user, 2026-11-01: the scene and the words say where you are. A screen reader has no scene.
  it("names no view on screen, and still names it for a screen reader", () => {
    expect(briefing).not.toMatch(/\{name\}<\/(p|span)>/);
    expect(briefing).toMatch(/`\$\{name\}: \$\{words\.text\}`/);
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
