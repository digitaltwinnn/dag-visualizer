// Bake app/favicon.ico from app/icon.svg.
//
// Why both files exist: they are DIFFERENT Next conventions serving different clients.
// `app/icon.svg` is the modern one — Next emits `<link rel="icon">` for it and a browser that
// reads the tag never looks anywhere else. But `/favicon.ico` is requested BY PATH, without
// parsing any HTML, by security scanners, link-preview bots and RSS readers, and `app/icon.*`
// does not answer that path — only a literal `app/favicon.ico` does. Leaving it 404 is a small
// standing blemish for exactly the reputation-scanner audience next.config.mjs's headers were
// added for. So the SVG stays the source of truth and this bakes the .ico from it; there is no
// second drawing to keep in sync.
//
// Run manually whenever app/icon.svg changes:
//
//   npx tsx scripts/bake-favicon.ts
//
// The container is written here because sharp renders SVG→PNG but cannot emit .ico. Payloads are
// PNG rather than the older BMP/DIB: PNG-in-ICO has been read by every shipping browser since
// IE11/Vista, and it avoids hand-rolling a bottom-up BGRA buffer plus its AND mask, which is the
// part of the BMP path that silently produces a transparent or inverted icon when you get it
// wrong. Three sizes, because the .ico is the LEGACY lane and legacy clients pick by size.
import { writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";

const SIZES = [16, 32, 48] as const;
const SRC = "app/icon.svg";
const OUT = "app/favicon.ico";

// Wrapped in a main() rather than using top-level await: the package is CJS, and tsx's esbuild
// transform rejects TLA for a "cjs" output format.
async function main() {
  const svg = readFileSync(SRC);
  const pngs = await Promise.all(
    SIZES.map((s) =>
      sharp(svg, { density: 384 }).resize(s, s).png({ compressionLevel: 9 }).toBuffer(),
    ),
  );

  // ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) per image, then the payloads back to back.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon (2 would be cursor)
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map((png, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(SIZES[i] === 256 ? 0 : SIZES[i], 0); // 0 encodes 256 — none of ours, but state it
    e.writeUInt8(SIZES[i] === 256 ? 0 : SIZES[i], 1);
    e.writeUInt8(0, 2); // palette size — 0 for truecolour
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });

  writeFileSync(OUT, Buffer.concat([header, ...entries, ...pngs]));
  console.log(`baked ${SIZES.join("/")}px from ${SRC} to ${OUT} (${offset} bytes)`);
}

void main();
