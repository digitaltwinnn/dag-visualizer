// Shared formatting helpers — one source of truth so the panels can't drift apart
// (these used to be copy-pasted, with subtly different `hex` implementations).

const DATUM_PER_DAG = 1e8; // 1 DAG = 1e8 datum (the on-chain fee unit)

export const toDag = (datum: number) => datum / DATUM_PER_DAG;
export const fmtDag = (datum: number) => toDag(datum).toFixed(4);

// Three.js color int → CSS hex. `>>> 0` + slice keep it valid for the full 0xRRGGBB
// range (and any stray sign bit) instead of assuming the input already fits in 6 hex.
export const hex = (c: number) => "#" + (c >>> 0).toString(16).padStart(6, "0").slice(-6);

// Data size in KB → readable string (KB up to ~1 MB, then MB). One decimal under 10 KB so a
// small tick doesn't collapse to "0 KB".
export const fmtKB = (kb: number) =>
  kb >= 1024
    ? `${(kb / 1024).toFixed(1)} MB`
    : kb >= 10
      ? `${Math.round(kb).toLocaleString()} KB`
      : `${kb.toFixed(1)} KB`;

// Byte count → readable string, staying in BYTES under 1 KB. An application state that serializes
// to 14 bytes is a real state, and `fmtKB` would render it "0.0 KB" — a zero the card would then be
// asserting about live data (rule 10). Above 1 KB it is the same scale everything else uses.
export const fmtBytes = (bytes: number) => (bytes < 1024 ? `${bytes.toLocaleString()} B` : fmtKB(bytes / 1024));

// Two-letter country code → the compact uppercase CODE mark the HUD shows where a country row
// needs a leading glyph (`··` when the code is absent or malformed, so the column keeps its
// width). This used to emit a flag EMOJI (a regional-indicator pair) and was replaced
// 2026-08-01 (user: "country icons don't render in Edge, only the code text shows"): Windows
// ships no flag-emoji font at all, so every browser there falls back to the bare letters or
// tofu — and emoji ignore CSS `color` anyway, so a flag could never inherit the muted tone or
// the accent like every other interface glyph (CLAUDE.md's one-icon-system rule). The code is
// real data, monochrome, and renders identically everywhere. Where the country NAME already
// sits next to it (card titles, table cells) the mark was simply dropped as redundant.
export const ccMark = (cc?: string | null) => (!cc || cc.length !== 2 ? "··" : cc.toUpperCase());

// Mid-ellipsis hash display (user, 2026-08-14 — the raw pane's long hashes "attached to the
// label" read better than the cards' short form): head and tail both survive at a character
// budget, because the head is what a reader recognizes and the tail is what they compare.
// The budget is per surface — the raw pane fits 46, a rail card ~27.
export function midHash(v: string, max = 46): string {
  if (v.length <= max) return v;
  const tail = Math.floor((max - 1) * 0.4);
  return `${v.slice(0, max - 1 - tail)}…${v.slice(-tail)}`;
}

// A COUNT AT MAGNITUDE SCALE → "~27.9M" (user, 2026-09-02: "1–25 of 27,851,696" and "1 /
// 1,114,068" on one pager row — "can we use a more readable format?"). Best practice splits the
// row's numbers by what they are: the visible row range and the CURRENT page stay exact (one
// names what is on screen, the other is an address you type back), while a chain-scale TOTAL is
// a magnitude — the chain grows every few seconds, so its "exact" length is stale the moment it
// renders, and eight digits of it are noise a reader has to count. Compact only from 10,000 up:
// below that the locale string is perfectly readable, and the windowed counts ("347 in window")
// keep their exactness, which is real. The tilde marks the rounding honestly (rule 10).
export const fmtCount = (n: number): string =>
  n < 10_000
    ? n.toLocaleString()
    : `~${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
