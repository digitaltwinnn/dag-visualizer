// THE one theme resolver (the src/net/parse.ts pattern). Both the ThemeController (runtime)
// and the pre-paint inline script in app/layout.tsx (which cannot import — it mirrors the
// two-value check textually) must agree with this. Only "light"/"dark" are ever STORED;
// absence is System, which keeps the pre-paint script branchless.
export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";
export const THEME_KEY = "dagviz:theme";

export function parseThemePref(raw: string | null | undefined): ThemePref {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}
