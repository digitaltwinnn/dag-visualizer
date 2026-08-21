import { describe, it, expect } from "vitest";
import { parseThemePref, resolveTheme, THEME_KEY } from "./resolve";

describe("parseThemePref", () => {
  it("accepts exactly the two explicit values", () => {
    expect(parseThemePref("light")).toBe("light");
    expect(parseThemePref("dark")).toBe("dark");
  });
  it("everything else is System — absence IS system, never stored", () => {
    expect(parseThemePref(null)).toBe("system");
    expect(parseThemePref(undefined)).toBe("system");
    expect(parseThemePref("system")).toBe("system"); // never written, still tolerated
    expect(parseThemePref("LIGHT")).toBe("system"); // exact values, no case folding
    expect(parseThemePref("auto")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("an explicit pref wins regardless of the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("system follows the OS", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

it("the storage key is stable", () => expect(THEME_KEY).toBe("dagviz:theme"));
