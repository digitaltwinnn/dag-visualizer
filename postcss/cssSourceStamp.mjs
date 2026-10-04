import { createHash } from "node:crypto";

/** The stamp of a stylesheet's source text — line endings normalised, so a checkout's CRLF and the
 *  compiler's input agree. Shared by the PostCSS stamp and the dev route that reads the file. */
export function cssSourceStamp(text) {
  return createHash("sha1").update(text.replace(/\r\n/g, "\n")).digest("hex").slice(0, 12);
}
