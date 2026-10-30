import { describe, it, expect } from "vitest";
import { parseThemePref, resolveTheme, THEME_KEY } from "./resolve";

describe("parseThemePref", () => {
  it("accepts exactly the two explicit values", () => {
    expect(parseThemePref("light")).toBe("light");
    expect(parseThemePref("dark")).toBe("dark");
  });
  // THE DEFAULT IS DARK (user, 2026-10-30: "set the default to dark"): a first visit with nothing
  // stored is the dark instrument whatever the OS says; System is a CHOICE now, stored like the
  // other two, since absence no longer means it.
  it("accepts System as a stored choice", () => {
    expect(parseThemePref("system")).toBe("system");
  });
  it("everything else is the default, dark — absence included", () => {
    expect(parseThemePref(null)).toBe("dark");
    expect(parseThemePref(undefined)).toBe("dark");
    expect(parseThemePref("LIGHT")).toBe("dark"); // exact values, no case folding
    expect(parseThemePref("auto")).toBe("dark");
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
