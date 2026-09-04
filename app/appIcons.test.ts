import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

// THE APP ICONS ARE BUILD ARTIFACTS THAT FAIL SILENTLY, which is the whole reason for this file.
//
// Written after shipping a broken one (2026-08-31): app/icon.svg carried `--primary` inside an XML
// COMMENT, a double hyphen is illegal there, and the browser therefore refused to DECODE the file.
// Nothing anywhere said so — the route still answered 200, Next still emitted the <link>, tsc and
// the whole suite stayed green, and the only symptom was the tab quietly showing the default
// globe. The verification that missed it checked the PLUMBING and never the PAYLOAD.
//
// So these assert the payload: that each file is what its extension claims. They are deliberately
// about VALIDITY, not appearance — the drawing is a design question, and no test should pin it.
const APP = join(process.cwd(), "app");

describe("app icons", () => {
  it("icon.svg actually DECODES — the failure mode is a silent non-decode", async () => {
    // Rendered, not merely read. sharp's librsvg is the same parse a browser does, and it is what
    // caught the shipped bug: an illegal `--` in a comment made the whole file undecodable while
    // every other signal stayed green. Rasterising is therefore the assertion — if this throws,
    // the tab shows no icon.
    const svg = readFileSync(join(APP, "icon.svg"));
    const png = await sharp(svg, { density: 384 }).resize(32, 32).png().toBuffer();
    expect(png.length).toBeGreaterThan(0);
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");

    // Called out separately because it is the specific trap that shipped and the error message
    // ("Comment must not contain '--'") is easy to misread as being about the SVG's markup.
    for (const c of svg.toString("utf8").match(/<!--[\s\S]*?-->/g) ?? []) {
      expect(c.slice(4, -3), "XML forbids a double hyphen inside a comment").not.toContain("--");
    }
  });

  it("favicon.ico exists and is a real ICO — app/icon.* does NOT serve /favicon.ico", () => {
    // They are different Next conventions. Only a literal app/favicon.ico answers the path that
    // scanners, link-preview bots and RSS readers request BY URL without parsing any HTML.
    const p = join(APP, "favicon.ico");
    expect(existsSync(p), "app/favicon.ico is missing — run scripts/bake-favicon.ts").toBe(true);
    const b = readFileSync(p);
    // ICONDIR: reserved=0, type=1 (icon), count>=1 — all little-endian uint16.
    expect(b.readUInt16LE(0)).toBe(0);
    expect(b.readUInt16LE(2)).toBe(1);
    const n = b.readUInt16LE(4);
    expect(n).toBeGreaterThan(0);
    // Every directory entry must point at a payload that lies inside the file.
    for (let i = 0; i < n; i++) {
      const e = 6 + 16 * i;
      const bytes = b.readUInt32LE(e + 8);
      const offset = b.readUInt32LE(e + 12);
      expect(bytes).toBeGreaterThan(0);
      expect(offset + bytes).toBeLessThanOrEqual(b.length);
    }
  });

  it("the PWA/apple icons exist and DECODE as real PNGs (manifest.ts + the iOS touch icon)", async () => {
    // Same philosophy as the svg assertion above: these are build artifacts that fail silently —
    // a manifest pointing at a broken PNG installs with a blank tile and nothing errors. All four
    // are generated from app/icon.svg (2026-09-03, the manifest's own header has the pipeline).
    const files = [
      join(APP, "apple-icon.png"),
      join(process.cwd(), "public", "icon-192.png"),
      join(process.cwd(), "public", "icon-512.png"),
      join(process.cwd(), "public", "icon-maskable-512.png"),
    ];
    for (const f of files) {
      expect(existsSync(f), `${f} is missing`).toBe(true);
      const meta = await sharp(readFileSync(f)).metadata();
      expect(meta.format, f).toBe("png");
      expect(meta.width ?? 0, f).toBeGreaterThanOrEqual(180);
    }
  });

  it("the .ico is baked FROM the svg, so the two cannot drift into different marks", () => {
    // scripts/bake-favicon.ts is the one home; this only asserts the source it needs is present.
    expect(existsSync(join(process.cwd(), "scripts", "bake-favicon.ts"))).toBe(true);
    expect(existsSync(join(APP, "icon.svg"))).toBe(true);
  });
});
