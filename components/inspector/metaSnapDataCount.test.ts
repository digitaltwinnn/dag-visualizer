import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE METAGRAPH SNAPSHOT CARD COUNTS ITS DATA UPDATES FROM THE EXACT READ (D6, 2026-11-07 — the
// ruling on the two-step gate: it guards payload RENDERING, not counting). The tick's exact read
// (`/api/snapshot/[ordinal]`, `app/api/snapshot/exactRow.ts`) carries `dataTxCount` on every row,
// so the card states the count with no Decompress; the ~2.5 MB deep read stays the RAW pane's and
// the card's own Decompress door's, for the payload and the dL1 signers. A source scan: the pane must
// not take the count from the deep read again.
const src = readFileSync(join(__dirname, "MetaSnapPane.tsx"), "utf8");

describe("the metagraph snapshot card's data count", () => {
  it("reads the exact row's count", () => {
    expect(src).toMatch(/row\?\.dataTxCount/);
  });

  it("never reads the count from the deep read", () => {
    expect(src).not.toMatch(/deep\??\.dataTxCount/);
  });
});
